/* Verdad o Reto — 10 turnos (5 cada quien). Cumplir vale 2 puntos, pasar 0. */
import { turnGame, el, clear, beep, vibrate, shuffled } from './lib/kit.js';

const VERDADES = [
  '¿Qué fue lo primero que pensaste cuando me viste?',
  '¿Cuál ha sido tu momento más vergonzoso?',
  '¿Qué es lo que más extrañas de mí ahorita?',
  '¿Alguna vez me mentiste con algo chiquito? ¿Qué fue?',
  '¿Qué canción te recuerda a mí?',
  '¿Cuál es tu miedo más grande sobre el futuro?',
  '¿Qué es lo más cursi que has hecho por alguien?',
  '¿Qué hábito mío te da más ternura?',
  '¿Qué es algo que nunca le has contado a nadie?',
  '¿Cuál es tu plan ideal conmigo cuando nos veamos?',
  '¿Qué te hizo saber que te gustaba?',
  '¿Qué es lo que más te cuesta decirme?',
  '¿Qué apodo mío odias en secreto?',
  '¿De qué te arrepientes de este año?',
];
const RETOS = [
  'Manda un audio cantando el coro de nuestra canción.',
  'Cuenta 3 cosas que te gustan de mí sin repetir ninguna.',
  'Manda una selfie con la cara más ridícula que puedas.',
  'Habla como bebé durante los siguientes 2 minutos.',
  'Escribe un poema de 4 líneas sobre mí en 60 segundos.',
  'Imita mi forma de hablar en un audio.',
  'Manda una foto de lo que estás viendo ahorita mismo.',
  'Di algo bonito de ti mismo/a (sin bromas).',
  'Baila 15 segundos sin música y mándalo.',
  'Cuenta un chiste malísimo, obligatorio que dé pena.',
  'Escribe nuestro nombre de pareja ideal.',
  'Manda un mensaje de voz diciendo lo que harías si estuviera ahí.',
];
const TURNS = 10;

export default (ctx) => turnGame(ctx, {
  init(c, P){
    return { verdades: shuffled(VERDADES, c.rng), retos: shuffled(RETOS, c.rng),
             turn:P.host, n:1, pick:null, card:'', score:{ [P.host]:0, [P.guest]:0 } };
  },

  action(s, a, from, api){
    const P = api.P;
    if(from !== s.turn) return;

    if(a.pick && !s.pick){
      s.pick = a.pick;
      s.card = a.pick === 'verdad'
        ? s.verdades[(s.n - 1) % s.verdades.length]
        : s.retos[(s.n - 1) % s.retos.length];
      return;
    }
    if(a.done != null && s.pick){
      if(a.done) s.score[from] += 2;
      if(s.n >= TURNS){
        const mine = s.score[P.me], their = s.score[P.them];
        return api.finish(mine > their ? 'me' : mine < their ? 'them' : 'draw', `${mine} — ${their} puntos`);
      }
      s.n++; s.pick = null; s.card = ''; s.turn = P.other(from);
    }
  },

  render(s, ui, c, api){
    const P = api.P;
    const mine = P.isMe(s.turn);
    clear(ui.center); clear(ui.actions);

    ui.status(`Turno ${s.n}/${TURNS} · ${mine ? 'Te toca' : `Le toca a ${P.name(P.them)}`}`, mine ? 'me' : 'them');

    if(!s.pick){
      ui.center.append(el('div', { class:'big-emoji', text:'🍒' }),
                       el('p', { class:'vr-hint', text: mine ? 'Escoge una' : `${P.name(P.them)} está escogiendo…` }));
      if(mine){
        ui.btn('💬 Verdad', () => { beep(700, .08); api.act({ pick:'verdad' }); }, 'primary');
        ui.btn('🔥 Reto',   () => { beep(520, .08); api.act({ pick:'reto' }); }, 'primary');
      }
    }else{
      ui.center.append(
        el('div', { class:'vr-card ' + s.pick },
          el('span', { class:'vr-tag', text: s.pick === 'verdad' ? 'VERDAD' : 'RETO' }),
          el('p', { text:s.card })));
      if(mine){
        ui.btn('✅ Hecho (+2)', () => { vibrate(30); api.act({ done:1 }); }, 'primary');
        ui.btn('🙈 Paso', () => api.act({ done:0 }));
      }else{
        ui.center.append(el('p', { class:'vr-hint', text:'Esperando a que cumpla…' }));
      }
    }
    ui.center.append(el('div', { class:'g-pill', text:`${s.score[P.me]} — ${s.score[P.them]}` }));
  },
}, { scroll:true });
