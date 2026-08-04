# PDF Compiler

Веб-інтерфейс для завантаження документів, накладання watermark (текст + зображення) і конвертації в PDF.

У монорепо TG Service FE публічний шлях: **`/pdf-compiler/`** (через nginx :4000).

## Швидкий старт (Docker, у монорепо)

```bash
# з кореня TG Service FE
docker compose up --build pdfcompiler nginx
```

Відкрийте: **http://localhost:4000/pdf-compiler/**

Standalone (окремий compose у цій теці):

```bash
docker compose up --build
# http://localhost:3080/pdf-compiler/
```

Для root-шляху без префікса: `docker build --build-arg VITE_BASE=/ .` і `PUBLIC_BASE=`.

## Локальна розробка

Потрібні: Node 20+, LibreOffice, djvulibre (опційно для DjVu).

```bash
npm install
npm run dev
```

- UI: http://localhost:5173/pdf-compiler/
- API: http://localhost:3080  

## Можливості

- Multi-upload + drag-and-drop, горизонтальний ряд мініатюр з кольоровими іконками типів
- Передперегляд PDF і растрових зображень (посторінково, без continuous scroll)
- Два незалежні шари watermark: текст і зображення (можна одночасно)
- Resize watermark: Shift — пропорційно, Alt — від центру; розмір тексту синхронізується з fontSize
- Фоновий job з детальним прогресом (SSE) і ZIP-архівом результату
- Convert і watermark незалежні: для вже готових PDF watermark працює без конвертації

## Репозиторій

https://github.com/vitervholovi/pdf-compiler (private)
