(function(){
const YEAR = new Date().getFullYear();
const ROWS = [
  {id:'1',label:'Plank 1',zone:'top'},{id:'2',label:'Plank 2',zone:'top'},{id:'3',label:'Plank 3',zone:'top'},
  {id:'4',label:'Plank 4',zone:'bottom'},{id:'5',label:'Plank 5',zone:'bottom'},{id:'6',label:'Plank 6',zone:'bottom'},
  {id:'L',label:'Lade',zone:'bottom'}];
const COLS = ['A','B','C','D'];
const SLOTS = ROWS.flatMap(r=>COLS.map(c=>r.id+c));
const zoneOf = s => (ROWS.find(r=>r.id===s?.[0])||{}).zone;
const TYPES = {
  rood:{label:'Rood',v:'--t-rood'}, wit:{label:'Wit',v:'--t-wit',light:1}, rose:{label:'Rosé',v:'--t-rose',light:1},
  champagne:{label:'Champagne',v:'--t-champagne',light:1}, mousserend:{label:'Mousserend',v:'--t-mousserend',light:1},
  zoet:{label:'Zoet',v:'--t-zoet'}, versterkt:{label:'Versterkt',v:'--t-versterkt'}};
const tcol = t => `var(${(TYPES[t]||TYPES.rood).v})`;
const SPARK = t => t==='champagne'||t==='mousserend';

const DISHES = [
 {k:'aperitief',label:'Aperitief',kw:['aperitief','borrel','hapje','oester','toast'],types:{champagne:3,mousserend:3,wit:1,rose:1}},
 {k:'schaal',label:'Oesters & schaaldieren',kw:['oester','kreeft','schaaldier','langoustine','gamba','krab','coquille','sint-jakob','mossel'],types:{champagne:3,wit:3,mousserend:2}},
 {k:'vis',label:'Vis',kw:['vis','zalm','tarbot','kabeljauw','zeebaars','tonijn','tong','forel'],types:{wit:3,champagne:2,rose:2}},
 {k:'gevogelte',label:'Gevogelte',kw:['kip','gevogelte','eend','parelhoen','kalkoen','duif'],types:{wit:2,rood:2,rose:1,champagne:1}},
 {k:'rund',label:'Rund & lam',kw:['rund','biefstuk','steak','lam','côte','entrecote','ossenhaas','bbq','vlees'],types:{rood:3}},
 {k:'wild',label:'Wild',kw:['wild','hert','ree','fazant','zwijn','haas','paddenstoel'],types:{rood:3}},
 {k:'pasta',label:'Pasta & pizza',kw:['pasta','pizza','tomaat','risotto','italiaans'],types:{rood:2,wit:1,rose:1}},
 {k:'aziatisch',label:'Aziatisch & kruidig',kw:['aziatisch','sushi','thai','curry','kruidig','japans','pittig'],types:{wit:2,rose:2,mousserend:1,champagne:1}},
 {k:'vega',label:'Vegetarisch',kw:['vegetarisch','groente','paddenstoel','truffel','asperge','salade'],types:{wit:2,rood:1,rose:1}},
 {k:'kaas',label:'Kaas',kw:['kaas','comté','roquefort','brie','parmezaan','blauwe'],types:{versterkt:3,zoet:2,rood:1,wit:1}},
 {k:'dessert',label:'Dessert',kw:['dessert','chocolade','taart','fruit','brûlée','zoet'],types:{zoet:3,versterkt:2,mousserend:1}},
];

const state = {bottles:[], log:[], settings:{top:8,bottom:14}, tab:'kast', loaded:false,
  canWrite:true, canPhoto:false, ai:null, q:'', fType:'', sort:'urgentie', dish:'', claudePicks:null, claudeBusy:false};

const $ = s => document.querySelector(s);
const h = v => String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const eur = new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR',maximumFractionDigits:0});
const eur2 = new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'});
const today = () => new Date().toISOString().slice(0,10);
const fmtDate = d => { if(!d) return ''; const x=new Date(d); return isNaN(x)?h(d):x.toLocaleDateString('nl-NL',{day:'numeric',month:'short',year:'numeric'}); };
const vint = b => b.vintage ? String(b.vintage) : '';
const vshort = b => { const v=vint(b); if(/^\d{4}$/.test(v)) return "'"+v.slice(2); return v ? v.slice(0,3).toUpperCase() : '·'; };
const title = b => [b.producer,b.cuvee].filter(Boolean).join(' · ') || 'Naamloze fles';
const inKast = () => state.bottles.filter(b=>SLOTS.includes(b.slot));
const bySlot = () => Object.fromEntries(inKast().map(b=>[b.slot,b]));
const freeSlots = () => { const m=bySlot(); return SLOTS.filter(s=>!m[s]); };

function since(d){
  if(!d) return '';
  const a=new Date(d), n=new Date(); if(isNaN(a)) return '';
  let m=(n.getFullYear()-a.getFullYear())*12+(n.getMonth()-a.getMonth()); if(n.getDate()<a.getDate()) m--;
  if(m<1){const days=Math.max(0,Math.round((n-a)/864e5)); return days+(days===1?' dag':' dagen');}
  const y=Math.floor(m/12), r=m%12;
  return (y? y+' jr':'') + (y&&r?' ':'') + (r? r+' mnd':'');
}
function status(b){
  const f=+b.drinkFrom||0, p=+b.drinkPeak||0, t=+b.drinkTo||0;
  if(!f && !t) return {k:'onbekend',label:'Geen drinkvenster'};
  if(t && YEAR>t) return {k:'over',label:'Venster verstreken ('+t+')'};
  if(f && YEAR<f) return {k:'jong',label:'Te jong · vanaf '+f};
  if(t && t-YEAR<=1) return {k:'haast',label: t===YEAR?'Drink dit jaar':'Drink vóór eind '+t};
  if(p && YEAR===p) return {k:'piek',label:'Op piek'};
  return {k:'klaar',label:'Klaar'+(t?' · tot '+t:'')};
}
const URG = {over:0,haast:1,piek:2,klaar:3,onbekend:4,jong:5};

function toast(msg){ const r=$('#toastRoot'); r.innerHTML=`<div class="toast" role="status">${h(msg)}</div>`; clearTimeout(toast.t); toast.t=setTimeout(()=>r.innerHTML='',2600); }

/* ---------- tabs ---------- */
const ICONS = {
 kast:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="5" y="2.5" width="14" height="19" rx="1.5"/><path d="M5 8h14M5 13h14M5 18h14"/></svg>',
 lijst:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></svg>',
 vanavond:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M7 3h10l-.6 5.5a4.4 4.4 0 0 1-8.8 0z"/><path d="M12 13v7M8.5 21h7"/></svg>',
 logboek:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11"/></svg>'};
const TABS=[['kast','Kast'],['lijst','Lijst'],['vanavond','Vanavond'],['logboek','Logboek']];
function renderTabs(){
  $('#tabs').innerHTML = TABS.map(([k,l])=>`<button type="button" data-tab="${k}" ${state.tab===k?'aria-current="page"':''}>${ICONS[k]}${l}</button>`).join('');
}
$('#tabs').addEventListener('click',e=>{const b=e.target.closest('[data-tab]'); if(!b) return; state.tab=b.dataset.tab; try{localStorage.setItem('wk-tab',state.tab)}catch(_){} render(); window.scrollTo(0,0);});
try{const t=localStorage.getItem('wk-tab'); if(t && TABS.some(x=>x[0]===t)) state.tab=t;}catch(_){}

/* ---------- render ---------- */
function render(){
  renderTabs();
  $('#addBtn').hidden = !state.canWrite;
  $('#scanBtn').hidden = !state.canWrite || !state.ai;
  const m=$('#main');
  if(state.tab==='kast') m.innerHTML=viewKast();
  else if(state.tab==='lijst') m.innerHTML=viewLijst();
  else if(state.tab==='vanavond') m.innerHTML=viewVanavond();
  else m.innerHTML=viewLog();
  if(state.tab==='lijst'){ const q=$('#q'); if(q && renderLijstFocus){ q.focus(); q.setSelectionRange(q.value.length,q.value.length); } }
  renderLijstFocus=false;
}
let renderLijstFocus=false;

function capHTML(b){
  const t=TYPES[b.type]||TYPES.rood;
  return `<span class="cap ${t.light?'light':''}" style="--c:${tcol(b.type)}"><span class="inner">${h(vshort(b))}</span></span>`;
}
function slotHTML(s,m){
  const b=m[s];
  if(!b) return `<button type="button" class="slot empty" data-slot="${s}" aria-label="Plek ${s}, leeg"><span class="ring">${s}</span></button>`;
  const st=status(b), flag = ['haast','over','jong','piek'].includes(st.k) ? `<span class="flag ${st.k}"></span>`:'';
  const dim = state.highlight && !state.highlight.includes(b.id) ? ' dim':'';
  return `<button type="button" class="slot${dim}" data-bottle="${h(b.id)}" aria-label="Plek ${s}: ${h(title(b))} ${h(vint(b))}, ${h(st.label)}">${capHTML(b)}${flag}</button>`;
}
function fridgeHTML(){
  const m=bySlot(); const S=state.settings;
  let out=`<div class="fridge"><button type="button" class="panel" id="panel" aria-label="Zonetemperaturen aanpassen">
    <span class="lbl">BOVEN</span><span class="led num">${String(S.top).padStart(2,'0')}°</span><span class="sep"></span><span class="led num">${String(S.bottom).padStart(2,'0')}°</span><span class="lbl">ONDER</span></button><div class="glass">`;
  out+=`<div class="zone-tag"><span>ZONE BOVEN</span><span>${S.top}°C</span></div>`;
  ROWS.forEach((r,i)=>{
    if(r.id==='4') out+=`<div class="zone-split"></div><div class="zone-tag"><span>ZONE ONDER</span><span>${S.bottom}°C</span></div>`;
    const cells=COLS.map(c=>slotHTML(r.id+c,m)).join('');
    if(r.id==='L') out+=`<div class="drawer"><div class="tag">LADE</div><div class="rack">${cells}</div></div>`;
    else out+=`<div class="rack">${cells}</div><div class="shelf"><span>${r.id}</span></div>`;
  });
  out+=`</div></div>`;
  return out;
}
function legendHTML(){
  return `<div class="legend">${Object.values(TYPES).map(t=>`<span><i style="background:var(${t.v})"></i>${t.label}</span>`).join('')}
  <span><i style="background:#F0A63A"></i>Haast</span><span><i style="background:#E2614A"></i>Over venster</span><span><i style="background:#7E95AE"></i>Te jong</span><span><i style="background:#7ED3A4"></i>Op piek</span></div>`;
}
function stats(){
  const k=inKast(); const value=k.reduce((a,b)=>a+(+b.marketValue||+b.price||0),0);
  const hot=k.filter(b=>['haast','over'].includes(status(b).k)).length;
  return `<div class="stats">
    <div class="stat"><span class="eyebrow">In de kast</span><b>${k.length}<span class="muted" style="font-size:16px"> / 28</span></b></div>
    <div class="stat"><span class="eyebrow">Vrije plekken</span><b>${28-k.length}</b></div>
    <div class="stat ${hot?'hot':''}"><span class="eyebrow">Met haast</span><b>${hot}</b></div>
    <div class="stat"><span class="eyebrow">Waarde</span><b>${value?eur.format(value):'—'}</b></div></div>`;
}
function rowItem(b){
  const st=status(b);
  return `<button type="button" class="rowitem" data-bottle="${h(b.id)}"><span class="dot" style="background:${tcol(b.type)}"></span>
    <span class="t"><b>${h(title(b))}</b><span>${h([vint(b),b.region].filter(Boolean).join(' · '))}</span></span>
    <span class="pill ${st.k}">${h(st.label)}</span></button>`;
}
function viewKast(){
  const k=inKast();
  const urgent=k.filter(b=>['over','haast','piek'].includes(status(b).k)).sort((a,b)=>URG[status(a).k]-URG[status(b).k]);
  const recent=[...k].sort((a,b)=>String(b.addedAt||'').localeCompare(String(a.addedAt||''))).slice(0,4);
  let side='';
  if(!state.loaded) side=`<div class="card"><p class="muted" style="margin:0">Kast laden…</p></div>`;
  else if(!k.length) side=`<div class="card empty-state"><h3>De kast is nog leeg</h3><p>Tik op een lege plek in de kast of op “+ Fles” om je eerste wijn toe te voegen. Claude kan drinkvenster, serveertips en eten erbij voor je invullen.</p>${state.canWrite?'<button class="btn primary" type="button" data-add="1A">Eerste fles toevoegen</button>':''}</div>`;
  else {
    side+=`<div class="card"><h3>Drink deze eerst</h3>${urgent.length?urgent.map(rowItem).join(''):'<p class="muted" style="margin:0">Niets met haast. Alles ligt goed.</p>'}</div>`;
    side+=`<div class="card"><h3>Laatst toegevoegd</h3>${recent.map(rowItem).join('')}</div>`;
  }
  return stats()+`<div class="kast-layout"><div>${fridgeHTML()}${legendHTML()}</div><div class="side">${side}</div></div>`;
}

function viewLijst(){
  let list=[...state.bottles];
  const q=state.q.trim().toLowerCase();
  if(q) list=list.filter(b=>[b.producer,b.cuvee,b.region,b.appellation,b.country,b.grapes,b.vintage,b.pairing,b.slot,b.shop].join(' ').toLowerCase().includes(q));
  if(state.fType) list=list.filter(b=>b.type===state.fType);
  const sorts={
    urgentie:(a,b)=>URG[status(a).k]-URG[status(b).k]||(+a.drinkTo||9999)-(+b.drinkTo||9999),
    plek:(a,b)=>SLOTS.indexOf(a.slot)-SLOTS.indexOf(b.slot),
    jaargang:(a,b)=>String(a.vintage||'').localeCompare(String(b.vintage||'')),
    prijs:(a,b)=>(+b.marketValue||+b.price||0)-(+a.marketValue||+a.price||0),
    nieuw:(a,b)=>String(b.addedAt||'').localeCompare(String(a.addedAt||''))};
  list.sort(sorts[state.sort]||sorts.urgentie);
  const all=state.bottles;
  const paid=all.reduce((a,b)=>a+(+b.price||0),0), market=all.reduce((a,b)=>a+(+b.marketValue||+b.price||0),0);
  const byType=Object.keys(TYPES).map(t=>[t,all.filter(b=>b.type===t).length]).filter(x=>x[1]);
  const regions={}; all.forEach(b=>{const r=b.region||b.country; if(r) regions[r]=(regions[r]||0)+1;});
  const topReg=Object.entries(regions).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const max=Math.max(1,...byType.map(x=>x[1]),...topReg.map(x=>x[1]));
  const out=all.length-inKast().length;
  const sum = all.length ? `<div class="stats" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr))">
     <div class="stat"><span class="eyebrow">Flessen totaal</span><b>${all.length}</b></div>
     <div class="stat"><span class="eyebrow">Aankoopwaarde</span><b>${paid?eur.format(paid):'—'}</b></div>
     <div class="stat"><span class="eyebrow">Marktwaarde</span><b>${market?eur.format(market):'—'}</b></div>
     ${out?`<div class="stat"><span class="eyebrow">Buiten de kast</span><b>${out}</b></div>`:''}</div>
     <div class="kast-layout" style="grid-template-columns:repeat(auto-fit,minmax(260px,1fr));margin-bottom:18px">
       <div class="card"><h3>Per soort</h3><div class="bars">${byType.map(([t,n])=>`<div class="bar"><span>${TYPES[t].label}</span><span class="track"><span class="fill" style="display:block;width:${n/max*100}%;background:${tcol(t)}"></span></span><span class="num">${n}</span></div>`).join('')}</div></div>
       ${topReg.length?`<div class="card"><h3>Per regio</h3><div class="bars">${topReg.map(([r,n])=>`<div class="bar"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${h(r)}</span><span class="track"><span class="fill" style="display:block;width:${n/max*100}%;background:var(--beech)"></span></span><span class="num">${n}</span></div>`).join('')}</div></div>`:''}
     </div>` : '';
  const items = list.map(b=>{const st=status(b); const t=TYPES[b.type]||TYPES.rood;
    return `<button type="button" class="wine" data-bottle="${h(b.id)}"><span class="dot" style="background:${tcol(b.type)};color:${t.light?'#2a1d0e':'#fff'}">${h(vshort(b))}</span>
      <span style="min-width:0"><h4>${h(title(b))}</h4><span class="meta">${h([vint(b),b.region||b.country,b.grapes].filter(Boolean).join(' · '))}</span></span>
      <span class="r"><span class="pill ${st.k}">${h(st.label)}</span><span class="code">${h(b.slot||'buiten')}</span></span></button>`;}).join('');
  return sum+`<div class="toolbar">
    <input id="q" type="search" placeholder="Zoek op producent, regio, druif, gerecht…" value="${h(state.q)}" aria-label="Zoeken">
    <select id="fType" aria-label="Soort"><option value="">Alle soorten</option>${Object.entries(TYPES).map(([k,t])=>`<option value="${k}" ${state.fType===k?'selected':''}>${t.label}</option>`).join('')}</select>
    <select id="sort" aria-label="Sorteren">${[['urgentie','Eerst drinken'],['plek','Plek in kast'],['jaargang','Jaargang'],['prijs','Waarde'],['nieuw','Nieuwste']].map(([k,l])=>`<option value="${k}" ${state.sort===k?'selected':''}>${l}</option>`).join('')}</select></div>
    <div class="list">${items || `<div class="card empty-state">${all.length?'Geen flessen gevonden met dit filter.':'Nog geen flessen. Voeg er een toe met “+ Fles”.'}</div>`}</div>
    <div class="card" style="margin-top:18px"><h3>Back-up</h3><p class="muted" style="margin-top:0">Download de hele kast als JSON-bestand, of zet een eerdere back-up terug. Zo verhuis je je data naar een andere opslag.</p>
      <div class="actions"><button class="btn small" type="button" id="exportBtn">Back-up downloaden</button>
      ${state.canWrite?'<label class="btn small" for="importFile">Back-up terugzetten</label><input id="importFile" type="file" accept="application/json,.json" hidden>':''}
      ${store.mode==='supabase'?'<button class="btn small" type="button" id="logoutBtn">Uitloggen</button>':''}</div></div>`;
}

function dishScore(b,d){
  const txt=[b.pairing,b.notes].join(' ').toLowerCase();
  let s=0, why=[];
  const hit=d.kw.filter(k=>txt.includes(k));
  if(hit.length){s+=3+hit.length; why.push('past bij '+hit.slice(0,2).join(', '));}
  const ta=d.types[b.type]||0; s+=ta*1.5; if(ta>=3&&!hit.length) why.push((TYPES[b.type]||{}).label+' is een klassieker hierbij');
  const st=status(b); s+={haast:3,over:2,piek:2.5,klaar:1,onbekend:0,jong:-6}[st.k];
  if(st.k==='haast'||st.k==='over') why.push('moet op'); if(st.k==='piek') why.push('op piek');
  if(st.k==='jong') why.push('eigenlijk nog te jong');
  if(b.reservedFor){s-=4; why.push('gereserveerd: '+b.reservedFor);}
  return {s,why:why.join(' · ')};
}
function viewVanavond(){
  const k=inKast();
  const d=DISHES.find(x=>x.k===state.dish);
  let res='';
  if(d){
    const ranked=k.map(b=>({b,...dishScore(b,d)})).filter(x=>x.s>0).sort((a,b)=>b.s-a.s).slice(0,5);
    res=`<div class="card"><h3>Uit de kast bij ${h(d.label.toLowerCase())}</h3>${ranked.length?ranked.map(x=>`<button type="button" class="rowitem" data-bottle="${h(x.b.id)}"><span class="dot" style="background:${tcol(x.b.type)}"></span><span class="t"><b>${h(title(x.b))} ${h(vint(x.b))}</b><span>${h(x.why||'')}</span></span><span class="code">${h(x.b.slot)}</span></button>`).join(''):'<p class="muted" style="margin:0">Niets in de kast dat hier echt bij past.</p>'}</div>`;
  }
  let cl='';
  if(state.ai){
    const p=state.claudePicks;
    cl=`<div class="card"><h3>Vraag het Claude</h3><div class="field"><label for="dishText">Wat eten jullie, en wat is de gelegenheid?</label><textarea id="dishText" placeholder="Bijv. tarbot met beurre blanc, verjaardag van Vivian">${h(state.dishText||'')}</textarea></div>
      <div class="actions"><button class="btn primary" type="button" id="askClaude" ${state.claudeBusy||!k.length?'disabled':''}>${state.claudeBusy?'Claude kijkt in de kast…':'Kies een fles'}</button></div>
      ${p?`<div style="margin-top:10px">${(p.picks||[]).map(x=>{const b=state.bottles.find(y=>y.id===x.id); return b?`<button type="button" class="rowitem" data-bottle="${h(b.id)}"><span class="dot" style="background:${tcol(b.type)}"></span><span class="t"><b>${h(title(b))} ${h(vint(b))}</b><span>${h(x.why)}</span></span><span class="code">${h(b.slot)}</span></button>`:'';}).join('')}${p.tip?`<p class="why" style="margin-top:8px">${h(p.tip)}</p>`:''}</div>`:''}
    </div>`;
  }
  return `<div class="card" style="margin-bottom:16px"><h3>Wat staat er op tafel?</h3><div class="chips">${DISHES.map(x=>`<button type="button" class="chip" data-dish="${x.k}" aria-pressed="${state.dish===x.k}">${x.label}</button>`).join('')}</div>
    ${k.length?'':'<p class="muted" style="margin:12px 0 0">Zodra er flessen in de kast liggen, verschijnen hier suggesties.</p>'}</div>
    <div class="side">${res}${cl}</div>`;
}

function viewLog(){
  if(!state.log.length) return `<div class="card empty-state"><h3>Nog niets geopend</h3><p>Open je een fles, tik hem dan aan in de kast en kies “Geopend”. Je legt vast wanneer, met wie en bij welk gerecht. Zo leer je welke combinaties werken.</p></div>`;
  return `<div class="list">${state.log.map(l=>`<div class="logitem"><div class="hd"><b>${h(title(l))} ${h(vint(l))}</b><span class="muted num" style="font-size:13px">${fmtDate(l.openedOn)}</span></div>
    <div class="muted" style="font-size:14px">${h([l.with&&'met '+l.with, l.dish&&'bij '+l.dish, l.occasion].filter(Boolean).join(' · '))}</div>
    ${l.pairingScore?`<div style="font-size:14px">Combinatie <span class="stars" aria-label="${l.pairingScore} van 5">${'★'.repeat(l.pairingScore)}${'☆'.repeat(5-l.pairingScore)}</span>${l.myScore?` · eigen score <b class="num">${h(l.myScore)}</b>`:''}</div>`:(l.myScore?`<div style="font-size:14px">Eigen score <b class="num">${h(l.myScore)}</b></div>`:'')}
    ${l.tasting?`<div style="font-size:14px">${h(l.tasting)}</div>`:''}</div>`).join('')}</div>`;
}

/* ---------- events in main ---------- */
document.addEventListener('click',e=>{
  const t=e.target;
  const bt=t.closest('[data-bottle]'); if(bt && !t.closest('.sheet')){ openDetail(bt.dataset.bottle); return; }
  const sl=t.closest('[data-slot]'); if(sl){ if(state.canWrite) openForm(null,sl.dataset.slot); return; }
  const ad=t.closest('[data-add]'); if(ad){ openForm(null,ad.dataset.add); return; }
  if(t.closest('#panel')){ if(state.canWrite) openZones(); return; }
  const ch=t.closest('[data-dish]'); if(ch){ state.dish = state.dish===ch.dataset.dish?'':ch.dataset.dish; render(); return; }
  if(t.closest('#askClaude')) askClaude();
  if(t.closest('#exportBtn')) exportBackup();
  if(t.closest('#logoutBtn')) store.signOut();
});
$('#addBtn').addEventListener('click',()=>openForm(null,freeSlots()[0]||''));
$('#scanBtn').addEventListener('click',()=>openForm(null,freeSlots()[0]||'',{camera:true}));
document.addEventListener('input',e=>{
  if(e.target.id==='q'){ state.q=e.target.value; renderLijstFocus=true; render(); }
  if(e.target.id==='dishText'){ state.dishText=e.target.value; }
});
document.addEventListener('change',e=>{
  if(e.target.id==='fType'){state.fType=e.target.value; render();}
  if(e.target.id==='sort'){state.sort=e.target.value; render();}
  if(e.target.id==='importFile' && e.target.files[0]) importBackup(e.target.files[0]);
});

/* ---------- sheet ---------- */
function openSheet(html){
  $('#sheetRoot').innerHTML=`<div class="overlay" id="ov"><div class="sheet" role="dialog" aria-modal="true">${html}</div></div>`;
  document.body.style.overflow='hidden';
  const f=$('#sheetRoot').querySelector('input,select,textarea,button'); if(f) setTimeout(()=>{ if(window.matchMedia('(min-width:700px)').matches) f.focus(); },30);
}
function closeSheet(){ $('#sheetRoot').innerHTML=''; document.body.style.overflow=''; }
document.addEventListener('keydown',e=>{ if(e.key==='Escape' && $('#ov')) closeSheet(); });
document.addEventListener('mousedown',e=>{ if(e.target.id==='ov') closeSheet(); });
document.addEventListener('click',e=>{ if(e.target.closest('[data-close]')) closeSheet(); });

/* ---------- detail ---------- */
function windowSVG(b){
  const f=+b.drinkFrom, t=+b.drinkTo, p=+b.drinkPeak; if(!f&&!t) return '';
  const lo=Math.min(f||t, YEAR)-1, hi=Math.max(t||f, YEAR)+1, W=320, x=y=>12+(y-lo)/(hi-lo)*(W-24);
  const a=x(f||lo+1), z=x(t||hi-1);
  return `<div class="window"><svg viewBox="0 0 ${W} 54" role="img" aria-label="Drinkvenster ${f||'?'} tot ${t||'?'}${p?', piek '+p:''}">
    <line x1="12" x2="${W-12}" y1="22" y2="22" stroke="var(--line)" stroke-width="2"/>
    <rect x="${a}" y="16" width="${Math.max(4,z-a)}" height="12" rx="6" fill="var(--ok)" opacity=".35"/>
    ${p?`<rect x="${x(p)-5}" y="16" width="10" height="12" rx="5" fill="var(--ok)"/>`:''}
    <line x1="${x(YEAR)}" x2="${x(YEAR)}" y1="8" y2="36" stroke="var(--warn)" stroke-width="2"/>
    <text x="${x(YEAR)}" y="7" text-anchor="middle" font-size="10" fill="var(--warn)" font-family="var(--f-mono)" dominant-baseline="hanging" dy="-6">nu</text>
    ${f?`<text x="${a}" y="48" text-anchor="middle" font-size="11" fill="var(--muted)" font-family="var(--f-mono)">${f}</text>`:''}
    ${t?`<text x="${z}" y="48" text-anchor="middle" font-size="11" fill="var(--muted)" font-family="var(--f-mono)">${t}</text>`:''}
    ${p&&p!==f&&p!==t?`<text x="${x(p)}" y="48" text-anchor="middle" font-size="11" fill="var(--ok)" font-family="var(--f-mono)">piek ${p}</text>`:''}
  </svg></div>`;
}
function dl(rows){ const r=rows.filter(x=>x[1]!==''&&x[1]!=null&&x[1]!==false); return r.length?`<dl class="dl">${r.map(([k,v])=>`<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`:''; }
function openDetail(id){
  const b=state.bottles.find(x=>x.id===id); if(!b) return;
  const st=status(b), t=TYPES[b.type]||TYPES.rood;
  const ws = 'https://www.wine-searcher.com/find/'+encodeURIComponent([b.producer,b.cuvee,/^\d{4}$/.test(vint(b))?vint(b):''].filter(Boolean).join(' ').toLowerCase().replace(/\s+/g,'+'));
  const prev=state.log.filter(l=>l.producer===b.producer && (l.cuvee||'')===(b.cuvee||''));
  const serve=[b.serveTemp&&h(b.serveTemp)+'°C', b.decant==='ja'?'decanteren'+(b.decantMin?' ±'+h(b.decantMin)+' min':''):b.decant==='optioneel'?'decanteren optioneel':b.decant==='nee'?'niet decanteren':'', b.glass&&h(b.glass)].filter(Boolean).join(' · ');
  openSheet(`<div class="sheet-hd"><div style="min-width:0"><div class="eyebrow">${t.label}${b.slot?' · plek '+h(b.slot)+' · zone '+(zoneOf(b.slot)==='top'?'boven':'onder'):' · buiten de kast'}</div>
      <h2>${h(b.producer||'Naamloze fles')}</h2><div class="muted">${h([b.cuvee,vint(b)].filter(Boolean).join(' · '))}</div></div><button class="x" data-close aria-label="Sluiten">×</button></div>
    <span class="pill ${st.k}">${h(st.label)}</span>
    ${windowSVG(b)}
    ${b.photo?`<img class="photo" src="${h(store.photoUrl(b.photo))}" alt="Etiket van ${h(title(b))}" onerror="this.remove()">`:''}
    <div class="section"><h4>De fles</h4>${dl([
      ['Regio',h([b.appellation,b.region,b.country].filter(Boolean).join(', '))],['Druiven',h(b.grapes)],['Formaat',h(b.size)],['Alcohol',b.abv?h(b.abv)+'%':''],
      ['Degorgement',SPARK(b.type)?h(b.disgorged):''],['Dosage',SPARK(b.type)?h(b.dosage):''],['LWIN / barcode',h(b.lwin)]])}</div>
    <div class="section"><h4>Drinken</h4>${dl([['Venster',(b.drinkFrom||b.drinkTo)?h((b.drinkFrom||'?')+' – '+(b.drinkTo||'?'))+(b.drinkPeak?' · piek '+h(b.drinkPeak):''):''],['Bron',h(b.windowSource)],['Serveren',serve],['Past bij',h(b.pairing)]])}</div>
    <div class="section"><h4>Aankoop en waarde</h4>${dl([['In de kast sinds',b.addedAt?fmtDate(b.addedAt)+' <span class="muted">('+since(b.addedAt)+')</span>':''],['Gekocht',h([fmtDate(b.purchaseDate),b.shop].filter(Boolean).join(' · '))],['Prijs',b.price?eur2.format(b.price):''],['Marktwaarde',(b.marketValue?eur2.format(b.marketValue)+(b.valueCheckedAt?' <span class="muted">(opgezocht '+fmtDate(b.valueCheckedAt)+')</span>':'')+' · ':'')+`<a href="${h(ws)}" target="_blank" rel="noopener">check Wine-Searcher</a>`],['Cadeau van',h(b.giftFrom)],['Bewaren voor',h(b.reservedFor)]])}</div>
    ${(b.criticScore||b.myScore||b.notes)?`<div class="section"><h4>Beoordeling</h4>${dl([['Critici',h(b.criticScore)],['Eigen score',h(b.myScore)],['Notities',h(b.notes)]])}</div>`:''}
    ${(b.sources||[]).length?`<div class="section"><h4>Bronnen</h4><ul class="sources">${b.sources.map(x=>`<li><a href="${h(x.url)}" target="_blank" rel="noopener">${h(x.title||x.url)}</a></li>`).join('')}</ul></div>`:''}
    ${prev.length?`<div class="section"><h4>Eerder geopend</h4>${prev.map(l=>`<p style="margin:0 0 6px;font-size:14px"><b>${fmtDate(l.openedOn)}</b> ${h([l.dish&&'bij '+l.dish,l.with&&'met '+l.with].filter(Boolean).join(' · '))}${l.tasting?' — '+h(l.tasting):''}</p>`).join('')}</div>`:''}
    ${state.canWrite?`<div class="section"><div class="actions">
      <button class="btn primary" type="button" id="dOpen">Geopend</button>
      <button class="btn" type="button" id="dEdit">Bewerken</button>
      ${state.ai?'<button class="btn" type="button" id="dWeb">Prijs en scores opzoeken</button>':''}
      <button class="btn" type="button" id="dCopy">Nog een fles hiervan</button>
      <button class="btn danger" type="button" id="dDel">Verwijderen</button></div>
      <div class="field" style="margin-top:12px;max-width:260px"><label for="dMove">Verplaatsen naar</label><select id="dMove">${moveOptions(b.slot)}</select></div></div>`:''}`);
  if(!state.canWrite) return;
  $('#dEdit').onclick=()=>openForm(b);
  if($('#dWeb')) $('#dWeb').onclick=e=>refreshFromWeb(b,e.currentTarget);
  $('#dOpen').onclick=()=>openOpened(b);
  $('#dCopy').onclick=async()=>{const s=freeSlots()[0]; if(!s){toast('De kast is vol');return;} const c={...b}; delete c.id; c.slot=s; c.addedAt=today(); delete c.photo; if(b.photo) c.photo=b.photo; await save('bottles',store.newId(),c); closeSheet(); toast('Toegevoegd op '+s);};
  $('#dDel').onclick=async e=>{ const btn=e.currentTarget; if(!btn.dataset.sure){btn.dataset.sure=1;btn.textContent='Zeker? Tik nogmaals';return;} await store.remove('bottles',b.id).catch(dbErr); closeSheet(); toast('Fles verwijderd'); };
  $('#dMove').onchange=async e=>{ const v=e.target.value; const o=bySlot()[v]; if(o){ await store.update('bottles',o.id,{slot:b.slot||''}).catch(dbErr);} await store.update('bottles',b.id,{slot:v}).catch(dbErr); closeSheet(); toast(v?(o?'Gewisseld met '+title(o):'Verplaatst naar '+v):'Uit de kast gehaald'); };
}
function moveOptions(cur){
  const m=bySlot();
  return `<option value="${h(cur||'')}" selected>${cur?'Plek '+h(cur)+' (huidig)':'Buiten de kast (huidig)'}</option>`+
    SLOTS.filter(s=>s!==cur).map(s=>`<option value="${s}">${s}${m[s]?' · wissel met '+h(m[s].producer||'fles'):''}</option>`).join('')+
    (cur?`<option value="">Buiten de kast</option>`:'');
}

/* ---------- opened ---------- */
function openOpened(b){
  openSheet(`<div class="sheet-hd"><div><div class="eyebrow">Fles geopend</div><h2>${h(title(b))} ${h(vint(b))}</h2></div><button class="x" data-close aria-label="Sluiten">×</button></div>
  <form id="oForm"><div class="grid">
    ${fld({k:'openedOn',label:'Datum',type:'date'},{openedOn:today()})}
    ${fld({k:'with',label:'Met wie',ph:'Vivian, Maud…'},{})}
    ${fld({k:'dish',label:'Gerecht',ph:'Wat aten jullie erbij?'},{})}
    ${fld({k:'occasion',label:'Gelegenheid',ph:'Verjaardag, gewone dinsdag…'},{})}
    ${fld({k:'pairingScore',label:'Hoe was de combinatie?',type:'select',opts:[['','—'],['5','★★★★★ Perfect'],['4','★★★★ Heel goed'],['3','★★★ Prima'],['2','★★ Matig'],['1','★ Werkte niet']]},{})}
    ${fld({k:'myScore',label:'Eigen score (0–100)',type:'number'},{})}
    ${fld({k:'tasting',label:'Proefnotitie',type:'textarea',full:1,ph:'Hoe smaakte hij? Te vroeg, perfect, over de top?'},{})}
  </div><div class="actions" style="margin-top:14px"><button class="btn primary" type="submit">Opslaan en uit de kast halen</button><button class="btn" type="button" data-close>Annuleren</button></div></form>`);
  $('#oForm').onsubmit=async e=>{
    e.preventDefault(); const v=readForm(e.target);
    const snap={}; ['producer','cuvee','vintage','type','region','country','appellation','grapes','price','slot','pairing'].forEach(k=>{ if(b[k]!==undefined && b[k]!=='') snap[k]=b[k]; });
    v.pairingScore=v.pairingScore?+v.pairingScore:null;
    const ok=await save('log',store.newId(),{...snap,...v,bottleId:b.id});
    if(!ok) return;
    await store.remove('bottles',b.id).catch(dbErr);
    closeSheet(); toast('Proost! Opgeslagen in het logboek');
  };
}

/* ---------- form ---------- */
const GROUPS=[
 ['De fles',[{k:'producer',label:'Producent',req:1,ph:'Bijv. Pierre Péters'},{k:'cuvee',label:'Cuvée / naam',ph:'Bijv. Cuvée de Réserve'},{k:'vintage',label:'Jaargang',ph:'2019 of NV'},{k:'type',label:'Soort',type:'select',opts:Object.entries(TYPES).map(([k,t])=>[k,t.label])},
   {k:'size',label:'Formaat',type:'select',opts:[['75 cl','75 cl'],['37,5 cl','37,5 cl (half)'],['150 cl','150 cl (magnum)'],['300 cl','300 cl (jeroboam)'],['50 cl','50 cl']]},{k:'abv',label:'Alcohol %',type:'number',step:'0.1'}]],
 ['Champagne & mousserend',[{k:'disgorged',label:'Degorgement',ph:'Bijv. mrt 2023',sp:1},{k:'dosage',label:'Dosage',type:'select',sp:1,opts:[['',''],['Brut Nature','Brut Nature (0 g/l)'],['Extra Brut','Extra Brut (<6 g/l)'],['Brut','Brut (<12 g/l)'],['Extra Dry','Extra Dry'],['Sec','Sec'],['Demi-Sec','Demi-Sec'],['Doux','Doux']]}],1],
 ['Herkomst',[{k:'country',label:'Land'},{k:'region',label:'Regio',ph:'Bijv. Bourgogne'},{k:'appellation',label:'Appellatie',ph:'Bijv. Gevrey-Chambertin 1er Cru'},{k:'grapes',label:'Druiven',ph:'Bijv. Pinot Noir'}]],
 ['Drinkvenster',[{k:'drinkFrom',label:'Drinken vanaf',type:'number',ph:YEAR},{k:'drinkTo',label:'Drinken tot',type:'number',ph:YEAR+5},{k:'drinkPeak',label:'Piek',type:'number'},{k:'windowSource',label:'Bron',ph:'Producent, Vinous, eigen inschatting'}]],
 ['Serveren',[{k:'serveTemp',label:'Serveertemperatuur °C',type:'number'},{k:'decant',label:'Decanteren',type:'select',opts:[['',''],['nee','Nee'],['optioneel','Optioneel'],['ja','Ja']]},{k:'decantMin',label:'Decanteertijd (min)',type:'number'},{k:'glass',label:'Glas',ph:'Bourgogne, Bordeaux, wijnglas voor champagne'}]],
 ['Past bij',[{k:'pairing',label:'Gerechten',type:'textarea',full:1,ph:'Bijv. eend, paddenstoelen, oude Comté'}]],
 ['Aankoop en waarde',[{k:'purchaseDate',label:'Aankoopdatum',type:'date'},{k:'shop',label:'Gekocht bij'},{k:'price',label:'Prijs (€)',type:'number',step:'0.01'},{k:'marketValue',label:'Marktwaarde (€)',type:'number',step:'0.01'},{k:'giftFrom',label:'Cadeau van'},{k:'reservedFor',label:'Bewaren voor',ph:'Bijv. 10 jaar samen'}]],
 ['Beoordeling',[{k:'criticScore',label:'Score critici',ph:'Bijv. 94 Vinous'},{k:'myScore',label:'Eigen score (0–100)',type:'number'},{k:'notes',label:'Notities',type:'textarea',full:1}]],
 ['Overig',[{k:'lwin',label:'LWIN of barcode'},{k:'addedAt',label:'In de kast sinds',type:'date'}]],
];
function fld(f,v){
  const val=v[f.k]??'';
  const cls=`field${f.full?' full':''}${f.sp?' sparkling-only':''}`;
  const req=f.req?'required':'';
  let input;
  if(f.type==='select') input=`<select id="f_${f.k}" name="${f.k}">${f.opts.map(([k,l])=>`<option value="${h(k)}" ${String(val)===String(k)?'selected':''}>${h(l)}</option>`).join('')}</select>`;
  else if(f.type==='textarea') input=`<textarea id="f_${f.k}" name="${f.k}" placeholder="${h(f.ph||'')}">${h(val)}</textarea>`;
  else input=`<input id="f_${f.k}" name="${f.k}" type="${f.type||'text'}" ${f.type==='number'?'inputmode="decimal" step="'+(f.step||'1')+'"':''} value="${h(val)}" placeholder="${h(f.ph||'')}" ${req}>`;
  return `<div class="${cls}"><label for="f_${f.k}">${h(f.label)}</label>${input}</div>`;
}
function readForm(form){
  const o={}; new FormData(form).forEach((v,k)=>{ if(v instanceof File) return; v=String(v).trim(); o[k]=v; });
  form.querySelectorAll('input[type=number]').forEach(i=>{ const k=i.name; if(o[k]!=='' && o[k]!=null) o[k]=+String(o[k]).replace(',','.'); });
  return o;
}
function openForm(b,slot,opts={}){
  const isNew=!b; const v=b?{...b}:{type:'rood',size:'75 cl',addedAt:today(),slot:slot||''};
  const m=bySlot();
  const slotOpts=[['','Buiten de kast'],...SLOTS.filter(s=>!m[s]||s===v.slot).map(s=>[s,'Plek '+s+' · zone '+(zoneOf(s)==='top'?'boven':'onder')])];
  openSheet(`<div class="sheet-hd"><div><div class="eyebrow">${isNew?'Nieuwe fles':'Bewerken'}</div><h2>${isNew?(slot?'Plek '+h(slot):'Fles toevoegen'):h(title(b))}</h2></div><button class="x" data-close aria-label="Sluiten">×</button></div>
  <form id="wForm" class="${SPARK(v.type)?'is-sparkling':''}" novalidate>
    ${state.ai?`<div class="ai scan" id="scanBox">
      <img id="scanPreview" class="scan-thumb" alt="Gemaakte foto" hidden>
      <p id="scanText">Maak een foto van het etiket. Claude leest de fles uit en vult alles in. Of vul producent, cuvée en jaargang zelf in en laat Claude de rest aanvullen.</p>
      <div class="actions" style="margin:0">
        <label class="btn small primary" for="f_scan">Foto van etiket</label>
        <input id="f_scan" type="file" accept="image/*" capture="environment" hidden>
        <button class="btn small" type="button" id="enrich">Aanvullen</button>
      </div></div>`:''}
    <fieldset><legend>Plek</legend><div class="grid">
      ${fld({k:'slot',label:'Plek in de kast',type:'select',opts:slotOpts},v)}
      ${isNew?fld({k:'count',label:'Aantal flessen',type:'number',ph:'1'},{count:1}):''}
    </div></fieldset>
    ${GROUPS.map(([g,fs,sp])=>`<fieldset class="${sp?'sparkling-only':''}"><legend>${g}</legend><div class="grid">${fs.map(f=>fld(f,v)).join('')}</div></fieldset>`).join('')}
    ${state.canPhoto?`<fieldset><legend>Foto van het etiket</legend><div class="field"><label for="f_photo">${v.photo?'Vervang foto':'Kies een foto'}</label><input id="f_photo" type="file" accept="image/*"></div>${v.photo?`<img class="photo" style="margin-top:8px" src="${h(store.photoUrl(v.photo))}" alt="Huidige foto">`:''}</fieldset>`:''}
    <p id="formErr" style="color:var(--over);margin:0 0 8px" hidden></p>
    <div class="actions"><button class="btn primary" type="submit" id="saveBtn">${isNew?'Toevoegen':'Opslaan'}</button><button class="btn" type="button" data-close>Annuleren</button></div>
  </form>`);
  const form=$('#wForm');
  $('#f_type').onchange=e=>form.classList.toggle('is-sparkling',SPARK(e.target.value));
  if($('#enrich')) $('#enrich').onclick=()=>enrich(form);
  const scan=$('#f_scan');
  if(scan){ scan.onchange=()=>{ const f=scan.files[0]; if(f) scanLabel(form,f); scan.value=''; };
    if(opts.camera) scan.click(); }
  form.onsubmit=async e=>{
    e.preventDefault();
    const val=readForm(form); const err=$('#formErr');
    if(!val.producer && !val.cuvee){ err.textContent='Vul ten minste een producent of naam in.'; err.hidden=false; return; }
    if(val.vintage && /^nv$/i.test(val.vintage)) val.vintage='NV';
    const btn=$('#saveBtn'); btn.disabled=true; btn.textContent='Opslaan…';
    const file=$('#f_photo')?.files?.[0] || form._scanFile;
    if(file){ try{ val.photo=await store.uploadPhoto(file); }catch(x){ err.textContent='De foto kon niet worden opgeslagen ('+(x.message||'fout')+'). De rest wordt wel bewaard.'; err.hidden=false; } }
    else if(b?.photo) val.photo=b.photo;
    const count=Math.max(1,Math.min(28,+val.count||1)); delete val.count;
    if(b){ const inForm=new Set([...form.elements].map(x=>x.name).filter(Boolean)); Object.entries(b).forEach(([k,x])=>{ if(k!=='id' && !inForm.has(k) && !(k in val)) val[k]=x; }); }
    if(form._sources){ val.sources=form._sources; val.valueCheckedAt=form._checkedAt; }
    if(isNew){
      const free=freeSlots(); let slots=[];
      if(val.slot){ slots=[val.slot]; const rest=free.filter(s=>s!==val.slot); const start=SLOTS.indexOf(val.slot); rest.sort((a,c)=>((SLOTS.indexOf(a)-start+28)%28)-((SLOTS.indexOf(c)-start+28)%28)); slots.push(...rest.slice(0,count-1)); }
      else slots=Array(count).fill('');
      for(const s of slots){ const ok=await save('bottles',store.newId(),{...val,slot:s}); if(!ok){btn.disabled=false;btn.textContent='Toevoegen';return;} }
      closeSheet(); toast(slots.length>1?`${slots.length} flessen toegevoegd`:'Fles toegevoegd'+(slots[0]?' op '+slots[0]:''));
    } else {
      if(val.slot && val.slot!==b.slot && bySlot()[val.slot]){ err.textContent='Die plek is net bezet.'; err.hidden=false; btn.disabled=false; btn.textContent='Opslaan'; return; }
      const ok=await save('bottles',b.id,val); if(!ok){btn.disabled=false;btn.textContent='Opslaan';return;}
      closeSheet(); toast('Opgeslagen');
    }
  };
}
const FILL_KEYS=['producer','cuvee','vintage','type','size','abv','country','region','appellation','grapes','disgorged','dosage','drinkFrom','drinkPeak','drinkTo','serveTemp','decant','decantMin','glass','pairing'];
const FILL_SPEC=`Sleutels (laat een sleutel weg als je het niet redelijk zeker weet): producer, cuvee (naam van de cuvée, zonder producent en jaartal), vintage (jaartal als tekst, of "NV"), type (een van: rood, wit, rose, champagne, mousserend, zoet, versterkt), size (een van: "37,5 cl", "50 cl", "75 cl", "150 cl", "300 cl"), abv (getal), country, region, appellation, grapes, disgorged (alleen mousserend, bijv. "mrt 2023"), dosage (alleen mousserend: Brut Nature, Extra Brut, Brut, Extra Dry, Sec, Demi-Sec of Doux), drinkFrom (jaartal), drinkPeak (jaartal), drinkTo (jaartal), serveTemp (getal °C), decant ("ja","nee" of "optioneel"), decantMin (getal), glass (kort), pairing (5-8 concrete gerechten, komma-gescheiden, Nederlands), marketValue (getal in euro per fles in dit formaat), criticScore (tekst), windowSource (tekst).`;
/* Wat Claude op het web moet opzoeken (de serverfunctie geeft Claude dan de webzoekfunctie). */
const WEB_SPEC=`Zoek op het web (maximaal een paar zoekopdrachten) naar precies deze wijn en jaargang: (1) de actuele winkelprijs bij Nederlandse of Europese wijnhandels, in euro per fles in dit formaat → marketValue; (2) scores van critici en het gemiddelde op Vivino → criticScore, kort, bijv. "94 Vinous · 93 Wine Advocate · 4,2 Vivino"; (3) het drinkvenster volgens producent of critici → drinkFrom/drinkPeak/drinkTo, met de bron in windowSource (bijv. "Vinous 2023"). Wat je niet online vindt, vul je aan uit eigen kennis; zet dan bij windowSource "Inschatting Claude". Verzin geen scores: laat criticScore weg als je ze niet vindt.`;
/* Vult lege formuliervelden met Claudes antwoord. Standaardwaarden (rood, 75 cl) mogen overschreven worden. */
function fillForm(form,r){
  const DEFAULTS={type:'rood',size:'75 cl'}; let n=0;
  const set=(k,val)=>{ const el=form.querySelector(`[name="${k}"]`); if(!el||val==null||val==='') return;
    const cur=String(el.value).trim(); if(cur!=='' && cur!==DEFAULTS[k]) return;
    if(el.tagName==='SELECT' && ![...el.options].some(o=>o.value===String(val))) return;
    el.value=val; n++; };
  FILL_KEYS.forEach(k=>set(k,r[k]));
  if(r.marketValue||r.typicalPrice) set('marketValue',r.marketValue||r.typicalPrice);
  if(r.criticScore) set('criticScore',r.criticScore);
  if(r.drinkFrom||r.drinkTo) set('windowSource',r.windowSource||'Inschatting Claude');
  if(r._sources){ form._sources=r._sources; form._checkedAt=today(); }
  form.classList.toggle('is-sparkling',SPARK(form.querySelector('[name=type]').value));
  return n;
}
async function enrich(form){
  const v=readForm(form); const btn=$('#enrich'); const err=$('#formErr');
  if(!v.producer && !v.cuvee){ err.textContent='Vul eerst producent of naam in, of maak een foto van het etiket.'; err.hidden=false; return; }
  err.hidden=true; btn.disabled=true; btn.textContent='Claude zoekt op het web…';
  try{
    const r=await state.ai.json(`Geef voor deze wijn beknopte, realistische gegevens in het Nederlands. Wijn: ${JSON.stringify({producent:v.producer,cuvee:v.cuvee,jaargang:v.vintage,soort:v.type,regio:v.region,formaat:v.size})}. Het is nu ${YEAR}. ${WEB_SPEC} Sluit af met alleen een JSON-object. ${FILL_SPEC}`,null,{web:true});
    const n=fillForm(form,r);
    toast(n?`${n} velden aangevuld. Controleer ze even.`:'Niets aan te vullen');
  }catch(x){ err.textContent='Aanvullen lukte niet: '+(x.message||'onbekende fout'); err.hidden=false; }
  btn.disabled=false; btn.textContent='Aanvullen';
}
async function scanLabel(form,file){
  const err=$('#formErr'), txt=$('#scanText'), prev=$('#scanPreview'), box=$('#scanBox');
  err.hidden=true; form._scanFile=file;
  const blob=await store.shrinkImage(file,1400,0.85);
  const dataUrl=await new Promise((res,rej)=>{const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(blob);});
  prev.src=dataUrl; prev.hidden=false; box.classList.add('busy');
  txt.textContent='Claude leest het etiket en zoekt prijs en scores op. Dit duurt 10 tot 30 seconden…';
  box.querySelectorAll('button,label').forEach(x=>x.setAttribute('aria-disabled','true'));
  try{
    const r=await state.ai.json(`Dit is een foto van een wijnfles of etiket. Lees alles wat op het etiket staat (producent, cuvée, jaargang, appellatie, alcohol, formaat, voor champagne ook dosage en degorgement). Vul daarna aan met druiven, drinkvenster, serveren, gerechten, prijs en scores. Het is nu ${YEAR}. ${WEB_SPEC} Schrijf in het Nederlands. Als er geen wijnetiket op de foto staat, antwoord dan {"error":"geen etiket"}. Sluit af met alleen een JSON-object. ${FILL_SPEC} Voeg ook "seen" toe: één korte zin over wat je op het etiket las en wat je online vond.`, dataUrl, {web:true});
    if(r.error){ txt.textContent='Op deze foto vond Claude geen etiket. Probeer het van dichterbij, recht van voren en met genoeg licht.'; }
    else { const n=fillForm(form,r); txt.textContent=(r.seen?r.seen+' ':'')+(n?`${n} velden ingevuld. Kijk ze even na en kies een plek.`:'Alle velden waren al ingevuld.'); form.querySelector('#f_slot')?.scrollIntoView({behavior:'smooth',block:'center'}); }
  }catch(x){ txt.textContent='Uitlezen lukte niet: '+(x.message||'onbekende fout')+'. De foto wordt wel als etiketfoto bewaard.'; }
  box.classList.remove('busy'); box.querySelectorAll('[aria-disabled]').forEach(x=>x.removeAttribute('aria-disabled'));
}
async function refreshFromWeb(b,btn){
  btn.disabled=true; btn.textContent='Claude zoekt op het web…';
  try{
    const r=await state.ai.json(`Wijn: ${JSON.stringify({producent:b.producer,cuvee:b.cuvee,jaargang:b.vintage,soort:b.type,regio:b.region,formaat:b.size})}. Het is nu ${YEAR}. ${WEB_SPEC} Sluit af met alleen een JSON-object met de sleutels marketValue (getal), criticScore (tekst), drinkFrom, drinkPeak, drinkTo (jaartallen), windowSource (tekst). Laat weg wat je niet vindt.`,null,{web:true});
    const patch={valueCheckedAt:today()};
    if(r.marketValue) patch.marketValue=+r.marketValue;
    if(r.criticScore) patch.criticScore=String(r.criticScore);
    if((r.drinkFrom||r.drinkTo) && (!b.drinkFrom && !b.drinkTo || (b.windowSource||'')==='Inschatting Claude')){
      ['drinkFrom','drinkPeak','drinkTo'].forEach(k=>{ if(r[k]) patch[k]=+r[k]; }); patch.windowSource=r.windowSource||'Inschatting Claude'; }
    if(r._sources) patch.sources=r._sources;
    await store.update('bottles',b.id,patch);
    toast(r.marketValue?'Bijgewerkt: '+eur2.format(r.marketValue):'Geen actuele prijs gevonden');
    await new Promise(r=>setTimeout(r,300)); openDetail(b.id);
  }catch(x){ toast('Opzoeken lukte niet: '+(x.message||'fout')); btn.disabled=false; btn.textContent='Prijs en scores opzoeken'; }
}
async function askClaude(){
  const k=inKast(); if(!k.length) return;
  state.claudeBusy=true; render();
  try{
    const inv=k.map(b=>({id:b.id,wijn:title(b),jaar:vint(b),soort:b.type,regio:b.region,druiven:b.grapes,status:status(b).label,pastBij:b.pairing,bewarenVoor:b.reservedFor||undefined}));
    const r=await state.ai.json(`Je bent sommelier voor een thuiskast. Het is ${YEAR}. Gerecht/gelegenheid: "${(state.dishText||'').slice(0,400)}". Kies maximaal 3 flessen uit deze kast, beste eerst. Geef voorrang aan flessen die op moeten, sla flessen over die te jong zijn of ergens voor bewaard worden tenzij de gelegenheid past. Kast: ${JSON.stringify(inv)}. Antwoord met alleen JSON: {"picks":[{"id":"…","why":"één korte zin in het Nederlands"}],"tip":"optioneel één zin serveertip"}`,{modelTier:'default'});
    state.claudePicks={picks:(r.picks||[]).filter(p=>k.some(b=>b.id===p.id)).slice(0,3),tip:r.tip||''};
  }catch(x){ toast('Claude kon nu geen keuze maken'); }
  state.claudeBusy=false; render();
}

/* ---------- zones ---------- */
function openZones(){
  const S=state.settings;
  openSheet(`<div class="sheet-hd"><div><div class="eyebrow">Koelzones</div><h2>Temperatuur per zone</h2></div><button class="x" data-close aria-label="Sluiten">×</button></div>
   <p class="muted" style="margin-top:0">Neem over wat het display van de kast aangeeft (5–18 °C). Boven zijn plank 1–3, onder plank 4–6 en de lade.</p>
   <form id="zForm"><div class="grid">${fld({k:'top',label:'Zone boven °C',type:'number'},S)}${fld({k:'bottom',label:'Zone onder °C',type:'number'},S)}</div>
   <div class="actions" style="margin-top:14px"><button class="btn primary" type="submit">Opslaan</button></div></form>`);
  $('#zForm').onsubmit=async e=>{ e.preventDefault(); const v=readForm(e.target); const c=x=>Math.max(5,Math.min(18,+x||0)); const ok=await save('settings','kast',{top:c(v.top),bottom:c(v.bottom)}); if(ok){closeSheet(); toast('Zones bijgewerkt');} };
}

/* ---------- data ---------- */
function dbErr(e){
  console.error(e);
  toast(e&&e.message?'Opslaan lukte niet: '+e.message:'Opslaan lukte niet. Probeer het opnieuw.');
}
async function save(col,id,data){
  const clean={}; Object.entries(data).forEach(([k,v])=>{ if(v!==undefined && v!=='' && !(typeof v==='number'&&isNaN(v))) clean[k]=v; });
  try{ await store.set(col,id,clean); return true; }
  catch(e){ dbErr(e); return false; }
}
function banner(msg){ $('#banner').innerHTML = msg?`<div class="banner">${h(msg)}</div>`:''; }

async function exportBackup(){
  const data=await store.exportAll(); data.exportedAt=new Date().toISOString();
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  const a=document.createElement('a'); a.href=url; a.download='wijnkast-backup-'+today()+'.json'; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),2000);
}
async function importBackup(file){
  try{ const data=JSON.parse(await file.text()); if(!Array.isArray(data.bottles)) throw new Error('Dit is geen wijnkast-back-up');
    await store.importAll(data); toast(data.bottles.length+' flessen teruggezet'); }
  catch(x){ toast('Terugzetten lukte niet: '+(x.message||x)); }
}

/* ---------- inloggen (alleen bij Supabase) ---------- */
function viewLogin(sent){
  $('#addBtn').hidden=true; $('#scanBtn').hidden=true;
  $('#main').innerHTML=`<div class="card" style="max-width:440px;margin:24px auto">
    <h3>Inloggen</h3>
    ${sent?`<p>Check je mail. Er staat een inloglink klaar voor <b>${h(sent)}</b>.</p>`:
    `<p class="muted" style="margin-top:0">Je krijgt een inloglink per mail. Alleen adressen die in Supabase zijn toegestaan kunnen de kast zien.</p>
    <form id="loginForm"><div class="field"><label for="f_email">E-mailadres</label><input id="f_email" name="email" type="email" autocomplete="email" required></div>
    <p id="loginErr" style="color:var(--over)" hidden></p>
    <div class="actions" style="margin-top:12px"><button class="btn primary" type="submit">Stuur inloglink</button></div></form>`}</div>`;
  const f=$('#loginForm'); if(!f) return;
  f.onsubmit=async e=>{ e.preventDefault(); const email=f.email.value.trim();
    try{ await store.signIn(email); viewLogin(email); }catch(x){ const el=$('#loginErr'); el.textContent=/rate limit/i.test(x.message||'')?'Er zijn net te veel inlogmails verstuurd. Probeer het over een uur opnieuw.':(x.message||'Versturen lukte niet'); el.hidden=false; } };
}

/* ---------- start ---------- */
render();
(async()=>{
  try{ await store.init(); }
  catch(e){ state.loaded=true; state.canWrite=false; banner('Verbinden met de opslag lukte niet: '+(e.message||e)); render(); return; }
  if(store.needsLogin()){ state.loaded=true; renderTabs(); viewLogin(); return; }
  if(store.mode==='local') banner('Lokale modus: de kast wordt alleen in deze browser bewaard. Koppel Supabase om hem te delen (zie README).');
  state.canPhoto=true;
  state.ai = await ai.init();
  store.watch('bottles', list=>{ state.bottles=list; state.loaded=true; render(); });
  store.watch('log', list=>{ state.log=list.sort((a,b)=>String(b.openedOn||'').localeCompare(String(a.openedOn||''))); render(); });
  store.watchDoc('settings','kast', d=>{ if(d){ state.settings={top:d.top??8,bottom:d.bottom??14}; render(); } });
})();
})();
