/* Buscaminas a dos — gana quien encuentre más minas.
   Si destapas una mina, te la quedas y sigues; si no, pasa el turno. */
import { turnGame, turnText, turnClass, el, clear, beep, vibrate, rngInt,
         sfxPop, sfxCapture, chord } from './lib/kit.js';

const W = 10, H = 10, MINES = 15, TARGET = 8;
const ix = (x, y) => y * W + x;

export default (ctx) => {
  let abiertas = -1, minas = -1;

  return turnGame(ctx, {
  init(c, P){
    const mine = Array(W * H).fill(false);
    let placed = 0;
    while(placed < MINES){
      const i = rngInt(c.rng, W * H);
      if(!mine[i]){ mine[i] = true; placed++; }
    }
    const num = mine.map((_, i) => {
      if(mine[i]) return -1;
      const x = i % W, y = (i / W) | 0;
      let n = 0;
      for(let dy = -1; dy <= 1; dy++) for(let dx = -1; dx <= 1; dx++){
        const nx = x + dx, ny = y + dy;
        if(nx >= 0 && nx < W && ny >= 0 && ny < H && mine[ix(nx, ny)]) n++;
      }
      return n;
    });
    return {
      mine, num, rev: Array(W * H).fill(false), owner: {},
      turn: c.rng() < 0.5 ? P.host : P.guest,
      score: { [P.host]:0, [P.guest]:0 },
    };
  },

  /* El invitado sólo recibe lo ya destapado: las minas siguen siendo secreto. */
  view(s){
    return {
      cells: s.rev.map((r, i) => r ? (s.mine[i] ? { m: s.owner[i] } : { n: s.num[i] }) : null),
      turn: s.turn, score: s.score,
    };
  },

  action(s, a, from, api){
    const P = api.P;
    if(from !== s.turn || a.i == null || s.rev[a.i]) return;

    if(s.mine[a.i]){
      s.rev[a.i] = true; s.owner[a.i] = from; s.score[from]++;
      if(s.score[from] >= TARGET)
        return api.finish(P.isMe(from) ? 'me' : 'them', `${s.score[P.me]} — ${s.score[P.them]} minas`);
      return;                                          // sigue el mismo jugador
    }

    // Destapado en cascada de las casillas vacías.
    const stack = [a.i];
    while(stack.length){
      const i = stack.pop();
      if(s.rev[i] || s.mine[i]) continue;
      s.rev[i] = true;
      if(s.num[i] !== 0) continue;
      const x = i % W, y = (i / W) | 0;
      for(let dy = -1; dy <= 1; dy++) for(let dx = -1; dx <= 1; dx++){
        const nx = x + dx, ny = y + dy;
        if(nx >= 0 && nx < W && ny >= 0 && ny < H && !s.rev[ix(nx, ny)]) stack.push(ix(nx, ny));
      }
    }
    s.turn = P.other(from);
  },

  render(v, ui, c, api){
    const P = api.P;
    ui.status(turnText(P, v.turn, `${v.score[P.me]} — ${v.score[P.them]} · meta ${TARGET}`), turnClass(P, v.turn));

    /* sonido según lo que acaba de pasar, para los dos */
    const nAbiertas = v.cells.filter(Boolean).length;
    const nMinas = v.score[P.me] + v.score[P.them];
    const nuevas = abiertas >= 0 ? nAbiertas - abiertas : 0;
    if(minas >= 0 && nMinas > minas){ sfxCapture(); vibrate([30, 50, 30]); }
    else if(nuevas > 0){ sfxPop(); vibrate(10); }
    const recien = abiertas >= 0 && nuevas > 0;
    abiertas = nAbiertas; minas = nMinas;

    const board = el('div', { class:'bd bd-ms' });
    v.cells.forEach((cell, i) => {
      const node = el('button', {
        class:'ms-cell' + (cell ? ' open' : '') + (cell?.m ? ' mine' : '') + (recien && cell ? ' revealed' : ''),
        style: cell?.m ? { background:P.color(cell.m) } : {},
        onclick: () => {
          if(cell || !P.isMe(v.turn)) return;
          api.act({ i });
        },
      });
      if(cell?.m) node.textContent = '💣';
      else if(cell && cell.n > 0){ node.textContent = cell.n; node.dataset.n = cell.n; }
      board.append(node);
    });

    clear(ui.center).append(board);
    clear(ui.actions).append(el('div', { class:'g-pill', html:
      `<span style="color:${P.color(P.me)}">💣</span> ${v.score[P.me]} · <span style="color:${P.color(P.them)}">💣</span> ${v.score[P.them]}` }));
  },
  });
};
