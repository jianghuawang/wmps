import { describe, expect, it } from 'vitest';
import { classifyFile, isGloballySearchable, saveTargetForLegacy } from '../src/shared/file-types';

describe('file format contract', () => {
  it('classifies every format promised by WMPS', () => {
    expect(classifyFile('brief.md')).toBe('markdown');
    expect(classifyFile('memo.docx')).toBe('word');
    expect(classifyFile('memo.DOC')).toBe('word-legacy');
    expect(classifyFile('model.xlsx')).toBe('spreadsheet');
    expect(classifyFile('model.xls')).toBe('spreadsheet-legacy');
    expect(classifyFile('data.csv')).toBe('csv');
    expect(classifyFile('prototype.htm')).toBe('html');
    expect(classifyFile('reference.pdf')).toBe('pdf');
    expect(classifyFile('notes.txt')).toBe('unsupported');
    expect(classifyFile('data.json')).toBe('unsupported');
  });

  it('limits workspace text search to the agreed first-release formats', () => {
    expect(isGloballySearchable('notes.md')).toBe(true);
    expect(isGloballySearchable('preview.html')).toBe(true);
    expect(isGloballySearchable('data.csv')).toBe(true);
    expect(isGloballySearchable('memo.docx')).toBe(false);
  });

  it('never overwrites a legacy Office format', () => {
    expect(saveTargetForLegacy('/work/memo.doc')).toBe('/work/memo.docx');
    expect(saveTargetForLegacy('/work/model.xls')).toBe('/work/model.xlsx');
    expect(saveTargetForLegacy('/work/model.xlsx')).toBe('/work/model.xlsx');
  });
});
