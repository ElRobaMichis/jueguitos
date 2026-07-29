/* Conecta 4 — 7 columnas × 6 filas, con ficha que cae de verdad */
import { turnGame, turnText, turnClass, el, clear, beep, vibrate, sfxDrop, sfxWall } from './lib/kit.js';

const W = 7, H = 6;
const idx = (x, y) => y * W + x;

function winnerLine(b, x, y, who){
  for(const [dx, dy] of [[1,0],[0,1],[1,1],[1,-1]]){
    const line = [[x, y]];
    for(const s of [1, -1]){
      let cx = x + dx * s, cy = y + dy * s;
      while(cx >= 0 && cx < W && cy >= 0 && cy < H && b[idx(cx, cy)] === who){
        line.push([cx, cy]); cx += dx * s; cy += dy * s;
      }
    }
    if(line.length >= 4) return line.map(([a, c]) => idx(a, c));
  }
  return null;
}

export default (ctx) => {
  let visto = null;                                   // última ficha ya animada

  return turnGame(ctx, {
    init(c, P){
      return { b: Array(W * H).fill(null), turn: c.rng() < 0.5 ? P.host : P.guest, win: null, last: null };
    },

    action(s, a, from, api){
      if(s.win || from !== s.turn || a.x == null) return;
      let y = -1;
      for(let r = H - 1; r >= 0; r--) if(!s.b[idx(a.x, r)]){ y = r; break; }
      if(y < 0) return;                                  // columna llena
      s.b[idx(a.x, y)] = from;
      s.last = idx(a.x, y);
      const line = winnerLine(s.b, a.x, y, from);
      if(line){
        s.win = { by: from, line };
        api.finish(api.P.isMe(from) ? 'me' : 'them', '¡Cuatro en línea!');
        return;
      }
      if(s.b.every(Boolean)){ api.finish('draw', 'Tablero lleno'); return; }
      s.turn = api.P.other(from);
    },

    render(s, ui, c, api){
      const P = api.P;
      ui.status(s.win ? '¡Se acabó!' : turnText(P, s.turn), s.win ? '' : turnClass(P, s.turn));

      /* ¿ficha nueva? suena y cae (los dos lo ven y lo oyen) */
      const cayo = s.last != null && s.last !== visto;
      if(cayo){ visto = s.last; sfxDrop(); vibrate(18); }

      const board = el('div', { class:'bd bd-c4' });
      for(let y = 0; y < H; y++){
        for(let x = 0; x < W; x++){
          const i = idx(x, y);
          const v = s.b[i];
          const nueva = cayo && i === s.last;
          const disc = v ? el('span', {
            class:'disc' + (nueva ? ' dropping' : ''),
            style:{ background:P.color(v), '--fall': `-${(y + 1) * 108}%` },
          }) : '';
          board.append(el('button', {
            class:'cell c4-cell' + (s.win?.line.includes(i) ? ' win' : ''),
            onclick: () => {
              if(s.win || !P.isMe(s.turn)) return;
              const lleno = !s.b.slice().filter((_, k) => k % W === x).includes(null);
              if(lleno){ sfxWall(); return; }
              api.act({ x });
            },
          }, disc));
        }
      }
      clear(ui.center).append(board);
      clear(ui.actions).append(el('div', { class:'g-pill', html:
        `<span style="color:${P.color(P.me)}">●</span> Tú · <span style="color:${P.color(P.them)}">●</span> ${P.name(P.them)}` }));
    },
  });
};
