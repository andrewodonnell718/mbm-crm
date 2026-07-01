const MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const MAX_TOKENS = 4000;

async function fetchPageText(url) {
  try {
    if (!/^https?:\/\//i.test(url)) return null;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 9000);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'MBM-CRM/1.0 (+https://mbm-crm.vercel.app)' },
      redirect: 'follow'
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const html = await res.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return text.slice(0, 6000);
  } catch (e) {
    return null;
  }
}

async function callGemini(apiKey, prompt) {
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/'
    + encodeURIComponent(MODEL) + ':generateContent?key=' + encodeURIComponent(apiKey);
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: MAX_TOKENS, temperature: 0.7 }
    })
  });
  const data = await r.json();
  return { ok: r.ok, status: r.status, data };
}

function extractText(data) {
  if (data && data.candidates && data.candidates[0] && data.candidates[0].content
      && Array.isArray(data.candidates[0].content.parts)) {
    return data.candidates[0].content.parts.map(p => p.text || '').join('').trim();
  }
  return '';
}

module.exports = async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;

  if (req.method === 'GET') {
    if (!apiKey) { res.status(200).json({ health: 'NO KEY', message: 'GEMINI_API_KEY is not set in Vercel (or the deploy was before you added it).' }); return; }
    try {
      const { ok, status, data } = await callGemini(apiKey, 'Reply with the single word: OK');
      if (!ok) { res.status(200).json({ health: 'AI ERROR', model: MODEL, status, error: (data && data.error && data.error.message) || data }); return; }
      res.status(200).json({ health: 'OK', model: MODEL, keyPresent: true, reply: extractText(data) });
    } catch (e) {
      res.status(200).json({ health: 'CRASH', model: MODEL, error: e && e.message ? e.message : String(e) });
    }
    return;
  }

  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  if (!apiKey) { res.status(500).json({ error: 'Server is missing GEMINI_API_KEY' }); return; }

  try {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
    body = body || {};

    const text = (body.text || '').toString();
    const url = body.url ? body.url.toString() : '';
    if (!text.trim()) { res.status(400).json({ error: 'Missing "text"' }); return; }

    let prompt = text;
    if (url) {
      const pageText = await fetchPageText(url);
      if (pageText) prompt = 'LIVE WEBSITE CONTENT fetched from ' + url + ':\n"""' + pageText + '"""\n\n' + text;
    }

    const { ok, status, data } = await callGemini(apiKey, prompt);
    if (!ok) {
      const msg = (data && data.error && data.error.message) || 'AI request failed';
      res.status(status).json({ error: msg });
      return;
    }
    res.status(200).json({ result: extractText(data) });
  } catch (e) {
    res.status(500).json({ error: 'Server error: ' + (e && e.message ? e.message : 'unknown') });
  }
};
