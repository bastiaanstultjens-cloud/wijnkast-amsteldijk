/*
 * Opslaglaag van de wijnkast.
 *
 * Twee varianten met dezelfde API:
 *  - "supabase": gedeeld tussen apparaten en personen (Bastiaan en Vivian), live bijgewerkt.
 *  - "local":    alles in localStorage van deze browser. Wordt gebruikt als config.js leeg is.
 *
 * Data-model: documenten (plain JSON) per collectie, met een id.
 *   bottles/<id>   één fles (zie CLAUDE.md voor de velden)
 *   log/<id>       één geopende fles
 *   settings/kast  { top, bottom } zonetemperaturen
 *
 * In Supabase staat alles in één tabel `docs (collection, id, data jsonb)`.
 */
(function () {
  const cfg = window.WIJNKAST_CONFIG || {};
  const listeners = []; // {type:'col'|'doc', col, id, cb}

  function newId() {
    return (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)).replace(/-/g, '').slice(0, 20);
  }

  /* Verklein een foto naar max 1000px JPEG, zodat opslag en laden snel blijven. */
  async function shrinkImage(file, max = 1000, quality = 0.82) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      return await new Promise(res => c.toBlob(res, 'image/jpeg', quality));
    } finally { URL.revokeObjectURL(url); }
  }

  /* ---------------- lokaal ---------------- */
  const LS_KEY = 'wijnkast:v1';
  const local = {
    mode: 'local',
    _read() { try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch (_) { return {}; } },
    _write(all) {
      try { localStorage.setItem(LS_KEY, JSON.stringify(all)); }
      catch (e) { throw new Error('De browseropslag is vol. Verwijder foto\'s of koppel Supabase.'); }
      notifyAll();
    },
    async init() { window.addEventListener('storage', e => { if (e.key === LS_KEY) notifyAll(); }); },
    needsLogin() { return false; },
    async list(col) { const c = this._read()[col] || {}; return Object.entries(c).map(([id, d]) => ({ id, ...d })); },
    async get(col, id) { return (this._read()[col] || {})[id] || null; },
    async set(col, id, data) { const all = this._read(); (all[col] ||= {})[id] = data; this._write(all); },
    async update(col, id, patch) { const all = this._read(); const c = (all[col] ||= {}); c[id] = { ...(c[id] || {}), ...patch }; this._write(all); },
    async remove(col, id) { const all = this._read(); if (all[col]) delete all[col][id]; this._write(all); },
    async uploadPhoto(file) {
      const blob = await shrinkImage(file, 700, 0.75);
      return await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
    },
    photoUrl(p) { return p || ''; },
    async authToken() { return null; },
  };

  /* ---------------- Supabase ---------------- */
  const BUCKET = 'etiketten';
  const sb = {
    mode: 'supabase', client: null, session: null,
    async init() {
      if (!window.supabase) throw new Error('Supabase-bibliotheek niet geladen');
      this.client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
      const { data } = await this.client.auth.getSession();
      this.session = data.session;
      if (this.session) {
        // Bewaarde sessie van een verwijderd of verlopen account: opruimen in plaats van half ingelogd blijven.
        const { error } = await this.client.auth.getUser();
        if (error && (error.status === 401 || error.status === 403)) {
          await this.client.auth.signOut({ scope: 'local' }).catch(() => {});
          this.session = null;
        }
      }
      // Niet herladen na inloggen: op iOS raakte de sessie daarbij soms kwijt. Alleen bij uitloggen opnieuw beginnen.
      this.client.auth.onAuthStateChange((evt, session) => {
        this.session = session;
        if (evt === 'SIGNED_OUT' && this._live) location.reload();
      });
      if (this.session) this._startLive();
    },
    _startLive() {
      if (this._live) return;
      this._live = true;
      let t = null;
      this.client.channel('docs-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'docs' }, () => { clearTimeout(t); t = setTimeout(notifyAll, 150); })
        .subscribe();
      document.addEventListener('visibilitychange', () => { if (!document.hidden) notifyAll(); });
    },
    needsLogin() { return !this.session; },
    async signIn(email, password) {
      const { data, error } = await this.client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      this.session = data.session;
      this._startLive();
    },
    async signOut() { await this.client.auth.signOut(); },
    async list(col) {
      const { data, error } = await this.client.from('docs').select('id,data').eq('collection', col);
      if (error) throw error;
      return data.map(r => ({ id: r.id, ...r.data }));
    },
    async get(col, id) {
      const { data, error } = await this.client.from('docs').select('data').eq('collection', col).eq('id', id).maybeSingle();
      if (error) throw error;
      return data ? data.data : null;
    },
    async set(col, id, d) {
      const { error } = await this.client.from('docs').upsert({ collection: col, id, data: d, updated_at: new Date().toISOString() });
      if (error) throw error; notifyAll();
    },
    async update(col, id, patch) { const cur = (await this.get(col, id)) || {}; await this.set(col, id, { ...cur, ...patch }); },
    async remove(col, id) {
      const { error } = await this.client.from('docs').delete().eq('collection', col).eq('id', id);
      if (error) throw error; notifyAll();
    },
    async uploadPhoto(file) {
      const blob = await shrinkImage(file);
      const path = newId() + '.jpg';
      const { error } = await this.client.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg' });
      if (error) throw error;
      return path;
    },
    photoUrl(p) {
      if (!p) return '';
      if (p.startsWith('data:') || p.startsWith('http')) return p;
      return this.client.storage.from(BUCKET).getPublicUrl(p).data.publicUrl;
    },
    async authToken() { return this.session?.access_token || null; },
  };

  const impl = cfg.supabaseUrl && cfg.supabaseAnonKey ? sb : local;

  async function fire(l) {
    try {
      if (l.type === 'col') l.cb(await impl.list(l.col));
      else l.cb(await impl.get(l.col, l.id));
    } catch (e) { console.error('Laden mislukt', e); }
  }
  function notifyAll() { listeners.forEach(fire); }

  window.store = {
    get mode() { return impl.mode; },
    init: () => impl.init(),
    needsLogin: () => impl.needsLogin(),
    signIn: (email, password) => impl.signIn(email, password),
    signOut: () => impl.signOut && impl.signOut(),
    newId,
    shrinkImage,
    set: (c, i, d) => impl.set(c, i, d),
    update: (c, i, p) => impl.update(c, i, p),
    remove: (c, i) => impl.remove(c, i),
    uploadPhoto: f => impl.uploadPhoto(f),
    photoUrl: p => impl.photoUrl(p),
    authToken: () => impl.authToken(),
    /** Roept cb aan met de hele collectie, nu en na elke wijziging. */
    watch(col, cb) { const l = { type: 'col', col, cb }; listeners.push(l); fire(l); },
    /** Roept cb aan met één document (of null), nu en na elke wijziging. */
    watchDoc(col, id, cb) { const l = { type: 'doc', col, id, cb }; listeners.push(l); fire(l); },
    /** Alles als één JSON-object, voor back-up. */
    async exportAll() { const out = {}; for (const c of ['bottles', 'log', 'settings']) out[c] = await impl.list(c); return out; },
    /** Zet een back-up terug (overschrijft documenten met dezelfde id). */
    async importAll(data) {
      for (const c of ['bottles', 'log', 'settings']) for (const { id, ...d } of data[c] || []) await impl.set(c, id, d);
    },
  };
})();
