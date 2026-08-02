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
    const clases = () => this.className.split(/\s+/).filter(Boolean);
    const poner = (l) => { this.className = [...new Set(l)].join(' '); };
    this.classList = {
      add: (...c) => poner([...clases(), ...c]),
      remove: (...c) => poner(clases().filter(x => !c.includes(x))),
      toggle: (c, f) => {
        const hay = clases().includes(c);
        const quiero = f === undefined ? !hay : !!f;
        quiero ? poner([...clases(), c]) : poner(clases().filter(x => x !== c));
        return quiero;
      },
      contains: (c) => clases().includes(c),
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
  getContext(){
    /* lienzo falso universal: cualquier propiedad o llamada devuelve otro
       igual, así los degradados (createRadialGradient().addColorStop()) y
       cualquier API futura del canvas no revientan las pruebas */
    const fake = new Proxy(function(){}, {
      get: (_, k) => (k === Symbol.toPrimitive ? () => 0 : fake),
      apply: () => fake,
      set: () => true,
    });
    return fake;
  }
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
/* La ventana escucha de verdad: los juegos de puntería oyen el arrastre en
   window (si sueltas fuera del canvas), y sin esto no se podría probar. */
const winH = {};
globalThis.window = {
  devicePixelRatio:1, innerWidth:390, innerHeight:844,
  addEventListener(ev, fn){ (winH[ev] ||= []).push(fn); },
  removeEventListener(ev, fn){ winH[ev] = (winH[ev] || []).filter(f => f !== fn); },
  dispatch(ev, arg){ (winH[ev] || []).forEach(fn => fn(arg)); },
};
try{ globalThis.navigator.vibrate = () => {}; }
catch{ Object.defineProperty(globalThis, 'navigator', { value:{ vibrate(){} }, configurable:true }); }
globalThis.__JG_FAST = true;   // animaciones a cámara rápida en las pruebas
/* Fotogramas de verdad: así los juegos de canvas ejecutan su física en las
   pruebas y no sólo se comprueba que arrancan. */
globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(performance.now()), 16);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);

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
const TURN_GAMES = ['gato','conecta4','reversi','damas','domino','escaleras',
                    'batalla','ludo','ahorcado','basta','trivia','verdadreto','preguntas','blackjack'];
/* Juegos en vivo / de puntería: aquí sólo comprobamos que montan y se
   destruyen sin reventar (el juego en sí depende de canvas y del reloj). */
const REALTIME = ['pingpong','airhockey','basket','arqueria','ritmo','taprace','globos','pictionary',
                  'memorama','buscaminas','patitos','canicas'];   // carreras y feria, cada quien en su tablero

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
/* --- lotería: prueba de sus reglas (honesto vs. tramposo) ---
   El robot que pulsa al azar jamás completaría una tabla de 16, así que
   aquí se juega a propósito: uno marca sólo lo cantado y otro hace trampa. */
async function probarLoteria(){
  const nombreCelda = (c) => c.find(n => n.className?.includes?.('lot-cn'))[0]?.textContent;
  const cantada     = (x) => x.el.find(n => n.className?.includes?.('lot-nombre'))[0]?.textContent;
  const botonGrito  = (x) => x.el.find(n => n.textContent === '¡LOTERÍA!')[0];

  async function partida(tramposo){
    const mod = await import('../js/games/loteria.js');
    const bus = makeBus();
    let fin = null;
    const onFinish = (isHost, res, text) => { if(!fin) fin = { res, text }; };
    const A = { id:'A', name:'Agus' }, B = { id:'B', name:'Rebus' };
    const cH = makeCtx({ isHost:true,  me:A, peer:B, seed:7, bus, onFinish });
    const cG = makeCtx({ isHost:false, me:B, peer:A, seed:7, bus, onFinish });
    const iH = await mod.default(cH), iG = await mod.default(cG);
    const mis = cH.el.find(n => n.className?.includes?.('lot-celda'));

    if(tramposo){
      mis.forEach(c => c.fire('click'));                 // quita las 16 de golpe
      await new Promise(r => setTimeout(r, 60));
      botonGrito(cH)?.fire('click');
    }else{
      const vistas = new Set();
      for(let t = 0; t < 3000 && !fin; t++){
        await new Promise(r => setTimeout(r, 6));
        const n = cantada(cH);
        if(n && !vistas.has(n)){
          vistas.add(n);
          mis.find(c => nombreCelda(c) === n)?.fire('click');
        }
        if(mis.filter(c => c.classList.contains('libre')).length >= 16){
          botonGrito(cH)?.fire('click');
          break;
        }
      }
    }
    await new Promise(r => setTimeout(r, 120));
    iH?.destroy?.(); iG?.destroy?.();
    return fin;
  }

  const antes = globalThis.__JG_FAST;
  globalThis.__JG_FAST = 0.08;              // baraja rápida, pero alcanzable
  const honesto = await partida(false);
  const trampa  = await partida(true);
  globalThis.__JG_FAST = antes;

  const okHonesto = honesto?.res === 'me';
  const okTrampa  = trampa?.res === 'them' && /falso/.test(trampa?.text || '');
  console.log(`${okHonesto ? '✓' : '✗'} loteria     jugador honesto gana con tabla llena` +
              (okHonesto ? '' : ` (dio: ${JSON.stringify(honesto)})`));
  console.log(`${okTrampa ? '✓' : '✗'} loteria     tramposo pierde y se le dice qué carta no salió` +
              (okTrampa ? '' : ` (dio: ${JSON.stringify(trampa)})`));
  return okHonesto && okTrampa ? 0 : 1;
}
if(!only) fails += await probarLoteria();

/* --- carreras: memorama y buscaminas ---
   Los dos reciben el MISMO tablero y juegan a la vez; gana quien termine
   primero, y en buscaminas pierdes en el acto si pisas tres minas. */
async function probarCarreras(){
  let mal = 0;
  function dupla(seed){
    const H = { msg:[] }, G = { msg:[] };
    const dar = (d, x, from) => x.msg.forEach(f => f(structuredClone(d), from));
    let fin = null;
    const mkRng = () => { let s = seed >>> 0 || 1;
      return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; };
    const mk = (isHost, me, peer, mine, their) => ({
      el:new FakeNode('div'), me, peer, isHost, seed, rng:mkRng(), random:mkRng(),
      send:d => dar(d, their, me.id), sendReliable:d => dar(d, their, me.id),
      onMsg:f => mine.msg.push(f), saveState(){}, onState(){},
      toast(){}, vibrate(){}, peerOnline:() => true, onPeerChange(){},
      finish:(r, t) => { if(!fin) fin = { r, t }; } });
    return { cH:mk(true, { id:'A', name:'Agus' }, { id:'B', name:'Rebus' }, H, G),
             cG:mk(false, { id:'B', name:'Rebus' }, { id:'A', name:'Agus' }, G, H),
             ver:() => fin };
  }

  /* buscaminas: tres minas y fuera */
  {
    const mod = await import('../js/games/buscaminas.js');
    const { cH, cG, ver } = dupla(77);
    const iH = await mod.default(cH), iG = await mod.default(cG);
    const celdas = (c) => c.el.find(n => n.classList?.contains?.('ms-cell'));
    const mismo = celdas(cH).length === 100 && celdas(cG).length === 100;
    const cel = celdas(cG);
    let pisadas = 0;
    for(let i = 0; i < 100 && !ver() && pisadas < 3; i++){
      cel[i].fire('click');
      await new Promise(r => setTimeout(r, 4));
      if(cel[i].classList.contains('mine')) pisadas++;
    }
    await new Promise(r => setTimeout(r, 60));
    const f = ver();
    if(!mismo || !f || f.r !== 'me' || !/3 minas/.test(f.t || '')) mal++;
    iH?.destroy?.(); iG?.destroy?.();
  }

  /* memorama: mismo reparto y gana quien junta los 10 pares */
  {
    const mod = await import('../js/games/memorama.js');
    const { cH, cG, ver } = dupla(41);
    const iH = await mod.default(cH), iG = await mod.default(cG);
    const caras = (c) => c.el.find(n => n.classList?.contains?.('mem-cara')).map(n => n.textContent);
    const igual = JSON.stringify(caras(cH)) === JSON.stringify(caras(cG));
    const cartas = cH.el.find(n => n.classList?.contains?.('mem-card'));
    const porCara = {};
    caras(cH).forEach((c, i) => (porCara[c] ||= []).push(i));
    for(const par of Object.values(porCara)){
      cartas[par[0]].fire('click');
      cartas[par[1]].fire('click');
      await new Promise(r => setTimeout(r, 8));
    }
    await new Promise(r => setTimeout(r, 80));
    const f = ver();
    if(!igual || !f || f.r !== 'me' || !/10 pares/.test(f.t || '')) mal++;
    iH?.destroy?.(); iG?.destroy?.();
  }

  console.log(`${mal ? '✗' : '✓'} carreras    mismo tablero para los dos; gana quien termina y 3 minas te eliminan`);
  return mal ? 1 : 0;
}
if(!only) fails += await probarCarreras();

/* --- red: fantasmas retenidos, acuses y reintentos ---
   Los brokers públicos guardan lo retenido para siempre; con códigos de 4
   dígitos, una sala "nueva" casi siempre pisa una vieja. Y un mensaje fiable
   sin acuse se reenviaba en cada reconexión... para siempre. */
async function probarRed(){
  const { Net } = await import('../js/net/net.js');
  const mk = () => {
    const n = new Net();
    n._alive = true;
    n.me = { id:'yo', name:'Yo', joinedAt:1 };
    n.sid = 'sesA';
    n.base = 'b'; n.tMsg = 'b/m'; n.tState = 'b/s';
    n.tPres = (x) => 'b/p/' + x; n.tPick = (x) => 'b/k/' + x;
    n._sealAndSend = () => {};                     // sin red de verdad
    n.publish = function(env){ (this.enviados ||= []).push(env); };
    return n;
  };
  let mal = 0;

  { // una despedida retenida de un desconocido NO crea fantasmas
    const n = mk();
    n._route('b/p/viejo', { t:'p', d:{ id:'viejo', online:false } });
    if(n.peers.size !== 0){ mal++; console.log('  ✗ la despedida vieja creó un fantasma'); }
  }
  { // una elección retenida de un desconocido tampoco... pero se aplica si aparece
    const n = mk();
    n._route('b/k/viejo', { t:'k', f:'viejo', s:'z', n:9, d:{ pick:'gato' } });
    if(n.peers.size !== 0){ mal++; console.log('  ✗ la elección vieja creó un fantasma'); }
    n._route('b/p/viejo', { t:'p', d:{ id:'viejo', name:'R', online:true, ts:Date.now() } });
    if(n.peers.get('viejo')?.pick !== 'gato'){ mal++; console.log('  ✗ la elección pendiente no se aplicó'); }
  }
  { // si la acabo de oír, una despedida rezagada de otro relay no la desconecta
    const n = mk();
    n._route('b/p/ella', { t:'p', d:{ id:'ella', online:true, ts:Date.now() } });
    n._route('b/p/ella', { t:'p', d:{ id:'ella', online:false } });
    if(!n.peers.get('ella')?.online){ mal++; console.log('  ✗ una despedida rezagada la desconectó'); }
  }
  { // de las copias retenidas de presencia gana la más nueva, no la última en llegar
    const n = mk();
    n._route('b/p/ella', { t:'p', d:{ id:'ella', name:'Nueva', online:true, ts:2000 } });
    n._route('b/p/ella', { t:'p', d:{ id:'ella', name:'Vieja', online:true, ts:1000 } });
    if(n.peers.get('ella')?.name !== 'Nueva'){ mal++; console.log('  ✗ una copia vieja pisó a la nueva'); }
  }
  { // el acuse vacía la bandeja de reintentos
    const n = mk();
    n.publishReliable({ t:'start', d:{} });
    const id = n._outbox[0]?.env.i;
    if(!id || (n.enviados || []).length !== 1){ mal++; console.log('  ✗ el fiable no salió al instante'); }
    n._route('b/m', { t:'ak', f:'ella', s:'x', n:1, d:{ id } });
    if(n._outbox.length !== 0){ mal++; console.log('  ✗ el acuse no vació la bandeja'); }
  }
  { // los fiables se confirman SIEMPRE, aunque lleguen repetidos
    const n = mk();
    let entregas = 0;
    n.on('msg:chat', () => entregas++);
    n._route('b/m', { t:'chat', f:'ella', s:'x', n:2, i:'ella:1', d:{ text:'hola' } });
    n._route('b/m', { t:'chat', f:'ella', s:'x', n:3, i:'ella:1', d:{ text:'hola' } });
    const aks = (n.enviados || []).filter(e => e.t === 'ak').length;
    if(aks !== 2){ mal++; console.log('  ✗ no confirma los reenvíos (' + aks + ')'); }
    if(entregas !== 1){ mal++; console.log('  ✗ el repetido se entregó dos veces'); }
  }
  console.log(`${mal ? '✗' : '✓'} red         sin fantasmas de salas viejas; fiables con acuse y sin duplicar`);
  return mal ? 1 : 0;
}
if(!only) fails += await probarRed();

/* --- el canal de juego no debe quedarse pegado a un relay mudo --- */
async function probarCanal(){
  const { Net } = await import('../js/net/net.js');
  const n = new Net();
  n._alive = true; n.me = { id:'yo' };
  const mk = (url, i, lastPeer) => ({ url, i, up:true, sawPeer:lastPeer > 0, lastPeer, client:{} });
  const t = Date.now();
  n.links = [mk('a', 0, t - 30000), mk('b', 1, t - 200), mk('c', 2, 0)];
  n._pickActive();
  const eligeFresco = n.active?.url === 'b';
  n._watchdog();
  const abandonaMudo = n.active?.url === 'b';
  n.links = [mk('a', 0, Date.now() - 100), mk('b', 1, Date.now() - 50), mk('c', 2, 0)];
  n.active = n.links[0];
  n._watchdog();
  const noCambiaPorCapricho = n.active?.url === 'a';
  const ok = eligeFresco && abandonaMudo && noCambiaPorCapricho;
  console.log(`${ok ? '✓' : '✗'} canal       se cambia de relay si el activo se queda mudo`);
  return ok ? 0 : 1;
}
if(!only) fails += await probarCanal();

/* --- colores: nunca el mismo para los dos, y los dos teléfonos de acuerdo --- */
async function probarColores(){
  const { colorFor } = await import('../js/core/ui.js');
  let repetidos = 0, discrepan = 0;
  for(let i = 0; i < 600; i++){
    const a = 'dev' + i.toString(36), b = 'tel' + (i * 13).toString(36);
    if(colorFor(a, b) === colorFor(b, a)) repetidos++;
    // los dos teléfonos calculan lo mismo para cada quien
    if(colorFor(a, b) !== colorFor(a, b) || colorFor(b, a) !== colorFor(b, a)) discrepan++;
  }
  const ok = repetidos === 0 && discrepan === 0;
  console.log(`${ok ? '✓' : '✗'} colores     los dos jugadores nunca comparten color` +
              (ok ? '' : ` (${repetidos} repetidos)`));
  return ok ? 0 : 1;
}
if(!only) fails += await probarColores();

/* --- air hockey: golpear rápido tiene que mandar el disco más fuerte --- */
async function probarAirHockey(){
  const mod = await import('../js/games/airhockey.js');
  async function golpe(msPorPaso){
    const host = new FakeNode('div');
    let snap = null;
    const ctx = { el:host, me:{ id:'A', name:'Agus' }, peer:{ id:'B', name:'Rebus' }, isHost:true, seed:5,
      rng:Math.random, random:Math.random,
      send(d){ if(d?.s) snap = d.s; }, sendReliable(){}, onMsg(){}, saveState(){}, onState(){},
      toast(){}, vibrate(){}, peerOnline:() => true, onPeerChange(){}, finish(){} };
    const inst = await mod.default(ctx);
    const cv = host.find(n => n.tagName === 'CANVAS')[0];
    const mover = (x, y) => cv.fire('pointermove', { clientX:x, clientY:y, preventDefault(){}, touches:[], changedTouches:[] });
    mover(170, 460);                       // mi mazo, abajo del todo
    await new Promise(r => setTimeout(r, 950));   // el disco sale parado 0.8 s
    /* El mismo recorrido en los dos casos; lo único que cambia es lo rápido
       que se hace. Así se compara la fuerza del golpe, no la distancia. */
    for(let i = 0; i < 14; i++){
      mover(170, 460 - i * 22);
      await new Promise(r => setTimeout(r, msPorPaso));
    }
    await new Promise(r => setTimeout(r, 220));
    inst?.destroy?.();
    return snap ? Math.hypot(snap[2], snap[3]) : 0;    // rapidez del disco
  }
  const suave  = await golpe(85);   // mazo lento
  const fuerte = await golpe(16);   // mazo rápido
  const ok = suave > 0 && fuerte > suave * 1.3;
  console.log(`${ok ? '✓' : '✗'} airhockey   golpear rápido manda el disco más fuerte (lento ${Math.round(suave)} · rápido ${Math.round(fuerte)})`);
  return ok ? 0 : 1;
}
if(!only) fails += await probarAirHockey();

/* --- ritmo: teclado ---
   En la computadora sólo se podía pulsar cuatro botones con el ratón: uno a
   la vez y sin precisión, o sea injugable. */
async function probarRitmo(){
  const mod = await import('../js/games/ritmo.js');
  const host = new FakeNode('div');
  const inst = await mod.default({ el:host, me:{ id:'A', name:'Agus' }, peer:{ id:'B', name:'Rebus' },
    isHost:true, seed:9, rng:Math.random, random:Math.random, send(){}, sendReliable(){}, onMsg(){},
    saveState(){}, onState(){}, toast(){}, vibrate(){}, peerOnline:() => true, onPeerChange(){}, finish(){} });
  await new Promise(r => setTimeout(r, 50));
  // ojo: 'rit-pads' es el contenedor, 'rit-pad' los botones
  const pads = host.find(n => n.classList?.contains?.('rit-pad'));

  const pulsa = (key, repeat = false) => {
    let evitado = false;
    globalThis.window.dispatch('keydown', { key, repeat, preventDefault(){ evitado = true; } });
    return evitado;
  };
  let mal = 0;
  for(const [key, carril] of [['ArrowLeft',0], ['ArrowDown',1], ['ArrowUp',2], ['ArrowRight',3], ['a',0], ['f',3]]){
    const evitado = pulsa(key);
    if(!pads[carril]?.classList.contains('hit') || !evitado) mal++;
    await new Promise(r => setTimeout(r, 130));
  }
  if(pulsa('z')) mal++;                                  // tecla ajena
  pulsa('ArrowLeft', true);
  if(pads[0]?.classList.contains('hit')) mal++;          // mantener pulsado no cuenta
  inst?.destroy?.();

  console.log(`${mal ? '✗' : '✓'} ritmo       se juega con ← ↓ ↑ → (o A S D F) y no mueve la página`);
  return mal ? 1 : 0;
}
if(!only) fails += await probarRitmo();

/* --- ahorcado: lo que le faltaba ---
   Quien ponía la palabra no veía qué letras intentaba el otro, y al fallar
   nunca se decía cuál era la palabra. */
async function probarAhorcado(){
  const mod = await import('../js/games/ahorcado.js');
  const bus = makeBus();
  const A = { id:'A', name:'Agus' }, B = { id:'B', name:'Rebus' };
  const cH = makeCtx({ isHost:true,  me:A, peer:B, seed:3, bus, onFinish(){} });
  const cG = makeCtx({ isHost:false, me:B, peer:A, seed:3, bus, onFinish(){} });
  await mod.default(cH); await mod.default(cG);
  await new Promise(r => setTimeout(r, 40));

  const busca = (x, cls) => x.el.find(n => n.className?.includes?.(cls));
  const tecla = (x, L) => busca(x, 'key').find(k => k.textContent === L);

  const inp = cH.el.find(n => n.tagName === 'INPUT')[0];
  inp.value = 'SOL';
  (inp.handlers.input || []).forEach(f => f({ target:inp }));
  cH.el.find(n => n.tagName === 'BUTTON').find(b => b.textContent.includes('Lista'))?.fire('click');
  await new Promise(r => setTimeout(r, 40));

  const veTeclado = busca(cH, 'key').length === 27;

  for(const L of ['B', 'C', 'D']){ tecla(cG, L)?.fire('click'); await new Promise(r => setTimeout(r, 15)); }
  tecla(cG, 'S')?.fire('click');
  await new Promise(r => setTimeout(r, 15));
  const enRojo  = busca(cH, 'key').filter(k => k.classList.contains('bad')).length;
  const enVerde = busca(cH, 'key').filter(k => k.classList.contains('good')).length;

  for(const L of ['F', 'G', 'H']){ tecla(cG, L)?.fire('click'); await new Promise(r => setTimeout(r, 15)); }
  const revelada = (x) => busca(x, 'ah-era').map(n => n.textContent).join(' ');
  const seRevela = /SOL/.test(revelada(cG)) && /SOL/.test(revelada(cH));

  const ok = veTeclado && enRojo === 3 && enVerde === 1 && seRevela;
  console.log(`${ok ? '✓' : '✗'} ahorcado    quien pone la palabra sigue la partida y al fallar se revela` +
              (ok ? '' : ` (teclado:${veTeclado} rojo:${enRojo} verde:${enVerde} revela:${seRevela})`));
  return ok ? 0 : 1;
}
if(!only) fails += await probarAhorcado();

/* --- puntería: el gesto de deslizar (basket y arquería) ---
   El fallo era que había que jalar hacia atrás desde la pelota y con el ratón
   no quedaba espacio; y que soltar fuera del canvas dejaba el tiro colgado. */
async function probarPunteria(){
  const { swipeShot } = await import('../js/games/lib/kit.js');
  const puntero = (x, y) => ({ clientX:x, clientY:y, preventDefault(){}, touches:[], changedTouches:[] });
  let mal = 0;

  /* la matemática del gesto */
  const casos = [
    ['hacia arriba dispara',            { x0:170, y0:300, x:150, y:120 }, true],
    ['en diagonal dispara',             { x0:80,  y0:300, x:220, y:120 }, true],
    ['un toque no dispara',             { x0:170, y0:300, x:172, y:298 }, false],
    ['hacia abajo no dispara',          { x0:170, y0:100, x:170, y:280 }, false],
    ['de lado no dispara',              { x0:60,  y0:200, x:260, y:203 }, false],
  ];
  for(const [nombre, gesto, deberia] of casos){
    const ok = !!swipeShot(gesto, { fuerza:4.6, tope:200 }) === deberia;
    if(!ok){ mal++; console.log(`✗ gesto       ${nombre}`); }
  }
  const a = swipeShot({ x0:0, y0:200, x:0, y:0 }, { fuerza:4.6, tope:200 });
  const b = swipeShot({ x0:0, y0:900, x:0, y:0 }, { fuerza:4.6, tope:200 });
  if(Math.abs(Math.hypot(a.vx, a.vy) - Math.hypot(b.vx, b.vy)) > 1){
    mal++; console.log('✗ gesto       pasado el tope sigue pegando más fuerte');
  }

  /* el cableado: soltar el ratón FUERA del canvas debe valer igual */
  async function tira(juego, gesto){
    const mod = await import(`../js/games/${juego}.js`);
    const host = new FakeNode('div');
    let vibró = 0;
    const antes = globalThis.navigator.vibrate;
    globalThis.navigator.vibrate = () => { vibró++; };
    const ctx = { el:host, me:{ id:'A', name:'Agus' }, peer:{ id:'B', name:'Rebus' }, isHost:true, seed:5,
      rng:Math.random, random:Math.random, send(){}, sendReliable(){}, onMsg(){},
      saveState(){}, onState(){}, toast(){}, vibrate(){}, peerOnline:() => true,
      onPeerChange(){}, finish(){} };
    const inst = await mod.default(ctx);
    const cv = host.find(n => n.tagName === 'CANVAS')[0];
    await new Promise(r => setTimeout(r, 60));
    vibró = 0;
    cv.fire('pointerdown', puntero(gesto.x0, gesto.y0));
    globalThis.window.dispatch('pointermove', puntero(gesto.x, gesto.y));
    globalThis.window.dispatch('pointerup', puntero(gesto.x, gesto.y));   // fuera del canvas
    await new Promise(r => setTimeout(r, 80));
    inst?.destroy?.();
    globalThis.navigator.vibrate = antes;
    return vibró > 0;
  }
  for(const [juego, gesto, deberia] of [
    ['basket',   { x0:170, y0:300, x:150, y:120 }, true],
    ['basket',   { x0:170, y0:100, x:170, y:290 }, false],
    ['arqueria', { x0:160, y0:310, x:200, y:110 }, true],
    ['arqueria', { x0:160, y0:120, x:160, y:300 }, false],
  ]){
    const disparó = await tira(juego, gesto);
    if(disparó !== deberia){ mal++; console.log(`✗ ${juego} el gesto ${JSON.stringify(gesto)} ${disparó?'disparó':'no disparó'}`); }
  }

  console.log(`${mal ? '✗' : '✓'} punteria    deslizar hacia el objetivo dispara; hacia abajo o un toque, no`);
  return mal ? 1 : 0;
}
if(!only) fails += await probarPunteria();

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

console.log(fails ? `\n${fails} juego(s) con problemas` : '\n✓ todos los juegos pasan');
process.exit(fails ? 1 : 0);
}
