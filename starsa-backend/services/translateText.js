// Provider-agnostic text translation. Swap providers via TRANSLATE_PROVIDER
// without touching excelTranslate.js / pdfTranslate.js.
// Never called from, or exposed to, the browser — this runs server-side only.

const PROVIDER = process.env.TRANSLATE_PROVIDER || 'libretranslate';

async function translateBatchLibre(strings, target, source = 'en') {
  const url = `${process.env.LIBRETRANSLATE_URL.replace(/\/$/, '')}/translate`;
  const results = [];
  // LibreTranslate has no native batch endpoint on all deployments; send
  // sequentially in small concurrency to stay polite to a self-hosted box.
  const CONCURRENCY = 4;
  let i = 0;
  async function worker() {
    while (i < strings.length) {
      const idx = i++;
      const body = {
        q: strings[idx],
        source,
        target: target,
        format: 'text',
      };
      if (process.env.LIBRETRANSLATE_API_KEY) body.api_key = process.env.LIBRETRANSLATE_API_KEY;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`LibreTranslate error ${res.status}: ${await res.text()}`);
      const data = await res.json();
      results[idx] = data.translatedText ?? strings[idx];
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, strings.length) }, worker));
  return results;
}

async function translateBatchGoogle(strings, target, source = 'en') {
  const key = process.env.GOOGLE_TRANSLATE_API_KEY;
  const url = `https://translation.googleapis.com/language/translate/v2?key=${key}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: strings, source, target, format: 'text' }),
  });
  if (!res.ok) throw new Error(`Google Translate error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.data.translations.map(t => t.translatedText);
}

async function translateBatchDeepl(strings, target, source = 'EN') {
  const url = process.env.DEEPL_API_URL || 'https://api-free.deepl.com/v2/translate';
  const params = new URLSearchParams();
  strings.forEach(s => params.append('text', s));
  params.append('target_lang', target.toUpperCase());
  params.append('source_lang', source.toUpperCase());
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `DeepL-Auth-Key ${process.env.DEEPL_API_KEY}`,
    },
    body: params,
  });
  if (!res.ok) throw new Error(`DeepL error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.translations.map(t => t.text);
}

// Maps display language names used by the frontend to ISO codes each
// provider expects. Extend this list to add more languages.
const LANG_CODES = {
  English: 'en', Hindi: 'hi', Urdu: 'ur', Arabic: 'ar', Bengali: 'bn', Marathi: 'mr',
  Telugu: 'te', Tamil: 'ta', Gujarati: 'gu', Kannada: 'kn', Malayalam: 'ml', Punjabi: 'pa',
  Spanish: 'es', French: 'fr', German: 'de', Portuguese: 'pt', Italian: 'it', Dutch: 'nl',
  Russian: 'ru', Chinese: 'zh', Japanese: 'ja', Korean: 'ko', Turkish: 'tr', Vietnamese: 'vi',
  Thai: 'th', Indonesian: 'id', Malay: 'ms', Polish: 'pl', Ukrainian: 'uk', Greek: 'el',
  Hebrew: 'he', Persian: 'fa',
};

function codeFor(name) {
  return LANG_CODES[name] || name.toLowerCase().slice(0, 2);
}

/**
 * Translate a batch of strings. Empty/whitespace-only entries pass through
 * untouched to save calls and avoid provider errors on empty input.
 */
async function translateBatch(strings, targetLangName) {
  const target = codeFor(targetLangName);
  const indices = [];
  const toSend = [];
  strings.forEach((s, i) => {
    if (s && s.trim()) { indices.push(i); toSend.push(s); }
  });
  if (toSend.length === 0) return strings.slice();

  let translated;
  if (PROVIDER === 'google') translated = await translateBatchGoogle(toSend, target);
  else if (PROVIDER === 'deepl') translated = await translateBatchDeepl(toSend, target);
  else translated = await translateBatchLibre(toSend, target);

  const out = strings.slice();
  indices.forEach((origIdx, k) => { out[origIdx] = translated[k]; });
  return out;
}

module.exports = { translateBatch, codeFor, LANG_CODES };
