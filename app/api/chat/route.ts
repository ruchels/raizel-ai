import { NextRequest, NextResponse } from 'next/server';
import { isValidModel, DEFAULT_MODEL_ID } from '@/lib/models';
import { createRindriClient, getRindriApiKey, mapProviderError } from '@/lib/rindri';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

    const client = createRindriClient();

    if (stream) {
      try {
        const streamResponse = await client.chat.completions.create({
          model,
          messages: formattedMessages,
          stream: true,
        });

        const encoder = new TextEncoder();
        const readableStream = new ReadableStream({
          async start(controller) {
            try {
              for await (const chunk of streamResponse) {
                const text = chunk.choices?.[0]?.delta?.content || '';
                if (text) {
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ delta: text })}\n\n`)
                  );
                }
              }
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              controller.close();
            } catch (streamError) {
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
          messages: formattedMessages,
          stream: false,
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
