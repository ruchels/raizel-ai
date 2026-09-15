import { NextRequest, NextResponse } from 'next/server';
import { isValidModel, DEFAULT_MODEL_ID } from '@/lib/models';
import { createRindriClient, getRindriApiKey, mapProviderError } from '@/lib/rindri';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // Allow up to 5 minutes for long generations (e.g. games, projects)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json(
        { error: 'Invalid JSON request payload.' },
        { status: 400 }
      );
    }

    const { model = DEFAULT_MODEL_ID, messages, stream = true } = body;

    // Validate Model whitelist
    if (!isValidModel(model)) {
      return NextResponse.json(
        {
          error: `Model "${model}" is not in the list of authorized models.`,
        },
        { status: 400 }
      );
    }

    // Validate Messages
    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: 'Messages array must be provided and not empty.' },
        { status: 400 }
      );
    }

    const apiKey = getRindriApiKey();
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            'API key is missing or invalid. Please check your RINDRI_API_KEY in .env.local on the server.',
        },
        { status: 401 }
      );
    }

    // Sanitize and format messages for OpenAI format (support text and multimodal image_url)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const formattedMessages: any[] = [];

    for (const m of messages) {
      if (!m) continue;
      const role = (['user', 'assistant', 'system'].includes(m.role)
        ? m.role
        : 'user') as 'user' | 'assistant' | 'system';

      const attachments = Array.isArray(m.attachments) ? m.attachments : [];
      const imageAttachments = attachments.filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (a: any) => a && a.type === 'image' && typeof a.content === 'string'
      );
      const textAttachments = attachments.filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (a: any) => a && a.type !== 'image' && typeof a.content === 'string'
      );

      let textContent = (m.content || '').trim();
      if (textAttachments.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const attachedTexts = textAttachments.map((att: any) => {
          return `\n\n[Attachment: ${att.name} (${att.type || 'file'})]\n\`\`\`\n${att.content}\n\`\`\``;
        });
        textContent = `${textContent ? `${textContent}\n` : ''}${attachedTexts.join('\n')}`.trim();
      }

      if (!textContent && imageAttachments.length > 0) {
        textContent = 'Please analyze the attached image(s).';
      }

      if (!textContent && imageAttachments.length === 0) {
        continue;
      }

      if (imageAttachments.length > 0 && role === 'user') {
        formattedMessages.push({
          role,
          content: [
            { type: 'text', text: textContent },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ...imageAttachments.map((img: any) => ({
              type: 'image_url',
              image_url: { url: img.content },
            })),
          ],
        });
      } else {
        formattedMessages.push({
          role,
          content: textContent,
        });
      }
    }

    if (formattedMessages.length === 0) {
      return NextResponse.json(
        { error: 'At least one valid message or attachment is required.' },
        { status: 400 }
      );
    }

    // High-performance System Instructions for RAIZEL AI
    const systemInstruction = {
      role: 'system',
      content: `You are RAIZEL AI, a premier, highly responsive, and elite AI engineering assistant.
CRITICAL INSTRUCTIONS:
- When asked to build large projects (such as 3D Python games, full-stack applications, complex simulations, scripts, or architectural systems), provide 100% complete, fully working, production-ready code with all required imports, game loop/logic, asset generation/fallbacks, and concise run instructions.
- NEVER abbreviate, summarize code blocks with "# ... implement later", or stop halfway.
- When provided with attachments (images, code files, or zip archives), thoroughly inspect and analyze the full content.
- Start outputting your response immediately without unnecessary delay or fluff.`,
    };

    const messagesPayload = [systemInstruction, ...formattedMessages];
    const client = createRindriClient();

    if (stream) {
      try {
        const streamResponse = await client.chat.completions.create({
          model,
          messages: messagesPayload,
          stream: true,
          max_tokens: 8192,
        });

        const encoder = new TextEncoder();
        const readableStream = new ReadableStream({
          async start(controller) {
            // Send initial keep-alive comment
            controller.enqueue(encoder.encode(': connected\n\n'));

            // Heartbeat to keep proxies/gateways from timing out while generating
            const pingTimer = setInterval(() => {
              try {
                controller.enqueue(encoder.encode(': ping\n\n'));
              } catch {
                clearInterval(pingTimer);
              }
            }, 3500);

            let totalTokensReceived = 0;
            try {
              for await (const chunk of streamResponse) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const delta = chunk.choices?.[0]?.delta as any;
                const text = delta?.content || '';
                const reasoning = delta?.reasoning_content || delta?.thinking || '';

                if (text || reasoning) {
                  totalTokensReceived++;
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({
                        delta: text,
                        reasoning: reasoning,
                      })}\n\n`
                    )
                  );
                }
              }

              if (totalTokensReceived === 0) {
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      error: 'Model provider terputus tanpa menghasilkan respon (Claude Opus kemungkinan overload atau request timeout di server AI). Silakan gunakan Claude Sonnet 5 / DeepSeek V4 Pro atau perkecil cakupan tugas.',
                    })}\n\n`
                  )
                );
              } else {
                controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              }
              clearInterval(pingTimer);
              controller.close();
            } catch (streamError) {
              clearInterval(pingTimer);
              const mapped = mapProviderError(streamError);
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ error: mapped.userMessage })}\n\n`
                )
              );
              controller.close();
            }
          },
        });

        return new Response(readableStream, {
          headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
          },
        });
      } catch (err: unknown) {
        const mapped = mapProviderError(err);
        return NextResponse.json(
          { error: mapped.userMessage },
          { status: mapped.status }
        );
      }
    } else {
      // Non-streaming fallback
      try {
        const completion = await client.chat.completions.create({
          model,
          messages: messagesPayload,
          stream: false,
          max_tokens: 8192,
        });

        const content =
          completion.choices?.[0]?.message?.content ||
          '';

        return NextResponse.json({
          model,
          content,
        });
      } catch (err: unknown) {
        const mapped = mapProviderError(err);
        return NextResponse.json(
          { error: mapped.userMessage },
          { status: mapped.status }
        );
      }
    }
  } catch (globalError: unknown) {
    const mapped = mapProviderError(globalError);
    return NextResponse.json(
      { error: mapped.userMessage },
      { status: mapped.status }
    );
  }
}
