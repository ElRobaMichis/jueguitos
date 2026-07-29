/* Ludo (parchís) para dos — 4 fichas, sacas con 6, comes al rival, meta exacta.
   El tablero clásico se genera rotando un brazo 90° cuatro veces.

   Tablero y fichas son permanentes: así la ficha recorre las casillas una por
   una y la comida se ve, en vez de aparecer y desaparecer de golpe. */
import { turnGame, el, clear, beep, vibrate,
         animMs, setDie, sfxDice, sfxStep, sfxLand, sfxCapture, sfxLadder } from './lib/kit.js';

const SIZE = 15;
const rot = ([x, y]) => [SIZE - 1 - y, x];             // 90° en el sentido del reloj
const rotN = (p, n) => { let q = p; for(let i = 0; i < n; i++) q = rot(q); return q; };

const ARM = [[0,6],[1,6],[2,6],[3,6],[4,6],[5,6],[6,5],[6,4],[6,3],[6,2],[6,1],[6,0],[7,0]];
const TRACK = [0,1,2,3].flatMap(q => ARM.map(p => rotN(p, q)));
const HOME_ARM = [[1,7],[2,7],[3,7],[4,7],[5,7]];
const homeCells = (q) => [...HOME_ARM.map(p => rotN(p, q)), [7, 7]];
const BASE_ARM = [[1,1],[4,1],[1,4],[4,4]];
const baseCells = (q) => BASE_ARM.map(p => rotN(p, q));

const START = (q) => 1 + 13 * q;
const SAFE = new Set([1, 9, 14, 22, 27, 35, 40, 48]);
const LAST = 56;                                       // 0..50 pista, 51..55 pasillo, 56 meta

const cellOf = (q, rel) => rel <= 50 ? TRACK[(START(q) + rel) % 52] : homeCells(q)[rel - 51];
const pct = ([x, y]) => ({ left: (x + .5) / SIZE * 100, top: (y + .5) / SIZE * 100 });

export default (ctx) => {
  /* ---------------- piezas permanentes ---------------- */
  const board = el('div', { class:'bd bd-ludo' });
  TRACK.forEach(([x, y], i) => board.append(el('div', {
    class:'ludo-cell' + (SAFE.has(i) ? ' safe' : ''),
    style:{ gridColumn:x + 1, gridRow:y + 1 }, text: SAFE.has(i) ? '★' : '' })));

  const die = el('div', { class:'die' });
  setDie(die, 6);
  const dieWrap = el('div', { class:'die-wrap' }, die);
  const toks = {};                                      // `${id}:${k}` -> nodo
  let built = false, shown = null, playing = false, lastMove = -1, timers = [];
  const stop = () => { timers.forEach(clearTimeout); timers = []; };
  const later = (fn, ms) => timers.push(setTimeout(fn, animMs(ms)));

  const game = turnGame(ctx, {
    init(c, P){
      return {
        q: { [P.host]:0, [P.guest]:2 },
        tok: { [P.host]:[-1,-1,-1,-1], [P.guest]:[-1,-1,-1,-1] },
        turn: P.host, dice: null, note: 'Tira el dado', move:null, k:0,
      };
    },

    action(s, a, from, api){
      const P = api.P;
      if(from !== s.turn) return;

      if(a.roll){
        if(s.dice != null) return;
        const d = 1 + Math.floor(Math.random() * 6);
        s.dice = d;
        s.note = `Salió ${d}`;
        s.k++;
        s.move = { k:s.k, kind:'roll', d };
        if(!movable(s, from, d).length){
          s.note = `Salió ${d} — sin movimientos 😕`;
          s.dice = null;
          s.turn = P.other(from);
        }
        return;
      }

      if(a.t == null || s.dice == null) return;
      const d = s.dice;
      if(!movable(s, from, d).includes(a.t)) return;

      const cur = s.tok[from][a.t];
      const next = cur === -1 ? 0 : cur + d;
      if(next > LAST) return;
      s.tok[from][a.t] = next;

      const other = P.other(from);
      const comidas = [];
      if(next <= 50 && !SAFE.has((START(s.q[from]) + next) % 52)){
        const miCelda = cellOf(s.q[from], next).join(',');
        s.tok[other].forEach((p, k) => {
          if(p >= 0 && p <= 50 && cellOf(s.q[other], p).join(',') === miCelda){
            s.tok[other][k] = -1;
            comidas.push(k);
          }
        });
      }
      if(comidas.length) s.note = '¡Te comió una ficha! 😈';

      s.k++;
      s.move = { k:s.k, kind:'walk', id:from, t:a.t, from:cur, to:next, d, other, comidas };

      if(s.tok[from].every(p => p === LAST))
        return api.finish(P.isMe(from) ? 'me' : 'them', '¡Metió las 4 fichas!');

      const again = d === 6 || next === LAST;
      s.dice = null;
      if(!again) s.turn = other;
      else s.note = (next === LAST ? '¡Metiste una ficha! ' : '¡Sacaste 6! ') + 'Tiras otra vez';
    },

    render(s, ui, c, api){
      const P = api.P;

      /* --- construcción única de zonas, pasillos y fichas --- */
      if(!built){
        built = true;
        for(const id of [P.host, P.guest]){
          const q = s.q[id];
          const a = rotN([0, 0], q), b = rotN([5, 5], q);
          board.append(el('div', { class:'ludo-base', style:{
            gridColumn:`${Math.min(a[0], b[0]) + 1} / span 6`,
            gridRow:`${Math.min(a[1], b[1]) + 1} / span 6`,
            background:P.color(id) + '22', borderColor:P.color(id) } }));
          homeCells(q).forEach(([x, y]) => board.append(el('div', {
            class:'ludo-cell home', style:{ gridColumn:x + 1, gridRow:y + 1, background:P.color(id) + '55' } })));
        }
        for(const id of [P.host, P.guest])
          for(let k = 0; k < 4; k++){
            const n = el('button', { class:'ludo-tok', style:{ background:P.color(id) }, title:P.name(id) });
            toks[`${id}:${k}`] = n;
            board.append(n);
          }
      }
      if(!shown) shown = { [P.host]:[...s.tok[P.host]], [P.guest]:[...s.tok[P.guest]] };

      const place = () => {
        for(const id of [P.host, P.guest]){
          const q = s.q[id];
          let parked = 0;
          shown[id].forEach((p, k) => {
            const cell = p === -1 ? baseCells(q)[parked++] : cellOf(q, p);
            const { left, top } = pct(cell);
            const n = toks[`${id}:${k}`];
            n.style.left = left + '%';
            n.style.top  = top + '%';
            n.textContent = p === LAST ? '★' : '';
          });
        }
      };
      place();

      /* --- animación de la jugada --- */
      if(s.move && s.move.k !== lastMove){
        lastMove = s.move.k;
        animar(s.move);
      }

      const myTurn = P.isMe(s.turn);
      const canMove = myTurn && s.dice != null && !playing ? movable(s, P.me, s.dice) : [];

      for(const id of [P.host, P.guest])
        for(let k = 0; k < 4; k++){
          const n = toks[`${id}:${k}`];
          const puedo = id === P.me && canMove.includes(k);
          n.classList.toggle('can', puedo);
          n.onclick = puedo ? () => { beep(720, .07); vibrate(20); api.act({ t:k }); } : null;
        }

      ui.status(playing ? `🎲 ${s.dice ?? ''}…`
                        : (myTurn ? 'Tu turno' : `Turno de ${P.name(P.them)}`) + ' · ' + s.note,
                playing ? '' : (myTurn ? 'me' : 'them'));

      if(!ui.center.contains(board)){ clear(ui.center); ui.center.append(board); }

      clear(ui.actions);
      ui.actions.append(dieWrap);
      if(myTurn && s.dice == null && !playing)
        ui.btn('🎲 Tirar dado', () => api.act({ roll:1 }), 'primary');
      else if(myTurn && !playing)
        ui.actions.append(el('div', { class:'g-pill dice', text:'Elige ficha' }));

      function animar(mv){
        stop();
        if(mv.kind === 'roll'){
          playing = true;
          die.classList.add('rolling'); sfxDice();
          for(let i = 1; i <= 5; i++) later(() => setDie(die, 1 + Math.floor(Math.random() * 6)), i * 120);
          later(() => {
            die.classList.remove('rolling');
            setDie(die, mv.d);
            die.classList.add('pop'); later(() => die.classList.remove('pop'), 320);
            beep(660, .07);
            playing = false;
            api.redraw();
          }, 700);
          return;
        }

        /* camina casilla por casilla */
        playing = true;
        const pasos = [];
        if(mv.from === -1){ pasos.push(0); }
        else for(let p = mv.from + 1; p <= mv.to; p++) pasos.push(p);

        pasos.forEach((p, i) => later(() => {
          shown[mv.id][mv.t] = p;
          place();
          p === LAST ? sfxLadder() : sfxStep(i);
        }, i * 125));

        later(() => {
          if(mv.comidas?.length){
            mv.comidas.forEach(k => {
              const n = toks[`${mv.other}:${k}`];
              n.classList.add('eaten');
              later(() => n.classList.remove('eaten'), 600);
              shown[mv.other][k] = -1;
            });
            sfxCapture(); vibrate([30, 50, 30]);
          }else sfxLand();
          place();
          playing = false;
          api.redraw();
        }, pasos.length * 125 + 140);
      }
    },
  }, { scroll:false });

  return { resync: game.resync, destroy(){ stop(); game.destroy(); } };
};

/* Índices de fichas que se pueden mover con ese dado. */
function movable(s, id, d){
  const out = [];
  s.tok[id].forEach((p, k) => {
    if(p === -1){ if(d === 6) out.push(k); return; }
    if(p === LAST) return;
    if(p + d <= LAST) out.push(k);
  });
  return out;
}
