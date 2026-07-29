/* Ludo (parchís) para dos — 4 fichas, sacas con 6, comes al rival, meta exacta.
   El tablero clásico se genera rotando un brazo 90° cuatro veces. */
import { turnGame, el, clear, beep, vibrate } from './lib/kit.js';

const SIZE = 15;
const rot = ([x, y]) => [SIZE - 1 - y, x];             // 90° en el sentido del reloj
const rotN = (p, n) => { let q = p; for(let i = 0; i < n; i++) q = rot(q); return q; };

/* Un brazo = 13 casillas; cuatro brazos = las 52 del circuito. */
const ARM = [[0,6],[1,6],[2,6],[3,6],[4,6],[5,6],[6,5],[6,4],[6,3],[6,2],[6,1],[6,0],[7,0]];
const TRACK = [0,1,2,3].flatMap(q => ARM.map(p => rotN(p, q)));
const HOME_ARM = [[1,7],[2,7],[3,7],[4,7],[5,7]];
const homeCells = (q) => [...HOME_ARM.map(p => rotN(p, q)), [7, 7]];
const BASE_ARM = [[1,1],[4,1],[1,4],[4,4]];
const baseCells = (q) => BASE_ARM.map(p => rotN(p, q));

const START = (q) => 1 + 13 * q;                       // casilla de salida de cada color
const SAFE = new Set([1, 9, 14, 22, 27, 35, 40, 48]);
const LAST = 56;                                       // 0..50 pista, 51..55 pasillo, 56 meta

const cellOf = (q, rel) => rel <= 50 ? TRACK[(START(q) + rel) % 52] : homeCells(q)[rel - 51];

export default (ctx) => turnGame(ctx, {
  init(c, P){
    return {
      q: { [P.host]:0, [P.guest]:2 },                  // brazos opuestos
      tok: { [P.host]:[-1,-1,-1,-1], [P.guest]:[-1,-1,-1,-1] },   // -1 = en casa
      turn: P.host, dice: null, note: 'Tira el dado', extra: false,
    };
  },

  action(s, a, from, api){
    const P = api.P;
    if(from !== s.turn) return;

    /* --- tirar --- */
    if(a.roll){
      if(s.dice != null) return;
      const d = 1 + Math.floor(Math.random() * 6);
      s.dice = d;
      s.note = `Salió ${d}`;
      if(!movable(s, from, d).length){
        s.note = `Salió ${d} — sin movimientos 😕`;
        s.dice = null;
        s.turn = P.other(from);
      }
      return;
    }

    /* --- mover ficha --- */
    if(a.t == null || s.dice == null) return;
    const d = s.dice;
    if(!movable(s, from, d).includes(a.t)) return;

    const cur = s.tok[from][a.t];
    let next;
    if(cur === -1) next = 0;                            // sale de casa con un 6
    else next = cur + d;
    if(next > LAST) return;
    s.tok[from][a.t] = next;

    /* ¿comí a alguien? */
    const other = P.other(from);
    if(next <= 50){
      const myCell = cellOf(s.q[from], next).join(',');
      if(!SAFE.has((START(s.q[from]) + next) % 52)){
        s.tok[other].forEach((p, k) => {
          if(p >= 0 && p <= 50 && cellOf(s.q[other], p).join(',') === myCell){
            s.tok[other][k] = -1;
            s.note = '¡Te comió una ficha! 😈';
          }
        });
      }
    }

    if(s.tok[from].every(p => p === LAST))
      return api.finish(P.isMe(from) ? 'me' : 'them', '¡Metió las 4 fichas!');

    const again = d === 6 || next === LAST;
    s.dice = null;
    if(!again) s.turn = other;
    else s.note = (next === LAST ? '¡Metiste una ficha! ' : '¡Sacaste 6! ') + 'Tiras otra vez';
  },

  render(s, ui, c, api){
    const P = api.P;
    const myTurn = P.isMe(s.turn);
    const canMove = myTurn && s.dice != null ? movable(s, P.me, s.dice) : [];

    ui.status((myTurn ? 'Tu turno' : `Turno de ${P.name(P.them)}`) + ' · ' + s.note, myTurn ? 'me' : 'them');

    const board = el('div', { class:'bd bd-ludo' });
    /* zonas de color */
    for(const id of [P.host, P.guest]){
      const q = s.q[id];
      const corner = rotN([0, 0], q), c2 = rotN([5, 5], q);
      board.append(el('div', {
        class:'ludo-base',
        style:{
          gridColumn:`${Math.min(corner[0], c2[0]) + 1} / span 6`,
          gridRow:`${Math.min(corner[1], c2[1]) + 1} / span 6`,
          background: P.color(id) + '22', borderColor: P.color(id),
        },
      }));
    }
    /* pista */
    TRACK.forEach(([x, y], i) => board.append(el('div', {
      class:'ludo-cell' + (SAFE.has(i) ? ' safe' : ''),
      style:{ gridColumn:x + 1, gridRow:y + 1 },
      text: SAFE.has(i) ? '★' : '',
    })));
    /* pasillos */
    for(const id of [P.host, P.guest])
      homeCells(s.q[id]).forEach(([x, y]) => board.append(el('div', {
        class:'ludo-cell home', style:{ gridColumn:x + 1, gridRow:y + 1, background:P.color(id) + '55' } })));

    /* fichas */
    for(const id of [P.host, P.guest]){
      const q = s.q[id];
      let parked = 0;
      s.tok[id].forEach((p, k) => {
        const [x, y] = p === -1 ? baseCells(q)[parked++] : cellOf(q, p);
        const mineMovable = id === P.me && canMove.includes(k);
        board.append(el('button', {
          class:'ludo-tok' + (mineMovable ? ' can' : ''),
          style:{ gridColumn:x + 1, gridRow:y + 1, background:P.color(id) },
          onclick: () => { if(!mineMovable) return; beep(720, .07); vibrate(20); api.act({ t:k }); },
          text: p === LAST ? '★' : '',
        }));
      });
    }

    clear(ui.center).append(board);
    clear(ui.actions);
    if(myTurn && s.dice == null) ui.btn('🎲 Tirar dado', () => { beep(480, .09); vibrate(30); api.act({ roll:1 }); }, 'primary');
    else if(myTurn)              ui.actions.append(el('div', { class:'g-pill dice', text:`🎲 ${s.dice} — elige ficha` }));
    else                         ui.actions.append(el('div', { class:'g-pill', text: s.dice ? `🎲 ${s.dice}` : 'Esperando…' }));
  },
});

/* Índices de fichas que se pueden mover con ese dado. */
function movable(s, id, d){
  const out = [];
  s.tok[id].forEach((p, k) => {
    if(p === -1){ if(d === 6) out.push(k); return; }
    if(p === LAST) return;
    if(p + d <= LAST) out.push(k);
  });
  return out;
}
