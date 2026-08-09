# PDF Compiler

Веб-інтерфейс для завантаження документів, накладання watermark (текст + зображення) і конвертації в PDF.

У монорепо TG Service FE публічний шлях: **`/temecriack/pdf-compiler/`** (через nginx :4000). Доступ лише після admin SSO (`/temecriack/auth/`); після логіну без явного `returnTo` відкривається хаб **`/temecriack/auth/menu/`**.

## Швидкий старт (Docker, у монорепо)

```bash
# з кореня TG Service FE
docker compose up --build pdfcompiler nginx auth
```

Відкрийте: **http://localhost:4000/temecriack/pdf-compiler/** (без сесії → login).

Standalone (окремий compose у цій теці):

```bash
docker compose up --build
# http://localhost:3080/temecriack/pdf-compiler/
```

Для root-шляху без префікса: `docker build --build-arg VITE_BASE=/ .` і `PUBLIC_BASE=`.

## Локальна розробка

Потрібні: Node 20+, LibreOffice, djvulibre (опційно для DjVu). Для повного SSO потрібен доступний auth (`/temecriack/auth/api`) і cookie `temecriack-admin-token`.

```bash
npm install
npm run dev
```

- UI: http://localhost:5173/temecriack/pdf-compiler/
- API: http://localhost:3080 (`/api/health` без JWT; інші `/api/*` — з токеном)

## Можливості

- Multi-upload + drag-and-drop, горизонтальний ряд мініатюр з кольоровими іконками типів
- Передперегляд PDF і растрових зображень (посторінково, без continuous scroll)
- Два незалежні шари watermark: текст і зображення (можна одночасно)
- Текст: кілька рядків, вирівнювання (зліва / центр / справа / по ширині), відстань між копіями (X/Y)
- Зображення: відстань між копіями по горизонталі та вертикалі
- Збереження / завантаження налаштувань watermark у JSON (зображення — base64)
- Resize watermark: Shift — пропорційно, Alt — від центру; розмір тексту синхронізується з fontSize
- Фоновий job з детальним прогресом (SSE) і ZIP-архівом результату
- Convert і watermark незалежні: для вже готових PDF watermark працює без конвертації

## Репозиторій

https://github.com/vitervholovi/pdf-compiler (private)
