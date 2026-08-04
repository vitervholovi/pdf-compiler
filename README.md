# PDF Compiler

Веб-інтерфейс для завантаження документів, накладання watermark (текст + зображення) і конвертації в PDF.

## Швидкий старт (Docker)

```bash
docker compose up --build
```

Відкрийте: **http://localhost:3080**

## Локальна розробка

Потрібні: Node 20+, LibreOffice, djvulibre (опційно для DjVu).

```bash
npm install
npm run dev
```

- UI: http://localhost:5173  
- API: http://localhost:3080  

## Можливості

- Multi-upload + drag-and-drop, горизонтальний ряд мініатюр з кольоровими іконками типів
- Передперегляд PDF і растрових зображень (посторінково, без continuous scroll)
- Два незалежні шари watermark: текст і зображення (можна одночасно)
- Resize watermark: Shift — пропорційно, Alt — від центру; розмір тексту синхронізується з fontSize
- Фоновий job з детальним прогресом (SSE) і ZIP-архівом результату
- Convert і watermark незалежні: для вже готових PDF watermark працює без конвертації
