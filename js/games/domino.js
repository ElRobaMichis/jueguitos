/* Dominó — doble seis, 7 fichas cada quien */
import { turnGame, turnText, turnClass, el, clear, beep, vibrate, shuffled } from './lib/kit.js';

const pips = (t) => t[0] + t[1];
const fits = (t, v) => t[0] === v || t[1] === v;

export default (ctx) => {
  let picked = null;                                  // ficha seleccionada (local)

  return turnGame(ctx, {
    init(c, P){
      const all = [];
      for(let a = 0; a <= 6; a++) for(let b = a; b <= 6; b++) all.push([a, b]);
      const deck = shuffled(all, c.rng);
      const hands = { [P.host]: deck.slice(0, 7), [P.guest]: deck.slice(7, 14) };

      // Empieza quien tenga el doble más alto; si nadie, el anfitrión.
      let turn = P.host, best = -1;
      for(const id of [P.host, P.guest])
        for(const t of hands[id]) if(t[0] === t[1] && t[0] > best){ best = t[0]; turn = id; }

      return { hands, chain: [], pool: deck.slice(14), turn, passes: 0, ids:[P.host, P.guest] };
    },

    view(s, who){
      const other = s.ids.find(i => i !== who);
      return {
        chain: s.chain, turn: s.turn, pool: s.pool.length,
        hand: s.hands[who], theirCount: s.hands[other].length,
      };
    },

    action(s, a, from, api){
      const P = api.P;
      if(from !== s.turn) return;
      const hand = s.hands[from];

      if(a.draw){
        if(!s.pool.length) return;
        hand.push(s.pool.pop());
        return;
      }
      if(a.pass){
        if(s.pool.length) return;                     // primero hay que robar
        s.passes++;
        if(s.passes >= 2){
          const mine = s.hands[P.me].reduce((n, t) => n + pips(t), 0);
          const their = s.hands[P.them].reduce((n, t) => n + pips(t), 0);
          return api.finish(mine < their ? 'me' : mine > their ? 'them' : 'draw', `Cerrado · ${mine} vs ${their} puntos`);
        }
        s.turn = P.other(from);
        return;
      }

      const t = hand[a.i];
      if(!t) return;
      if(!s.chain.length){
        s.chain.push([...t]);
      }else{
        const L = s.chain[0][0], R = s.chain.at(-1)[1];
        if(a.side === 'L'){
          if(!fits(t, L)) return;
          s.chain.unshift(t[1] === L ? [t[0], t[1]] : [t[1], t[0]]);
        }else{
          if(!fits(t, R)) return;
          s.chain.push(t[0] === R ? [t[0], t[1]] : [t[1], t[0]]);
        }
      }
      hand.splice(a.i, 1);
      s.passes = 0;

      if(!hand.length)
        return api.finish(P.isMe(from) ? 'me' : 'them', '¡Dominó!');
      s.turn = P.other(from);
    },

    render(v, ui, c, api){
      const P = api.P;
      const myTurn = P.isMe(v.turn);
      const L = v.chain.length ? v.chain[0][0] : null;
      const R = v.chain.length ? v.chain.at(-1)[1] : null;
      const canPlay = (t) => !v.chain.length || fits(t, L) || fits(t, R);

      ui.status(turnText(P, v.turn, `Pozo: ${v.pool} · ${P.name(P.them)}: ${v.theirCount}`), turnClass(P, v.turn));

      /* --- cadena --- */
      const chain = el('div', { class:'dom-chain' });
      if(!v.chain.length) chain.append(el('div', { class:'dom-empty', text:'Pon la primera ficha' }));
      v.chain.forEach(t => chain.append(tile(t, false)));

      /* --- mano --- */
      const hand = el('div', { class:'dom-hand' });
      (v.hand || []).forEach((t, i) => {
        const ok = myTurn && canPlay(t);
        const n = tile(t, true);
        n.className += ' dom-p' + (ok ? '' : ' off') + (picked === i ? ' sel' : '');
        n.onclick = () => {
          if(!ok) return;
          beep(560, .05); vibrate(15);
          const bothEnds = v.chain.length && fits(t, L) && fits(t, R) && L !== R;
          if(!v.chain.length)        api.act({ i, side:'R' });
          else if(bothEnds)          { picked = (picked === i ? null : i); api.redraw(); }
          else                       api.act({ i, side: fits(t, L) ? 'L' : 'R' });
        };
        hand.append(n);
      });

      clear(ui.center).append(
        el('div', { class:'dom-ends', text: v.chain.length ? `Puntas: ${L} y ${R}` : '' }),
        chain, hand);

      clear(ui.actions);
      if(myTurn && picked != null){
        ui.status('¿De qué lado la pones?', 'me');
        ui.btn(`◀ Izquierda (${L})`, () => { const i = picked; picked = null; api.act({ i, side:'L' }); }, 'primary');
        ui.btn(`Derecha (${R}) ▶`, () => { const i = picked; picked = null; api.act({ i, side:'R' }); }, 'primary');
      }else if(myTurn && !(v.hand || []).some(canPlay)){
        if(v.pool) ui.btn(`🫳 Robar del pozo (${v.pool})`, () => api.act({ draw:1 }), 'primary');
        else       ui.btn('🙅 Pasar', () => api.act({ pass:1 }), 'primary');
      }
    },
  });
};

function tile([a, b], vertical){
  return el('div', { class:'dom-tile' + (vertical ? ' v' : '') },
    el('span', { class:'dom-half', text: dots(a) }),
    el('span', { class:'dom-bar' }),
    el('span', { class:'dom-half', text: dots(b) }));
}
const dots = (n) => ['', '⠁', '⠃', '⠇', '⠋', '⠟', '⠿'][n] || '';
