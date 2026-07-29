/* Preguntas para conocerse — mazo cooperativo, sin ganador ni perdedor.
   Sale una carta, la contesta a quien le toca (por chat o por llamada) y
   pasan a la siguiente. */
import { turnGame, el, clear, beep, shuffled } from './lib/kit.js';

const CARTAS = [
  '¿Qué es lo que más te gusta de nuestra relación?',
  '¿Cuál fue el momento en que sentiste "esto va en serio"?',
  'Si pudiéramos vivir en cualquier ciudad, ¿cuál elegirías y por qué?',
  '¿Qué canción pondrías si tuviéramos que bailar juntos ahorita?',
  '¿Cómo te imaginas nuestro día perfecto cuando estemos juntos?',
  '¿Qué es algo de ti que crees que todavía no conozco?',
  '¿Cuál es tu recuerdo favorito de tu infancia?',
  '¿Qué te da más miedo de la distancia? Dilo honesto.',
  '¿Qué es lo más valiente que has hecho?',
  '¿Cómo te gusta que te consuelen cuando estás triste?',
  '¿Qué tres cosas quieres que hagamos juntos este año?',
  '¿Qué te hace sentir más querido/a?',
  '¿Qué le dirías a la versión de ti de hace 5 años?',
  'Si tuviéramos una casa, ¿cómo sería la sala?',
  '¿Qué es algo que te gustaría aprender conmigo?',
  '¿Cuál es tu forma favorita de perder el tiempo?',
  '¿Qué es lo que más te enorgullece de ti?',
  '¿Qué cosa pequeña mía te hace sonreír?',
];
const TOTAL = 14;

export default (ctx) => turnGame(ctx, {
  init(c, P){
    return { deck: shuffled(CARTAS, c.rng), n:1, turn:P.host };
  },

  action(s, a, from, api){
    if(!a.next || from !== s.turn) return;
    if(s.n >= TOTAL) return api.finish('draw', 'Se acabó el mazo ❤️');
    s.n++;
    s.turn = api.P.other(from);
  },

  render(s, ui, c, api){
    const P = api.P;
    const mine = P.isMe(s.turn);
    clear(ui.center); clear(ui.actions);

    ui.status(mine ? 'Te toca contestar 💌' : `Contesta ${P.name(P.them)}`, mine ? 'me' : 'them');
    ui.center.append(
      el('div', { class:'pq-card' },
        el('span', { class:'pq-n', text:`${s.n} / ${TOTAL}` }),
        el('p', { text: s.deck[(s.n - 1) % s.deck.length] })));

    if(mine) ui.btn(s.n >= TOTAL ? '❤️ Terminar' : '➡️ Ya contesté', () => { beep(700, .08); api.act({ next:1 }); }, 'primary');
    else     ui.center.append(el('p', { class:'vr-hint', text:'Cuando conteste, pasa la siguiente carta.' }));
  },
}, { scroll:true });
