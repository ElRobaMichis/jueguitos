/* Ahorcado — dos rondas: cada quien pone una palabra y el otro adivina.

   Dos cosas que faltaban y arruinaban la mitad del juego:
   quien ponía la palabra se quedaba mirando sin ver qué letras intentaba el
   otro (aburridísimo), y al fallar nunca se decía cuál era la palabra. Ahora
   el que pone ve el teclado con los aciertos y los errores en vivo, y cada
   ronda termina enseñando la palabra. */
import { turnGame, el, clear, beep, vibrate,
         sfxError, sfxCapture, chord } from './lib/kit.js';

const ABC = 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ'.split('');
const MAX = 6;
const norm = (s) => s.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-ZÑ ]/g, '');
const MUNECO = ['', '😵', '😵\n |', '😵\n/|', '😵\n/|\\', '😵\n/|\\\n/', '😵\n/|\\\n/ \\'];

export default (ctx) => {
  let draft = '', vistas = -1;

  return turnGame(ctx, {
    init(c, P){
      return { round:1, setter:P.host, word:'', guessed:[], wrong:0, phase:'set',
               score:{ [P.host]:0, [P.guest]:0 }, last:null, k:0 };
    },

    /* La palabra sólo la ve quien la puso… hasta que se revela al final. */
    view(s, who){
      const abierto = s.phase === 'reveal' || who === s.setter;
      return {
        round:s.round, setter:s.setter, phase:s.phase, wrong:s.wrong, guessed:s.guessed,
        score:s.score, last:s.last, k:s.k,
        mask: [...s.word].map(ch => (ch === ' ' || s.guessed.includes(ch) || abierto) ? ch : null),
        aciertos: [...new Set([...s.word])].filter(ch => ch !== ' ' && s.guessed.includes(ch)),
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
        const acierto = s.word.includes(L);
        if(!acierto) s.wrong++;
        s.k++;

        const resuelta = [...s.word].every(ch => ch === ' ' || s.guessed.includes(ch));
        const colgado = s.wrong >= MAX;
        if(resuelta || colgado){
          const pts = resuelta ? (MAX + 1) - s.wrong : 0;
          s.score[from] += pts;
          s.phase = 'reveal';
          s.last = { word:s.word, resuelta, pts, quien:from };
        }
        return;
      }

      if(a.next && s.phase === 'reveal'){
        if(s.round >= 2){
          const mine = s.score[P.me], their = s.score[P.them];
          return api.finish(mine > their ? 'me' : mine < their ? 'them' : 'draw', `${mine} — ${their} puntos`);
        }
        s.round = 2; s.setter = P.other(s.setter); s.phase = 'set';
        s.word = ''; s.guessed = []; s.wrong = 0; s.last = null;
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
                                    autocapitalize:'characters', autocomplete:'off', value:draft,
                                    oninput:(e) => draft = e.target.value });
          ui.center.append(inp);
          ui.btn('✅ Lista', () => {
            if(norm(draft).replace(/ /g, '').length < 3){ sfxError(); ui.status('Mínimo 3 letras', 'me'); return; }
            api.act({ word: draft }); draft = '';
          }, 'primary');
        }else{
          ui.status(`Ronda ${v.round} — ${P.name(P.them)} está pensando una palabra…`, 'them');
          ui.center.append(el('div', { class:'big-emoji', text:'🤔' }));
        }
        return;
      }

      /* --- se revela la palabra al terminar la ronda --- */
      if(v.phase === 'reveal'){
        const l = v.last || {};
        const gané = P.isMe(l.quien);
        ui.status(l.resuelta ? (gané ? '¡La sacaste! 🎉' : `${P.name(P.them)} la sacó`)
                             : (iSet ? 'No la sacó 😈' : 'Te colgaron 💀'),
                  l.resuelta === !iSet ? 'me' : 'them');
        ui.center.append(
          el('pre', { class:'hang', text: l.resuelta ? '' : MUNECO[MAX] }),
          el('div', { class:'ah-era' },
             el('span', { text:'La palabra era' }),
             el('strong', { text: l.word || '' })),
          el('div', { class:'g-pill', text: l.resuelta ? `+${l.pts} puntos para ${P.name(l.quien)}`
                                                       : 'sin puntos esta ronda' }),
          el('div', { class:'g-pill', text:`${v.score[P.me]} — ${v.score[P.them]}` }));
        ui.btn(v.round >= 2 ? '🏁 Ver resultado' : '➡️ Siguiente ronda', () => api.act({ next:1 }), 'primary');
        return;
      }

      /* --- adivinando --- */
      if(v.k !== vistas){
        vistas = v.k;
        if(v.k > 0) (v.wrong && v.guessed.length && !v.aciertos.includes(v.guessed.at(-1)))
          ? (sfxError(), vibrate(60)) : (chord([700, 900], .12), vibrate(15));
      }

      ui.status(iSet ? `${P.name(P.them)} adivina · ${MAX - v.wrong} intentos le quedan`
                     : `Te quedan ${MAX - v.wrong} intentos`,
                iSet ? 'them' : 'me');

      ui.center.append(
        el('pre', { class:'hang', text: MUNECO[v.wrong] || '' }),
        el('div', { class:'word' }, ...v.mask.map(ch =>
          el('span', { class:'letter' + (ch === ' ' ? ' space' : '') + (ch ? ' on' : ''), text: ch || '' }))),
      );

      /* El teclado lo ven los dos: el que adivina para jugar, el que puso la
         palabra para seguir la partida (antes se quedaba a ciegas). */
      const kb = el('div', { class:'kb' + (iSet ? ' mirando' : '') });
      ABC.forEach(L => {
        const usada = v.guessed.includes(L);
        const buena = usada && v.aciertos.includes(L);
        const b = el('button', {
          class:'key' + (usada ? (buena ? ' good' : ' bad') : ''),
          text:L,
          onclick:() => { if(iSet || usada) return; beep(640, .05); vibrate(12); api.act({ letter:L }); },
        });
        b.disabled = iSet || usada;
        kb.append(b);
      });
      ui.center.append(kb);
      ui.actions.append(el('div', { class:'g-pill', text:`Ronda ${v.round}/2 · ${v.score[P.me]} — ${v.score[P.them]}` }));
    },
  }, { scroll:true });
};
