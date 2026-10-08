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
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || 'Claude gaf een fout (' + res.status + ')');
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
