/* Reversi / Otelo — 8×8 */
import { turnGame, turnText, turnClass, el, clear, beep, vibrate } from './lib/kit.js';

const N = 8;
const at = (b, x, y) => b[y * N + x];
const DIRS = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];

function flips(b, x, y, who, other){
  if(at(b, x, y)) return [];
  const out = [];
  for(const [dx, dy] of DIRS){
    const run = [];
    let cx = x + dx, cy = y + dy;
    while(cx >= 0 && cx < N && cy >= 0 && cy < N && at(b, cx, cy) === other){
      run.push(cy * N + cx); cx += dx; cy += dy;
    }
    if(run.length && cx >= 0 && cx < N && cy >= 0 && cy < N && at(b, cx, cy) === who) out.push(...run);
  }
  return out;
}

const legalMoves = (b, who, other) => {
  const m = new Map();
  for(let y = 0; y < N; y++) for(let x = 0; x < N; x++){
    const f = flips(b, x, y, who, other);
    if(f.length) m.set(y * N + x, f);
  }
  return m;
};
const count = (b, who) => b.filter(v => v === who).length;

export default (ctx) => turnGame(ctx, {
  init(c, P){
    const b = Array(N * N).fill(null);
    b[27] = P.guest; b[28] = P.host;
    b[35] = P.host;  b[36] = P.guest;
    return { b, turn: P.host, passed: 0 };
  },

  action(s, a, from, api){
    const P = api.P, other = P.other(from);
    if(from !== s.turn) return;

    if(a.pass){
      s.passed++;
      if(s.passed >= 2) return end(s, api);
      s.turn = other;
      return;
    }
    const f = flips(s.b, a.x, a.y, from, other);
    if(!f.length) return;
    s.b[a.y * N + a.x] = from;
    f.forEach(i => s.b[i] = from);
    s.passed = 0;
    s.last = a.y * N + a.x;

    // ¿el rival puede mover? si no, se salta el turno; si nadie puede, se acaba.
    if(legalMoves(s.b, other, from).size)      s.turn = other;
    else if(legalMoves(s.b, from, other).size) s.msg = `${P.name(other)} no tiene jugadas, sigues tú`;
    else return end(s, api);
  },

  render(s, ui, c, api){
    const P = api.P;
    const mine = count(s.b, P.me), theirs = count(s.b, P.them);
    const moves = P.isMe(s.turn) ? legalMoves(s.b, P.me, P.them) : new Map();

    ui.status(turnText(P, s.turn, `${mine} — ${theirs}`), turnClass(P, s.turn));

    const board = el('div', { class:'bd bd-rv' });
    for(let y = 0; y < N; y++) for(let x = 0; x < N; x++){
      const i = y * N + x, v = s.b[i];
      const can = moves.has(i);
      board.append(el('button', {
        class:'cell rv-cell' + (can ? ' hint' : '') + (s.last === i ? ' last' : ''),
        onclick: () => { if(!can) return; beep(600, .06); vibrate(15); api.act({ x, y }); },
      }, v ? el('span', { class:'disc', style:{ background:P.color(v) } }) : (can ? el('span', { class:'dot' }) : '')));
    }

    clear(ui.center).append(board);
    clear(ui.actions);
    if(P.isMe(s.turn) && moves.size === 0)
      ui.btn('Pasar turno 🙅', () => api.act({ pass:1 }), 'primary');
    else
      ui.actions.append(el('div', { class:'g-pill', html:
        `<span style="color:${P.color(P.me)}">●</span> ${mine} · <span style="color:${P.color(P.them)}">●</span> ${theirs}` }));
  },
});

function end(s, api){
  const P = api.P;
  const a = count(s.b, P.me), b = count(s.b, P.them);
  api.finish(a > b ? 'me' : a < b ? 'them' : 'draw', `${a} — ${b}`);
}
