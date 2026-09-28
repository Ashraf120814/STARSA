# Starsa backend

Real, server-side document translation. No Claude, no browser AI, no API key
required by default — translation runs through a self-hosted, open-source
[LibreTranslate](https://github.com/LibreTranslate/LibreTranslate) instance.
Google Cloud Translate and DeepL are supported as drop-in alternatives if you
already have a key for one of those.

## What it actually does

- **Excel (.xlsx/.xls)** — parses the real workbook with `exceljs`, walks every
  cell, skips formulas/numbers/URLs/emails/file paths/cell-reference-looking
  tokens, translates only genuine text, and writes the workbook back out —
  sheets, formulas, number formats, merges and styling untouched.
- **PDF** — extracts real per-page text with `pdfjs-dist`, translates it, and
  rebuilds a new PDF with `pdf-lib`, embedding a real Unicode font (Google's
  open-source Noto fonts) matched to the target script so Hindi, Arabic,
  Chinese, etc. render as genuine text. Page count and order are preserved
  exactly. **Honest limitation:** this rebuild flows translated text onto
  each page at the same size — it does not pixel-clone multi-column layouts,
  tables, or images from the original. Good for reports, letters, contracts;
  not a substitute for a DTP tool on heavily designed PDFs.

## 1. Install

```bash
npm install
cp .env.example .env
```

## 2. Get a translation engine running

**Default (no API key, fully open-source):**

```bash
docker run -d -p 5000:5000 libretranslate/libretranslate
```

Leave `TRANSLATE_PROVIDER=libretranslate` and `LIBRETRANSLATE_URL=http://localhost:5000`
in `.env`. In production, run this container next to your backend (same
Docker network / same host) rather than exposing it publicly.

**Alternative — Google Cloud Translation:**
```
TRANSLATE_PROVIDER=google
GOOGLE_TRANSLATE_API_KEY=your-key
```

**Alternative — DeepL:**
```
TRANSLATE_PROVIDER=deepl
DEEPL_API_KEY=your-key
```

Whichever you use, the key lives only in this server's environment — it is
never sent to, or reachable from, the browser.

## 3. Get real fonts for non-Latin PDF output (one time)

```bash
node scripts/download-fonts.js
```

Pulls open-source (OFL-licensed) Noto Sans fonts straight from Google's
`google/fonts` GitHub repo — no account, no key. Skip this if you only need
Excel translation, or only translate into Latin-script languages.

## 4. Run it

```bash
npm start
```

Server listens on `PORT` (default 8080). Test it:

```bash
curl http://localhost:8080/api/health
curl -F "file=@Annual_Report.xlsx" -F "targetLanguage=Hindi" -F "translateSheetNames=false" \
  http://localhost:8080/api/translate/excel -o Annual_Report_Hindi.xlsx
```

## 5. Deploy

Any Node host works (Render, Railway, Fly.io, a VPS). Set the same env vars
there, and either run LibreTranslate as a sidecar container or point
`LIBRETRANSLATE_URL` at your own self-hosted instance. Set `ALLOWED_ORIGINS`
to your real frontend domain so only your site can call this API.

## 6. Point the frontend at it

In the frontend's config, set the API base URL to wherever this server is
deployed (e.g. `https://api.starsa.app`). The frontend calls:

- `POST /api/analyze/pdf` — `file` → `{ pages, eligible, maxPages }`
- `POST /api/translate/excel` — `file`, `targetLanguage`, `translateSheetNames` → translated `.xlsx` bytes
- `POST /api/translate/pdf` — `file`, `targetLanguage` → translated `.pdf` bytes
- `GET /api/languages` — list of supported target language names

## Security notes already built in

- Files are processed **entirely in memory** — never written to disk, so
  there's nothing on disk to leak or forget to delete.
- Upload size capped by `MAX_UPLOAD_MB`; PDF page count capped by `MAX_PDF_PAGES`.
- CORS restricted to `ALLOWED_ORIGINS`.
- No file contents are ever logged — only error messages.
- Translation keys stay server-side in environment variables, never sent to the client.

Still worth adding before real production traffic: authentication/rate
limiting per user, a malware/file-type scan on upload, and HTTPS termination
(handled automatically by most hosts above).
