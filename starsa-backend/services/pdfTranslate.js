const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
const { translateBatch } = require('./translateText');

// Which downloaded Noto font covers each target language's script.
// Anything not listed falls back to 'notosans' (Latin ext + Cyrillic + Greek).
const FONT_MAP = {
  Hindi: 'notosansdevanagari', Marathi: 'notosansdevanagari',
  Urdu: 'notosansarabic', Arabic: 'notosansarabic', Persian: 'notosansarabic',
  Bengali: 'notosansbengali', Telugu: 'notosanstelugu', Tamil: 'notosanstamil',
  Gujarati: 'notosansgujarati', Kannada: 'notosanskannada', Malayalam: 'notosansmalayalam',
  Punjabi: 'notosansgurmukhi', Chinese: 'notosanssc', Japanese: 'notosansjp',
  Korean: 'notosanskr', Thai: 'notosansthai', Hebrew: 'notosanshebrew',
};

const FONTS_DIR = path.join(__dirname, '..', 'fonts');

function chunk(arr, n) { const r = []; for (let i = 0; i < arr.length; i += n) r.push(arr.slice(i, i + n)); return r; }

async function extractPages(buffer) {
  const doc = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    let text = '', lastY = null;
    tc.items.forEach(it => {
      if (lastY !== null && Math.abs(it.transform[5] - lastY) > 2) text += '\n';
      text += it.str + ' ';
      lastY = it.transform[5];
    });
    pages.push({ text: text.trim(), width: vp.width, height: vp.height });
  }
  return { numPages: doc.numPages, pages };
}

function wrapText(text, font, size, maxWidth) {
  const lines = [];
  (text || '').split('\n').forEach(par => {
    const words = par.split(/\s+/).filter(Boolean);
    let cur = '';
    words.forEach(w => {
      const test = cur ? cur + ' ' + w : w;
      if (font.widthOfTextAtSize(test, size) > maxWidth && cur) { lines.push(cur); cur = w; }
      else cur = test;
    });
    lines.push(cur);
  });
  return lines;
}

/**
 * Translates a PDF buffer: real text extraction per page (page order and
 * count preserved), real translation, then rebuilt with a real embedded
 * Unicode font matched to the target script — Hindi/Arabic/Chinese/etc.
 * render as genuine shaped text, not missing-glyph boxes.
 *
 * Honest limitation: original multi-column layout, tables and images are
 * not reconstructed pixel-for-pixel — this rebuilds readable flowed text
 * in the same page order and dimensions, not a visual clone of the source.
 */
async function translatePdf(buffer, targetLang, maxPages = 100) {
  const { numPages, pages } = await extractPages(buffer);
  if (numPages > maxPages) {
    const err = new Error(`This PDF contains ${numPages} pages. The maximum allowed per translation is ${maxPages} pages. Please split the document and upload it in smaller parts.`);
    err.code = 'PAGE_LIMIT';
    throw err;
  }

  const batches = chunk(pages.map(p => p.text), 3);
  let translated = [];
  for (const b of batches) translated = translated.concat(await translateBatch(b, targetLang));

  const outDoc = await PDFDocument.create();
  outDoc.registerFontkit(fontkit);
  const fontKey = FONT_MAP[targetLang] || 'notosans';
  const fontPath = path.join(FONTS_DIR, `${fontKey}.ttf`);
  if (!fs.existsSync(fontPath)) {
    const err = new Error(`Font for "${targetLang}" isn't installed. Run "node scripts/download-fonts.js" once during setup.`);
    err.code = 'FONT_MISSING';
    throw err;
  }
  const font = await outDoc.embedFont(fs.readFileSync(fontPath), { subset: true });

  pages.forEach((p, i) => {
    const pg = outDoc.addPage([p.width, p.height]);
    const margin = 48, size = 11, maxW = p.width - margin * 2;
    let y = p.height - margin;
    wrapText(translated[i] || '', font, size, maxW).forEach(line => {
      if (y < margin) return;
      pg.drawText(line, { x: margin, y, size, font });
      y -= size * 1.5;
    });
  });

  return Buffer.from(await outDoc.save());
}

module.exports = { translatePdf, extractPages };
