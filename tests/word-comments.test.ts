import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { readWordComments } from '../src/renderer/editors/word-comments';

describe('existing Word comments', () => {
  it('reads authors, replies, resolved state, escaped text and anchored quotes', () => {
    const ns = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"';
    const bytes = zipSync({
      'word/comments.xml': strToU8(`<w:comments ${ns}><w:comment w:id="7" w:author="Alex Chen"><w:p w14:paraId="FIRST"><w:r><w:t>First paragraph.</w:t></w:r></w:p><w:p w14:paraId="AAA"><w:r><w:t>Keep &lt;this&gt; &amp; that.</w:t></w:r></w:p></w:comment><w:comment w:id="8" w:author="Sam"><w:p w14:paraId="BBB"><w:r><w:t>Agreed.</w:t></w:r></w:p></w:comment></w:comments>`),
      'word/document.xml': strToU8(`<w:document ${ns}><w:body><w:p><w:commentRangeStart w:id="7"/><w:r><w:t>Original wording</w:t></w:r><w:commentRangeEnd w:id="7"/></w:p></w:body></w:document>`),
      'word/commentsExtended.xml': strToU8('<w15:commentsEx xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml"><w15:commentEx w15:paraId="AAA" w15:done="1"/><w15:commentEx w15:paraId="BBB" w15:paraIdParent="AAA"/></w15:commentsEx>')
    });
    const comments = readWordComments(bytes);
    expect(comments).toHaveLength(2);
    expect(comments[0]).toMatchObject({ author: 'Alex Chen', initials: 'AC', text: 'First paragraph.\nKeep <this> & that.', quote: 'Original wording', resolved: true });
    expect(comments[1]).toMatchObject({ parentId: '7', text: 'Agreed.' });
  });
  it('distinguishes repeated text anchors by their document occurrence', () => {
    const ns = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
    const bytes = zipSync({
      'word/comments.xml': strToU8(`<w:comments ${ns}><w:comment w:id="0"><w:p><w:r><w:t>Second factory</w:t></w:r></w:p></w:comment></w:comments>`),
      'word/document.xml': strToU8(`<w:document ${ns}><w:body><w:p><w:r><w:t>factory then </w:t></w:r><w:commentRangeStart w:id="0"/><w:r><w:t>factory</w:t></w:r><w:commentRangeEnd w:id="0"/></w:p></w:body></w:document>`)
    });
    expect(readWordComments(bytes)[0]).toMatchObject({ quote: 'factory', occurrence: 1, occurrences: 2 });
  });
  it('returns an empty list for a document without comments', () => {
    expect(readWordComments(zipSync({ 'word/document.xml': strToU8('<document/>') }))).toEqual([]);
  });
});
