import JSZip from 'jszip';
import { FileAttachment } from '@/types/chat';

/**
 * Checks if a file is an image based on mimeType or extension
 */
export function isImageFile(file: File | { name: string; type?: string }): boolean {
  if (file.type && file.type.startsWith('image/')) return true;
  const ext = file.name.split('.').pop()?.toLowerCase();
  return ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'bmp'].includes(ext || '');
}

/**
 * Checks if a file is a zip archive
 */
export function isZipFile(file: File | { name: string; type?: string }): boolean {
  if (file.type === 'application/zip' || file.type === 'application/x-zip-compressed') return true;
  const ext = file.name.split('.').pop()?.toLowerCase();
  return ext === 'zip';
}

/**
 * Checks if a file is a readable code or text document
 */
export function isTextFile(file: File | { name: string; type?: string }): boolean {
  if (file.type && (file.type.startsWith('text/') || file.type.includes('json') || file.type.includes('javascript'))) {
    return true;
  }
  const ext = file.name.split('.').pop()?.toLowerCase();
  const textExtensions = [
    'txt', 'md', 'js', 'jsx', 'ts', 'tsx', 'py', 'json', 'html', 'css',
    'scss', 'c', 'cpp', 'h', 'hpp', 'java', 'go', 'rs', 'php', 'rb',
    'sh', 'bash', 'zsh', 'yaml', 'yml', 'xml', 'sql', 'env', 'prisma', 'graphql'
  ];
  return textExtensions.includes(ext || '');
}

/**
 * Converts a File or Blob into base64 Data URL
 */
export function readFileAsDataURL(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Converts a File into text content
 */
export function readFileAsText(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

/**
 * Processes any uploaded file into a FileAttachment object
 */
export async function processUploadedFile(file: File): Promise<FileAttachment> {
  const id = `att_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  // 1. Handle Images
  if (isImageFile(file)) {
    const dataUrl = await readFileAsDataURL(file);
    return {
      id,
      name: file.name,
      type: 'image',
      size: file.size,
      mimeType: file.type || 'image/png',
      content: dataUrl,
      previewUrl: dataUrl,
    };
  }

  // 2. Handle Zip Archives
  if (isZipFile(file)) {
    try {
      const zip = await JSZip.loadAsync(file);
      const fileNames: string[] = [];
      const extractedSnippets: string[] = [];
      let totalExtractedSize = 0;
      const MAX_TOTAL_SIZE = 2 * 1024 * 1024; // 2 MB limit for extracted text inside prompt

      // Read files in zip
      const entries = Object.keys(zip.files);
      for (const relativePath of entries) {
        const zipEntry = zip.files[relativePath];
        if (!zipEntry.dir) {
          fileNames.push(relativePath);
          // If it's a readable code/text file, extract content
          const isText = isTextFile({ name: relativePath });
          if (isText && totalExtractedSize < MAX_TOTAL_SIZE) {
            try {
              const textContent = await zipEntry.async('string');
              if (textContent.length > 0 && totalExtractedSize + textContent.length <= MAX_TOTAL_SIZE) {
                totalExtractedSize += textContent.length;
                extractedSnippets.push(
                  `--- File: ${relativePath} (${textContent.split('\n').length} lines) ---\n${textContent.slice(0, 80000)}`
                );
              }
            } catch {
              // ignore non-text binary in zip
            }
          }
        }
      }

      const summaryText = `[ZIP Archive: ${file.name}]\n` +
        `Total files: ${fileNames.length}\n\n` +
        `Directory Listing:\n` +
        fileNames.slice(0, 50).map((f) => ` - ${f}`).join('\n') +
        (fileNames.length > 50 ? `\n ...and ${fileNames.length - 50} more files\n` : '\n\n') +
        `Extracted Code/Text Content:\n` +
        (extractedSnippets.length > 0
          ? extractedSnippets.join('\n\n')
          : '(No plain text or code files extracted)');

      return {
        id,
        name: file.name,
        type: 'zip',
        size: file.size,
        mimeType: 'application/zip',
        content: summaryText,
        extractedFiles: fileNames,
      };
    } catch (e) {
      console.error('Failed to parse zip file', e);
      return {
        id,
        name: file.name,
        type: 'zip',
        size: file.size,
        mimeType: 'application/zip',
        content: `[ZIP Archive: ${file.name}] (Unable to decompress archive contents)`,
      };
    }
  }

  // 3. Handle Text / Code / Document Files
  try {
    const text = await readFileAsText(file);
    const lineCount = text.split('\n').length;
    return {
      id,
      name: file.name,
      type: 'text',
      size: file.size,
      mimeType: file.type || 'text/plain',
      content: text,
      lineCount,
    };
  } catch {
    return {
      id,
      name: file.name,
      type: 'document',
      size: file.size,
      mimeType: file.type || 'application/octet-stream',
      content: `[File Attachment: ${file.name} (${file.size} bytes)]`,
    };
  }
}

/**
 * Creates an auto-collapsed snippet attachment when long text is pasted (like Claude AI)
 */
export function createPastedSnippetAttachment(pastedText: string): FileAttachment {
  const id = `paste_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const lines = pastedText.split('\n');
  const lineCount = lines.length;

  // Infer filename or extension
  let extension = 'txt';
  const trimmed = pastedText.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    extension = 'json';
  } else if (trimmed.includes('import React') || trimmed.includes('export default') || trimmed.includes('className=')) {
    extension = 'tsx';
  } else if (trimmed.includes('def ') || (trimmed.includes('import ') && trimmed.includes(':'))) {
    extension = 'py';
  } else if (trimmed.includes('function ') || trimmed.includes('const ') || trimmed.includes('let ')) {
    extension = 'js';
  } else if (trimmed.startsWith('#include') || trimmed.includes('int main(')) {
    extension = 'c';
  } else if (trimmed.startsWith('<html') || trimmed.startsWith('<!DOCTYPE')) {
    extension = 'html';
  }

  const name = `pasted_content.${extension}`;

  return {
    id,
    name,
    type: 'text',
    size: new Blob([pastedText]).size,
    mimeType: 'text/plain',
    content: pastedText,
    lineCount,
  };
}

/**
 * Formats size into human-readable string (KB, MB)
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
