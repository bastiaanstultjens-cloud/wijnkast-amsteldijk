/* Veeg een sheet omlaag om hem te sluiten, zoals op iOS.
 * Alleen uiterlijk/gedrag: sluiten gaat via dezelfde Escape-afhandeling als in app.js.
 * Een formulier waarin je al iets hebt ingevuld sluit niet door vegen (dan veert hij terug),
 * zodat je nooit per ongeluk invoer kwijtraakt. */
(function(){
  const root = document.getElementById('sheetRoot');
  if(!root || !('ontouchstart' in window)) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const wide = window.matchMedia('(min-width:700px)');
  let sheet=null, y=0, raf=0, drag=null, dirty=false;

  const set = v => { y=v; if(sheet) sheet.style.transform = v ? `translate3d(0,${v}px,0)` : ''; };
  // zachte grens: hoe verder voorbij, hoe minder hij meegaat
  const rubber = (d, dim, c=0.55) => (d*dim*c)/(dim + c*Math.abs(d));
  // Apple's momentumprojectie (scroll-vertraging)
  const project = (v, rate=0.998) => (v/1000)*rate/(1-rate);
  const close = () => document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));

  // kritisch gedempte veer (damping 1.0), start vanaf de huidige positie en snelheid
  function spring(target, v0, response, done){
    cancelAnimationFrame(raf);
    if(reduce.matches){ set(target); done&&done(); return; }
    const w = 2*Math.PI/response, k = w*w, c = 2*w;
    let v = v0, last = performance.now();
    const step = now => {
      let dt = Math.min(0.032,(now-last)/1000); last = now;
      while(dt>0){ const h=Math.min(dt,1/240); const a = -k*(y-target) - c*v; v += a*h; set(y + v*h); dt-=h; }
      if(Math.abs(y-target)<0.5 && Math.abs(v)<10){ set(target); raf=0; done&&done(); return; }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  new MutationObserver(()=>{
    const s = root.querySelector('.sheet');
    if(s!==sheet){ cancelAnimationFrame(raf); sheet=s; y=0; drag=null; dirty=false;
      if(s) s.addEventListener('input',()=>{dirty=true;}); }
  }).observe(root,{childList:true});

  root.addEventListener('touchstart',e=>{
    if(!sheet || wide.matches || e.touches.length>1) return;
    if(!sheet.contains(e.target) || e.target.closest('input,select,textarea,[contenteditable]')) return;
    if(sheet.scrollTop>0) return;
    cancelAnimationFrame(raf); // grijp hem ook halverwege een animatie vast
    const t=e.touches[0];
    drag={x0:t.clientX, y0:t.clientY - y, base:y, active:y!==0, hist:[{y:y,t:e.timeStamp}]};
  },{passive:true});

  root.addEventListener('touchmove',e=>{
    if(!drag || !sheet) return;
    const t=e.touches[0], dy=t.clientY-drag.y0, dx=t.clientX-drag.x0;
    if(!drag.active){
      if(Math.abs(dy-drag.base)<10 && Math.abs(dx)<10) return;
      if(dy-drag.base<0 || Math.abs(dx)>Math.abs(dy-drag.base) || sheet.scrollTop>0){ drag=null; return; }
      drag.active=true; sheet.style.animation='none';
    }
    e.preventDefault();
    const h=sheet.offsetHeight, canClose=!dirty;
    let v = dy<0 ? rubber(dy,h) : (canClose ? dy : rubber(dy,h,0.3));
    set(v);
    drag.hist.push({y:v,t:e.timeStamp}); if(drag.hist.length>6) drag.hist.shift();
  },{passive:false});

  const end = ()=>{
    if(!drag || !sheet){ drag=null; return; }
    const d=drag; drag=null;
    if(!d.active){ if(y) spring(0,0,0.35); return; }
    const a=d.hist[0], b=d.hist[d.hist.length-1], dt=(b.t-a.t)/1000;
    const vel = dt>0 ? (b.y-a.y)/dt : 0;           // px/s bij loslaten
    const h=sheet.offsetHeight, end=y+project(vel);
    if(!dirty && vel>-50 && (end>h*0.45 || vel>900)){
      spring(h+40, vel, 0.3, close);               // snelheid van de vinger loopt door
    } else {
      spring(0, vel, 0.35);
    }
  };
  root.addEventListener('touchend',end,{passive:true});
  root.addEventListener('touchcancel',end,{passive:true});
})();
