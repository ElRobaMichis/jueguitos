/* Memorama — carrera: los dos tienen EL MISMO tablero (misma semilla) y cada
   quien juega en el suyo a la vez. Gana quien junte los 10 pares primero.

   Antes era por turnos y se sentía raro: la mitad del tiempo estabas mirando
   sin hacer nada, y las cartas del otro te llegaban tarde o no las alcanzabas
   a ver. Así nadie espera y la tensión está en el marcador del rival. */
import { raceGame, el, clear, beep, vibrate, shuffled,
         sfxFlip, chord, sfxError, sfxWin } from './lib/kit.js';

const FACES = ['🍓','🌙','🐙','🎈','🍕','🦋','⚡','🌵','🐧','🍀','🎸','🚀','🧁','🐳','🌻','🍩'];
const PARES = 10;
const ESPERA = 900;                     // lo que se ve la pareja fallada (tablero propio)

export default (ctx) => {
  let verRival = () => {};

  return raceGame(ctx, {
  setup(c, P, api){
    const picks = shuffled(FACES, c.rng).slice(0, PARES);
    const cartas = shuffled([...picks, ...picks], c.rng);

    const hechas = new Set();
    let arriba = [], bloqueado = false, intentos = 0, suAvance = 0, t0 = performance.now();

    const st = el('div', { class:'g-status me' });
    const grid = el('div', { class:'bd bd-mem' });
    const pie = el('div', { class:'g-pill' });
    c.el.append(el('div', { class:'g-wrap' }, st, el('div', { class:'g-center' }, grid),
                            el('div', { class:'g-row' }, pie)));

    const celdas = cartas.map((cara, i) => {
      const nodo = el('button', { class:'mem-card' },
        el('span', { class:'mem-inner' },
          el('span', { class:'mem-dorso', text:'❔' }),
          el('span', { class:'mem-cara', text:cara })));
      nodo.addEventListener('click', () => tocar(i));
      grid.append(nodo);
      return nodo;
    });

    const pintar = () => {
      celdas.forEach((n, i) => {
        n.classList.toggle('up', arriba.includes(i) || hechas.has(i));
        n.classList.toggle('done', hechas.has(i));
      });
      const seg = Math.round((performance.now() - t0) / 1000);
      st.textContent = api.terminado ? 'Se acabó' :
        `${hechas.size / 2} de ${PARES} pares · ⏱ ${seg}s`;
      pie.textContent = `Tú ${hechas.size / 2} — ${suAvance} ${c.peer.name}`;
    };

    function tocar(i){
      if(bloqueado || api.terminado) return;
      if(hechas.has(i) || arriba.includes(i)) return;

      arriba.push(i);
      sfxFlip(); vibrate(10);
      pintar();
      if(arriba.length < 2) return;

      const [a, b] = arriba;
      intentos++;
      if(cartas[a] === cartas[b]){
        hechas.add(a); hechas.add(b);
        arriba = [];
        chord([660, 880, 1100], .16); vibrate([20, 35, 20]);
        pintar();
        api.progress(hechas.size / 2);
        if(hechas.size === cartas.length){
          const seg = ((performance.now() - t0) / 1000).toFixed(1);
          sfxWin();
          api.progress(PARES, { force:true });
          api.gano(`¡Los 10 pares en ${seg}s y ${intentos} intentos!`);
        }
        return;
      }

      bloqueado = true;
      sfxError();
      setTimeout(() => {
        arriba = []; bloqueado = false; pintar();
      }, ESPERA);
    }

    verRival = (n) => { suAvance = n; pintar(); };
    pintar();
    const reloj = setInterval(pintar, 1000);
    return { destroy(){ clearInterval(reloj); } };
  },

  onRival(n){ verRival(n); },
  });
};
