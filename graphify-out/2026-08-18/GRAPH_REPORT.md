# Graph Report - pdf-compiler  (2026-08-18)

## Corpus Check
- 64 files · ~50,765 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 522 nodes · 1065 edges · 25 communities (22 shown, 3 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 11 edges (avg confidence: 0.53)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c6812d4b`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- DocumentPreview.vue
- App.vue
- index.js
- dependencies
- package.json
- fonts.js
- convert.js
- FileUploadZone.vue
- package.json
- TextWatermarkSettings.vue
- AGENTS.md
- ImageWatermarkSettings.vue
- JobProgress.vue
- PDF Compiler
- tiling.js
- PDF Compiler — module graph
- vite.config.js
- PDF Compiler — module graph
- PDF Compiler
- tiling.js
- sliceCalcPdf.js
- commitWm
- README.md
- vite.config.js
- TextWatermarkSettings.vue

## God Nodes (most connected - your core abstractions)
1. `ensureAccessToken()` - 17 edges
2. `getAccessToken()` - 16 edges
3. `convertToPdf()` - 14 edges
4. `applyWatermark()` - 14 edges
5. `isTokenExpired()` - 12 edges
6. `prepareCalcXlsx()` - 12 edges
7. `redirectToLogin()` - 11 edges
8. `loadPreview()` - 10 edges
9. `renderTextWatermarkPng()` - 10 edges
10. `normalizeWatermark()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `installAxiosAuthInterceptor()` --indirect_call--> `status()`  [INFERRED]
  client/src/vendor/temecriack-session/http.js → server/src/middleware/authLite.test.js
- `applyWatermarkState()` --calls--> `normalizeWatermark()`  [EXTRACTED]
  client/src/App.vue → client/src/utils/watermarkModel.js
- `makeEntry()` --calls--> `cacheLocalImage()`  [EXTRACTED]
  client/src/App.vue → client/src/utils/previewCache.js
- `makeEntry()` --calls--> `cacheLocalPdf()`  [EXTRACTED]
  client/src/App.vue → client/src/utils/previewCache.js
- `textPlace()` --calls--> `getTextPlacement()`  [EXTRACTED]
  client/src/components/DocumentPreview.vue → client/src/utils/watermarkModel.js

## Import Cycles
- None detected.

## Communities (25 total, 3 thin omitted)

### Community 0 - "DocumentPreview.vue"
Cohesion: 0.12
Nodes (49): authUrl(), configureSession(), ensureAccessToken(), getApiBase(), isAccessUsable(), login(), logout(), notifyAuthFailure() (+41 more)

### Community 1 - "App.vue"
Cohesion: 0.05
Nodes (49): applyWatermarkState(), bottomBar, busy, convertingCount, downloadUrl, editOrientation, enqueuePreview(), events (+41 more)

### Community 2 - "index.js"
Cohesion: 0.17
Nodes (15): emit, imageName, onImage(), patchImage(), patchPlacement(), placement, props, setRotation() (+7 more)

### Community 3 - "dependencies"
Cohesion: 0.10
Nodes (31): app, dataDir, __dirname, PORT, previewsDir, previewStore, PUBLIC_BASE, resultsDir (+23 more)

### Community 4 - "package.json"
Cohesion: 0.14
Nodes (31): applySheetPrintLayout(), capColumnWidths(), colToIndex(), densifyRange(), detectUsedRange(), escapeRegex(), indexToCol(), inRange() (+23 more)

### Community 5 - "fonts.js"
Cohesion: 0.06
Nodes (33): A4_LANDSCAPE, A4_PORTRAIT, active, canvas, displayScale, docImageUrl, fontsReadyTick, getMeasureCtx() (+25 more)

### Community 6 - "convert.js"
Cohesion: 0.15
Nodes (22): applyWatermark(), drawAlignedLine(), embedImageBuffer(), hexToRgb(), lineWidth(), measureTextBlock(), splitLines(), visualTilePositions() (+14 more)

### Community 7 - "FileUploadZone.vue"
Cohesion: 0.18
Nodes (24): CALC_EXT, convertCalcToPdf(), convertDjvuToPdf(), convertImageToPdf(), convertToPdf(), convertWithLibreOffice(), enqueueLibreOffice(), findProducedPdf() (+16 more)

### Community 8 - "package.json"
Cohesion: 0.08
Nodes (37): makeEntry(), dragover, emit, input, meta(), onDrop(), onPick(), props (+29 more)

### Community 9 - "TextWatermarkSettings.vue"
Cohesion: 0.08
Nodes (25): archiver, cors, express, multer, pdf-lib, @pdf-lib/fontkit, dependencies, archiver (+17 more)

### Community 10 - "AGENTS.md"
Cohesion: 0.16
Nodes (22): convertTextToPdf(), embedTtfFamily(), ensureFontkit(), findTtf(), FONT_DIRS, fontkitRegistered, needsUnicodeFont(), resolveDocumentFont() (+14 more)

### Community 11 - "ImageWatermarkSettings.vue"
Cohesion: 0.09
Nodes (22): dependencies, @iconify/vue, pdfjs-dist, vue, devDependencies, sass, vite, @vitejs/plugin-vue (+14 more)

### Community 12 - "JobProgress.vue"
Cohesion: 0.12
Nodes (15): concurrently, description, devDependencies, concurrently, name, private, scripts, build (+7 more)

### Community 13 - "PDF Compiler"
Cohesion: 0.23
Nodes (9): loadPreview(), cacheLocalImage(), cacheLocalPdf(), getCachedImageUrl(), hasCachedPdf(), imageUrls, inflight, pdfBuffers (+1 more)

### Community 14 - "tiling.js"
Cohesion: 0.42
Nodes (10): clamp(), ensureSlots(), imageMetrics(), imagePlace(), onMove(), onPrimaryDown(), onResizeDown(), onRotateDown() (+2 more)

### Community 15 - "PDF Compiler — module graph"
Cohesion: 0.32
Nodes (8): a4PageSizeFor(), cancelRender(), cleanupPdf(), fitScale(), loadPdfFromBuffer(), onDocImageLoad(), renderPage(), resetBlank()

### Community 16 - "vite.config.js"
Cohesion: 0.29
Nodes (5): Admin SSO, Gateway / monorepo, Graphify, Ключові потоки, Стек

### Community 17 - "PDF Compiler — module graph"
Cohesion: 0.29
Nodes (6): Convert / fonts, Overview, PDF Compiler — module graph, Styles, Tiling patterns, Watermark settings

### Community 18 - "PDF Compiler"
Cohesion: 0.33
Nodes (5): PDF Compiler, Локальна розробка, Можливості, Репозиторій, Швидкий старт (Docker, у монорепо)

### Community 19 - "tiling.js"
Cohesion: 0.90
Nodes (4): intersectsPageRotated(), rotatedAabb(), stepsForPattern(), tileGhostsFromPrimary()

### Community 21 - "commitWm"
Cohesion: 0.67
Nodes (3): clonePlain(), commitWm(), emit

### Community 24 - "TextWatermarkSettings.vue"
Cohesion: 0.23
Nodes (11): emit, patchPlacement(), patchText(), placement, props, setRotation(), FONT_OPTIONS, fontCssFamily() (+3 more)

## Knowledge Gaps
- **150 isolated node(s):** `name`, `version`, `private`, `type`, `dev` (+145 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `status()` connect `dependencies` to `DocumentPreview.vue`?**
  _High betweenness centrality (0.069) - this node is a cross-community bridge._
- **Why does `installAxiosAuthInterceptor()` connect `DocumentPreview.vue` to `dependencies`?**
  _High betweenness centrality (0.069) - this node is a cross-community bridge._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _150 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `DocumentPreview.vue` be split into smaller, more focused modules?**
  _Cohesion score 0.1244886031560491 - nodes in this community are weakly interconnected._
- **Should `App.vue` be split into smaller, more focused modules?**
  _Cohesion score 0.05191256830601093 - nodes in this community are weakly interconnected._
- **Should `dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.09634146341463415 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._