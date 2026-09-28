const ExcelJS = require('exceljs');
const { translateBatch } = require('./translateText');

function isTranslatable(value) {
  if (typeof value !== 'string') return false;
  const s = value.trim();
  if (!s) return false;
  if (/^https?:\/\//i.test(s)) return false;
  if (/^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(s)) return false;
  if (/^[A-Za-z]:\\|^\//.test(s)) return false;          // file paths
  if (/^-?\d+([.,]\d+)?%?$/.test(s)) return false;        // pure numbers
  if (/^[A-Z]{1,3}\d{1,7}$/.test(s)) return false;        // cell-reference-like tokens
  return /[a-zA-Z]{2,}/.test(s);                          // must contain actual words
}

/**
 * Translates an .xlsx buffer, preserving workbook structure: sheet order,
 * row/column order, cell positions, formulas, number formats, merges,
 * borders and fonts (exceljs keeps all style objects untouched — only
 * `.value` on qualifying text cells is replaced).
 *
 * @param {Buffer} buffer   original .xlsx file
 * @param {string} targetLang  display language name, e.g. "Hindi"
 * @param {boolean} translateSheetNames
 * @returns {Promise<Buffer>} translated .xlsx file
 */
async function translateExcel(buffer, targetLang, translateSheetNames = false) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const jobs = []; // { cell, text }
  wb.eachSheet(sheet => {
    sheet.eachRow({ includeEmpty: false }, row => {
      row.eachCell({ includeEmpty: false }, cell => {
        // Skip formula cells outright — never translate formulas/refs.
        if (cell.formula) return;
        const v = cell.value;
        if (typeof v === 'string' && isTranslatable(v)) {
          jobs.push({ cell, text: v });
        } else if (v && typeof v === 'object' && v.richText) {
          // Rich text runs: translate each run's text, keep its own formatting.
          v.richText.forEach(run => {
            if (isTranslatable(run.text)) jobs.push({ run, text: run.text });
          });
        }
      });
    });
  });

  if (jobs.length) {
    const CHUNK = 100;
    for (let i = 0; i < jobs.length; i += CHUNK) {
      const slice = jobs.slice(i, i + CHUNK);
      const translated = await translateBatch(slice.map(j => j.text), targetLang);
      slice.forEach((job, k) => {
        if (job.cell) job.cell.value = translated[k];
        else if (job.run) job.run.text = translated[k];
      });
    }
  }

  if (translateSheetNames) {
    const names = wb.worksheets.map(ws => ws.name);
    const translatedNames = await translateBatch(names, targetLang);
    wb.worksheets.forEach((ws, i) => {
      // Excel sheet names: <=31 chars, no : \ / ? * [ ]
      let name = (translatedNames[i] || ws.name).slice(0, 31).replace(/[:\\/?*[\]]/g, ' ').trim();
      if (name) ws.name = name;
    });
  }

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}

module.exports = { translateExcel, isTranslatable };
