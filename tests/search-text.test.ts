import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { extractSearchText } from '../src/main/search-text';
import { detectFileKind } from '../src/shared/file-types';

describe('workspace document search', () => {
  const document = zipSync({
    'word/document.xml': strToU8('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Marketing &amp; </w:t></w:r><w:r><w:t>管理</w:t></w:r></w:p></w:body></w:document>'),
    'word/comments.xml': strToU8('<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:comment w:id="1" w:author="Reviewer"><w:p><w:r><w:t>请补充案例</w:t></w:r></w:p></w:comment></w:comments>')
  });
  it('searches body runs and reviewer comments as readable text', async () => {
    expect(await extractSearchText('application.docx', document)).toEqual([
      { text: 'Marketing & 管理', location: 'Paragraph 1' },
      { text: '请补充案例', location: 'Comment · Reviewer' }
    ]);
  });
  it('recognizes Word content with a misleading Markdown extension', async () => {
    expect(detectFileKind('application.md', document)).toBe('word');
    expect(await extractSearchText('application.md', document)).toHaveLength(2);
    expect(detectFileKind('notes.md', strToU8('# Notes'))).toBe('markdown');
  });
});
