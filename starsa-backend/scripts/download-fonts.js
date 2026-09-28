#!/usr/bin/env node
// One-time setup: downloads the open-source Noto Sans font for each script
// this app supports, straight from the google/fonts GitHub repo (OFL
// licensed, no API key, no account). Run: node scripts/download-fonts.js
// These fonts let the PDF service render real Hindi/Arabic/Chinese/etc.
// text instead of "tofu" boxes when it rebuilds a translated PDF.

const fs = require('fs');
const path = require('path');

const FOLDERS = {
  notosans: 'ofl/notosans',                     // Latin ext + Cyrillic + Greek (default/fallback)
  notosansarabic: 'ofl/notosansarabic',          // Arabic, Urdu, Persian
  notosansdevanagari: 'ofl/notosansdevanagari',  // Hindi, Marathi
  notosansbengali: 'ofl/notosansbengali',
  notosanstelugu: 'ofl/notosanstelugu',
  notosanstamil: 'ofl/notosanstamil',
  notosansgujarati: 'ofl/notosansgujarati',
  notosanskannada: 'ofl/notosanskannada',
  notosansmalayalam: 'ofl/notosansmalayalam',
  notosansgurmukhi: 'ofl/notosansgurmukhi',      // Punjabi
  notosanssc: 'ofl/notosanssc',                  // Chinese (simplified)
  notosansjp: 'ofl/notosansjp',                  // Japanese
  notosanskr: 'ofl/notosanskr',                  // Korean
  notosansthai: 'ofl/notosansthai',
  notosanshebrew: 'ofl/notosanshebrew',
};

const OUT_DIR = path.join(__dirname, '..', 'fonts');

async function fetchJSON(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'starsa-backend-font-setup' } });
  if (!res.ok) throw new Error(`GitHub API ${res.status} for ${url}`);
  return res.json();
}

async function downloadOne(key, folder) {
  const api = `https://api.github.com/repos/google/fonts/contents/${folder}`;
  const files = await fetchJSON(api);
  const ttf = Array.isArray(files) ? files.find(f => f.name.toLowerCase().endsWith('.ttf')) : null;
  if (!ttf) { console.warn(`⚠ no .ttf found in ${folder}, skipping ${key}`); return; }
  const res = await fetch(ttf.download_url);
  if (!res.ok) throw new Error(`download failed ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(path.join(OUT_DIR, `${key}.ttf`), buf);
  console.log(`✓ ${key}.ttf  (${(buf.length / 1024).toFixed(0)} KB)`);
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const [key, folder] of Object.entries(FOLDERS)) {
    try { await downloadOne(key, folder); }
    catch (e) { console.error(`✗ ${key}: ${e.message}`); }
  }
  console.log('\nDone. Fonts saved to ./fonts — restart the server to pick them up.');
})();
