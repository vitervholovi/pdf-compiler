# AGENTS.md

Інструкції для AI-агентів у цьому репозиторії.

## Graphify

Перед змінами коду дивись графи в `graphify/` — вони показують зв’язки модулів без повного читання всіх файлів.

Після змін, що торкаються архітектури (нові сервіси, маршрути, утиліти), оновлюй відповідний граф у `graphify/`.

## Стек

- **client/** — Vue 3 + Vite, передперегляд PDF (pdf.js), watermark UI
- **server/** — Express: preview, jobs (SSE), LibreOffice/sharp/pdf-lib конвертація і watermark

## Gateway / monorepo

Публічний шлях у TG Service FE: **`/temecriack/pdf-compiler/`** (`VITE_BASE`, `PUBLIC_BASE` / monorepo `PDF_COMPILER_SUBPATH`).

Сервер приймає і `/api/...`, і `/temecriack/pdf-compiler/api/...` (strip за `PUBLIC_BASE`). Клієнт будує URL через `apiUrl()` / `import.meta.env.BASE_URL`.

## Admin SSO

- Session SDK: `@temecriack/session` → `client/src/vendor/temecriack-session` (канон: monorepo `auth/src/session`; sync через `scripts/sync-admin-session.sh`).
- Boot: `client/src/main.js` викликає `requireSession({ skewSec: 60 })` перед `mount` — без access JWT UI не монтується.
- API: `server/src/middleware/authLite.js` вимагає Bearer або cookie `temecriack-admin-token` для `/api/*` **окрім** `/api/health` (Docker healthcheck).
- Клієнтські `/api` запити — `apiFetch` / `authFetch` (refresh on 401). SSE (`EventSource`) покладається на SSO cookie (немає Authorization header).
- Не додавати `AUTH_JWT_SECRET` / JWKS у deploy цього модуля.

## Ключові потоки

1. Upload → client preview (pdf/image) або `/api/preview` (office/text)
2. Watermark налаштовується в UI; tiling у `client/src/utils/tiling.js` ≈ `server/src/utils/tiling.js`
3. Job → convert → applyWatermark → ZIP
