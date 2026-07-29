/* ¿Me conoces? — 8 rondas.
   La pregunta es sobre uno de los dos: esa persona escribe su respuesta de
   verdad (en secreto), la otra intenta adivinarla, y luego se revelan. */
import { turnGame, el, clear, beep, vibrate, shuffled } from './lib/kit.js';

const PREGUNTAS = [
  'mi comida favorita', 'la canción que más me gusta', 'mi color favorito',
  'lo que más me da miedo', 'mi película favorita', 'a dónde quiero viajar contigo',
  'mi manía más rara', 'lo primero que pensé de ti', 'mi postre favorito',
  'qué hago cuando estoy nervioso/a', 'mi día favorito de la semana', 'mi mayor sueño',
  'qué animal me gustaría ser', 'mi recuerdo favorito de nosotros', 'qué me pone de mal humor',
  'mi apodo favorito para ti', 'qué haría con un millón de pesos', 'mi materia favorita en la escuela',
];
const ROUNDS = 8;

export default (ctx) => {
  let draft = '';

  return turnGame(ctx, {
    init(c, P){
      return { qs: shuffled(PREGUNTAS, c.rng), round:1, subject:P.host, phase:'answer',
               truth:'', guess:'', score:{ [P.host]:0, [P.guest]:0 } };
    },

    view(s, who){
      const isSubject = who === s.subject;
      return {
        round:s.round, subject:s.subject, phase:s.phase, score:s.score,
        q: s.qs[(s.round - 1) % s.qs.length],
        truth: (s.phase === 'reveal' || isSubject) ? s.truth : '',
        guess: (s.phase === 'reveal' || !isSubject) ? s.guess : '',
        hasTruth: !!s.truth,
      };
    },

    action(s, a, from, api){
      const P = api.P;
      if(a.truth != null && from === s.subject && s.phase === 'answer'){
        if(!String(a.truth).trim()) return;
        s.truth = String(a.truth).slice(0, 60); s.phase = 'guess';
        return;
      }
      if(a.guess != null && from !== s.subject && s.phase === 'guess'){
        if(!String(a.guess).trim()) return;
        s.guess = String(a.guess).slice(0, 60); s.phase = 'reveal';
        return;
      }
      if(a.judge != null && from === s.subject && s.phase === 'reveal'){
        if(a.judge) s.score[P.other(s.subject)] += 1;
        if(s.round >= ROUNDS){
          const mine = s.score[P.me], their = s.score[P.them];
          return api.finish(mine > their ? 'me' : mine < their ? 'them' : 'draw',
                            `${mine} — ${their} · ${mine === their ? 'se conocen igualito' : 'sabes más de la otra persona'}`);
        }
        s.round++; s.subject = P.other(s.subject); s.phase = 'answer'; s.truth = ''; s.guess = '';
      }
    },

    render(v, ui, c, api){
      const P = api.P;
      const iAm = P.isMe(v.subject);
      clear(ui.center); clear(ui.actions);

      const head = el('div', { class:'tv-q' },
        el('span', { class:'tv-round', text:`Ronda ${v.round}/${ROUNDS}` }),
        el('h3', { text: iAm ? `¿Cuál es ${v.q}?` : `¿Cuál es ${v.q} de ${P.name(P.them)}?` }));
      ui.center.append(head);

      if(v.phase === 'answer'){
        if(iAm){
          ui.status('Responde la verdad (no la va a ver todavía)', 'me');
          ui.center.append(el('input', { class:'g-input', placeholder:'Tu respuesta…', value:draft,
                                         oninput:(e) => draft = e.target.value }));
          ui.btn('🔒 Guardar', () => { if(!draft.trim()) return; api.act({ truth:draft }); draft = ''; }, 'primary');
        }else{
          ui.status(`${P.name(P.them)} está escribiendo su respuesta…`, 'them');
          ui.center.append(el('div', { class:'big-emoji', text:'💭' }));
        }
        return;
      }

      if(v.phase === 'guess'){
        if(!iAm){
          ui.status('Ahora adivina 👀', 'me');
          ui.center.append(el('input', { class:'g-input', placeholder:'Creo que es…', value:draft,
                                         oninput:(e) => draft = e.target.value }));
          ui.btn('💘 Adivinar', () => { if(!draft.trim()) return; api.act({ guess:draft }); draft = ''; }, 'primary');
        }else{
          ui.status(`${P.name(P.them)} está adivinando…`, 'them');
          ui.center.append(el('div', { class:'big-emoji', text:'🤞' }));
        }
        return;
      }

      /* --- revelación --- */
      ui.status(iAm ? '¿Le atinó?' : 'A ver si le atinaste…', iAm ? 'me' : 'them');
      ui.center.append(
        el('div', { class:'tv-card' }, el('b', { text: iAm ? 'Tu respuesta' : `Respuesta de ${P.name(P.them)}` }),
                                        el('p', { text:v.truth || '…' })),
        el('div', { class:'tv-card guess' }, el('b', { text: iAm ? `${P.name(P.them)} dijo` : 'Tú dijiste' }),
                                              el('p', { text:v.guess || '…' })));
      if(iAm){
        ui.btn('✅ Sí, le atinó', () => { beep(880, .12); api.act({ judge:1 }); }, 'primary');
        ui.btn('❌ Para nada', () => { beep(300, .12); api.act({ judge:0 }); });
      }
      ui.center.append(el('div', { class:'g-pill', text:`${v.score[P.me]} — ${v.score[P.them]}` }));
    },
  }, { scroll:true });
};
