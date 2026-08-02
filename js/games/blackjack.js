/* Blackjack — 5 rondas contra la casa, los dos a la vez.

   Cada quien juega su mano contra el mismo crupier (lo lleva el anfitrión).
   No hay turnos: los dos piden o se plantan a su ritmo, y cuando ambos
   terminan, la casa destapa y roba hasta 17. Ganarle a la casa da 2 puntos,
   empatar 1. Al final de las 5 rondas gana quien tenga más puntos.

   La carta tapada de la casa NO viaja al invitado hasta que se destapa
   (view la recorta), para que nadie pueda hacer trampa mirando la red. */
import { turnGame, el, clear, beep, vibrate, shuffled,
         sfxFlip, sfxWin, sfxError, chord } from './lib/kit.js';

const RONDAS = 5;
const PALOS = ['♠', '♥', '♦', '♣'];
const RANGOS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

/* dos barajas: 5 rondas de dos jugadores nunca las agotan */
function mazo(rng){
  const cartas = [];
  for(let d = 0; d < 2; d++)
    for(const p of PALOS) for(const r of RANGOS) cartas.push(r + p);
  return shuffled(cartas, rng);
}

const rango = (c) => c.slice(0, -1);
const palo  = (c) => c.slice(-1);

function valor(cartas){
  let suma = 0, ases = 0;
  for(const c of cartas){
    const r = rango(c);
    if(r === 'A'){ suma += 11; ases++; }
    else if('JQK'.includes(r)) suma += 10;
    else suma += Number(r);
  }
  while(suma > 21 && ases > 0){ suma -= 10; ases--; }   // el as baja a 1 si hace falta
  return suma;
}

export default (ctx) => turnGame(ctx, {
  init(c, P){
    const s = {
      deck: mazo(c.rng), di: 0,
      round: 1, phase: 'play',
      hands: { [P.host]: { c: [], done: false }, [P.guest]: { c: [], done: false } },
      dealer: [],
      pts: { [P.host]: 0, [P.guest]: 0 },
      resultado: null,
      ids: [P.host, P.guest],
    };
    repartir(s);
    return s;
  },

  /* La carta tapada de la casa no sale del anfitrión hasta destaparse. */
  view(s){
    return {
      round: s.round, phase: s.phase, hands: s.hands, pts: s.pts, resultado: s.resultado,
      dealer: s.phase === 'play' ? [s.dealer[0], null] : s.dealer,
    };
  },

  action(s, a, from, api){
    const P = api.P;
    const mano = s.hands[from];

    if(a.hit && s.phase === 'play' && mano && !mano.done){
      mano.c.push(roba(s));
      if(valor(mano.c) >= 21) mano.done = true;      // 21 o pasado: ya no pide más
      if(s.ids.every(id => s.hands[id].done)) juegaLaCasa(s);
      return;
    }

    if(a.stand && s.phase === 'play' && mano && !mano.done){
      mano.done = true;
      if(s.ids.every(id => s.hands[id].done)) juegaLaCasa(s);
      return;
    }

    if(a.next && s.phase === 'reveal'){
      if(s.round >= RONDAS){
        const mios = s.pts[P.me], suyos = s.pts[P.them];
        return api.finish(mios > suyos ? 'me' : mios < suyos ? 'them' : 'draw',
                          `${mios} — ${suyos} puntos contra la casa`);
      }
      s.round++;
      s.phase = 'play';
      s.resultado = null;
      repartir(s);
    }
  },

  render(v, ui, c, api){
    const P = api.P;
    clear(ui.center); clear(ui.actions);

    const mia = v.hands[P.me], suya = v.hands[P.them];
    const vd = v.phase === 'play' ? valor([v.dealer[0]]) : valor(v.dealer);

    ui.status(v.phase === 'play'
      ? (mia.done ? (suya.done ? 'Juega la casa…' : `Esperando a ${P.name(P.them)}…`)
                  : `Ronda ${v.round}/${RONDAS} — llevas ${valor(mia.c)}`)
      : `Ronda ${v.round}/${RONDAS} — la casa hizo ${vd}${vd > 21 ? ' (se pasó)' : ''}`,
      mia.done ? 'them' : 'me');

    const fila = (titulo, cartas, extra = '') => el('div', { class:'bj-fila' },
      el('div', { class:'bj-titulo', text: titulo + (extra ? ` · ${extra}` : '') }),
      el('div', { class:'bj-mano' }, ...cartas.map(carta =>
        carta == null
          ? el('span', { class:'bj-card oculta' })
          : el('span', { class:'bj-card' + ('♥♦'.includes(palo(carta)) ? ' roja' : '') },
              el('b', { text: rango(carta) }), el('i', { text: palo(carta) })))));

    const marca = (id) => {
      const val = valor(v.hands[id].c);
      const res = v.resultado?.[id];
      if(res) return res === 'gana' ? `${val} · ¡gana! +2` : res === 'empata' ? `${val} · empate +1` : `${val} · pierde`;
      return val > 21 ? `${val} ¡se pasó!` : String(val);
    };

    ui.center.append(
      fila('La casa', v.dealer, v.phase === 'play' ? '?' : String(vd)),
      fila('Tú', mia.c, marca(P.me)),
      fila(P.name(P.them), suya.c, marca(P.them)),
      el('div', { class:'g-pill', text:`Puntos: tú ${v.pts[P.me]} — ${v.pts[P.them]} ${P.name(P.them)}` }),
    );

    if(v.phase === 'play' && !mia.done){
      ui.btn('🂠 Pedir', () => { sfxFlip(); vibrate(12); api.act({ hit:1 }); }, 'primary');
      ui.btn('✋ Plantarse', () => { beep(500, .07); api.act({ stand:1 }); });
    }else if(v.phase === 'reveal'){
      const gane = v.resultado?.[P.me] === 'gana';
      gane ? chord([660, 880], .15) : null;
      ui.btn(v.round >= RONDAS ? '🏁 Ver resultado' : '➡️ Siguiente ronda', () => api.act({ next:1 }), 'primary');
    }
  },
}, { scroll:true });

/* --- ayudantes del anfitrión --- */

function roba(s){
  if(s.di >= s.deck.length - 1){ s.deck = shuffled(s.deck, Math.random); s.di = 0; }
  return s.deck[s.di++];
}

function repartir(s){
  for(const id of s.ids) s.hands[id] = { c: [roba(s), roba(s)], done: valor([]) === 21 };
  s.dealer = [roba(s), roba(s)];
  /* 21 de entrada: esa mano ya está servida */
  for(const id of s.ids) if(valor(s.hands[id].c) === 21) s.hands[id].done = true;
}

function juegaLaCasa(s){
  while(valor(s.dealer) < 17) s.dealer.push(roba(s));
  const casa = valor(s.dealer);
  s.resultado = {};
  for(const id of s.ids){
    const v = valor(s.hands[id].c);
    if(v > 21) s.resultado[id] = 'pierde';
    else if(casa > 21 || v > casa){ s.resultado[id] = 'gana'; s.pts[id] += 2; }
    else if(v === casa){ s.resultado[id] = 'empata'; s.pts[id] += 1; }
    else s.resultado[id] = 'pierde';
  }
  s.phase = 'reveal';
}
