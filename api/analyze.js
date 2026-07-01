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

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Server is missing GEMINI_API_KEY' });
    return;
  }

  try {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
    body = body || {};

    const text = (body.text || '').toString();
    const url = body.url ? body.url.toString() : '';
    if (!text.trim()) {
      res.status(400).json({ error: 'Missing "text"' });
      return;
    }

    let prompt = text;
    if (url) {
      const pageText = await fetchPageText(url);
      if (pageText) {
        prompt = 'LIVE WEBSITE CONTENT fetched from ' + url + ':\n"""' + pageText + '"""\n\n' + text;
      }
    }

    const geminiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/'
      + encodeURIComponent(MODEL) + ':generateContent?key=' + encodeURIComponent(apiKey);

    const aiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: MAX_TOKENS, temperature: 0.7 }
      })
    });

    const data = await aiRes.json();

    if (!aiRes.ok) {
      const msg = (data && data.error && data.error.message) || 'AI request failed';
      res.status(aiRes.status).json({ error: msg });
      return;
    }

    let result = '';
    if (data.candidates && data.candidates[0] && data.candidates[0].content
        && Array.isArray(data.candidates[0].content.parts)) {
      result = data.candidates[0].content.parts.map(p => p.text || '').join('').trim();
    }

    res.status(200).json({ result });
  } catch (e) {
    res.status(500).json({ error: 'Server error: ' + (e && e.message ? e.message : 'unknown') });
  }
};
