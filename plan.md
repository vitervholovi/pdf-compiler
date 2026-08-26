# Implementation Plan

## Context

PDF з обмеженими правами (Standard encryption, порожній user password, `/P` без modify) зараз проходить через `PDFDocument.load(..., { ignoreEncryption: true })` + `save()`. Це **не розшифровує** потоки й лишає `/Encrypt` → вихідний файл часто не відкривається.

Зразок: `60146_…_Румыния_1.pdf` (PDFsharp). `qpdf --decrypt --password=` знімає захист чисто; LibreOffice PDF→PDF на цьому файлі падає; Ghostscript `pdfwrite` з `-sPDFPassword=` працює як last-resort «друк у PDF».

## SIZE / MODE

SIZE: M | MODE: SOLO | Execute batch: NO

## Requirements

1. Перед `pdf-lib` load/save нормалізувати PDF: зняти encryption/permissions, коли це можливо без користувацького пароля.
2. Порядок спроб:
   1. **qpdf decrypt** (порожній пароль) — зберігає структуру/текст;
   2. якщо не вийшло — **друк у PDF** через Ghostscript `pdfwrite` (`-sPDFPassword=`) і далі watermark на цей файл;
   3. якщо й це не вийшло — явна помилка (без тихого `ignoreEncryption` на save-шляху).
3. Watermark накладати лише на вже нормалізований (незашифрований) PDF.
4. Не вимагати пароль у UI в цьому TASK (лише empty password).

## Acceptance Criteria

```
AC-001: Given PDF з /Encrypt і порожнім user password (як зразок Румыния),
         When job з text/image watermark,
         Then вихідний PDF відкривається без помилок і містить watermark.

AC-002: Given той самий PDF, When qpdf decrypt недоступний/падає а gs успішний,
         Then pipeline використовує print-to-PDF і watermark накладається на gs-результат.

AC-003: Given незашифрований звичайний PDF,
         When watermark job,
         Then поведінка як раніше (без зайвої перегонки через gs).

AC-004: Given PDF, який не відкривається ні qpdf, ні gs з порожнім паролем,
         When job,
         Then file_error з зрозумілим повідомленням; не віддається битий «зашифрований» PDF.
```

## Порядок етапів

1. TASK-001 — утиліта normalize + інтеграція в convert/watermark + Docker deps + тести  
2. (після коду) запитати користувача про оновлення graphify

## Tasks

### TASK-001 — Normalize encrypted PDFs before watermark

Status: DONE  
Dependencies: none  
Allowed files:

- `server/src/utils/normalizePdf.js` (new)
- `server/src/utils/normalizePdf.test.js` (new)
- `server/src/services/convert.js`
- `server/src/services/watermark.js`
- `server/src/utils/stripEmptyPdfPages.js`
- `server/src/utils/sliceCalcPdf.js`
- `Dockerfile`
- `plan.md` (статус TASK)

Read-only:

- `server/src/services/jobs.js` (виклики convert → watermark)
- `server/package.json` (тест-скрипт уже є)
- зразок PDF користувача лише для ручної/локальної перевірки (не комітити)

Protected:

- `client/**` — не чіпати
- auth/session, nginx, monorepo docker поза `pdf-compiler/Dockerfile`

#### Objective

Єдиний normalize-крок для PDF перед будь-яким `pdf-lib` save-шляхом: decrypt → інакше print-to-PDF → інакше fail.

#### Implementation

1. **`normalizePdf.js`**
   - Детект encryption: наявність `/Encrypt` у байтах (або спроба `PDFDocument.load` без `ignoreEncryption`).
   - Якщо не encrypted → no-op (повернути той самий path / скопійований outPath за контрактом функції).
   - Якщо encrypted:
     1. `qpdf --decrypt --password= -- <in> <out>` (timeout, перевірка exit + що out відкривається `PDFDocument.load` без ignore).
     2. Якщо fail → `gs -dSAFER -dBATCH -dNOPAUSE -sDEVICE=pdfwrite -sPDFPassword= -sOutputFile=<out> <in>`; перевірити load без ignore.
     3. Якщо fail → `throw` з повідомленням українською на кшталт: захищений PDF, не вдалося зняти обмеження.
   - Не зберігати вихід з `ignoreEncryption: true` як фінальний артефакт.
   - Винести `run()` spawn-helper локально або мінімально перевикористати патерн з `convert.js` (без широкого рефактору convert).

2. **`convert.js`**
   - Гілка `ext === 'pdf'`: після copy викликати normalize у workDir (in-place replace outPdf або окремий файл). Так preview/job отримують уже «чистий» PDF.

3. **`watermark.js`**
   - Перед load: якщо ще encrypted — `normalizePdf` у temp поруч з out; load **без** `ignoreEncryption` (або лише як read-only probe). Прибрати залежність від `ignoreEncryption` для успішного шляху.
   - Захист: навіть якщо convert забули normalize, watermark не віддає битий файл.

4. **`stripEmptyPdfPages.js` / `sliceCalcPdf.js`**
   - Після успішного normalize у convert для вхідних PDF calc-шлях рідко encrypted; все одно: load без ігнору encryption на save, або короткий normalize перед load якщо encrypted. Мінімальна зміна: не `save` після `ignoreEncryption` на encrypted doc — або normalize first.

5. **`Dockerfile`**
   - Додати `qpdf` і `ghostscript` у `apt-get install` runtime stage.

6. **Тести**
   - Юніт: mock/spawn або мінімальний fixture — незашифрований PDF no-op; якщо в CI немає qpdf/gs — skip integration з clear reason **або** генерувати незашифрований fixture + окремий тест «detect /Encrypt string».
   - Бажано: інтеграційний тест з маленьким encrypted PDF (порожній пароль), згенерованим у тесті через зовнішній інструмент якщо є, інакше перевірити порядок викликів через injectable runner.
   - Існуючі: `npm test -w server` (або `cd server && npm test`).

#### Tests

- `npm test -w server` (root workspace) / `npm test` у `server/` — як у `server/package.json`: `node --test src/**/*.test.js`
- Ручна перевірка (не блокер CI): зразок Румыния через job watermark після rebuild image з qpdf+gs

#### Regression risks

| Risk | Why | Detect |
|------|-----|--------|
| MEDIUM: gs fallback збільшує час/розмір, може погіршити шрифти/текст | pdfwrite переписує документ | AC-002 + порівняти що watermark OK; звичайні PDF не йдуть у gs (AC-003) |
| MEDIUM: відсутність qpdf/gs у local `npm run dev` без Docker | spawn fail → помилка замість тихого ignore | повідомлення має згадувати відсутній інструмент; Docker image обов’язково має пакети |
| LOW: подвійний normalize (convert + watermark) | зайва робота | ідемпотентність: другий раз no-op |

#### Acceptance criteria

AC-001 … AC-004 (див. вище).

#### Definition of Done

- Код лише в Allowed files; тести TASK зелені; один commit; encrypted sample шлях покритий логікою decrypt→print→fail; `ignoreEncryption` не використовується для фінального save захищених PDF.

#### Refactoring

Level: R1  

Approved:

- **REFACTORING-001** | R1 | `@server/src/utils/normalizePdf.js` | extract spawn+normalize  
  Problem: дубль ignoreEncryption у кількох load-сайтах  
  Improvement: один normalize helper  
  Risk: LOW | INCLUDE

Deferred:

- UI для введення PDF-пароля — окремий TASK  
- Заміна pdf-lib / чистий JS decrypt — DEFER  
- Оновлення graphify — лише після явного «так» користувача

Constraints: API/deps(npm)/DB/architecture = NO; дозволені лише apt-пакети в Dockerfile (`qpdf`, `ghostscript`).

#### Coder Prompt

```
TASK-001: Normalize encrypted PDFs before watermark (decrypt → Ghostscript print-to-PDF → fail).

Allowed: server/src/utils/normalizePdf.js(+test), convert.js, watermark.js,
stripEmptyPdfPages.js, sliceCalcPdf.js, Dockerfile, plan.md status.

Do: qpdf empty-password decrypt first; if that fails, gs pdfwrite with -sPDFPassword=;
never save via ignoreEncryption as final output; wire convert pdf-copy + watermark.

Tests: server node:test; keep unencrypted path unchanged.
No client/auth changes. No graphify update. One commit after tests pass.
```

## Dependency Graph

TASK-001 (only)

## Coordination

SKIP: SIZE=M MODE=SOLO

## Integration order

Sequential: лише TASK-001.

## Definition of Done (PLAN)

TASK-001 DONE, AC-001…004 PASS, server tests PASS, clean tree after commit, graphify update лише якщо користувач окремо погодив.
