import { DOMParser } from '@xmldom/xmldom';
import { unzipSync, strFromU8 } from 'fflate';
import * as XLSX from 'xlsx';
import { classifyFile } from '../shared/file-types.js';

export interface SearchSection { text: string; location: string; }
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
export async function extractSearchText(path: string, bytes: Uint8Array): Promise<SearchSection[]> {
  const kind = classifyFile(path);
  if (bytes[0] === 80 && bytes[1] === 75) {
    const archive = unzipSync(bytes, { filter: file => /^word\/(document|comments|header\d+|footer\d+)\.xml$/.test(file.name) });
    if (archive['word/document.xml']) {
      const result: SearchSection[] = [];
      for (const [name, data] of Object.entries(archive)) {
        const doc = new DOMParser().parseFromString(strFromU8(data), 'application/xml');
        const paragraphs = Array.from(doc.getElementsByTagNameNS(W, 'p'));
        for (const [index, p] of paragraphs.entries()) {
          const comment = p.parentNode?.nodeType === 1 && (p.parentNode as Element).localName === 'comment' ? p.parentNode as Element : null;
          result.push({ text: Array.from(p.getElementsByTagNameNS(W, 't')).map(t => t.textContent).join(''), location: comment ? `Comment · ${comment.getAttributeNS(W, 'author') || 'Reviewer'}` : `Paragraph ${index + 1}` });
        }
      }
      return result;
    }
  }
  if (['spreadsheet', 'spreadsheet-legacy', 'csv'].includes(kind)) {
    const book = XLSX.read(bytes, { type: 'array' });
    return book.SheetNames.flatMap(name => XLSX.utils.sheet_to_csv(book.Sheets[name]).split('\n').map((text, i) => ({ text, location: `${name} · Row ${i + 1}` })));
  }
  if (kind === 'pdf') {
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task = getDocument({ data: bytes.slice(), useSystemFonts: true });
    const pdf = await task.promise;
    try {
      const result: SearchSection[] = [];
      for (let page = 1; page <= pdf.numPages; page++) {
        const content = await (await pdf.getPage(page)).getTextContent();
        result.push({ text: content.items.map(item => 'str' in item ? item.str : '').join(' '), location: `Page ${page}` });
      }
      return result;
    } finally { await task.destroy(); }
  }
  return new TextDecoder().decode(bytes).split(/\r?\n/).map((text, i) => ({ text, location: `Line ${i + 1}` }));
}
