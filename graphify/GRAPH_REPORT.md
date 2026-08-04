# PDF Compiler — module graph

Оновлено: 2026-08-04

## Overview

```mermaid
flowchart LR
  UI[client App.vue] --> Preview[DocumentPreview.vue]
  UI --> TextWM[TextWatermarkSettings]
  UI --> ImgWM[ImageWatermarkSettings]
  UI --> JobsUI[JobProgress]
  Preview --> TileC[client/utils/tiling.js]
  Preview --> PdfJS[pdfjs-dist]
  UI -->|POST /api/preview| PrevR[routes/preview.js]
  UI -->|POST /api/jobs| JobsR[routes/jobs.js]
  PrevR --> Previews[services/previews.js]
  Previews --> Convert[services/convert.js]
  JobsR --> Jobs[services/jobs.js]
  Jobs --> Convert
  Jobs --> WM[services/watermark.js]
  Convert --> Fonts[utils/fonts.js]
  Convert --> LO[LibreOffice / sharp]
  WM --> TileS[server/utils/tiling.js]
  WM --> Fonts
```

## Tiling patterns

| pattern   | spacing                         | layout        |
|-----------|---------------------------------|---------------|
| single    | —                               | one copy      |
| tile      | dense (~1.1× AABB)              | regular       |
| grid      | sparse (~2.05× AABB)            | regular       |
| diagonal  | medium + brick offset           | odd rows +½x  |

Overflow: tiles that **intersect** the page are kept; page/stage clips them.

## Styles

- Tokens: `client/src/styles/variables.scss`
- All UI styles: `client/src/styles/main.scss` (imported from `main.js`)
- Vue SFCs have no `<style>` blocks

- Text/md/json: `resolveDocumentFont` → DejaVu Sans (Cyrillic-safe); requires `@pdf-lib/fontkit`
- xls/xlsx/ods: LibreOffice `calc_pdf_Export` + `SinglePageSheets=true`
- Watermark StandardFonts + Cyrillic → auto-fallback to DejaVu Sans
- Fonts: `server/src/utils/fonts.js` registers fontkit per PDFDocument
- Upload names: `utils/filenames.js` decodes multer Latin-1→UTF-8 (Cyrillic in ZIP)
- Client preview cache: `client/src/utils/previewCache.js` (bytes kept after server temp cleanup)
