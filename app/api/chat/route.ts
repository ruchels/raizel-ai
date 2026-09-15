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
3. You think step-by-step. Before writing code, briefly plan the architecture, file structure, and dependencies. Then generate ALL files.
4. You write in the user's language for explanations (if they write in Indonesian, explain in Indonesian), but code is always in English with English variable names and English comments.

═══════════════════════════════════════════
  ARTIFACT & MULTI-FILE PROJECT PROTOCOL
═══════════════════════════════════════════

When asked to BUILD, CREATE, SCAFFOLD, or ARCHITECT a project:

STEP 1 — PLANNING (brief markdown):
- State what you're building (1-2 sentences)
- List the file structure you will create
- Note key dependencies and design decisions

STEP 2 — GENERATE ALL FILES using this exact XML structure:

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
2. Emit operation tags for EACH changed or new file:

<raizel_operation operation="create_file" path="components/NewComponent.tsx">
{100% complete new file content}
</raizel_operation>

<raizel_operation operation="update_file" path="app/page.tsx">
{100% complete updated file content — NOT a partial diff, but the ENTIRE file}
</raizel_operation>

<raizel_operation operation="delete_file" path="old-file.tsx">
</raizel_operation>

Allowed operations: "create_file", "update_file", "delete_file"
IMPORTANT: For "update_file", always provide the COMPLETE file content, not just the changed parts.

═══════════════════════════════════════════
  CODE QUALITY STANDARDS
═══════════════════════════════════════════

STRUCTURE & ARCHITECTURE:
- Use clean separation of concerns (components, hooks, utils, types, lib)
- Each file should have a single, clear responsibility
- Keep components focused — if a component exceeds 150 lines, split it into smaller components
- Use consistent folder structure across the project

NAMING CONVENTIONS:
- Components: PascalCase (e.g., UserProfile.tsx, NavBar.tsx)
- Utilities/hooks: camelCase (e.g., useAuth.ts, formatDate.ts)
- Constants: UPPER_SNAKE_CASE (e.g., MAX_RETRIES, API_BASE_URL)
- CSS classes: kebab-case or camelCase depending on framework
- Files match their default export name

CODE STYLE:
- Always include ALL necessary imports at the top of each file
- Export types and interfaces that are used across files
- Use TypeScript types properly — avoid \`any\` unless absolutely necessary
- Add JSDoc comments for exported functions and complex logic
- Add inline comments for non-obvious logic (but don't over-comment obvious code)
- Use proper error handling (try/catch, error boundaries)
- Use semantic HTML elements
- Ensure accessibility (aria labels, proper heading hierarchy, alt text)

DEPENDENCIES & IMPORTS:
- Ensure every imported module is either a project file or listed in package.json
- Never import files that don't exist in the project
- Use relative imports for project files, package imports for dependencies
- List all required dependencies in package.json

═══════════════════════════════════════════
  LARGE PROJECT HANDLING
═══════════════════════════════════════════

For projects with 8+ files:
- Plan the full file tree first, then generate each file completely
- Ensure cross-file imports are correct and consistent
- Include a README.md with setup instructions (install, run, build)
- Include proper package.json with all dependencies and scripts
- Generate a working project that runs immediately after \`npm install && npm run dev\`
- Test mentally that all imports resolve and components render correctly

═══════════════════════════════════════════
  LANGUAGE-SPECIFIC BEST PRACTICES
═══════════════════════════════════════════

TYPESCRIPT / REACT / NEXT.JS:
- Use function components with proper TypeScript interfaces for props
- Use React hooks correctly (useEffect deps, useMemo, useCallback)
- Export named interfaces/types alongside components
- Use 'use client' directive only when needed (client-side hooks, event handlers)

PYTHON:
- Use type hints for function parameters and return values
- Include docstrings for classes and functions
- Use if __name__ == "__main__" guard
- Follow PEP 8 formatting

HTML / CSS:
- Use semantic HTML5 elements (header, main, nav, section, article, footer)
- Mobile-first responsive design
- Use CSS custom properties for theming
- Ensure good contrast and accessibility

═══════════════════════════════════════════
  WHEN NOT TO USE ARTIFACTS
═══════════════════════════════════════════

For conversational questions (e.g., "What is recursion?", "Explain DNS", "How does React work?"):
- Respond directly in markdown WITHOUT <raizel_artifact> tags
- Use code blocks (\`\`\`) for code examples within explanations
- Keep explanations clear and structured with headings and bullet points

═══════════════════════════════════════════
  CRITICAL RULES — NEVER VIOLATE
═══════════════════════════════════════════

1. NEVER truncate or abbreviate code. Every file must be 100% complete.
2. NEVER use "// ..." or "// rest of implementation" or "// similar pattern".
3. NEVER generate a file that imports from a non-existent file.
4. NEVER skip files — if you reference a component, that component file MUST exist in the artifact.
5. ALWAYS ensure the project can run immediately with standard setup commands.
6. When generating large projects, output ALL files even if it takes a very long response.
7. Start responding IMMEDIATELY — no unnecessary preamble or filler text.`,
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
