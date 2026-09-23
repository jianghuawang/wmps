import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate';
import * as XLSX from 'xlsx';
const root = resolve('examples/Harbor Studio');
for (const folder of ['Plans', 'Finance', 'Notes', 'Reference']) await mkdir(join(root,folder),{recursive:true});
await writeFile(join(root,'Welcome.md'), `# Harbor Studio\n\nA small team, a new collection, and one place for everything.\n\n> Fictional workspace made for the WMPS demo.\n\n## Autumn collection\n\nWe’re preparing a collection of everyday objects for a slower, more thoughtful home.\n\n### This week\n\n- [x] Agree on the creative direction\n- [x] Review the launch brief\n- [ ] Confirm the photography budget\n- [ ] Share the final collection guide\n\n## Around the workspace\n\n| Document | What’s inside |\n| --- | --- |\n| Launch brief | The idea, audience, and review comments |\n| Collection budget | Costs and a working forecast |\n| Weekly notes | Decisions and next steps |\n| Collection guide | A PDF to read and share |\n\n## A little less switching\n\nWrite a brief, check the numbers, and keep your notes alongside the work. Open any file from the sidebar to get started.\n`);
await writeFile(join(root,'Notes','Weekly notes.md'), '# Weekly notes\n\n## Monday · Creative review\n\nWe chose warm neutrals, simple shapes, and natural light for the autumn collection.\n\n- Mia will finish the product descriptions.\n- Alex will confirm the studio booking.\n- The team will review the budget on Thursday.\n');
const doc = new Document({creator:'Harbor Studio (fictional)', title:'Autumn collection — launch brief', styles:{default:{document:{run:{font:'Georgia',size:24},paragraph:{spacing:{after:180}}}}}, sections:[{children:[
new Paragraph({text:'Autumn collection',heading:HeadingLevel.TITLE}),
new Paragraph({children:[new TextRun({text:'LAUNCH BRIEF  /  HARBOR STUDIO',color:'687782',size:20})]}),
new Paragraph({text:'A quieter kind of everyday',heading:HeadingLevel.HEADING_1}),
new Paragraph('Our autumn collection brings together useful objects with a calm, considered feel. The focus is on things people reach for every day: a favorite cup, a generous notebook, and a light that makes a room feel like home.'),
new Paragraph('The launch will begin with a small collection of six products.'),
new Paragraph({text:'Who we’re making it for',heading:HeadingLevel.HEADING_1}),
new Paragraph('People who value thoughtful details, lasting materials, and a home that feels personal. We want the collection to feel welcoming, useful, and easy to live with.'),
new Paragraph({text:'The story we’ll tell',heading:HeadingLevel.HEADING_1}),
new Paragraph('Show the objects in real moments: a slow breakfast, an afternoon at the desk, or an evening spent reading. Photography should use natural light and leave room for the materials to speak.'),
new Paragraph({text:'Next steps',heading:HeadingLevel.HEADING_1}),
new Paragraph('Confirm the final product list, review the photography budget, and prepare a short collection guide for the team.')]}]});
const archive=unzipSync(await Packer.toBuffer(doc));
archive['word/document.xml']=strToU8(strFromU8(archive['word/document.xml']).replace(/<w:r>(<w:t[^>]*>The launch will begin with a small collection of six products\.<\/w:t>)<\/w:r>/,'<w:commentRangeStart w:id="0"/><w:r>$1</w:r><w:commentRangeEnd w:id="0"/><w:r><w:commentReference w:id="0"/></w:r>'));
if(!strFromU8(archive['word/document.xml']).includes('commentRangeStart'))throw new Error('Demo anchor was not inserted');
archive['word/comments.xml']=strToU8('<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:comment w:id="0" w:author="Mia Chen" w:initials="MC" w:date="2026-09-18T09:30:00Z"><w:p><w:r><w:t>Let’s lead with the ceramic cup and desk lamp. They tell the collection’s story best, and we can introduce the remaining pieces over the following week.</w:t></w:r></w:p></w:comment></w:comments>');
archive['word/_rels/document.xml.rels']=strToU8(strFromU8(archive['word/_rels/document.xml.rels']).replace('</Relationships>','<Relationship Id="rIdDemoComments" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="comments.xml"/></Relationships>'));
archive['[Content_Types].xml']=strToU8(strFromU8(archive['[Content_Types].xml']).replace('</Types>','<Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/></Types>'));
await writeFile(join(root,'Plans','Launch brief.docx'),zipSync(archive));
const book=XLSX.utils.book_new();const sheet=XLSX.utils.aoa_to_sheet([['Autumn collection','Units','Unit cost','Total'],['Ceramic cup',120,12,{t:'n',f:'B2*C2',v:1440}],['Desk lamp',60,38,{t:'n',f:'B3*C3',v:2280}],['Notebook',200,6,{t:'n',f:'B4*C4',v:1200}],['Photography',1,850,850],['Packaging',380,2,760],['Total','','',{t:'n',f:'SUM(D2:D6)',v:6530}]]);sheet['!cols']=[{wch:28},{wch:14},{wch:16},{wch:18}];XLSX.utils.book_append_sheet(book,sheet,'Budget');await writeFile(join(root,'Finance','Collection budget.xlsx'),XLSX.write(book,{type:'buffer',bookType:'xlsx'}));
function pdfBytes() {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    null,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];
  const stream = 'BT /F1 22 Tf 72 700 Td (Harbor Studio | Autumn Collection) Tj /F1 14 Tf 0 -40 Td (Six everyday objects. Thoughtful details. Lasting materials.) Tj ET';
  objects[3] = `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`;
  let output = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(output)); output += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(output); output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`; return Buffer.from(output);
}
await writeFile(join(root,'Reference','Collection guide.pdf'),pdfBytes());
console.log(root);
