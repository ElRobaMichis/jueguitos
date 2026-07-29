/* ===========================================================================
   kit.js — piezas comunes para todos los juegos.
   =========================================================================== */

import { el, clear, colorFor, initial, beep, vibrate } from '../../core/ui.js';
export { el, clear, colorFor, initial, beep, vibrate };
export { makeRng, rngInt, shuffled, clamp, sleep, toast, sfxPop } from '../../core/ui.js';

/** Estructura estándar: barra de estado + zona central + fila de botones. */
export function layout(ctx, { status = '', scroll = false } = {}){
  const st     = el('div', { class:'g-status', text:status });
  const center = el('div', { class:'g-center' });
  const actions= el('div', { class:'g-row' });
  const wrap   = el('div', { class:'g-wrap', style: scroll ? {} : { overflow:'hidden' } }, st, center, actions);
  ctx.el.append(wrap);
  return {
    wrap, center, actions,
    status(text, cls = ''){ st.textContent = text; st.className = 'g-status ' + cls; },
    btn(label, onclick, cls = ''){
      const b = el('button', { class:'g-btn ' + cls, onclick });
      b.textContent = label;
      actions.append(b);
      return b;
    },
  };
}

/** Tamaño disponible para un tablero cuadrado, sin pasarse de la pantalla. */
export function boardSize(ctx, { max = 520, padding = 24, reserve = 150 } = {}){
  const w = ctx.el.clientWidth  || window.innerWidth;
  const h = ctx.el.clientHeight || window.innerHeight;
  return Math.max(200, Math.min(max, w - padding, h - reserve));
}

/** Canvas con densidad de pantalla correcta. */
export function makeCanvas(w, h){
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const cv = el('canvas', { class:'g-board' });
  cv.width = Math.round(w * dpr);
  cv.height = Math.round(h * dpr);
  cv.style.width = w + 'px';
  cv.style.height = h + 'px';
  const g = cv.getContext('2d');
  g.scale(dpr, dpr);
  return { cv, g, w, h };
}

/** Coordenadas de un toque/click relativas al canvas, en px CSS. */
export function pointerPos(cv, ev){
  const r = cv.getBoundingClientRect();
  const p = ev.touches?.[0] || ev.changedTouches?.[0] || ev;
  return { x: p.clientX - r.left, y: p.clientY - r.top };
}

/* ===========================================================================
   turnGame — motor para juegos por turnos.

   El anfitrión es la única autoridad: guarda el estado, aplica las acciones y
   publica una instantánea (retenida). El invitado sólo manda intenciones y
   dibuja lo que recibe. Así nunca se desincronizan, y si alguien se reconecta
   recibe el tablero completo al instante.

   def = {
     init(ctx, P)             -> estado inicial            (sólo anfitrión)
     action(state, act, from, api)  -> aplica una acción   (sólo anfitrión)
     render(view, ui, ctx, api)     -> dibuja              (los dos)
     view?(state, paraQuienId)-> versión recortada del estado, para esconder
                                 cartas, barcos o minas del rival
     tick?(state, api)        -> se llama cada segundo     (sólo anfitrión)
   }
   api = { act(a), sync(), finish(res, texto), P, isHost }
   =========================================================================== */

export function turnGame(ctx, def, uiOpts){
  const ui = layout(ctx, uiOpts);
  const P  = players(ctx);
  let state = null;
  let timer = null;

  const api = {
    P, isHost: ctx.isHost,
    /** Manda una acción: el anfitrión la aplica directo, el invitado la envía. */
    act(a){
      if(ctx.isHost) applyLocal(a, P.me);
      else ctx.sendReliable({ a });
    },
    sync(){
      if(!ctx.isHost) return;
      ctx.saveState(def.view ? def.view(state, P.guest) : state);
      draw();
    },
    /** Redibuja sin tocar la red (para selecciones y demás detalles locales). */
    redraw(){ draw(); },
    finish(res, text){ if(ctx.isHost) ctx.finish(res, text); },
    get state(){ return state; },
  };

  function applyLocal(a, from){
    try{ def.action(state, a, from, api); }
    catch(err){ console.error('[turnGame] action', err); }
    api.sync();
  }

  function draw(){
    if(!state) return;
    // El anfitrión tiene el estado completo, pero dibuja su propia vista para
    // que los dos juegos se rendericen exactamente con la misma forma de datos.
    const v = ctx.isHost && def.view ? def.view(state, P.host) : state;
    try{ def.render(v, ui, ctx, api); }
    catch(err){ console.error('[turnGame] render', err); }
  }

  /* --- anfitrión --- */
  if(ctx.isHost){
    state = def.init(ctx, P);
    api.sync();
    ctx.onMsg((m, from) => { if(m?.a != null) applyLocal(m.a, from); });
    if(def.tick) timer = setInterval(() => { def.tick(state, api); }, 1000);
  }
  /* --- invitado --- */
  else{
    ui.status('Cargando partida…');
    ctx.onState((s) => { state = s; draw(); });
  }

  return {
    resync(){ if(ctx.isHost) api.sync(); },
    destroy(){ clearInterval(timer); },
  };
}

/** Quién es quién: me/them y host/guest (útil para colores y turnos). */
export function players(ctx){
  const me = ctx.me.id, them = ctx.peer.id;
  const host  = ctx.isHost ? me : them;
  const guest = ctx.isHost ? them : me;
  return {
    me, them, host, guest,
    name(id){ return id === me ? ctx.me.name : ctx.peer.name; },
    color(id){ return colorFor(id); },
    other(id){ return id === me ? them : me; },
    isMe(id){ return id === me; },
  };
}

/** "Tu turno" / "Turno de X" listo para la barra de estado. */
export function turnText(P, turnId, extra = ''){
  return (P.isMe(turnId) ? 'Es tu turno' : `Turno de ${P.name(turnId)}`) + (extra ? ' · ' + extra : '');
}
export const turnClass = (P, turnId) => (P.isMe(turnId) ? 'me' : 'them');

/* ===========================================================================
   liveGame — para juegos en vivo (ping pong, air hockey).
   El anfitrión simula la física y manda el estado a 15 Hz (paquetes de ~60 B,
   unos 3 KB/s como mucho); el invitado interpola y sólo manda su control.
   =========================================================================== */
/* 12 instantáneas por segundo: con la interpolación de los juegos se ve igual
   de fluido que a 15 y se ahorra un 20 % de datos. */
export function liveGame(ctx, def, hz = 12){
  const P = players(ctx);
  let last = 0, raf = 0, running = true;
  const api = { P, isHost: ctx.isHost, finish: (r, t) => ctx.isHost && ctx.finish(r, t) };

  const g = def.setup(ctx, P, api);

  if(ctx.isHost){
    ctx.onMsg((m) => { if(m?.c != null) g.onInput(m.c, ctx.peer.id); });
    let acc = 0;
    const loop = (t) => {
      if(!running) return;
      const dt = Math.min(0.05, (t - last) / 1000 || 0.016);
      last = t;
      g.step(dt);
      acc += dt;
      if(acc >= 1 / hz){ acc = 0; ctx.send({ s: g.snapshot() }); }
      g.draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }else{
    ctx.onMsg((m) => { if(m?.s) g.applySnapshot(m.s); });
    const loop = (t) => {
      if(!running) return;
      const dt = Math.min(0.05, (t - last) / 1000 || 0.016);
      last = t;
      g.predict?.(dt);
      g.draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }

  return {
    resync(){ if(ctx.isHost) ctx.send({ s: g.snapshot() }); },
    destroy(){ running = false; cancelAnimationFrame(raf); g.destroy?.(); },
  };
}

/* ===========================================================================
   duelGame — los dos juegan lo mismo por separado y sólo se sincroniza el
   marcador (basket, arquería, ritmo, globos, tap). Consume poquísimos datos y
   aguanta perfecto una conexión mala.
   =========================================================================== */
export function duelGame(ctx, def){
  const P = players(ctx);
  let myScore = 0, theirScore = 0, myDone = false, theirDone = false;
  let lastSent = 0;

  const api = {
    P,
    setScore(v, { force = false } = {}){
      myScore = v;
      const now = performance.now();
      if(force || now - lastSent > 700){       // como mucho ~1.4 envíos por segundo
        lastSent = now;
        ctx.send({ sc: myScore });
      }
      def.onScores?.(myScore, theirScore, myDone, theirDone);
    },
    done(){
      if(myDone) return;
      myDone = true;
      ctx.sendReliable({ sc: myScore, fin: 1 });
      def.onScores?.(myScore, theirScore, myDone, theirDone);
      check();
    },
    get theirScore(){ return theirScore; },
    get theyFinished(){ return theirDone; },
  };

  function check(){
    if(!(myDone && theirDone)) return;
    if(!ctx.isHost) return;                    // el anfitrión declara el resultado
    const res = myScore > theirScore ? 'me' : myScore < theirScore ? 'them' : 'draw';
    ctx.finish(res, `${myScore} — ${theirScore}`);
  }

  ctx.onMsg((m) => {
    if(m?.sc == null) return;
    theirScore = m.sc;
    if(m.fin) theirDone = true;
    def.onScores?.(myScore, theirScore, myDone, theirDone);
    check();
  });

  const inst = def.setup(ctx, P, api);
  return {
    resync(){ ctx.send({ sc: myScore, fin: myDone ? 1 : 0 }); },
    destroy(){ inst?.destroy?.(); },
  };
}
