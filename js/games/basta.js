/* Basta / Stop — 3 rondas. Los dos escriben a la vez; quien grita "¡Basta!"
   corta la ronda. 10 puntos si nadie repitió, 5 si coincidieron. */
import { turnGame, el, clear, beep, vibrate, rngInt } from './lib/kit.js';

const CATS = ['Nombre', 'Animal', 'Comida', 'Color', 'Lugar', 'Cosa'];
const LETTERS = 'ABCDEFGHIJLMNOPRSTV'.split('');
const ROUNDS = 3, TIME = 100;
const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

export default (ctx) => {
  let draft = {}, submitted = false;

  return turnGame(ctx, {
    init(c, P){
      return { phase:'play', round:1, letter:LETTERS[rngInt(c.rng, LETTERS.length)],
               answers:{}, t:TIME, score:{ [P.host]:0, [P.guest]:0 }, detail:null, ids:[P.host, P.guest] };
    },

    view(s, who){
      const other = s.ids.find(i => i !== who);
      const detail = s.detail
        ? Object.fromEntries(CATS.map(c => [c, [s.detail[c][who], s.detail[c][other]]]))
        : null;
      return {
        phase:s.phase, round:s.round, letter:s.letter, t:s.t, score:s.score, detail,
        theirsIn: !!s.answers[other],
        mine: s.answers[who] || null,
        theirs: s.phase === 'reveal' ? (s.answers[other] || {}) : null,
      };
    },

    action(s, a, from, api){
      const P = api.P;
      if(a.basta && s.phase === 'play'){ s.phase = 'wait'; s.t = 8; return; }

      if(a.answers && (s.phase === 'wait' || s.phase === 'play')){
        s.answers[from] = a.answers;
        if(s.phase === 'play') s.phase = 'wait';
        if(s.ids.every(id => s.answers[id])) scoreRound(s, api);
        return;
      }

      if(a.next && s.phase === 'reveal'){
        if(s.round >= ROUNDS){
          const mine = s.score[P.me], their = s.score[P.them];
          return api.finish(mine > their ? 'me' : mine < their ? 'them' : 'draw', `${mine} — ${their} puntos`);
        }
        s.round++; s.phase = 'play'; s.answers = {}; s.detail = null; s.t = TIME;
        s.letter = LETTERS[Math.floor(Math.random() * LETTERS.length)];
      }
    },

    tick(s, api){
      if(s.phase === 'play' || s.phase === 'wait'){
        s.t--;
        if(s.t <= 0){
          if(s.phase === 'play'){ s.phase = 'wait'; s.t = 8; }
          else scoreRound(s, api);                     // el que no mandó, se queda sin puntos
        }
        api.sync();
      }
    },

    render(v, ui, c, api){
      const P = api.P;
      clear(ui.center); clear(ui.actions);

      /* --- se acabó la ronda: manda lo que llevas --- */
      if(v.phase === 'wait' && !submitted && !v.mine){
        submitted = true;
        api.act({ answers: { ...draft } });
      }
      if(v.phase === 'play') submitted = false;

      ui.status(v.phase === 'reveal' ? `Ronda ${v.round}/${ROUNDS} — resultados`
                                     : `Letra ${v.letter} · ${v.t}s`,
                v.phase === 'reveal' ? '' : 'me');

      if(v.phase === 'reveal'){
        const table = el('div', { class:'basta-res' });
        CATS.forEach(cat => {
          const a = v.mine?.[cat] || '—', b = v.theirs?.[cat] || '—';
          const pts = v.detail?.[cat] || [0, 0];
          table.append(el('div', { class:'basta-row' },
            el('span', { class:'bc', text:cat }),
            el('span', { class:'ba', style:{ color:P.color(P.me) },   text:`${a} (${pts[0]})` }),
            el('span', { class:'ba', style:{ color:P.color(P.them) }, text:`${b} (${pts[1]})` })));
        });
        ui.center.append(el('div', { class:'basta-letter', text:v.letter }), table);
        ui.center.append(el('div', { class:'g-pill', text:`${v.score[P.me]} — ${v.score[P.them]}` }));
        ui.btn(v.round >= ROUNDS ? '🏁 Ver resultado' : '➡️ Siguiente ronda', () => api.act({ next:1 }), 'primary');
        draft = {};
        return;
      }

      ui.center.append(el('div', { class:'basta-letter', text:v.letter }));
      const form = el('div', { class:'basta-form' });
      CATS.forEach(cat => form.append(el('label', { class:'basta-field' },
        el('span', { text:cat }),
        el('input', {
          class:'g-input', autocomplete:'off', value:draft[cat] || '',
          disabled: v.phase !== 'play',
          placeholder: v.letter + '…',
          oninput:(e) => draft[cat] = e.target.value,
        }))));
      ui.center.append(form);

      if(v.phase === 'play')
        ui.btn('✋ ¡BASTA!', () => { beep(900, .18); vibrate([40, 40, 80]); api.act({ basta:1 }); }, 'primary');
      else
        ui.actions.append(el('div', { class:'g-pill', text: v.theirsIn ? 'Contando puntos…' : `Esperando a ${P.name(P.them)}…` }));
    },
  }, { scroll:true });
};

function scoreRound(s, api){
  const [a, b] = s.ids;
  const A = s.answers[a] || {}, B = s.answers[b] || {};
  const L = s.letter.toLowerCase();
  const detail = {};
  for(const cat of CATS){
    const va = norm(A[cat]), vb = norm(B[cat]);
    const oka = va.startsWith(L) && va.length > 1;
    const okb = vb.startsWith(L) && vb.length > 1;
    const same = oka && okb && va === vb;
    const pa = oka ? (same ? 5 : 10) : 0;
    const pb = okb ? (same ? 5 : 10) : 0;
    s.score[a] += pa; s.score[b] += pb;
    detail[cat] = { [a]:pa, [b]:pb };
  }
  s.detail = detail;
  s.phase = 'reveal';
}
