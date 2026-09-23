// @vitest-environment jsdom
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { createDocxEditor } from '@docx-editor.dev/core';

Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { configurable: true, value: () => null });

function documentXml(bytes: Uint8Array) {
  const files = unzipSync(bytes);
  return strFromU8(files['word/document.xml']);
}

describe('DOCX byte-in and byte-out seam', () => {
  it('reopens a serialized fixture without losing its body, table, or image relationship', async () => {
    const input = new Uint8Array(await readFile(resolve('fixtures/roundtrip.docx')));
    const first = createDocxEditor({ document: input, mode: 'edit', container: document.createElement('div') });
    const serialized = new Uint8Array(await first.save()); first.destroy();
    expect(documentXml(serialized)).toContain('WMPS Round-trip Fixture');
    expect(documentXml(serialized)).toContain('<w:tbl');
    expect(Object.keys(unzipSync(serialized)).some((path) => path.startsWith('word/media/') && path.endsWith('.png'))).toBe(true);

    const reopened = createDocxEditor({ document: serialized, mode: 'edit', container: document.createElement('div') });
    const second = new Uint8Array(await reopened.save()); reopened.destroy();
    expect(documentXml(second)).toContain('WMPS Round-trip Fixture');
    expect(documentXml(second)).toContain('<w:tbl');
  });
});
