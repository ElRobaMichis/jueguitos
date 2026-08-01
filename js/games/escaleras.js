/* Serpientes y Escaleras — con dado que rueda y fichas que caminan.

   El tablero y las fichas se crean una sola vez y sólo se mueven; así se
   pueden animar de verdad (si se redibujaran, darían saltos). El estado que
   viaja incluye la jugada (de dónde salió, dónde cayó y a dónde lo mandó la
   serpiente o la escalera), así los dos teléfonos ven la misma animación. */
import { turnGame, el, clear, beep, vibrate,
         animMs, setDie, sfxDice, sfxStep, sfxLand, sfxLadder, sfxSnake } from './lib/kit.js';

const JUMPS = {
  2:38, 7:14, 8:31, 15:26, 21:42, 28:84, 36:44, 51:67, 71:91, 78:98,
  16:6, 46:25, 49:11, 62:19, 64:60, 74:53, 89:68, 92:88, 95:75, 99:80,
};
const isLadder = (a) => JUMPS[a] > a;

/* posición de una casilla (1..100) en % dentro del tablero; 0 = fuera, en la salida */
function spot(n){
  if(n <= 0) return { left:5, top:105.5 };   // la salida, bajo la casilla 1
  const i = n - 1, row = Math.floor(i / 10);
  const col = row % 2 === 0 ? i % 10 : 9 - (i % 10);
  return { left: col * 10 + 5, top: (9 - row) * 10 + 5 };
}

export default (ctx) => {
  /* ---------------- piezas permanentes ---------------- */
  const board = el('div', { class:'bd bd-sl' });
  for(let row = 9; row >= 0; row--){
    for(let k = 0; k < 10; k++){
      const col = row % 2 === 0 ? k : 9 - k;
      const n = row * 10 + col + 1;
      const j = JUMPS[n];
      board.append(el('div', { class:'sl-cell' + (j ? (isLadder(n) ? ' ladder' : ' snake') : '') + (n === 100 ? ' meta' : '') },
        el('i', { class:'sl-n', text:String(n) }),
        j ? el('i', { class:'sl-j', text: isLadder(n) ? '🪜' : '🐍' }) : ''));
    }
  }
  const tokens = {};                                    // id -> nodo de la ficha
  const die = el('div', { class:'die' });
  setDie(die, 6);
  const dieWrap = el('div', { class:'die-wrap' }, die);

  let shown = null, playing = false, lastMove = -1, timers = [];
  const stop = () => { timers.forEach(clearTimeout); timers = []; };
  const later = (fn, ms) => timers.push(setTimeout(fn, animMs(ms)));

  const place = (id, n, slide = false) => {
    const t = tokens[id]; if(!t) return;
    const p = spot(n);
    t.classList.toggle('sliding', slide);
    t.style.left = p.left + '%';
    t.style.top  = p.top + '%';
  };

  const game = turnGame(ctx, {
    init(c, P){
      return { pos:{ [P.host]:0, [P.guest]:0 }, turn:P.host, dice:null, note:'Tira el dado',
               move:null, k:0 };
    },

    action(s, a, from, api){
      const P = api.P;
      if(from !== s.turn || !a.roll || s.busy) return;

      const d = 1 + Math.floor(Math.random() * 6);
      const desde = s.pos[from];
      let p = desde + d;
      if(p > 100) p = 100 - (p - 100);                  // rebota en la meta
      const cae = p;
      let nota = '';

      if(JUMPS[p] != null){
        nota = isLadder(p) ? `¡Escalera! ${p} → ${JUMPS[p]} 🪜` : `¡Serpiente! ${p} → ${JUMPS[p]} 🐍`;
        p = JUMPS[p];
      }
      s.pos[from] = p;
      s.dice = d;
      s.note = nota;
      s.k++;
      s.move = { k:s.k, id:from, from:desde, walk:cae, to:p, d };

      /* Ojo: NO se gana aquí. Antes salía el cartel de "ganaste" antes de que
         la ficha se moviera, y no se veía llegar a la meta. Se marca quién
         ganó y el aviso lo da la animación al terminar. */
      if(p >= 100){ s.win = from; return; }
      if(d !== 6) s.turn = P.other(from);
      else s.note = (nota ? nota + ' · ' : '') + '¡Sacaste 6, tiras otra vez!';
    },

    render(s, ui, c, api){
      const P = api.P;

      /* fichas: se crean una vez */
      for(const id of [P.host, P.guest]){
        if(tokens[id]) continue;
        tokens[id] = el('div', { class:'sl-tok ' + (P.isMe(id) ? 'mine' : 'foe'),
                                 style:{ background:P.color(id) },
                                 text: P.isMe(id) ? '★' : '', title:P.name(id) });
        board.append(tokens[id]);
      }
      if(!shown){ shown = { ...s.pos }; for(const id of [P.host, P.guest]) place(id, shown[id]); }

      /* ¿hay una jugada nueva que animar? */
      if(s.move && s.move.k !== lastMove){
        lastMove = s.move.k;
        animar(s.move, api);
      }

      ui.status(playing ? `🎲 ${s.dice}…`
                        : ((P.isMe(s.turn) ? 'Es tu turno' : `Turno de ${P.name(s.turn)}`) +
                           (s.note ? ' · ' + s.note : '')),
                playing ? '' : (P.isMe(s.turn) ? 'me' : 'them'));

      if(!ui.center.contains(board)){ clear(ui.center); ui.center.append(board); }

      clear(ui.actions);
      ui.actions.append(el('div', { class:'g-pill', html:
        `<span style="color:${P.color(P.me)}">●</span> ${shown[P.me]} · <span style="color:${P.color(P.them)}">●</span> ${shown[P.them]}` }));
      ui.actions.append(dieWrap);
      const puedo = P.isMe(s.turn) && !playing;
      const b = ui.btn(puedo ? '🎲 Tirar dado' : (playing ? '…' : 'Espera tu turno'),
                       () => { if(!puedo) return; api.act({ roll:1 }); }, 'primary');
      b.disabled = !puedo;

      /* ---- animación: dado → pasos → serpiente/escalera ---- */
      function animar(mv, api){
        stop();
        playing = true;
        die.classList.add('rolling');
        sfxDice();

        for(let i = 1; i <= 5; i++) later(() => setDie(die, 1 + Math.floor(Math.random() * 6)), i * 130);
        later(() => {
          die.classList.remove('rolling');
          setDie(die, mv.d);
          die.classList.add('pop');
          later(() => die.classList.remove('pop'), 320);
          beep(660, .07);

          /* camina casilla por casilla */
          const pasos = [];
          for(let n = mv.from + 1; n <= mv.walk; n++) pasos.push(n);
          pasos.forEach((n, i) => later(() => {
            shown[mv.id] = n;
            place(mv.id, n);
            sfxStep(i);
          }, i * 135));

          const finPasos = pasos.length * 135 + 120;
          later(() => {
            if(mv.walk !== mv.to){                       // serpiente o escalera
              isLadder(mv.walk) ? sfxLadder() : sfxSnake();
              vibrate(isLadder(mv.walk) ? [20, 40, 20] : 90);
              shown[mv.id] = mv.to;
              place(mv.id, mv.to, true);
              later(() => { tokens[mv.id]?.classList.remove('sliding'); terminar(); }, 850);
            }else{
              sfxLand();
              terminar();
            }
          }, finPasos);

          function terminar(){
            playing = false;
            api.redraw();
            // ahora sí: la ficha ya llegó, se puede cantar victoria
            if(s.win) api.finish(P.isMe(s.win) ? 'me' : 'them', '¡Llegó a la meta!');
          }
        }, 750);
      }
    },

  }, { scroll:false });

  return {
    resync: game.resync,
    destroy(){ stop(); game.destroy(); },     // que no queden temporizadores sueltos
  };
};
