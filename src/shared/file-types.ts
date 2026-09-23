import { unzipSync } from 'fflate';
export type FileKind =
  | 'markdown'
  | 'word'
  | 'word-legacy'
  | 'spreadsheet'
  | 'spreadsheet-legacy'
  | 'csv'
  | 'html'
  | 'pdf'
  | 'unsupported';

const formats: Readonly<Record<string, FileKind>> = {
  '.md': 'markdown',
  '.docx': 'word',
  '.doc': 'word-legacy',
  '.xlsx': 'spreadsheet',
  '.xls': 'spreadsheet-legacy',
  '.csv': 'csv',
  '.html': 'html',
  '.htm': 'html',
  '.pdf': 'pdf'
};

function extensionOf(path: string): string {
  const name = path.split(/[\\/]/).pop() ?? path;
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot).toLowerCase() : '';
}

export function classifyFile(path: string): FileKind {
  return formats[extensionOf(path)] ?? 'unsupported';
}

export function isEditable(kind: FileKind): boolean {
  return ['markdown', 'word', 'word-legacy', 'spreadsheet', 'spreadsheet-legacy', 'csv'].includes(kind);
}

export function isGloballySearchable(path: string): boolean {
  return ['markdown', 'html', 'csv'].includes(classifyFile(path));
}

export function saveTargetForLegacy(path: string): string {
  const extension = extensionOf(path);
  if (extension === '.doc') return `${path.slice(0, -4)}.docx`;
  if (extension === '.xls') return `${path.slice(0, -4)}.xlsx`;
  return path;
}

export const supportedExtensions = Object.freeze(Object.keys(formats));

export function detectFileKind(path: string, bytes: Uint8Array): FileKind {
  if (bytes[0] === 80 && bytes[1] === 75 && classifyFile(path) === 'markdown') {
    try { if (unzipSync(bytes, { filter: file => file.name === 'word/document.xml' })['word/document.xml']) return 'word'; } catch { /* Fall back to extension. */ }
  }
  return classifyFile(path);
}
