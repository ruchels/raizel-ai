import { NextRequest, NextResponse } from 'next/server';
import type OpenAI from 'openai';
import { isValidModel, DEFAULT_MODEL_ID } from '@/lib/models';
import { createRindriClient, getRindriApiKey, mapProviderError } from '@/lib/rindri';
import { SYSTEM_PROMPT, PLAIN_CHAT_HINT } from '@/lib/prompt';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Server-side proxy to the Rindri gateway.
 * The API key never leaves this file — the browser only ever talks to /api/chat.
 */

type ChatRole = 'user' | 'assistant' | 'system';

interface IncomingAttachment {
  type?: string;
  content?: string;
  mimeType?: string;
}

interface IncomingMessage {
  role?: string;
  content?: string;
  attachments?: IncomingAttachment[];
}

type ProviderMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

/** Upper bounds to keep one request from exhausting the gateway or our memory. */
const LIMITS = {
  maxMessages: 200,
  maxMessageChars: 600_000,
  maxSystemContextChars: 400_000,
  maxImagesPerMessage: 8,
  maxTotalChars: 1_500_000,
};

const DATA_URL_RE = /^data:image\/(png|jpe?g|webp|gif|bmp|avif);base64,[A-Za-z0-9+/=\s]+$/i;

function toRole(value: unknown): ChatRole {
  return value === 'assistant' || value === 'system' ? value : 'user';
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest('Request body is not valid JSON.');
  }

  if (typeof body !== 'object' || body === null) {
    return badRequest('Request body must be a JSON object.');
  }

  const {
    model = DEFAULT_MODEL_ID,
    messages,
    stream = true,
    systemContext,
  } = body as {
    model?: unknown;
    messages?: unknown;
    stream?: unknown;
    systemContext?: unknown;
  };

  if (typeof model !== 'string' || !isValidModel(model)) {
    return badRequest(`"${String(model)}" is not an authorized model.`);
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return badRequest('At least one message is required.');
  }

  if (messages.length > LIMITS.maxMessages) {
    return badRequest(`Conversation exceeds the ${LIMITS.maxMessages} message limit.`);
  }

  if (systemContext !== undefined && typeof systemContext !== 'string') {
    return badRequest('systemContext must be a string.');
  }

  if (typeof systemContext === 'string' && systemContext.length > LIMITS.maxSystemContextChars) {
    return badRequest('Project context is too large for a single request.');
  }

  const apiKey = getRindriApiKey();
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          'No API key configured on the server. Set RINDRI_API_KEY in .env.local and restart.',
      },
      { status: 401 }
    );
  }

  /* --- normalize messages --- */

  const formatted: ProviderMessage[] = [];
  let totalChars = 0;

  for (const raw of messages as IncomingMessage[]) {
    if (!raw) continue;
    const role = toRole(raw.role);

    let text = typeof raw.content === 'string' ? raw.content.trim() : '';
    if (text.length > LIMITS.maxMessageChars) {
      text = `${text.slice(0, LIMITS.maxMessageChars)}\n[message truncated by the server at ${LIMITS.maxMessageChars} characters]`;
    }

    const images = (Array.isArray(raw.attachments) ? raw.attachments : [])
      .filter((a) => a?.type === 'image' && typeof a.content === 'string' && DATA_URL_RE.test(a.content))
      .slice(0, LIMITS.maxImagesPerMessage);

    if (!text && images.length === 0) continue;

    totalChars += text.length;
    if (totalChars > LIMITS.maxTotalChars) {
      return badRequest(
        'This conversation is too large to send. Start a new chat or remove some attachments.'
      );
    }

    if (images.length > 0 && role === 'user') {
      formatted.push({
        role: 'user',
        content: [
          { type: 'text', text: text || 'Please analyze the attached image(s).' },
          ...images.map((img) => ({
            type: 'image_url' as const,
            image_url: { url: img.content as string },
          })),
        ],
      });
    } else if (role === 'system') {
      formatted.push({ role: 'system', content: text });
    } else if (role === 'assistant') {
      formatted.push({ role: 'assistant', content: text });
    } else {
      formatted.push({ role: 'user', content: text });
    }
  }

  if (formatted.length === 0) {
    return badRequest('No message contained any readable content.');
  }

  const hasProjectContext = typeof systemContext === 'string' && systemContext.trim().length > 0;

  const payload: ProviderMessage[] = [
    { role: 'system', content: hasProjectContext ? SYSTEM_PROMPT : SYSTEM_PROMPT + PLAIN_CHAT_HINT },
  ];
  if (hasProjectContext) {
    payload.push({ role: 'system', content: systemContext as string });
  }
  payload.push(...formatted);

  const client = createRindriClient();

  /* --- non-streaming --- */

  if (!stream) {
    try {
      const completion = await client.chat.completions.create({
        model,
        messages: payload,
        stream: false,
        max_tokens: 16384,
      });
      return NextResponse.json({
        model,
        content: completion.choices?.[0]?.message?.content ?? '',
      });
    } catch (err) {
      const mapped = mapProviderError(err);
      return NextResponse.json({ error: mapped.userMessage }, { status: mapped.status });
    }
  }

  /* --- streaming --- */

  let providerStream: Awaited<ReturnType<typeof client.chat.completions.create>>;
  try {
    providerStream = await client.chat.completions.create({
      model,
      messages: payload,
      stream: true,
      max_tokens: 32768,
    });
  } catch (err) {
    const mapped = mapProviderError(err);
    return NextResponse.json({ error: mapped.userMessage }, { status: mapped.status });
  }

  const encoder = new TextEncoder();

  const body_ = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (payloadObj: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payloadObj)}\n\n`));
      };

      // Keeps intermediate proxies from dropping a long generation.
      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(': ping\n\n'));
        } catch {
          clearInterval(heartbeat);
        }
      }, 10_000);

      const finish = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      try {
        controller.enqueue(encoder.encode(': connected\n\n'));

        let received = 0;
        for await (const chunk of providerStream as AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>) {
          const delta = chunk.choices?.[0]?.delta as
            | (OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta & {
                reasoning_content?: string;
                thinking?: string;
              })
            | undefined;

          const text = delta?.content ?? '';
          const reasoning = delta?.reasoning_content ?? delta?.thinking ?? '';

          if (text || reasoning) {
            received++;
            send({ delta: text, reasoning });
          }
        }

        if (received === 0) {
          send({
            error:
              'The model returned an empty response. This usually means the provider is overloaded or the request timed out — try a different model or a smaller task.',
          });
        } else {
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        }
      } catch (err) {
        send({ error: mapProviderError(err).userMessage });
      } finally {
        finish();
      }
    },
    cancel() {
      // The browser aborted; nothing further to clean up.
    },
  });

  return new Response(body_, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
