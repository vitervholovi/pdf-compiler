# Graph Report - pdf-compiler  (2026-08-04)

## Corpus Check
- 35 files · ~11,854 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 308 nodes · 492 edges · 17 communities
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 8 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `a643da97`
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

## God Nodes (most connected - your core abstractions)
1. `convertToPdf()` - 14 edges
2. `loadPreview()` - 10 edges
3. `applyWatermark()` - 10 edges
4. `fileCategory()` - 9 edges
5. `makeEntry()` - 7 edges
6. `runJob()` - 7 edges
7. `decodeUploadFilename()` - 7 edges
8. `extOf()` - 7 edges
9. `publicApiPath()` - 7 edges
10. `onMove()` - 6 edges

## Surprising Connections (you probably didn't know these)
- `loadPreview()` --calls--> `cacheLocalImage()`  [EXTRACTED]
  pdf-compiler/client/src/components/DocumentPreview.vue → pdf-compiler/client/src/utils/previewCache.js
- `loadPreview()` --calls--> `cacheLocalPdf()`  [EXTRACTED]
  pdf-compiler/client/src/components/DocumentPreview.vue → pdf-compiler/client/src/utils/previewCache.js
- `loadPreview()` --calls--> `cacheServerPreview()`  [EXTRACTED]
  pdf-compiler/client/src/components/DocumentPreview.vue → pdf-compiler/client/src/utils/previewCache.js
- `convertTextToPdf()` --calls--> `resolveDocumentFont()`  [EXTRACTED]
  pdf-compiler/server/src/services/convert.js → pdf-compiler/server/src/utils/fonts.js
- `runJob()` --calls--> `convertToPdf()`  [EXTRACTED]
  pdf-compiler/server/src/services/jobs.js → pdf-compiler/server/src/services/convert.js

## Import Cycles
- None detected.

## Communities (17 total, 0 thin omitted)

### Community 0 - "DocumentPreview.vue"
Cohesion: 0.06
Nodes (45): active, cancelRender(), canvas, clamp(), cleanupPdf(), clonePlain(), commitWm(), displayScale (+37 more)

### Community 1 - "App.vue"
Cohesion: 0.07
Nodes (44): bottomBar, busy, convertingCount, downloadUrl, enqueuePreview(), events, files, makeEntry() (+36 more)

### Community 2 - "index.js"
Cohesion: 0.12
Nodes (25): app, dataDir, __dirname, PORT, previewsDir, previewStore, PUBLIC_BASE, resultsDir (+17 more)

### Community 3 - "dependencies"
Cohesion: 0.08
Nodes (25): archiver, cors, express, multer, pdf-lib, @pdf-lib/fontkit, dependencies, archiver (+17 more)

### Community 4 - "package.json"
Cohesion: 0.09
Nodes (22): dependencies, @iconify/vue, pdfjs-dist, vue, devDependencies, sass, vite, @vitejs/plugin-vue (+14 more)

### Community 5 - "fonts.js"
Cohesion: 0.15
Nodes (23): applyWatermark(), drawAlignedLine(), hexToRgb(), lineWidth(), measureTextBlock(), pdfRotation(), splitLines(), embedTtfFamily() (+15 more)

### Community 6 - "convert.js"
Cohesion: 0.25
Nodes (18): CALC_EXT, convertDjvuToPdf(), convertImageToPdf(), convertTextToPdf(), convertToPdf(), convertWithLibreOffice(), enqueueLibreOffice(), libreOfficeChain (+10 more)

### Community 7 - "FileUploadZone.vue"
Cohesion: 0.15
Nodes (12): dragover, emit, input, meta(), onDrop(), onPick(), props, remove() (+4 more)

### Community 8 - "package.json"
Cohesion: 0.12
Nodes (15): concurrently, description, devDependencies, concurrently, name, private, scripts, build (+7 more)

### Community 9 - "TextWatermarkSettings.vue"
Cohesion: 0.36
Nodes (5): emit, patchText(), props, FONT_OPTIONS, fontCssFamily()

### Community 10 - "AGENTS.md"
Cohesion: 0.33
Nodes (4): Gateway / monorepo, Graphify, Ключові потоки, Стек

### Community 11 - "ImageWatermarkSettings.vue"
Cohesion: 0.47
Nodes (5): emit, imageName, onImage(), patchImage(), props

### Community 12 - "JobProgress.vue"
Cohesion: 0.33
Nodes (4): logEl, percent, props, visible

### Community 13 - "PDF Compiler"
Cohesion: 0.33
Nodes (5): PDF Compiler, Локальна розробка, Можливості, Репозиторій, Швидкий старт (Docker, у монорепо)

### Community 14 - "tiling.js"
Cohesion: 0.70
Nodes (4): intersectsPage(), rotatedAabb(), stepsForPattern(), tileGhostsFromPrimary()

### Community 15 - "PDF Compiler — module graph"
Cohesion: 0.40
Nodes (4): Overview, PDF Compiler — module graph, Styles, Tiling patterns

## Knowledge Gaps
- **120 isolated node(s):** `name`, `version`, `private`, `type`, `dev` (+115 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `convertToPdf()` connect `convert.js` to `index.js`?**
  _High betweenness centrality (0.007) - this node is a cross-community bridge._
- **Why does `applyWatermark()` connect `fonts.js` to `index.js`?**
  _High betweenness centrality (0.006) - this node is a cross-community bridge._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _120 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `DocumentPreview.vue` be split into smaller, more focused modules?**
  _Cohesion score 0.06037414965986394 - nodes in this community are weakly interconnected._
- **Should `App.vue` be split into smaller, more focused modules?**
  _Cohesion score 0.06748911465892599 - nodes in this community are weakly interconnected._
- **Should `index.js` be split into smaller, more focused modules?**
  _Cohesion score 0.12121212121212122 - nodes in this community are weakly interconnected._
- **Should `dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.07692307692307693 - nodes in this community are weakly interconnected._