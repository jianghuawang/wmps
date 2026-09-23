# Development guide

WMPS is a local-first desktop workspace for Markdown, Word documents, spreadsheets, HTML previews, and PDFs. It uses a VS Code-like folder, tree, and tab shell without code-editing features or a plugin setup step.

The first release targets Apple Silicon macOS. The Electron architecture deliberately keeps future Windows and Linux ports possible.

## Run the app

```bash
npm install
npm run build
npm start
```

For development, use `npm run dev`. Open `examples/Q3 Planning` to try a sample workspace containing all four requested formats. Create Markdown, Word, or spreadsheet files from **File → New File**, or right-click a folder in the explorer. Save with **⌘S**. The sun/moon button switches themes; **View → Appearance → System** follows macOS. Your theme choice is retained across launches.

The interface follows `design/Document Editor.html`: light neutral surfaces and a charcoal dark theme, IBM Plex Sans/Mono and Source Serif 4, a slim activity rail, a folder explorer, and compact document tabs. This project adapts the existing local WMS editor foundation into a separate WMPS application and keeps its settings independent.

Workspace search finds file names, Markdown/HTML text, DOCX body text and comments, spreadsheet cells, and PDF text. Results identify their paragraph, comment author, sheet, or page. Image-only PDFs have no searchable text.

Launch a specific folder with `WMPS --workspace /path/to/folder`.

Screenshots from the desktop interaction check are in `artifacts/`.

## Formats

| Format | First-release behavior |
| --- | --- |
| `.md` | Edit with CodeMirror, sanitized GFM/KaTeX preview, bidirectional line-map scroll sync |
| `.docx` | Rich editing and DOCX-byte export through docx-editor.dev; existing comments shown beside native text highlights, linked in both directions, with authors, dates and replies |
| `.doc` | Open through macOS `textutil`; the first save creates `.docx` and leaves the original untouched |
| `.xlsx` | Edit through Univer; parse and save through the SheetJS bridge |
| `.xls` | Open through SheetJS; the first save creates `.xlsx` and leaves the original untouched |
| `.csv` | Edit as a single spreadsheet sheet and save as CSV |
| `.html`, `.htm` | Script-free, read-only preview; local relative assets are allowed, remote assets require an explicit toggle |
| `.pdf` | Read-only PDF.js viewer with pages, thumbnails, text layer, search, and zoom |

WMPS intentionally does not support TXT, JSON, source code, PowerPoint, HTML editing, or PDF editing.

## Architecture and security

- Electron main owns filesystem access, dialogs, the file watcher, Finder/Trash integration, logging, and encrypted recovery storage.
- The React renderer is sandboxed with `contextIsolation: true`, `nodeIntegration: false`, and a restrictive Content Security Policy.
- The preload exposes a narrow typed API. Inputs and IPC results are validated with Zod.
- Workspace paths are canonicalized and restricted to the selected folder. Symlinks are not traversed. Individually selected or dropped files receive explicit grants.
- Document engines run locally. WMPS contains no analytics, telemetry, crash upload, cloud sync, or update service.
- Recovery snapshots use Electron `safeStorage`. WMPS does not fall back to plaintext recovery if OS encryption is unavailable.
- HTML scripts and inline event handlers are removed. Remote assets are disabled until the user opts in for that preview.

Each file editor is a lazy-loaded adapter implementing the same host seam: serialize to bytes, focus search, report dirty state, and expose view state. An error boundary isolates failures to one tab and offers a read-only text/hex fallback.

## Engines and licenses

- [docx-editor.dev](https://github.com/eigenpal/docx-editor) 2.7.0 — Apache-2.0. WMPS uses the open DOCX byte-in/byte-out editor, not SuperDoc, because WMPS itself is MIT-licensed and its shipped dependency licenses must be compatible and redistributable.
- [Univer](https://github.com/dream-num/univer) 0.25.1 — Apache-2.0.
- [PDF.js](https://github.com/mozilla/pdf.js) 6.2.108 — Apache-2.0.
- [SheetJS Community Edition](https://git.sheetjs.com/sheetjs/sheetjs) 0.20.3 — Apache-2.0.

WMPS is MIT licensed. Dependencies retain their own licenses; see `THIRD_PARTY_NOTICES.md`.

## Development

Requirements: Apple Silicon Mac, a current Node.js release, and npm.

```bash
npm install
npm run dev
```

Verification:

```bash
npm run typecheck
npm test
npm run build
npm audit
npm run test:desktop
npm run test:markdown-interactions
npm run test:workspace-windows
```

Create an arm64 DMG:

```bash
npm run package:mac
```

The current command explicitly disables signing-identity discovery and creates an unsigned local build, matching the pre-Developer-ID phase of the project. Before public distribution, remove `CSC_IDENTITY_AUTO_DISCOVERY=false` from the script, configure a Developer ID Application certificate, and notarize the DMG.

## Fixture coverage

`fixtures/` includes Markdown with GFM and math, a DOCX with headings/table/image, an XLSX with formulas and two sheets, CSV, HTML with local CSS/SVG, and a searchable PDF. Unit tests cover the format boundary, Markdown scroll line map, DOCX serialization/reopen behavior, and XLS/XLSX SheetJS–Univer mapping. The desktop smoke test exercises real Electron rendering, file creation, theme switching, and saved edits after tab switching. Test workspaces use temporary copies; examples are not modified.

See [FIDELITY.md](../FIDELITY.md) before using WMPS as the only copy of an Office document.

## Demo and screenshots

The public screenshots use only the fictional Harbor Studio workspace. Regenerate it with `node scripts/create-demo.mjs`, then run `npm run build` and `node scripts/capture-demo.mjs`. Captures use isolated settings and temporary document copies.

To test another annotated document corpus, run `node tests/real-documents.e2e.mjs /path/to/documents`. Set `WMPS_TEST_QUERIES` to comma-separated search terms present in the corpus, including a term in a comment. This optional check opens Markdown, DOCX and PDF files from temporary copies and checks original file hashes.
