/* Batalla Naval — tablero 8×8, flota de 5 barcos.
   Colocación automática (con botón para reacomodar) para que en el celular
   sea rápido; después, a disparar por turnos. Si le atinas, repites. */
import { turnGame, el, clear, beep, vibrate, rngInt, makeRng,
         sfxCapture, sfxWall, sfxDrop, chord } from './lib/kit.js';

const N = 8, FLEET = [5, 4, 3, 3, 2];
const ix = (x, y) => y * N + x;

function randomFleet(rng){
  const taken = new Set(), ships = [];
  for(const len of FLEET){
    for(let tries = 0; tries < 500; tries++){
      const horiz = rng() < 0.5;
      const x = rngInt(rng, N - (horiz ? len - 1 : 0));
      const y = rngInt(rng, N - (horiz ? 0 : len - 1));
      const cells = [];
      for(let k = 0; k < len; k++) cells.push(ix(x + (horiz ? k : 0), y + (horiz ? 0 : k)));
      if(cells.some(c => taken.has(c))) continue;
      // sin barcos pegados
      const near = new Set();
      cells.forEach(c => {
        const cx = c % N, cy = (c / N) | 0;
        for(let dy = -1; dy <= 1; dy++) for(let dx = -1; dx <= 1; dx++){
          const nx = cx + dx, ny = cy + dy;
          if(nx >= 0 && nx < N && ny >= 0 && ny < N) near.add(ix(nx, ny));
        }
      });
      if([...near].some(c => taken.has(c) && !cells.includes(c))) continue;
      cells.forEach(c => taken.add(c));
      ships.push({ len, cells, hits: [] });
      break;
    }
  }
  return ships;
}

export default (ctx) => {
  // Semilla propia de cada jugador: si no, los dos tendrían la misma flota.
  const own = [...ctx.me.id].reduce((h, ch) => (h * 33 + ch.charCodeAt(0)) >>> 0, ctx.seed >>> 0);
  let myFleet = randomFleet(makeRng(own));
  let sent = false;
  let disparos = -1, salidas = 0;   // para saber qué disparo es nuevo y cómo debe sonar

  return turnGame(ctx, {
    init(c, P){
      return { phase:'place', fleets:{}, shots:{ [P.host]:[], [P.guest]:[] }, turn:P.host, ids:[P.host, P.guest] };
    },

    view(s, who){
      const other = s.ids.find(i => i !== who);
      const mine = s.fleets[who] || [], theirs = s.fleets[other] || [];
      const cellOfShip = (fleet, i) => fleet.find(sh => sh.cells.includes(i));

      return {
        phase: s.phase, turn: s.turn,
        ready: { me: !!s.fleets[who], them: !!s.fleets[other] },
        myShips: mine.map(sh => ({ cells: sh.cells, sunk: sh.cells.every(c => (s.shots[other] || []).includes(c)) })),
        incoming: s.shots[other] || [],                 // dónde me han disparado
        outgoing: (s.shots[who] || []).map(i => ({
          i, hit: !!cellOfShip(theirs, i),
          sunk: (() => { const sh = cellOfShip(theirs, i); return sh ? sh.cells.every(c => (s.shots[who] || []).includes(c)) : false; })(),
        })),
        left: {
          me:   mine.filter(sh => !sh.cells.every(c => (s.shots[other] || []).includes(c))).length,
          them: theirs.filter(sh => !sh.cells.every(c => (s.shots[who] || []).includes(c))).length,
        },
      };
    },

    action(s, a, from, api){
      const P = api.P;
      if(a.fleet){
        s.fleets[from] = a.fleet.map(sh => ({ ...sh }));
        if(s.fleets[P.host] && s.fleets[P.guest]) s.phase = 'play';
        return;
      }
      if(s.phase !== 'play' || from !== s.turn || a.i == null) return;
      const other = P.other(from);
      if(s.shots[from].includes(a.i)) return;
      s.shots[from].push(a.i);

      const hit = (s.fleets[other] || []).some(sh => sh.cells.includes(a.i));
      const allSunk = (s.fleets[other] || []).every(sh => sh.cells.every(c => s.shots[from].includes(c)));
      if(allSunk) return api.finish(P.isMe(from) ? 'me' : 'them', '¡Hundiste toda la flota!');
      if(!hit) s.turn = other;                          // si atinas, tiras otra vez
    },

    render(v, ui, c, api){
      const P = api.P;

      /* ---------- colocación ---------- */
      if(v.phase === 'place'){
        ui.status(v.ready.me ? (v.ready.them ? '¡Listos!' : `Esperando a ${P.name(P.them)}…`)
                             : 'Acomoda tu flota', v.ready.me ? 'them' : 'me');
        clear(ui.center).append(grid(myFleet.flatMap(s => s.cells), [], [], null));
        clear(ui.actions);
        if(!v.ready.me){
          ui.btn('🔀 Otra formación', () => { myFleet = randomFleet(makeRng((Math.random() * 1e9) | 0)); api.redraw(); });
          ui.btn('⚓ ¡Listo!', () => { if(sent) return; sent = true; beep(700, .1); api.act({ fleet: myFleet }); }, 'primary');
        }
        return;
      }

      /* ---------- combate ---------- */
      const myTurn = P.isMe(v.turn);
      ui.status(myTurn ? 'Tu turno: dispara 🎯' : `Disparando ${P.name(P.them)}…`, myTurn ? 'me' : 'them');

      /* ¿hubo disparo nuevo? suena distinto si fue agua, tocado o hundido */
      const total = v.outgoing.length + v.incoming.length;
      let ultimo = null;
      if(disparos >= 0 && total > disparos){
        const mio = v.outgoing.length > salidas;
        const o = mio ? v.outgoing.at(-1) : null;
        const dio = mio ? o.hit : v.myShips.some(sh => sh.cells.includes(v.incoming.at(-1)));
        if(mio && o?.sunk){ chord([300, 220, 160], .3); vibrate([50, 60, 90]); }
        else if(dio){ sfxCapture(); vibrate(mio ? [25, 40, 25] : 80); }
        else { sfxWall(); vibrate(10); }
        ultimo = mio ? o.i : v.incoming.at(-1);
      }
      disparos = total; salidas = v.outgoing.length;

      const shotMap = new Map(v.outgoing.map(o => [o.i, o]));
      const enemy = el('div', { class:'bd bd-bn enemy' });
      for(let i = 0; i < N * N; i++){
        const o = shotMap.get(i);
        enemy.append(el('button', {
          class:'bn-cell' + (o ? (o.hit ? ' hit' : ' miss') : '') + (o?.sunk ? ' sunk' : '') +
                (ultimo === i ? ' boom' : ''),
          text: o ? (o.hit ? '💥' : '·') : '',
          onclick: () => { if(!myTurn || o) return; sfxDrop(); vibrate(25); api.act({ i }); },
        }));
      }

      const mineCells = new Set(v.myShips.flatMap(s => s.cells));
      const sunkCells = new Set(v.myShips.filter(s => s.sunk).flatMap(s => s.cells));
      const mine = el('div', { class:'bd bd-bn small' });
      for(let i = 0; i < N * N; i++){
        const shipHere = mineCells.has(i);
        const shot = v.incoming.includes(i);
        mine.append(el('div', {
          class:'bn-cell' + (shipHere ? ' ship' : '') + (shot && shipHere ? ' hit' : '') +
                (shot && !shipHere ? ' miss' : '') + (sunkCells.has(i) ? ' sunk' : '') +
                (ultimo === i ? ' boom' : ''),
          text: shot ? (shipHere ? '💥' : '·') : '',
        }));
      }

      clear(ui.center).append(
        el('div', { class:'bn-label', text:`Flota de ${P.name(P.them)} — le quedan ${v.left.them}` }), enemy,
        el('div', { class:'bn-label', text:`Tu flota — te quedan ${v.left.me}` }), mine);
      clear(ui.actions);
    },
  }, { scroll:true });
};

function grid(ship, hits, miss){
  const g = el('div', { class:'bd bd-bn' });
  const set = new Set(ship);
  for(let i = 0; i < N * N; i++) g.append(el('div', { class:'bn-cell' + (set.has(i) ? ' ship' : '') }));
  return g;
}
