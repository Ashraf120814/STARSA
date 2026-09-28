require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { translateExcel } = require('./services/excelTranslate');
const { translatePdf, extractPages } = require('./services/pdfTranslate');
const { LANG_CODES } = require('./services/translateText');

const app = express();
const PORT = process.env.PORT || 8080;
const MAX_UPLOAD_MB = parseInt(process.env.MAX_UPLOAD_MB || '25', 10);
const MAX_PDF_PAGES = parseInt(process.env.MAX_PDF_PAGES || '100', 10);
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);

app.use(cors({
  origin: ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : true,
}));

// Files are handled entirely in memory — never written to disk, so there is
// nothing to clean up and nothing a second request could ever read.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 },
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.get('/api/languages', (req, res) => res.json({ languages: Object.keys(LANG_CODES) }));

app.post('/api/translate/excel', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    const name = req.file.originalname.toLowerCase();
    if (!name.endsWith('.xlsx') && !name.endsWith('.xls')) {
      return res.status(400).json({ error: 'Unsupported file type. Please upload a PDF or Excel file.' });
    }
    const target = req.body.targetLanguage;
    if (!target || !LANG_CODES[target]) {
      return res.status(400).json({ error: 'Please choose a valid target language.' });
    }
    const translateSheetNames = req.body.translateSheetNames === 'true';

    const outBuffer = await translateExcel(req.file.buffer, target, translateSheetNames);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="translated.xlsx"`);
    res.send(outBuffer);
  } catch (err) {
    console.error('[excel translate]', err); // never logs file contents, only the error
    res.status(500).json({ error: 'Something went wrong while translating your file. Your original file has not been modified. Please try again.' });
  }
});

app.post('/api/translate/pdf', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    const name = req.file.originalname.toLowerCase();
    if (!name.endsWith('.pdf')) {
      return res.status(400).json({ error: 'Unsupported file type. Please upload a PDF or Excel file.' });
    }
    const target = req.body.targetLanguage;
    if (!target || !LANG_CODES[target]) {
      return res.status(400).json({ error: 'Please choose a valid target language.' });
    }

    const outBuffer = await translatePdf(req.file.buffer, target, MAX_PDF_PAGES);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="translated.pdf"`);
    res.send(outBuffer);
  } catch (err) {
    if (err.code === 'PAGE_LIMIT') return res.status(400).json({ error: err.message });
    if (err.code === 'FONT_MISSING') return res.status(500).json({ error: err.message });
    console.error('[pdf translate]', err);
    res.status(500).json({ error: 'Something went wrong while translating your file. Your original file has not been modified. Please try again.' });
  }
});

// Lets the frontend show page count / eligibility before committing to a full translate.
app.post('/api/analyze/pdf', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    const { numPages } = await extractPages(req.file.buffer);
    res.json({ pages: numPages, eligible: numPages <= MAX_PDF_PAGES, maxPages: MAX_PDF_PAGES });
  } catch (err) {
    console.error('[pdf analyze]', err);
    res.status(500).json({ error: 'Could not read this PDF.' });
  }
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File exceeds the allowed limit.' });
  }
  console.error(err);
  res.status(500).json({ error: 'Unexpected server error.' });
});

app.listen(PORT, () => console.log(`Starsa backend listening on :${PORT}`));
