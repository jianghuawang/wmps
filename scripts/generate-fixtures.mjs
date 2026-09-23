import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Document, HeadingLevel, ImageRun, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from 'docx';
import * as XLSX from 'xlsx';

const root = new URL('../fixtures/', import.meta.url).pathname;
await mkdir(join(root, 'assets'), { recursive: true });

const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const word = new Document({ sections: [{ headers: {}, children: [
  new Paragraph({ text: 'WMPS Round-trip Fixture', heading: HeadingLevel.TITLE }),
  new Paragraph({ text: 'A document with headings, formatting, a table, and an image.', heading: HeadingLevel.HEADING_1 }),
  new Paragraph({ children: [new TextRun({ text: 'Bold text', bold: true }), new TextRun(' and '), new TextRun({ text: 'italic text', italics: true })] }),
  new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [
    new TableRow({ children: [new TableCell({ children: [new Paragraph('Item')] }), new TableCell({ children: [new Paragraph('Value')] })] }),
    new TableRow({ children: [new TableCell({ children: [new Paragraph('Alpha')] }), new TableCell({ children: [new Paragraph('42')] })] })
  ] }),
  new Paragraph({ children: [new ImageRun({ data: pixel, transformation: { width: 48, height: 48 }, type: 'png' })] })
] }] });
await writeFile(join(root, 'roundtrip.docx'), await Packer.toBuffer(word));

const plan = XLSX.utils.aoa_to_sheet([['Item', 'Q1', 'Q2', 'Total'], ['Alpha', 10, 14, { t: 'n', v: 24, f: 'SUM(B2:C2)', z: '$0.00' }], ['Beta', 8, 12, { t: 'n', v: 20, f: 'SUM(B3:C3)', z: '$0.00' }]]);
plan['!cols'] = [{ wpx: 170 }, { wpx: 90 }, { wpx: 90 }, { wpx: 110 }]; plan['!rows'] = [{ hpx: 30 }]; plan['!merges'] = [];
const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, plan, 'Plan'); XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Assumption', 'Value'], ['Growth', .12]]), 'Assumptions');
await writeFile(join(root, 'roundtrip.xlsx'), XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx', cellStyles: true }));

await writeFile(join(root, 'sample.csv'), 'Name,Quarter,Amount\nAlpha,Q1,120\nBeta,Q2,180\n');
await writeFile(join(root, 'guide.md'), `---\ntitle: WMPS Markdown Fixture\n---\n\n# Working across formats\n\nA **live preview** with [a relative link](./preview.html).\n\n## GFM features\n\n- [x] Task lists\n- [ ] Bidirectional updates\n\n| Format | Mode |\n| --- | --- |\n| Markdown | Edit |\n| PDF | View |\n\nInline math $E = mc^2$ and a block:\n\n$$\\int_0^1 x^2 dx = \\frac{1}{3}$$\n\n\`\`\`ts\nconst localFirst = true;\n\`\`\`\n`);
await writeFile(join(root, 'preview.html'), `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="./assets/preview.css"><title>WMPS HTML</title></head><body><main><span>LOCAL HTML</span><h1>A safe, script-free preview.</h1><p>Relative styles load through the workspace-restricted protocol.</p><img src="./assets/mark.svg" alt="WMPS mark"><script>document.body.dataset.unsafe='true'</script></main></body></html>`);
await writeFile(join(root, 'assets/preview.css'), `body{margin:0;background:#f3f4f2;color:#1f292e;font-family:-apple-system,sans-serif}main{max-width:720px;margin:12vh auto;padding:64px;background:white;box-shadow:0 20px 60px #bcc3c7}span{font-size:11px;letter-spacing:.16em;color:#1766c2}h1{font-size:44px;letter-spacing:-.04em;max-width:570px}p{font:18px/1.6 Georgia,serif}img{width:72px;margin-top:25px}`);
await writeFile(join(root, 'assets/mark.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="24" fill="#1766c2"/><path d="M25 30h50v10H25zm0 20h50v10H25zm0 20h34v10H25z" fill="white"/></svg>`);

function pdfBytes() {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    null,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];
  const stream = 'BT /F1 28 Tf 72 700 Td (WMPS PDF Fixture) Tj /F1 14 Tf 0 -40 Td (Searchable and selectable text.) Tj ET';
  objects[3] = `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`;
  let output = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(output)); output += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(output); output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`; return Buffer.from(output);
}
await writeFile(join(root, 'reference.pdf'), pdfBytes());
console.log(`Generated fixtures in ${root}`);
