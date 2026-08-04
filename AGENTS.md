# AGENTS.md

Інструкції для AI-агентів у цьому репозиторії.

## Graphify

Перед змінами коду дивись графи в `graphify/` — вони показують зв’язки модулів без повного читання всіх файлів.

Після змін, що торкаються архітектури (нові сервіси, маршрути, утиліти), оновлюй відповідний граф у `graphify/`.

## Стек

- **client/** — Vue 3 + Vite, передперегляд PDF (pdf.js), watermark UI
- **server/** — Express: preview, jobs (SSE), LibreOffice/sharp/pdf-lib конвертація і watermark

## Ключові потоки

1. Upload → client preview (pdf/image) або `/api/preview` (office/text)
2. Watermark налаштовується в UI; tiling у `client/src/utils/tiling.js` ≈ `server/src/utils/tiling.js`
3. Job → convert → applyWatermark → ZIP
