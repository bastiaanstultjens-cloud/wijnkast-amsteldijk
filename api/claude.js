// Vercel serverless function: POST /api/claude  { prompt } -> { data: <JSON van Claude> }
// GET /api/claude -> { enabled } zodat de app weet of de Claude-knoppen getoond worden.
//
// Omgevingsvariabelen (Vercel > Settings > Environment Variables):
//   ANTHROPIC_API_KEY   verplicht voor de Claude-functies
//   ANTHROPIC_MODEL     optioneel, standaard claude-sonnet-5-5 (moet webzoeken ondersteunen)
// Body: { prompt, image?: data-URL, web?: true }. Met web:true zoekt Claude max. 5x op het web
// ($10 per 1.000 zoekopdrachten bij Anthropic, dus max. ~5 cent per fles plus tokens).
//   SUPABASE_URL, SUPABASE_ANON_KEY
//                       optioneel; standaard de waarden hieronder. De functie accepteert alleen ingelogde
//                       gebruikers (anders kan iedereen met de link jouw API-tegoed gebruiken).

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';

// Publieke Supabase-gegevens (dezelfde als in config.js). Omgevingsvariabelen gaan voor, maar alleen als ze
// er geldig uitzien: een verkeerd geplakte waarde (bijv. met •••• erin) liet de functie eerder crashen.
const SB_URL_DEFAULT = 'https://lgqlvmfaesiinoenoytg.supabase.co';
const SB_KEY_DEFAULT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxncWx2bWZhZXNpaW5vZW5veXRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0ODIxNzIsImV4cCI6MjEwNzA1ODE3Mn0.nGkeVVmF2w9JnvnwoZ6AP-zukoZ1iCeqHr08JgnY9e4';
const clean = v => String(v || '').trim();
const envUrl = clean(process.env.SUPABASE_URL), envKey = clean(process.env.SUPABASE_ANON_KEY);
const SB_URL = /^https:\/\/[\w.-]+$/.test(envUrl.replace(/\/$/, '')) ? envUrl.replace(/\/$/, '') : SB_URL_DEFAULT;
const SB_KEY = /^[\x21-\x7e]+$/.test(envKey) && /^(eyJ|sb_)/.test(envKey) ? envKey : SB_KEY_DEFAULT;

async function isLoggedIn(req) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return false;
  const r = await fetch(SB_URL + '/auth/v1/user', { headers: { Authorization: auth, apikey: SB_KEY } });
  return r.ok;
}

function extractJson(text) {
  const start = text.indexOf('{'), end = text.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('Geen JSON in antwoord');
  return JSON.parse(text.slice(start, end + 1));
}

export default async function handler(req, res) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (req.method === 'GET') return res.status(200).json({ enabled: !!key });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Alleen POST' });
  if (!key) return res.status(501).json({ error: 'ANTHROPIC_API_KEY ontbreekt' });
  if (!/^[\x21-\x7e]+$/.test(key.trim())) return res.status(500).json({ error: 'ANTHROPIC_API_KEY in Vercel bevat vreemde tekens (bijv. ••••). Plak de sleutel opnieuw en redeploy' });
  let loggedIn;
  try { loggedIn = await isLoggedIn(req); }
  catch (e) { return res.status(500).json({ error: 'Inlogcontrole mislukte; Supabase onbereikbaar? (' + (e.message || e) + ')' }); }
  if (!loggedIn) return res.status(401).json({ error: 'Log eerst in' });

  const prompt = String((req.body && req.body.prompt) || '').slice(0, 12000);
  if (!prompt) return res.status(400).json({ error: 'Lege vraag' });

  // Optionele foto als data-URL (de app verkleint hem vooraf tot max 1400px JPEG)
  const content = [];
  const img = req.body && req.body.image;
  if (img) {
    const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/.exec(String(img));
    if (!m) return res.status(400).json({ error: 'Onbekend fotoformaat' });
    if (m[2].length > 4_000_000) return res.status(413).json({ error: 'Foto te groot' });
    content.push({ type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } });
  }
  content.push({ type: 'text', text: prompt });

  const useWeb = !!(req.body && req.body.web);
  const tools = useWeb ? [{
    type: 'web_search_20250305', name: 'web_search', max_uses: 5,
    user_location: { type: 'approximate', city: 'Amsterdam', country: 'NL', timezone: 'Europe/Amsterdam' },
  }] : undefined;

  try {
    const messages = [{ role: 'user', content }];
    let blocks = [];
    // Bij webzoeken kan de API een lange beurt pauzeren (pause_turn): dan sturen we hem terug om door te gaan.
    for (let round = 0; round < 4; round++) {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': key.trim(), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 3000,
          system: 'Je bent een ervaren sommelier. Sluit je antwoord af met één geldig JSON-object, zonder uitleg erna.',
          messages,
          ...(tools ? { tools } : {}),
        }),
      });
      const raw = await r.text();
      let j;
      try { j = JSON.parse(raw); } catch (_) { return res.status(502).json({ error: 'Onverwacht antwoord van Anthropic (' + r.status + '): ' + raw.slice(0, 200) }); }
      if (!r.ok) return res.status(502).json({ error: 'Anthropic: ' + (j.error?.message || 'API-fout ' + r.status) }); 
      blocks = blocks.concat(j.content || []);
      if (j.stop_reason !== 'pause_turn') break;
      messages.push({ role: 'assistant', content: j.content });
    }

    // Het JSON-antwoord staat in de tekst na het laatste zoekresultaat.
    let last = -1;
    blocks.forEach((b, i) => { if (b.type === 'web_search_tool_result') last = i; });
    const text = blocks.slice(last + 1).filter(b => b.type === 'text').map(b => b.text).join('');

    // Bronnen: alle geciteerde pagina's, anders de gevonden zoekresultaten.
    const seen = new Map();
    blocks.forEach(b => (b.citations || []).forEach(c => { if (c.url && !seen.has(c.url)) seen.set(c.url, c.title || c.url); }));
    if (!seen.size) blocks.filter(b => b.type === 'web_search_tool_result' && Array.isArray(b.content))
      .forEach(b => b.content.slice(0, 3).forEach(x => { if (x.url && !seen.has(x.url)) seen.set(x.url, x.title || x.url); }));
    const sources = [...seen].slice(0, 6).map(([url, title]) => ({ url, title }));
    const searches = blocks.filter(b => b.type === 'server_tool_use' && b.name === 'web_search').length;

    return res.status(200).json({ data: extractJson(text), sources, searches });
  } catch (e) {
    return res.status(500).json({ error: 'Serverfout: ' + (e.message || 'onbekend') });
  }
}
