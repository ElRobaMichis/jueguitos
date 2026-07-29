/* Serpientes y Escaleras */
import { turnGame, turnText, turnClass, el, clear, beep, vibrate } from './lib/kit.js';

const JUMPS = {                                       // origen: destino
  2:38, 7:14, 8:31, 15:26, 21:42, 28:84, 36:44, 51:67, 71:91, 78:98,
  16:6, 46:25, 49:11, 62:19, 64:60, 74:53, 89:68, 92:88, 95:75, 99:80,
};
const isLadder = (a) => JUMPS[a] > a;

export default (ctx) => turnGame(ctx, {
  init(c, P){
    return { pos:{ [P.host]:0, [P.guest]:0 }, turn:P.host, dice:null, note:'' };
  },

  action(s, a, from, api){
    const P = api.P;
    if(from !== s.turn || !a.roll || s.rolling) return;

    const d = 1 + Math.floor(Math.random() * 6);
    s.dice = d;
    let p = s.pos[from] + d;
    if(p > 100) p = 100 - (p - 100);                  // rebota en la meta
    s.note = '';

    if(JUMPS[p] != null){
      s.note = isLadder(p) ? `¡Escalera! ${p} → ${JUMPS[p]} 🪜` : `¡Serpiente! ${p} → ${JUMPS[p]} 🐍`;
      p = JUMPS[p];
    }
    s.pos[from] = p;

    if(p >= 100) return api.finish(P.isMe(from) ? 'me' : 'them', '¡Llegó a la meta!');
    if(d !== 6) s.turn = P.other(from);
    else s.note += (s.note ? ' · ' : '') + '¡Sacaste 6, tiras otra vez!';
  },

  render(s, ui, c, api){
    const P = api.P;
    ui.status(turnText(P, s.turn, s.note || (s.dice ? `salió ${s.dice}` : '')), turnClass(P, s.turn));

    const board = el('div', { class:'bd bd-sl' });
    for(let row = 9; row >= 0; row--){
      for(let k = 0; k < 10; k++){
        const col = row % 2 === 0 ? k : 9 - k;        // serpentea
        const n = row * 10 + col + 1;
        const j = JUMPS[n];
        const cell = el('div', { class:'sl-cell' + (j ? (isLadder(n) ? ' ladder' : ' snake') : '') },
          el('i', { class:'sl-n', text:String(n) }),
          j ? el('i', { class:'sl-j', text: isLadder(n) ? '🪜' : '🐍' }) : '');
        for(const id of [P.me, P.them])
          if(s.pos[id] === n) cell.append(el('span', { class:'sl-tok', style:{ background:P.color(id) }, text:'' }));
        board.append(cell);
      }
    }

    clear(ui.center).append(board);
    clear(ui.actions);
    ui.actions.append(el('div', { class:'g-pill', html:
      `<span style="color:${P.color(P.me)}">●</span> ${s.pos[P.me]} · <span style="color:${P.color(P.them)}">●</span> ${s.pos[P.them]}` }));
    if(P.isMe(s.turn))
      ui.btn(s.dice ? `🎲 Tirar (${s.dice})` : '🎲 Tirar dado', () => { beep(500, .08); vibrate(30); api.act({ roll:1 }); }, 'primary');
  },
});
