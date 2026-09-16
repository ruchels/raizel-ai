import JSZip from 'jszip';
import type { ExtractionResult } from '@/types/project';
import {
  getExtension,
  isTextLike,
  looksBinary,
  MAX_TEXT_FILE_BYTES,
  formatBytes,
} from './fileTypes';

/**
 * Text extraction. Every path here either returns real decoded content or an
 * explicit failure reason — it never returns a placeholder that pretends the
 * file was read.
 */

function decodeUtf8(buffer: ArrayBuffer): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(buffer);
}

/** Normalises line endings and strips a UTF-8 BOM. */
export function normalizeText(text: string): string {
  return text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
}

/* ------------------------------------------------------------------ */
/* DOCX                                                                */
/* ------------------------------------------------------------------ */

const XML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
};

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&(?:amp|lt|gt|quot|apos);/g, (m) => XML_ENTITIES[m] ?? m)
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

/**
 * Converts WordprocessingML into plain text.
 * A .docx is a ZIP; the body lives in word/document.xml.
 */
function wordXmlToText(xml: string): string {
  let out = xml;

  // Structural markers -> newlines/tabs before tags are stripped.
  out = out.replace(/<w:tab\b[^>]*\/?>/g, '\t');
  out = out.replace(/<w:br\b[^>]*\/?>/g, '\n');
  out = out.replace(/<\/w:p>/g, '\n');
  out = out.replace(/<\/w:tr>/g, '\n');
  out = out.replace(/<\/w:tc>/g, '\t');

  // Keep only the contents of text runs, drop every other tag.
  const textRuns: string[] = [];
  const runRegex = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|(\n|\t)/g;
  let match: RegExpExecArray | null;
  while ((match = runRegex.exec(out)) !== null) {
    if (match[1] !== undefined) textRuns.push(decodeXmlEntities(match[1]));
    else if (match[2] !== undefined) textRuns.push(match[2]);
  }

  return textRuns
    .join('')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function extractDocx(buffer: ArrayBuffer): Promise<ExtractionResult> {
  const bytes = buffer.byteLength;
  try {
    const zip = await JSZip.loadAsync(buffer);
    const parts = ['word/document.xml', 'word/footnotes.xml', 'word/endnotes.xml'];
    const chunks: string[] = [];

    for (const part of parts) {
      const entry = zip.file(part);
      if (!entry) continue;
      const xml = await entry.async('string');
      const text = wordXmlToText(xml);
      if (text) chunks.push(text);
    }

    if (chunks.length === 0) {
      return {
        ok: false,
        text: '',
        bytes,
        reason: 'extract_failed',
        detail: 'The .docx archive does not contain a readable word/document.xml body.',
      };
    }

    return { ok: true, text: normalizeText(chunks.join('\n\n')), bytes, converted: true };
  } catch (err) {
    return {
      ok: false,
      text: '',
      bytes,
      reason: 'extract_failed',
      detail: `Could not open the .docx archive: ${err instanceof Error ? err.message : 'unknown error'}`,
    };
  }
}

/* ------------------------------------------------------------------ */
/* PDF                                                                 */
/* ------------------------------------------------------------------ */

let pdfWorkerConfigured = false;

async function loadPdfjs() {
  const pdfjs = await import('pdfjs-dist');
  if (!pdfWorkerConfigured) {
    try {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url
      ).toString();
    } catch {
      // Falls back to pdf.js' own main-thread worker shim.
    }
    pdfWorkerConfigured = true;
  }
  return pdfjs;
}

interface PdfTextItem {
  str?: string;
  hasEOL?: boolean;
  transform?: number[];
}

async function extractPdf(buffer: ArrayBuffer): Promise<ExtractionResult> {
  const bytes = buffer.byteLength;
  try {
    const pdfjs = await loadPdfjs();
    // Text only: no scripting, no external font fetching, no speculative range
    // requests. pdf.js runs untrusted input, so the surface stays minimal.
    const doc = await pdfjs.getDocument({
      data: new Uint8Array(buffer),
      disableAutoFetch: true,
      useSystemFonts: false,
      isOffscreenCanvasSupported: false,
    }).promise;

    const pages: string[] = [];
    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      const page = await doc.getPage(pageNum);
      const content = await page.getTextContent();
      const items = content.items as PdfTextItem[];

      let pageText = '';
      let lastY: number | null = null;
      for (const item of items) {
        if (typeof item.str !== 'string') continue;
        const y = item.transform?.[5];
        if (lastY !== null && typeof y === 'number' && Math.abs(y - lastY) > 2) {
          pageText += '\n';
        } else if (pageText && !pageText.endsWith(' ') && !pageText.endsWith('\n')) {
          pageText += ' ';
        }
        pageText += item.str;
        if (item.hasEOL) pageText += '\n';
        if (typeof y === 'number') lastY = y;
      }

      pages.push(`--- Page ${pageNum} ---\n${pageText.trim()}`);
      page.cleanup();
    }

    await doc.cleanup();

    const joined = pages.join('\n\n').trim();
    const withoutMarkers = joined.replace(/--- Page \d+ ---/g, '').trim();

    if (!withoutMarkers) {
      return {
        ok: false,
        text: '',
        bytes,
        reason: 'extract_failed',
        detail:
          'This PDF contains no extractable text layer. It is most likely a scan or image-only document; OCR is not available in RAIZEL.',
      };
    }

    return { ok: true, text: normalizeText(joined), bytes, converted: true };
  } catch (err) {
    return {
      ok: false,
      text: '',
      bytes,
      reason: 'extract_failed',
      detail: `Could not read the PDF: ${err instanceof Error ? err.message : 'unknown error'}`,
    };
  }
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Extracts text from an in-memory buffer given a path (for type detection).
 * Used by both the attachment pipeline and the ZIP project importer.
 */
export async function extractTextFromBuffer(
  filePath: string,
  buffer: ArrayBuffer
): Promise<ExtractionResult> {
  const bytes = buffer.byteLength;
  const ext = getExtension(filePath);

  if (bytes > MAX_TEXT_FILE_BYTES) {
    return {
      ok: false,
      text: '',
      bytes,
      reason: 'too_large',
      detail: `File is ${formatBytes(bytes)}, above the ${formatBytes(MAX_TEXT_FILE_BYTES)} per-file limit.`,
    };
  }

  if (ext === 'docx') return extractDocx(buffer);
  if (ext === 'pdf') return extractPdf(buffer);

  if (!isTextLike(filePath)) {
    // Unknown extension: try decoding anyway, but verify the result is text.
    const candidate = decodeUtf8(buffer);
    if (!candidate || looksBinary(candidate)) {
      return {
        ok: false,
        text: '',
        bytes,
        reason: 'binary',
        detail: `"${filePath}" is a binary or unsupported format, so its contents were not read.`,
      };
    }
    return { ok: true, text: normalizeText(candidate), bytes };
  }

  const text = decodeUtf8(buffer);
  if (looksBinary(text)) {
    return {
      ok: false,
      text: '',
      bytes,
      reason: 'decode_failed',
      detail: `"${filePath}" could not be decoded as UTF-8 text.`,
    };
  }

  return { ok: true, text: normalizeText(text), bytes };
}

export async function extractTextFromFile(file: File): Promise<ExtractionResult> {
  const buffer = await file.arrayBuffer();
  return extractTextFromBuffer(file.name, buffer);
}

export function readFileAsDataURL(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file as data URL'));
    reader.readAsDataURL(file);
  });
}
