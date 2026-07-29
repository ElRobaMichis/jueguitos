/* Memorama — 10 pares */
import { turnGame, turnText, turnClass, el, clear, beep, vibrate, shuffled,
         sfxFlip, chord, sfxError } from './lib/kit.js';

const FACES = ['🍓','🌙','🐙','🎈','🍕','🦋','⚡','🌵','🐧','🍀','🎸','🚀','🧁','🐳','🌻','🍩'];

export default (ctx) => {
  let vistas = '', pares = 0;

  return turnGame(ctx, {
  init(c, P){
    const picks = shuffled(FACES, c.rng).slice(0, 10);
    return {
      cards: shuffled([...picks, ...picks], c.rng),
      up: [], matched: {}, lock: false,
      turn: c.rng() < 0.5 ? P.host : P.guest,
      score: { [P.host]:0, [P.guest]:0 },
    };
  },

  /* Sólo se ven las cartas volteadas o ya emparejadas. */
  view(s){
    return {
      faces: s.cards.map((f, i) => (s.up.includes(i) || s.matched[i] != null) ? f : null),
      n: s.cards.length, up:s.up, matched:s.matched, turn:s.turn, score:s.score, lock:s.lock,
    };
  },

  action(s, a, from, api){
    const P = api.P;
    if(s.lock || from !== s.turn || a.i == null) return;
    if(s.matched[a.i] != null || s.up.includes(a.i)) return;

    s.up.push(a.i);
    if(s.up.length < 2) return;

    const [x, y] = s.up;
    if(s.cards[x] === s.cards[y]){
      s.matched[x] = from; s.matched[y] = from;
      s.score[from]++;
      s.up = [];
      const done = Object.keys(s.matched).length >= s.cards.length;
      if(done){
        const mine = s.score[P.me], their = s.score[P.them];
        return api.finish(mine > their ? 'me' : mine < their ? 'them' : 'draw', `${mine} — ${their} pares`);
      }
    }else{
      s.lock = true;
      setTimeout(() => {                              // se enseñan un momento y se voltean
        s.up = []; s.lock = false; s.turn = P.other(from);
        api.sync();
      }, 5);
    }
  },

  render(v, ui, c, api){
    const P = api.P;
    ui.status(turnText(P, v.turn, `${v.score[P.me]} — ${v.score[P.them]}`), turnClass(P, v.turn));

    /* sonidos según lo que cambió (los oyen los dos) */
    const huella = v.up.join(',');
    const nPares = Object.keys(v.matched).length / 2;
    if(huella !== vistas){
      if(v.up.length) sfxFlip(), vibrate(12);
      vistas = huella;
    }
    if(nPares > pares){ chord([660, 880, 1100], .18); vibrate([25, 40, 25]); }
    else if(nPares === pares && v.lock) sfxError();
    pares = nPares;

    const grid = el('div', { class:'bd bd-mem' });
    for(let i = 0; i < v.n; i++){
      const face = v.faces[i];
      const owner = v.matched[i];
      const shown = face != null;
      const cara = el('span', { class:'mem-cara', text: shown ? face : '' });
      const dorso = el('span', { class:'mem-dorso', text:'❔' });
      grid.append(el('button', {
        class:'mem-card' + (shown ? ' up' : '') + (owner != null ? ' done' : ''),
        style: owner != null ? { borderColor:P.color(owner), background:P.color(owner) + '22' } : {},
        onclick: () => {
          if(v.lock || !P.isMe(v.turn) || shown) return;
          api.act({ i });
        },
      }, el('span', { class:'mem-inner' }, dorso, cara)));
    }

    clear(ui.center).append(grid);
    clear(ui.actions).append(el('div', { class:'g-pill', html:
      `<span style="color:${P.color(P.me)}">●</span> ${v.score[P.me]} · <span style="color:${P.color(P.them)}">●</span> ${v.score[P.them]}` }));
  },
  });
};
