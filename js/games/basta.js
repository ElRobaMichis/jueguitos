/* Basta / Stop — 3 rondas. Los dos escriben a la vez; quien grita "¡Basta!"
   corta la ronda. 10 puntos si nadie repitió, 5 si coincidieron.

   Importante: el formulario se crea UNA sola vez y nunca se borra. Antes se
   reconstruía en cada redibujado (y el reloj redibuja cada segundo), así que
   al escribir se perdía el foco y en el teléfono se cerraba el teclado. */
import { turnGame, el, clear, beep, vibrate, rngInt, sfxError, chord } from './lib/kit.js';

const CATS = ['Nombre', 'Animal', 'Comida', 'Color', 'Lugar', 'Cosa'];
const LETTERS = 'ABCDEFGHIJLMNOPRSTV'.split('');
const ROUNDS = 3, TIME = 100;
const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

export default (ctx) => {
  let submitted = false, lastRound = 0, lastPhase = '';

  /* --- piezas permanentes --- */
  const letterNode = el('div', { class:'basta-letter' });
  const inputs = {};
  const form = el('div', { class:'basta-form' });
  for(const cat of CATS){
    const inp = el('input', { class:'g-input', autocomplete:'off', autocapitalize:'words', enterkeyhint:'next' });
    inputs[cat] = inp;
    form.append(el('label', { class:'basta-field' }, el('span', { text:cat }), inp));
  }
  /* Enter salta al siguiente campo en vez de cerrar el teclado. */
  CATS.forEach((cat, i) => inputs[cat].addEventListener('keydown', (e) => {
    if(e.key !== 'Enter') return;
    e.preventDefault();
    (inputs[CATS[i + 1]] || inputs[CATS[0]]).focus();
  }));

  const playBox   = el('div', { class:'basta-play' }, letterNode, form);
  const revealBox = el('div', { class:'basta-reveal' });
  const readAll   = () => Object.fromEntries(CATS.map(c => [c, inputs[c].value]));
  const clearAll  = () => CATS.forEach(c => inputs[c].value = '');

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
        if(s.ids.every(id => s.answers[id])) scoreRound(s);
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
      if(s.phase !== 'play' && s.phase !== 'wait') return;
      s.t--;
      if(s.t <= 0){
        if(s.phase === 'play'){ s.phase = 'wait'; s.t = 8; }
        else scoreRound(s);
      }
      api.sync();
    },

    render(v, ui, c, api){
      const P = api.P;

      /* ronda nueva: vaciamos los campos */
      if(v.round !== lastRound){ lastRound = v.round; clearAll(); submitted = false; }
      if(v.phase === 'play') submitted = false;

      /* se acabó el tiempo o alguien gritó: mandamos lo que llevamos */
      if(v.phase === 'wait' && !submitted && !v.mine){
        submitted = true;
        api.act({ answers: readAll() });
      }

      /* ---------- captura ---------- */
      if(v.phase !== 'reveal'){
        revealBox.remove();
        if(!playBox.parentNode) ui.center.append(playBox);   // ojo: nunca se borra
        letterNode.textContent = v.letter;
        const bloqueado = v.phase !== 'play';
        for(const cat of CATS) inputs[cat].disabled = bloqueado;

        ui.status(v.phase === 'play' ? `Letra ${v.letter} · ${v.t}s`
                                     : (v.theirsIn ? 'Contando puntos…' : `Esperando a ${P.name(P.them)}…`),
                  v.phase === 'play' ? 'me' : 'them');

        clear(ui.actions);
        if(v.phase === 'play')
          ui.btn('✋ ¡BASTA!', () => { chord([880, 660, 440], .2); vibrate([40, 40, 80]); api.act({ basta:1 }); }, 'primary');
        else
          ui.actions.append(el('div', { class:'g-pill', text:'⏳' }));
        return;
      }

      /* ---------- resultados ---------- */
      playBox.remove();
      clear(revealBox);
      if(!revealBox.parentNode) ui.center.append(revealBox);

      ui.status(`Ronda ${v.round}/${ROUNDS} — resultados`);
      const table = el('div', { class:'basta-res' });
      CATS.forEach(cat => {
        const a = v.mine?.[cat]?.trim() || '—', b = v.theirs?.[cat]?.trim() || '—';
        const [pa, pb] = v.detail?.[cat] || [0, 0];
        table.append(el('div', { class:'basta-row' },
          el('span', { class:'bc', text:cat }),
          el('span', { class:'ba' + (pa ? ' ok' : ''), style:{ color:P.color(P.me) },   text:a }),
          el('span', { class:'bp', text:`${pa}·${pb}` }),
          el('span', { class:'ba' + (pb ? ' ok' : ''), style:{ color:P.color(P.them) }, text:b })));
      });
      revealBox.append(el('div', { class:'basta-letter small', text:v.letter }), table,
                       el('div', { class:'g-pill', text:`${v.score[P.me]} — ${v.score[P.them]}` }));

      if(lastPhase !== 'reveal'){ lastPhase = 'reveal'; beep(760, .1); }

      clear(ui.actions);
      ui.btn(v.round >= ROUNDS ? '🏁 Ver resultado' : '➡️ Siguiente ronda', () => api.act({ next:1 }), 'primary');
    },
  }, { scroll:true });
};

function scoreRound(s){
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
