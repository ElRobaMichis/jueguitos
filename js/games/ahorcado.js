/* Ahorcado — dos rondas: cada quien pone una palabra y el otro adivina. */
import { turnGame, el, clear, beep, vibrate } from './lib/kit.js';

const ABC = 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ'.split('');
const MAX = 6;
const norm = (s) => s.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-ZÑ ]/g, '');
const MUNECO = ['', '😵', '😵\n|', '😵\n/|', '😵\n/|\\', '😵\n/|\\\n/', '😵\n/|\\\n/ \\'];

export default (ctx) => {
  let draft = '';

  return turnGame(ctx, {
    init(c, P){
      return { round:1, setter:P.host, word:'', guessed:[], wrong:0, phase:'set',
               score:{ [P.host]:0, [P.guest]:0 } };
    },

    /* La palabra sólo la ve quien la puso. */
    view(s, who){
      const reveal = s.phase === 'end' || who === s.setter;
      return {
        round:s.round, setter:s.setter, phase:s.phase, wrong:s.wrong, guessed:s.guessed,
        score:s.score, len:s.word.length,
        mask: [...s.word].map(ch => (ch === ' ' || s.guessed.includes(ch) || reveal) ? ch : null),
        solved: s.word.length > 0 && [...s.word].every(ch => ch === ' ' || s.guessed.includes(ch)),
      };
    },

    action(s, a, from, api){
      const P = api.P;

      if(a.word != null && from === s.setter && s.phase === 'set'){
        const w = norm(a.word).trim();
        if(w.replace(/ /g, '').length < 3) return;
        s.word = w; s.phase = 'guess'; s.guessed = []; s.wrong = 0;
        return;
      }

      if(a.letter && s.phase === 'guess' && from !== s.setter){
        const L = norm(a.letter);
        if(!L || s.guessed.includes(L)) return;
        s.guessed.push(L);
        if(!s.word.includes(L)) s.wrong++;

        const solved = [...s.word].every(ch => ch === ' ' || s.guessed.includes(ch));
        const dead = s.wrong >= MAX;
        if(solved || dead){
          if(solved) s.score[from] += (MAX + 1) - s.wrong;
          if(s.round === 2){
            s.phase = 'end';
            const mine = s.score[P.me], their = s.score[P.them];
            return api.finish(mine > their ? 'me' : mine < their ? 'them' : 'draw', `${mine} — ${their} puntos`);
          }
          s.round = 2; s.setter = P.other(s.setter); s.phase = 'set'; s.word = ''; s.guessed = []; s.wrong = 0;
        }
      }
    },

    render(v, ui, c, api){
      const P = api.P;
      const iSet = P.isMe(v.setter);
      clear(ui.center); clear(ui.actions);

      /* --- poner la palabra --- */
      if(v.phase === 'set'){
        if(iSet){
          ui.status(`Ronda ${v.round} — escribe una palabra para ${P.name(P.them)}`, 'me');
          const inp = el('input', { class:'g-input', type:'text', maxlength:'18', placeholder:'Una palabra o frase corta',
                                    autocapitalize:'characters', value:draft,
                                    oninput:(e) => draft = e.target.value });
          ui.center.append(inp);
          ui.btn('✅ Lista', () => { if(norm(draft).replace(/ /g,'').length < 3){ ui.status('Mínimo 3 letras', 'me'); return; }
                                     api.act({ word: draft }); draft = ''; }, 'primary');
        }else{
          ui.status(`Ronda ${v.round} — ${P.name(P.them)} está pensando una palabra…`, 'them');
          ui.center.append(el('div', { class:'big-emoji', text:'🤔' }));
        }
        return;
      }

      /* --- adivinar --- */
      ui.status(iSet ? `${P.name(P.them)} está adivinando…` : `Te quedan ${MAX - v.wrong} intentos`,
                iSet ? 'them' : 'me');

      ui.center.append(
        el('pre', { class:'hang', text: MUNECO[v.wrong] || '' }),
        el('div', { class:'word' }, ...v.mask.map(ch =>
          el('span', { class:'letter' + (ch === ' ' ? ' space' : '') + (ch ? ' on' : ''), text: ch || '' }))),
      );

      if(!iSet){
        const kb = el('div', { class:'kb' });
        ABC.forEach(L => kb.append(el('button', {
          class:'key' + (v.guessed.includes(L) ? (v.mask.includes(L) ? ' good' : ' bad') : ''),
          text:L,
          onclick:() => { if(v.guessed.includes(L)) return; beep(640, .05); vibrate(12); api.act({ letter:L }); },
        })));
        ui.center.append(kb);
      }
      ui.actions.append(el('div', { class:'g-pill', text:`Ronda ${v.round}/2 · ${v.score[P.me]} — ${v.score[P.them]}` }));
    },
  }, { scroll:true });
};
