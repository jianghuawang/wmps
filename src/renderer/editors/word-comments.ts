import { unzipSync, strFromU8 } from 'fflate';

export interface WordComment {
  key: string; id: string; author: string; initials: string; date?: string;
  text: string; resolved: boolean; parentId?: string; quote: string; occurrence: number; occurrences: number;
}
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const W14 = 'http://schemas.microsoft.com/office/word/2010/wordml';
const W15 = 'http://schemas.microsoft.com/office/word/2012/wordml';
const elements = (node: Document | Element, local: string) => Array.from(node.getElementsByTagNameNS(W, local));

/** Read comments from the package even when the editing engine has no review module. */
export function readWordComments(bytes: Uint8Array): WordComment[] {
  const files = unzipSync(bytes, { filter: file => /word\/(comments[^/]*|document)\.xml$/.test(file.name) });
  const xml = (path: string) => files[path] ? new DOMParser().parseFromString(strFromU8(files[path]), 'application/xml') : null;
  const document = xml('word/document.xml'); const comments = xml('word/comments.xml');
  if (!comments) return [];
  if (comments.querySelector('parsererror')) throw new Error('The document comments could not be read.');
  const rows = elements(comments, 'comment');
  const paragraphIds = new Map(rows.flatMap(row => elements(row, 'p').map(p => [p.getAttributeNS(W14, 'paraId'), row.getAttributeNS(W, 'id') || ''] as const)));
  const extensions = xml('word/commentsExtended.xml');
  const states = new Map(Array.from(extensions?.getElementsByTagNameNS(W15, 'commentEx') || []).map(row => [row.getAttributeNS(W15, 'paraId'), row]));
  let bodyText = ''; const starts = new Map<string, number>();
  const quotes = new Map<string, string>(); const active = new Set<string>();
  for (const node of Array.from(document?.getElementsByTagName('*') || [])) {
    if (node.namespaceURI !== W) continue;
    const id = node.getAttributeNS(W, 'id') || '';
    if (node.localName === 'commentRangeStart') { active.add(id); quotes.set(id, ''); starts.set(id, bodyText.length); }
    if (node.localName === 'commentRangeEnd') active.delete(id);
    if (node.localName === 'p') for (const commentId of active) if (quotes.get(commentId)) quotes.set(commentId, quotes.get(commentId) + '\n');
    if (node.localName === 'tab' || node.localName === 'br') for (const commentId of active) quotes.set(commentId, (quotes.get(commentId) || '') + (node.localName === 'tab' ? '\t' : '\n'));
    if (node.localName === 't') { for (const commentId of active) quotes.set(commentId, (quotes.get(commentId) || '') + node.textContent); bodyText += node.textContent || ''; }
  }
  return rows.map(row => {
    const id = row.getAttributeNS(W, 'id') || ''; const author = row.getAttributeNS(W, 'author') || '';
    const quote = quotes.get(id) || ''; const needle = quote.trim().toLocaleLowerCase(); const positions: number[] = [];
    if (needle) for (let index = bodyText.toLocaleLowerCase().indexOf(needle); index >= 0; index = bodyText.toLocaleLowerCase().indexOf(needle, index + needle.length)) positions.push(index);
    const start = (starts.get(id) || 0) + quote.length - quote.trimStart().length;
    const state = elements(row, 'p').map(p => states.get(p.getAttributeNS(W14, 'paraId') || '')).find(Boolean);
    return { key: `comment:${id}`, id, author, initials: row.getAttributeNS(W, 'initials') || author.split(/\s+/).map(s => s[0]).join('').slice(0, 2), date: row.getAttributeNS(W, 'date') || undefined,
      text: elements(row, 'p').map(p => elements(p, 't').map(t => t.textContent).join('')).join('\n'),
      resolved: ['1', 'true'].includes(state?.getAttributeNS(W15, 'done') || ''),
      parentId: paragraphIds.get(state?.getAttributeNS(W15, 'paraIdParent') || ''), quote, occurrence: positions.indexOf(start), occurrences: positions.length };
  });
}
