import { BorderStyleTypes, CellValueType, HorizontalAlign, LocaleType, VerticalAlign, WrapStrategy, type IBorderStyleData, type ICellData, type IStyleData, type IWorkbookData } from '@univerjs/core';
import * as XLSX from 'xlsx';

type SheetBorder = { style?: string; color?: { rgb?: string } };
type SheetStyle = { font?: { name?: string; sz?: number; bold?: boolean; italic?: boolean; color?: { rgb?: string } }; fill?: { fgColor?: { rgb?: string } }; border?: { top?: SheetBorder; right?: SheetBorder; bottom?: SheetBorder; left?: SheetBorder }; alignment?: { horizontal?: string; vertical?: string; wrapText?: boolean }; numFmt?: string };

function color(rgb?: string) { if (!rgb) return undefined; const value = rgb.length === 8 ? rgb.slice(2) : rgb; return { rgb: `#${value}` }; }
const borderStyles: Record<string, BorderStyleTypes> = { thin: BorderStyleTypes.THIN, hair: BorderStyleTypes.HAIR, dotted: BorderStyleTypes.DOTTED, dashed: BorderStyleTypes.DASHED, dashDot: BorderStyleTypes.DASH_DOT, dashDotDot: BorderStyleTypes.DASH_DOT_DOT, double: BorderStyleTypes.DOUBLE, medium: BorderStyleTypes.MEDIUM, mediumDashed: BorderStyleTypes.MEDIUM_DASHED, mediumDashDot: BorderStyleTypes.MEDIUM_DASH_DOT, mediumDashDotDot: BorderStyleTypes.MEDIUM_DASH_DOT_DOT, slantDashDot: BorderStyleTypes.SLANT_DASH_DOT, thick: BorderStyleTypes.THICK };
function toUniverBorder(border?: SheetBorder): IBorderStyleData | undefined { const cl = color(border?.color?.rgb); if (!border?.style || !cl) return undefined; return { s: borderStyles[border.style] ?? BorderStyleTypes.THIN, cl }; }
function toUniverStyle(cell: XLSX.CellObject): IStyleData | undefined {
  const style = (cell.s ?? {}) as SheetStyle; const result: IStyleData = {};
  if (style.font?.name) result.ff = style.font.name;
  if (style.font?.sz) result.fs = style.font.sz;
  if (style.font?.bold) result.bl = 1;
  if (style.font?.italic) result.it = 1;
  if (style.font?.color?.rgb) result.cl = color(style.font.color.rgb);
  if (style.fill?.fgColor?.rgb) result.bg = color(style.fill.fgColor.rgb);
  const top = toUniverBorder(style.border?.top); const right = toUniverBorder(style.border?.right); const bottom = toUniverBorder(style.border?.bottom); const left = toUniverBorder(style.border?.left);
  if (top || right || bottom || left) result.bd = { t: top, r: right, b: bottom, l: left };
  const horizontal = { left: HorizontalAlign.LEFT, center: HorizontalAlign.CENTER, right: HorizontalAlign.RIGHT, justify: HorizontalAlign.JUSTIFIED, distributed: HorizontalAlign.DISTRIBUTED }[style.alignment?.horizontal ?? '']; if (horizontal) result.ht = horizontal;
  const vertical = { top: VerticalAlign.TOP, center: VerticalAlign.MIDDLE, bottom: VerticalAlign.BOTTOM }[style.alignment?.vertical ?? '']; if (vertical) result.vt = vertical;
  if (style.alignment?.wrapText) result.tb = WrapStrategy.WRAP;
  if (cell.z) result.n = { pattern: String(cell.z) };
  return Object.keys(result).length ? result : undefined;
}

function cellType(cell: XLSX.CellObject) {
  if (cell.t === 'n' || cell.t === 'd') return CellValueType.NUMBER;
  if (cell.t === 'b') return CellValueType.BOOLEAN;
  return CellValueType.STRING;
}

export function sheetJsToUniver(bytes: Uint8Array, name: string): IWorkbookData {
  const workbook = XLSX.read(bytes, { type: 'array', cellFormula: true, cellNF: true, cellStyles: true, cellDates: false });
  const id = `wmps-${crypto.randomUUID()}`; const sheets: IWorkbookData['sheets'] = {}; const sheetOrder: string[] = [];
  workbook.SheetNames.forEach((sheetName, sheetIndex) => {
    const worksheet = workbook.Sheets[sheetName]; const sheetId = `${id}-sheet-${sheetIndex}`; sheetOrder.push(sheetId);
    const range = XLSX.utils.decode_range(worksheet['!ref'] ?? 'A1'); const cellData: Record<number, Record<number, ICellData>> = {};
    for (let row = range.s.r; row <= range.e.r; row += 1) for (let column = range.s.c; column <= range.e.c; column += 1) {
      const source = worksheet[XLSX.utils.encode_cell({ r: row, c: column })]; if (!source) continue;
      const cell: ICellData = { v: source.v as string | number | boolean, t: cellType(source) };
      if (source.f) cell.f = source.f.startsWith('=') ? source.f : `=${source.f}`;
      const style = toUniverStyle(source); if (style) cell.s = style;
      (cellData[row] ??= {})[column] = cell;
    }
    const rowData: Record<number, { h?: number }> = {}; worksheet['!rows']?.forEach((row, index) => { if (row?.hpx) rowData[index] = { h: row.hpx }; });
    const columnData: Record<number, { w?: number }> = {}; worksheet['!cols']?.forEach((column, index) => { if (column?.wpx) columnData[index] = { w: column.wpx }; });
    sheets[sheetId] = { id: sheetId, name: sheetName, rowCount: Math.max(range.e.r + 1, 100), columnCount: Math.max(range.e.c + 1, 26), cellData, rowData, columnData,
      mergeData: (worksheet['!merges'] ?? []).map((merge) => ({ startRow: merge.s.r, startColumn: merge.s.c, endRow: merge.e.r, endColumn: merge.e.c })), showGridlines: 1, hidden: 0, rightToLeft: 0, tabColor: '', freeze: { startRow: -1, startColumn: -1, xSplit: 0, ySplit: 0 }, zoomRatio: 1, scrollTop: 0, scrollLeft: 0, defaultColumnWidth: 88, defaultRowHeight: 24, rowHeader: { width: 46 }, columnHeader: { height: 24 } };
  });
  return { id, name, appVersion: '0.25.1', locale: LocaleType.EN_US, styles: {}, sheetOrder, sheets };
}

function sheetJsType(type: CellValueType | null | undefined | void): XLSX.ExcelDataType {
  if (type === CellValueType.NUMBER) return 'n'; if (type === CellValueType.BOOLEAN) return 'b'; return 's';
}

const borderNames = new Map<BorderStyleTypes, string>(Object.entries(borderStyles).map(([name, value]) => [value, name]));
function toSheetBorder(border?: IBorderStyleData | null | void) { return border ? { style: borderNames.get(border.s) ?? 'thin', color: border.cl.rgb ? { rgb: border.cl.rgb.replace('#', '') } : undefined } : undefined; }

export function univerToWorkbookBytes(snapshot: IWorkbookData, format: 'xlsx' | 'csv'): Uint8Array {
  const workbook = XLSX.utils.book_new();
  for (const sheetId of snapshot.sheetOrder) {
    const source = snapshot.sheets[sheetId]; const worksheet: XLSX.WorkSheet = {};
    let maxRow = 0; let maxColumn = 0;
    for (const [rowKey, row] of Object.entries(source.cellData ?? {})) for (const [columnKey, cell] of Object.entries((row ?? {}) as Record<string, ICellData>)) {
      if (!cell) continue; const r = Number(rowKey); const c = Number(columnKey); maxRow = Math.max(maxRow, r); maxColumn = Math.max(maxColumn, c);
      const target: XLSX.CellObject = { t: sheetJsType(cell.t), v: cell.v ?? '' };
      if (cell.f) target.f = cell.f.startsWith('=') ? cell.f.slice(1) : cell.f;
      if (typeof cell.s === 'object' && cell.s) { if (cell.s.n?.pattern) target.z = cell.s.n.pattern; target.s = { font: { name: cell.s.ff, sz: cell.s.fs, bold: cell.s.bl === 1, italic: cell.s.it === 1, color: cell.s.cl?.rgb ? { rgb: cell.s.cl.rgb.replace('#', '') } : undefined }, fill: cell.s.bg?.rgb ? { fgColor: { rgb: cell.s.bg.rgb.replace('#', '') } } : undefined, border: cell.s.bd ? { top: toSheetBorder(cell.s.bd.t), right: toSheetBorder(cell.s.bd.r), bottom: toSheetBorder(cell.s.bd.b), left: toSheetBorder(cell.s.bd.l) } : undefined, alignment: { horizontal: ({ [HorizontalAlign.LEFT]: 'left', [HorizontalAlign.CENTER]: 'center', [HorizontalAlign.RIGHT]: 'right', [HorizontalAlign.JUSTIFIED]: 'justify', [HorizontalAlign.DISTRIBUTED]: 'distributed' } as Record<number, string>)[cell.s.ht ?? 0], vertical: ({ [VerticalAlign.TOP]: 'top', [VerticalAlign.MIDDLE]: 'center', [VerticalAlign.BOTTOM]: 'bottom' } as Record<number, string>)[cell.s.vt ?? 0], wrapText: cell.s.tb === WrapStrategy.WRAP } }; }
      worksheet[XLSX.utils.encode_cell({ r, c })] = target;
    }
    worksheet['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxRow, c: maxColumn } });
    worksheet['!merges'] = source.mergeData?.map((merge) => ({ s: { r: merge.startRow, c: merge.startColumn }, e: { r: merge.endRow, c: merge.endColumn } }));
    worksheet['!rows'] = Object.entries(source.rowData ?? {}).map(([index, row]) => ({ hpx: row?.h, hidden: row?.hd === 1, __index: Number(index) })).reduce<XLSX.RowInfo[]>((all, row) => { all[(row as XLSX.RowInfo & { __index: number }).__index] = row; return all; }, []);
    worksheet['!cols'] = Object.entries(source.columnData ?? {}).map(([index, column]) => ({ wpx: column?.w, hidden: column?.hd === 1, __index: Number(index) })).reduce<XLSX.ColInfo[]>((all, column) => { all[(column as XLSX.ColInfo & { __index: number }).__index] = column; return all; }, []);
    XLSX.utils.book_append_sheet(workbook, worksheet, source.name ?? 'Sheet');
    if (format === 'csv') break;
  }
  if (format === 'csv') return new TextEncoder().encode(XLSX.utils.sheet_to_csv(workbook.Sheets[workbook.SheetNames[0]]));
  return new Uint8Array(XLSX.write(workbook, { type: 'array', bookType: 'xlsx', cellStyles: true }));
}
