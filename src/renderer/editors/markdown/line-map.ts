export interface LineAnchor {
  sourceLine: number;
  previewTop: number;
}

export interface ScrollLineMap {
  previewTopForLine(line: number): number;
  sourceLineForPreviewTop(top: number): number;
}

function interpolate(value: number, aValue: number, bValue: number, aResult: number, bResult: number): number {
  if (aValue === bValue) return aResult;
  const ratio = (value - aValue) / (bValue - aValue);
  return aResult + ratio * (bResult - aResult);
}

export function createScrollLineMap(input: readonly LineAnchor[]): ScrollLineMap {
  const anchors = [...input]
    .filter((anchor) => Number.isFinite(anchor.sourceLine) && Number.isFinite(anchor.previewTop))
    .sort((a, b) => a.sourceLine - b.sourceLine || a.previewTop - b.previewTop);

  if (anchors.length === 0) anchors.push({ sourceLine: 0, previewTop: 0 });

  const byPreview = [...anchors].sort((a, b) => a.previewTop - b.previewTop);

  function between(value: number, list: readonly LineAnchor[], key: 'sourceLine' | 'previewTop') {
    if (value <= list[0][key]) return [list[0], list[0]] as const;
    const last = list[list.length - 1];
    if (value >= last[key]) return [last, last] as const;
    const upperIndex = list.findIndex((anchor) => anchor[key] >= value);
    return [list[upperIndex - 1], list[upperIndex]] as const;
  }

  return {
    previewTopForLine(line) {
      const [a, b] = between(line, anchors, 'sourceLine');
      return interpolate(line, a.sourceLine, b.sourceLine, a.previewTop, b.previewTop);
    },
    sourceLineForPreviewTop(top) {
      const [a, b] = between(top, byPreview, 'previewTop');
      return interpolate(top, a.previewTop, b.previewTop, a.sourceLine, b.sourceLine);
    }
  };
}
