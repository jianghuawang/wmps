import { describe, expect, it } from 'vitest';
import { createScrollLineMap } from '../src/renderer/editors/markdown/line-map';

describe('Markdown bidirectional scroll line map', () => {
  it('interpolates between real rendered source anchors', () => {
    const map = createScrollLineMap([
      { sourceLine: 0, previewTop: 0 },
      { sourceLine: 10, previewTop: 240 },
      { sourceLine: 30, previewTop: 700 }
    ]);

    expect(map.previewTopForLine(5)).toBe(120);
    expect(map.previewTopForLine(20)).toBe(470);
    expect(map.sourceLineForPreviewTop(120)).toBe(5);
    expect(map.sourceLineForPreviewTop(470)).toBe(20);
  });

  it('clamps beyond the first and last anchors', () => {
    const map = createScrollLineMap([
      { sourceLine: 3, previewTop: 90 },
      { sourceLine: 8, previewTop: 190 }
    ]);
    expect(map.previewTopForLine(0)).toBe(90);
    expect(map.previewTopForLine(99)).toBe(190);
    expect(map.sourceLineForPreviewTop(-10)).toBe(3);
    expect(map.sourceLineForPreviewTop(900)).toBe(8);
  });
});
