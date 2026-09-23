import { expect, it } from 'vitest';
import { readOoxmlPart } from '@docx-editor.dev/core/store';
import { wordReviewModules } from '../src/renderer/editors/word-review';
const ns = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
function part(xml: string, name: string) {
  const result = readOoxmlPart(xml, { name: `/word/${name}.xml`, contentType: 'application/xml' });
  if (!result.ok) throw new Error(result.reason);
  return result.part;
}
const commentsPart = part(`<w:comments ${ns}><w:comment w:id="7" w:author="Reviewer"><w:p><w:r><w:t>Clarify this sentence</w:t></w:r></w:p></w:comment></w:comments>`, 'comments');
const collect = wordReviewModules[0].review!.collectReviewItems;
it('anchors the actual repeated sentence and tracks its shifted position after text edits', () => {
  for (const prefix of ['', 'New introduction. ']) {
    const storyPart = part(`<w:document ${ns}><w:body><w:p><w:r><w:t>${prefix}Same sentence. </w:t></w:r><w:commentRangeStart w:id="7"/><w:r><w:t>Same sentence.</w:t></w:r><w:commentRangeEnd w:id="7"/></w:p></w:body></w:document>`, 'document');
    const [item] = collect({ storyPart, commentsPart });
    expect(item.kind).toBe('comment');
    if (item.kind !== 'comment') throw new Error('Expected comment');
    expect(item.range?.start.offset).toBe(prefix.length + 15);
    expect(item.range?.end.offset).toBe(prefix.length + 29);
    expect(item.orphaned).toBe(false);
  }
});
it('retains the complete cross-paragraph range rather than a matching text fragment', () => {
  const storyPart = part(`<w:document ${ns}><w:body><w:p><w:commentRangeStart w:id="7"/><w:r><w:t>First paragraph</w:t></w:r></w:p><w:p><w:r><w:t>Second paragraph</w:t></w:r><w:commentRangeEnd w:id="7"/></w:p></w:body></w:document>`, 'document');
  const [item] = collect({ storyPart, commentsPart });
  if (item.kind !== 'comment') throw new Error('Expected comment');
  expect(item.range?.start.paragraphId).not.toBe(item.range?.end.paragraphId);
  expect(item.range?.start.offset).toBe(0);
  expect(item.range?.end.offset).toBe(16);
});
it('keeps comments with collapsed anchors visible without inventing a highlighted sentence', () => {
  const storyPart = part(`<w:document ${ns}><w:body><w:p><w:r><w:t>Text</w:t></w:r><w:commentRangeStart w:id="7"/><w:commentRangeEnd w:id="7"/></w:p></w:body></w:document>`, 'document');
  const [item] = collect({ storyPart, commentsPart });
  expect(item).toMatchObject({ kind: 'comment', id: '7', range: null, orphaned: true });
});
