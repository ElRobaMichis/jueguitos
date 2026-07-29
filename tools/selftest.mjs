/* ===========================================================================
   Banco de pruebas sin navegador.

   Monta DOS instancias de cada juego (anfitrión e invitado), las conecta entre
   sí igual que lo haría la red real, y juega partidas pulsando botones al azar
   hasta que alguien gane. Sirve para cazar errores de lógica sin tener que
   abrir dos teléfonos.

   Uso:  node tools/selftest.mjs [id-del-juego]
   =========================================================================== */

/* ---------------------------------------------------------------- DOM falso */
class FakeNode {
  constructor(tag){
    this.tagName = (tag || 'div').toUpperCase();
    this.nodeType = tag === '#text' ? 3 : 1;
    this.children = []; this.handlers = {}; this.style = {}; this.dataset = {};
    this.className = ''; this._text = ''; this.value = ''; this.disabled = false;
    this.style.setProperty = (k,v) => { this.style[k]=v; };
    this.classList = {
      add: (...c) => this.className += ' ' + c.join(' '),
      remove: () => {}, toggle: () => {}, contains: (c) => this.className.includes(c),
    };
  }
  cloneNode(){ return new FakeNode(this.tagName); }
  get textContent(){ return this._text || this.children.map(c => c.textContent ?? '').join(''); }
  set textContent(v){ this._text = String(v); this.children = []; }
  set innerHTML(v){ this._text = String(v).replace(/<[^>]*>/g, ''); this.children = []; }
  get firstChild(){ return this.children[0]; }
  get clientWidth(){ return 340; }
  get clientHeight(){ return 520; }
  append(...kids){ for(const k of kids.flat()) if(k && typeof k === 'object'){ k.parent = this; this.children.push(k); } }
  appendChild(k){ this.append(k); return k; }
  removeChild(k){ this.children = this.children.filter(c => c !== k); }
  remove(){ this.parent?.removeChild(this); }
  replaceWith(){ }
  setAttribute(k, v){ this[k] = v; }
  getAttribute(k){ return this[k]; }
  addEventListener(ev, fn){ (this.handlers[ev] ||= []).push(fn); }
  /* algunos juegos asignan el manejador como propiedad: n.onclick = fn */
  set onclick(fn){ this.handlers.click = fn ? [fn] : []; }
  get onclick(){ return this.handlers.click?.[0]; }
  removeEventListener(){ }
  animate(){ return { finished: Promise.resolve() }; }
  getBoundingClientRect(){ return { left:0, top:0, width:340, height:340 }; }
  contains(node){ return node === this || this.children.some(c => c.contains?.(node)); }
  querySelector(){ return null; }
  fire(ev, arg = { preventDefault(){}, touches:[], changedTouches:[], clientX:10, clientY:10 }){
    (this.handlers[ev] || []).forEach(fn => fn(arg));
  }
  getContext(){ return new Proxy({}, { get: () => () => {} }); }
  /* todos los nodos con click, en orden */
  clickables(out = []){
    if(this.handlers.click?.length && !this.disabled) out.push(this);
    this.children.forEach(c => c.clickables(out));
    return out;
  }
  find(pred, out = []){
    if(pred(this)) out.push(this);
    this.children.forEach(c => c.find(pred, out));
    return out;
  }
  label(){ return (this.textContent || this.className || this.tagName).slice(0, 28).replace(/\s+/g, ' '); }
}

globalThis.document = {
  createElement: (t) => new FakeNode(t),
  createTextNode: (t) => { const n = new FakeNode('#text'); n.textContent = t; return n; },
  querySelector: () => null, querySelectorAll: () => [],
  getElementById: () => null, addEventListener(){},
};
globalThis.window = { devicePixelRatio:1, innerWidth:390, innerHeight:844, addEventListener(){}, removeEventListener(){} };
try{ globalThis.navigator.vibrate = () => {}; }
catch{ Object.defineProperty(globalThis, 'navigator', { value:{ vibrate(){} }, configurable:true }); }
globalThis.__JG_FAST = true;   // animaciones a cámara rápida en las pruebas
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};

/* -------------------------------------------------------- bus de "red" ---- */
function makeBus(){
  // `last` imita el mensaje retenido de MQTT: quien se suscribe después
  // recibe de inmediato el último estado publicado.
  const hostH = { msg:[], state:[], last:undefined }, guestH = { msg:[], state:[], last:undefined };
  return { hostH, guestH };
}

function makeCtx({ isHost, me, peer, seed, bus, onFinish }){
  const mineH  = isHost ? bus.hostH  : bus.guestH;
  const theirH = isHost ? bus.guestH : bus.hostH;
  let s = seed >>> 0 || 1;
  const rng = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };

  const deliver = (list, ...args) => list.forEach(fn => fn(...args));
  return {
    el: new FakeNode('div'),
    me, peer, isHost, seed, rng, random: rng,
    send:  (d) => deliver(theirH.msg, structuredClone(d), me.id),
    sendReliable: (d) => deliver(theirH.msg, structuredClone(d), me.id),
    onMsg: (fn) => mineH.msg.push(fn),
    saveState: (st) => { theirH.last = structuredClone(st); deliver(theirH.state, structuredClone(st), me.id); },
    onState: (fn) => { mineH.state.push(fn); if(mineH.last !== undefined) fn(structuredClone(mineH.last), peer.id); },
    toast(){}, vibrate(){},
    peerOnline: () => true,
    onPeerChange(){},
    finish: (res, text) => onFinish(isHost, res, text),
  };
}

/* --------------------------------------------------------------- prueba --- */
async function playOne(gameId, seed, maxSteps = 2200){
  const mod = await import(`../js/games/${gameId}.js`);
  const bus = makeBus();
  const A = { id:'aaa-host', name:'Agus' }, B = { id:'bbb-guest', name:'Novia' };
  let result = null;
  const onFinish = (isHost, res, text) => { if(!result) result = { by:isHost ? 'host' : 'guest', res, text }; };

  const ctxH = makeCtx({ isHost:true,  me:A, peer:B, seed, bus, onFinish });
  const ctxG = makeCtx({ isHost:false, me:B, peer:A, seed, bus, onFinish });

  const inst = [];
  inst.push(await mod.default(ctxH));
  inst.push(await mod.default(ctxG));

  let steps = 0, idle = 0;
  const rnd = (n) => Math.floor(Math.random() * n);
  while(!result && steps < maxSteps && idle < 70){
    const who = steps % 2 ? ctxH : ctxG;
    const btns = who.el.clickables();
    // sin botones: el juego espera un temporizador (memorama) o una animación (dados)
    if(!btns.length){ idle++; steps++; await new Promise(r => setTimeout(r, 40)); continue; }
    idle = 0;
    const b = btns[rnd(btns.length)];
    // rellena entradas de texto si las hay
    who.el.find(n => n.tagName === 'INPUT').forEach((n, i) => {
      if(!n.value){ n.value = 'prueba' + i; (n.handlers.input || []).forEach(fn => fn({ target:n })); }
    });
    b.fire('click');
    steps++;
    // dejamos correr el reloj de vez en cuando: algunos juegos usan temporizadores
    if(steps % 20 === 0) await new Promise(r => setTimeout(r, 20));
  }
  // resumen del avance, para distinguir "juego trabado" de "clics al azar lentos"
  const txt = ctxH.el.find(n => n.className?.includes?.('g-status')).map(n => n.textContent).join(' | ');
  inst.forEach(i => { try{ i?.destroy?.(); }catch{} });
  return { result, steps, progress: txt.slice(0, 90) };
}

export { playOne, FakeNode };

/* ---------------------------------------------------------------- runner -- */
const RUNS = 3;
const TURN_GAMES = ['gato','conecta4','reversi','damas','domino','escaleras','memorama',
                    'buscaminas','batalla','ludo','ahorcado','basta','trivia','verdadreto','preguntas'];
/* Juegos en vivo / de puntería: aquí sólo comprobamos que montan y se
   destruyen sin reventar (el juego en sí depende de canvas y del reloj). */
const REALTIME = ['pingpong','airhockey','basket','arqueria','ritmo','taprace','globos','pictionary'];

/* Presupuesto de clics. Damas y Ludo necesitan muchos más porque casi todas
   las casillas son pulsables y el robot pulsa al azar. */
const BUDGET = { damas:40000, ludo:12000, reversi:6000, memorama:6000, buscaminas:6000 };

const only = process.argv[2];
if(!process.env.JG_LIB){   // con JG_LIB=1 se importa como librería, sin correr nada
const list = only ? [only] : TURN_GAMES;
let fails = 0;

for(const id of list){
  const runs = [];
  for(let k = 0; k < RUNS; k++){
    try{
      runs.push(await playOne(id, 1234 + k * 7919, BUDGET[id] || 2200));
    }catch(err){
      fails++;
      console.log(`✗ ${id}: ${err.message}`);
      console.log(String(err.stack).split('\n').slice(1, 4).join('\n'));
      break;
    }
  }
  if(runs.length === RUNS){
    const done = runs.filter(r => r.result).length;
    const avg = Math.round(runs.reduce((n, r) => n + r.steps, 0) / RUNS);
    const ok = done > 0;
    if(!ok) fails++;
    console.log(`${ok ? '✓' : '⚠'} ${id.padEnd(11)} ${done}/${RUNS} partidas terminadas · ~${avg} jugadas` +
                (runs[0].result ? ` · ej: ${runs[0].result.res} (${runs[0].result.text || ''})` : ''));
  }
}
/* --- juegos en vivo: prueba de humo (montar + destruir) --- */
if(!only){
  for(const id of REALTIME){
    try{
      const mod = await import(`../js/games/${id}.js`);
      const bus = makeBus();
      const A = { id:'aaa-host', name:'Agus' }, B = { id:'bbb-guest', name:'Novia' };
      const noop = () => {};
      const h = await mod.default(makeCtx({ isHost:true,  me:A, peer:B, seed:99, bus, onFinish:noop }));
      const g = await mod.default(makeCtx({ isHost:false, me:B, peer:A, seed:99, bus, onFinish:noop }));
      await new Promise(r => setTimeout(r, 30));
      h?.destroy?.(); g?.destroy?.();
      console.log(`✓ ${id.padEnd(11)} monta y se destruye sin errores`);
    }catch(err){
      fails++;
      console.log(`✗ ${id}: ${err.message}`);
      console.log(String(err.stack).split('\n').slice(1, 3).join('\n'));
    }
  }
}

console.log(fails ? `\n${fails} juego(s) con problemas` : '\n✓ los 23 juegos pasan');
process.exit(fails ? 1 : 0);
}
