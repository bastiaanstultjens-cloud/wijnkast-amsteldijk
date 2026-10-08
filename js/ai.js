/*
 * Claude-functies (aanvullen van een fles, "Vanavond"-advies).
 * Praat met de serverfunctie /api/claude, die de Anthropic-sleutel geheim houdt.
 * ai.init() geeft null terug als die functie er niet is (bijv. bij lokaal openen
 * zonder `vercel dev`); de app verbergt de Claude-knoppen dan.
 */
(function () {
  async function call(prompt, imageDataUrl, opts = {}) {
    const token = await window.store.authToken();
    const res = await fetch('/api/claude', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: JSON.stringify({ prompt, image: imageDataUrl || undefined, web: !!opts.web }),
    });
    const raw = await res.text();
    let body = {};
    try { body = JSON.parse(raw); } catch (_) { /* Vercel-foutpagina of time-out */ }
    if (!res.ok) {
      if (body.error) throw new Error(body.error);
      if (res.status === 504 || /TIMEOUT/.test(raw)) throw new Error('Claude deed er te lang over (time-out). Probeer het nog eens');
      throw new Error('Claude gaf een fout (' + res.status + (raw ? ': ' + raw.slice(0, 120) : '') + ')');
    }
    // Bronnen van webzoeken meegeven als _sources
    return body.sources && body.sources.length ? { ...body.data, _sources: body.sources } : body.data;
  }
  window.ai = {
    async init() {
      try {
        const r = await fetch('/api/claude', { method: 'GET' });
        if (!r.ok) return null;
        const j = await r.json();
        return j.enabled ? { json: call } : null;
      } catch (_) { return null; }
    },
  };
})();
