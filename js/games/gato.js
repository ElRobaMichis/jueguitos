/* Gato / Tres en raya */
import { turnGame, turnText, turnClass, el, clear, beep, vibrate } from './lib/kit.js';

const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];

export default (ctx) => turnGame(ctx, {
  init(c, P){
    return {
      b: Array(9).fill(null),
      turn: c.rng() < 0.5 ? P.host : P.guest,
      X: P.host,                                   // el anfitrión es ❌
      win: null,
    };
  },

  action(s, a, from, api){
    if(s.win || from !== s.turn) return;
    if(a.i == null || s.b[a.i]) return;
    s.b[a.i] = from;
    const line = LINES.find(l => l.every(i => s.b[i] === from));
    if(line){
      s.win = { by: from, line };
      api.finish(api.P.isMe(from) ? 'me' : 'them', 'Tres en raya');
      return;
    }
    if(s.b.every(Boolean)){ api.finish('draw', 'Tablero lleno'); return; }
    s.turn = api.P.other(from);
  },

  render(s, ui, c, api){
    const P = api.P;
    ui.status(s.win ? '¡Se acabó!' : turnText(P, s.turn), s.win ? '' : turnClass(P, s.turn));

    const grid = el('div', { class:'bd bd-gato' });
    s.b.forEach((v, i) => {
      const winning = s.win?.line.includes(i);
      grid.append(el('button', {
        class: 'cell' + (winning ? ' win' : ''),
        onclick: () => {
          if(s.win || !P.isMe(s.turn) || s.b[i]) return;
          beep(760, .06); vibrate(20);
          api.act({ i });
        },
      }, v ? el('span', { class:'mark', style:{ color:P.color(v) }, text: v === s.X ? '✕' : '◯' }) : ''));
    });

    clear(ui.center).append(grid);
    clear(ui.actions).append(el('div', { class:'g-pill', html:
      `<span style="color:${P.color(s.X)}">✕ ${P.name(s.X)}</span> · <span style="color:${P.color(P.other(s.X))}">◯ ${P.name(P.other(s.X))}</span>` }));
  },
});
