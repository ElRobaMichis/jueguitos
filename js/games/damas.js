/* Damas — 8×8, con coronación y saltos múltiples */
import { turnGame, turnText, turnClass, el, clear, beep, vibrate } from './lib/kit.js';

const N = 8;
const i2 = (x, y) => y * N + x;
const inside = (x, y) => x >= 0 && x < N && y >= 0 && y < N;

/* Cada casilla: null | { p: idJugador, k: esDama }.
   El anfitrión juega abajo (avanza hacia arriba, dy = -1). */
const dirOf = (s, id) => (id === s.bottom ? -1 : 1);

function movesFor(s, x, y){
  const pc = s.b[i2(x, y)];
  if(!pc) return { jumps: [], steps: [] };
  const dy = dirOf(s, pc.p);
  const dirs = pc.k ? [[1,1],[1,-1],[-1,1],[-1,-1]] : [[1, dy],[-1, dy]];
  const jumps = [], steps = [];
  for(const [dx, dyy] of dirs){
    const nx = x + dx, ny = y + dyy;
    if(!inside(nx, ny)) continue;
    const t = s.b[i2(nx, ny)];
    if(!t){ steps.push({ x:nx, y:ny }); continue; }
    if(t.p === pc.p) continue;
    const jx = nx + dx, jy = ny + dyy;
    if(inside(jx, jy) && !s.b[i2(jx, jy)]) jumps.push({ x:jx, y:jy, cap:i2(nx, ny) });
  }
  return { jumps, steps };
}

function allMoves(s, who){
  const jumps = [], steps = [];
  for(let y = 0; y < N; y++) for(let x = 0; x < N; x++){
    const pc = s.b[i2(x, y)];
    if(pc?.p !== who) continue;
    const m = movesFor(s, x, y);
    m.jumps.forEach(j => jumps.push({ from:i2(x, y), ...j }));
    m.steps.forEach(j => steps.push({ from:i2(x, y), ...j }));
  }
  return jumps.length ? { list: jumps, forced: true } : { list: steps, forced: false };
}

export default (ctx) => {
  let sel = null;                                   // selección local (no viaja por la red)

  return turnGame(ctx, {
    init(c, P){
      const b = Array(N * N).fill(null);
      for(let y = 0; y < 3; y++) for(let x = 0; x < N; x++) if((x + y) % 2) b[i2(x, y)] = { p:P.guest, k:0 };
      for(let y = 5; y < N; y++) for(let x = 0; x < N; x++) if((x + y) % 2) b[i2(x, y)] = { p:P.host,  k:0 };
      return { b, turn: P.host, bottom: P.host, chain: null };
    },

    action(s, a, from, api){
      const P = api.P;
      if(from !== s.turn || a.from == null) return;
      const pc = s.b[a.from];
      if(!pc || pc.p !== from) return;
      if(s.chain != null && s.chain !== a.from) return;      // hay que seguir saltando con la misma ficha

      const fx = a.from % N, fy = (a.from / N) | 0;
      const { jumps, steps } = movesFor(s, fx, fy);
      const global = allMoves(s, from);
      const pool = (s.chain != null) ? jumps : (global.forced ? jumps : [...jumps, ...steps]);
      const mv = pool.find(m => m.x === a.x && m.y === a.y);
      if(!mv) return;

      s.b[a.from] = null;
      if(mv.cap != null) s.b[mv.cap] = null;
      const dest = i2(mv.x, mv.y);
      const crown = (pc.p === s.bottom && mv.y === 0) || (pc.p !== s.bottom && mv.y === N - 1);
      s.b[dest] = { p:pc.p, k: pc.k || (crown ? 1 : 0) };
      s.last = dest;

      // ¿puede seguir comiendo? (no si acaba de coronar)
      const more = mv.cap != null && !crown && movesFor(s, mv.x, mv.y).jumps.length;
      if(more){ s.chain = dest; return; }

      s.chain = null;
      const other = P.other(from);
      s.turn = other;

      const left = s.b.filter(p => p?.p === other).length;
      if(!left || !allMoves(s, other).list.length)
        api.finish(P.isMe(from) ? 'me' : 'them', left ? 'Sin movimientos' : 'Sin fichas');
    },

    render(s, ui, c, api){
      const P = api.P;
      const myTurn = P.isMe(s.turn);
      const mineLeft = s.b.filter(p => p?.p === P.me).length;
      const theirLeft = s.b.filter(p => p?.p === P.them).length;

      if(s.chain != null && myTurn) sel = s.chain;
      if(!myTurn) sel = null;

      const global = myTurn ? allMoves(s, P.me) : { list: [], forced: false };
      ui.status(turnText(P, s.turn, global.forced && myTurn ? '¡hay que comer!' : `${mineLeft} vs ${theirLeft}`),
                turnClass(P, s.turn));

      const targets = new Map();
      if(sel != null){
        const sx = sel % N, sy = (sel / N) | 0;
        const m = movesFor(s, sx, sy);
        const pool = (s.chain != null) ? m.jumps : (global.forced ? m.jumps : [...m.jumps, ...m.steps]);
        pool.forEach(t => targets.set(i2(t.x, t.y), t));
      }

      const board = el('div', { class:'bd bd-dm' });
      for(let y = 0; y < N; y++) for(let x = 0; x < N; x++){
        const i = i2(x, y), pc = s.b[i], dark = (x + y) % 2;
        const isTarget = targets.has(i);
        board.append(el('button', {
          class:'cell dm-cell' + (dark ? ' dark' : ' light') + (sel === i ? ' sel' : '') + (isTarget ? ' hint' : ''),
          onclick: () => {
            if(!myTurn) return;
            if(isTarget){ const from = sel; sel = null; beep(700, .07); vibrate(20); api.act({ from, x, y }); return; }
            if(pc?.p === P.me && (s.chain == null || s.chain === i)){ sel = (sel === i ? null : i); beep(480, .04); api.redraw(); }
          },
        },
          pc ? el('span', { class:'piece' + (pc.k ? ' king' : ''), style:{ background:P.color(pc.p) },
                            text: pc.k ? '♛' : '' }) : (isTarget ? el('span', { class:'dot' }) : '')
        ));
      }

      clear(ui.center).append(board);
      clear(ui.actions).append(el('div', { class:'g-pill', html:
        `<span style="color:${P.color(P.me)}">●</span> ${mineLeft} · <span style="color:${P.color(P.them)}">●</span> ${theirLeft}` }));
    },
  });
};
