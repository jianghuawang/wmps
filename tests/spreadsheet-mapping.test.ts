import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { sheetJsToUniver, univerToWorkbookBytes } from '../src/renderer/editors/spreadsheet/mapping';

describe('SheetJS and Univer workbook seam', () => {
  it('preserves values, formulas, formats, merges, dimensions and sheet order', () => {
    const first = XLSX.utils.aoa_to_sheet([['Item', 'Amount'], ['A', 10], ['B', 15], ['Total', { t: 'n', v: 25, f: 'SUM(B2:B3)', z: '$0.00' }]]);
    first['!merges'] = [XLSX.utils.decode_range('A1:B1')];
    first['!cols'] = [{ wpx: 160 }, { wpx: 90 }]; first['!rows'] = [{ hpx: 28 }];
    const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, first, 'Plan'); XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Note'], ['Second sheet']]), 'Notes');
    const input = new Uint8Array(XLSX.write(workbook, { type: 'array', bookType: 'xlsx', cellStyles: true }));

    const snapshot = sheetJsToUniver(input, 'Budget.xlsx');
    expect(snapshot.sheetOrder.map((id) => snapshot.sheets[id].name)).toEqual(['Plan', 'Notes']);
    const plan = snapshot.sheets[snapshot.sheetOrder[0]];
    expect(plan.cellData?.[3]?.[1]?.f).toBe('=SUM(B2:B3)');
    expect(plan.cellData?.[3]?.[1]?.s).toMatchObject({ n: { pattern: '$0.00' } });
    expect(plan.mergeData).toEqual([{ startRow: 0, startColumn: 0, endRow: 0, endColumn: 1 }]);
    expect(plan.columnData?.[0]?.w).toBe(160);
    expect(plan.rowData?.[0]?.h).toBe(28);

    plan.cellData![1]![1] = { v: 11, t: plan.cellData![1]![1]!.t };

    const output = XLSX.read(univerToWorkbookBytes(snapshot, 'xlsx'), { cellFormula: true, cellNF: true, cellStyles: true });
    expect(output.SheetNames).toEqual(['Plan', 'Notes']);
    expect(output.Sheets.Plan.B4.f).toBe('SUM(B2:B3)');
    expect(output.Sheets.Plan.B4.z).toBe('$0.00');
    expect(output.Sheets.Plan.B2.v).toBe(11);
    expect(output.Sheets.Plan['!merges']).toEqual([XLSX.utils.decode_range('A1:B1')]);
  });

  it('imports legacy XLS and saves the edited workbook as XLSX bytes', () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Legacy'], [7]]), 'Sheet1');
    const legacy = new Uint8Array(XLSX.write(workbook, { type: 'array', bookType: 'xls' }));

    const snapshot = sheetJsToUniver(legacy, 'Legacy.xls');
    const sheet = snapshot.sheets[snapshot.sheetOrder[0]];
    sheet.cellData![1]![0] = { ...sheet.cellData![1]![0], v: 8 };

    const converted = XLSX.read(univerToWorkbookBytes(snapshot, 'xlsx'));
    expect(converted.Sheets.Sheet1.A2.v).toBe(8);
  });
});
