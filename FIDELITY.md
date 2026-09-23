# Round-trip fidelity

WMPS always writes atomically, detects conflicting on-disk changes, and keeps legacy `.doc`/`.xls` originals untouched. Format-level fidelity still depends on the editor engine and bridge.

| Format | Expected to survive | Known limits |
| --- | --- | --- |
| Markdown | Exact source text, GFM syntax, front matter, task lists, fenced code, KaTeX source | Preview HTML is derived and is never saved |
| DOCX | Paragraphs, runs, common formatting, headings, lists, tables, images, page structure, and unsupported package payloads preserved by the DOCX engine | The current Word engine uses approximate font metrics for line wrapping and pagination; layout can differ from Microsoft Word. Advanced Word features must be verified against the original |
| DOC | Converted by macOS `textutil`, then edited as DOCX | The conversion step can simplify legacy-only Word features; WMPS never overwrites the `.doc` |
| XLSX | Cell values, formulas, number formats, common font/fill/alignment/border data when exposed by SheetJS, merges, row heights, column widths, and multiple sheets | Charts, pivot tables, macros, slicers, conditional formatting, data validation, drawings, named ranges, external links, and unsupported OOXML are not guaranteed to survive the SheetJS reconstruction |
| XLS | Parsed into the same workbook bridge and saved as XLSX | Legacy workbook-only features may simplify; WMPS never overwrites the `.xls` |
| CSV | Text cell values in one sheet | CSV has no formulas, styles, merges, dimensions, or additional sheets; delimiter/encoding details may normalize |
| HTML | Original file is never modified | Viewer strips scripts and event handlers; remote assets are blocked by default |
| PDF | Original bytes are never modified | Viewer only; forms and annotations are not edited |

For high-value Office files, keep the original and compare a saved copy in Microsoft Office or LibreOffice before adopting WMPS in a production workflow.


Existing DOCX comments are displayed read-only. Adding, editing, replying to, and resolving comments is not implemented. Comment text and relationships are checked for preservation during the save smoke test.
