 module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { text, type } = req.body || {};
  if (!text) return res.status(400).json({ error: 'No text provided' });

  let prompt = '';
  let maxTokens = 500;

  if (type === 'nutrition') {
    prompt = `Nutrition analyst. User described food they ate. Make best estimate based on typical portions. Always return numbers. Return ONLY valid JSON, no markdown: {"calories":number,"protein":number,"carbs":number,"fats":number,"fiber":number,"summary":"one sentence"}\n\nFood: ${text}`;
  } else if (type === 'muscle') {
    prompt = `Fitness expert. Muscles worked by: "${text}". Use ONLY: chest,front-delts,side-delts,rear-delts,traps,lats,upper-back,lower-back,biceps,triceps,forearms,abs,obliques,quads,hamstrings,glutes,calves,hip-flexors. Return ONLY valid JSON: {"front":["muscle1"],"back":["muscle2"]}`;
  } else if (type === 'coach') {
    prompt = text;
    maxTokens = 8000;
  } else {
    return res.status(400).json({ error: 'Invalid type' });
  }

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const d = await r.json();
    if (!r.ok) return res.status(500).json({ error: 'Anthropic API error', details: d });
    const raw = d.content.map(i => i.text || '').join('').replace(/```json|```/g, '').trim();
    if (type === 'coach') return res.status(200).json({ result: raw });
    try {
      return res.status(200).json(JSON.parse(raw));
    } catch (e) {
      return res.status(200).json({ raw });
    }
  } catch (e) {
    return res.status(500).json({ error: 'Server error', message: e.message });
  }
};
