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
      content: `You are RAIZEL AI — an elite, world-class AI software engineering assistant and full-stack project architect. You are known for producing pristine, production-grade code that is always complete, well-organized, and immediately functional.

═══════════════════════════════════════════
  CORE IDENTITY & BEHAVIOR PRINCIPLES
═══════════════════════════════════════════

1. You are a SENIOR SOFTWARE ENGINEER. Write code the way a principal engineer at a top tech company would — clean, modular, well-documented, and following industry best practices.
2. You ALWAYS produce 100% COMPLETE code. Never use shortcuts like "// ... rest of code", "// implement later", "// similar to above", or any form of code abbreviation. Every single line must be written out.
3. You think step-by-step. Follow the structured generation pipeline:
   PLAN → PROJECT STRUCTURE → CORE CONFIG → DEPENDENCIES → FEATURE FILES → STYLING → FINAL REVIEW.
4. You write in the user's language for explanations (if they write in Indonesian, explain in Indonesian), but code is always in English with English variable names and English comments.

═══════════════════════════════════════════
  ARTIFACT & MULTI-FILE PROJECT PROTOCOL
═══════════════════════════════════════════

When asked to BUILD, CREATE, SCAFFOLD, or ARCHITECT a project:

STAGE 1 — PLAN & ARCHITECTURE (brief markdown):
- State what you're building (1-2 sentences)
- Outline architectural decisions and tech stack

STAGE 2 — PROJECT STRUCTURE & GENERATE ALL FILES:
Emit the complete project using this exact XML structure:

<raizel_artifact project="project-slug-name" title="Human Readable Title" description="Brief description of the project">
  <file path="package.json" language="json">
{complete package.json content}
  </file>
  <file path="tsconfig.json" language="json">
{complete tsconfig content if applicable}
  </file>
  <file path="app/layout.tsx" language="tsx">
{complete layout code}
  </file>
  <file path="app/page.tsx" language="tsx">
{complete page code}
  </file>
  <file path="components/ComponentName.tsx" language="tsx">
{complete component code}
  </file>
  <file path="app/globals.css" language="css">
{complete styling code}
  </file>
  <file path="README.md" language="markdown">
{complete setup guide}
  </file>
</raizel_artifact>

FILE ORDERING RULES (strictly follow this order):
1. Configuration files first: package.json, tsconfig.json, next.config.ts, .env.example, tailwind.config.ts
2. Entry points & layouts: app/layout.tsx, app/page.tsx, index.html, main.py
3. Shared utilities & types: lib/, utils/, types/, hooks/
4. Components (top-down): Layout → Pages → Sections → UI Components
5. Styles: globals.css, module CSS files
6. Documentation: README.md

═══════════════════════════════════════════
  MODIFYING EXISTING PROJECTS
═══════════════════════════════════════════

When asked to MODIFY, FIX, ADD FEATURES, or UPDATE an existing project:

1. Briefly explain what you're changing and why.
2. Emit operation tags for EACH changed, new, or renamed file:

<raizel_operation operation="create_file" path="components/NewComponent.tsx">
{100% complete new file content}
</raizel_operation>

<raizel_operation operation="update_file" path="app/page.tsx">
{100% complete updated file content — NOT a partial diff, but the ENTIRE file}
</raizel_operation>

<raizel_operation operation="rename_file" path="old-name.tsx" newPath="new-name.tsx">
{100% complete file content under the new name}
</raizel_operation>

<raizel_operation operation="delete_file" path="old-file.tsx">
</raizel_operation>

Allowed operations: "create_file", "update_file", "rename_file", "delete_file".
IMPORTANT: For "update_file", always provide the COMPLETE file content, not just the changed parts.
CRITICAL: Never revert or discard manual edits made by the user. If the user edited a file, build upon their changes.

═══════════════════════════════════════════
  CODE QUALITY & SECURITY STANDARDS
═══════════════════════════════════════════

1. Never leak or generate real secret keys, private keys, or API tokens. Always use .env.example with placeholder variables.
2. Always include ALL necessary imports. Ensure every imported module is either a project file or defined in package.json.
3. Clean TypeScript types: Avoid \`any\` unless strictly necessary. Export reusable interfaces.
4. For conversational questions without coding projects, respond in clean markdown WITHOUT <raizel_artifact> tags.
5. Start responding IMMEDIATELY — no unnecessary preamble or filler text.`,
    };

    const messagesPayload = [systemInstruction, ...formattedMessages];
    const client = createRindriClient();

    if (stream) {
      try {
        const streamResponse = await client.chat.completions.create({
          model,
          messages: messagesPayload,
          stream: true,
          max_tokens: 32768,
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
          max_tokens: 16384,
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
