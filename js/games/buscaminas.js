/* Buscaminas — carrera: el MISMO tablero para los dos (misma semilla), cada
   quien en el suyo y a la vez. Gana quien lo limpie primero; si pisas tres
   minas, pierdes en el acto.

   Antes era por turnos, buscando minas a propósito, y se sentía raro porque
   no era buscaminas: era un juego de suerte por turnos. Así cada quien juega
   su tablero sin esperar y se ve en el marcador quién va ganando. */
import { raceGame, el, clear, beep, vibrate, rngInt,
         sfxPop, sfxCapture, sfxWin, sfxError } from './lib/kit.js';

const W = 10, H = 10, MINAS = 15, VIDAS = 3;
const ix = (x, y) => y * W + x;
const vecinos = (i) => {
  const x = i % W, y = (i / W) | 0, out = [];
  for(let dy = -1; dy <= 1; dy++) for(let dx = -1; dx <= 1; dx++){
    if(!dx && !dy) continue;
    const nx = x + dx, ny = y + dy;
    if(nx >= 0 && nx < W && ny >= 0 && ny < H) out.push(ix(nx, ny));
  }
  return out;
};

export default (ctx) => {
  let verRival = () => {};

  return raceGame(ctx, {
    setup(c, P, api){
      /* mismo tablero para los dos */
      const mina = Array(W * H).fill(false);
      let puestas = 0;
      while(puestas < MINAS){
        const i = rngInt(c.rng, W * H);
        if(!mina[i]){ mina[i] = true; puestas++; }
      }
      const num = mina.map((_, i) => mina[i] ? -1 : vecinos(i).filter(v => mina[v]).length);
      const SEGURAS = W * H - MINAS;

      const abierta = Array(W * H).fill(false);
      const bandera = Array(W * H).fill(false);
      let pisadas = 0, limpias = 0, modoBandera = false, suAvance = 0, t0 = performance.now();

      const st = el('div', { class:'g-status me' });
      const grid = el('div', { class:'bd bd-ms' });
      const pie = el('div', { class:'g-pill' });
      const btnBandera = el('button', { class:'g-btn', text:'🚩 Marcar' });
      c.el.append(el('div', { class:'g-wrap' }, st, el('div', { class:'g-center' }, grid),
                              el('div', { class:'g-row' }, pie, btnBandera)));

      btnBandera.addEventListener('click', () => {
        modoBandera = !modoBandera;
        btnBandera.classList.toggle('primary', modoBandera);
        btnBandera.textContent = modoBandera ? '🚩 Marcando' : '🚩 Marcar';
        beep(modoBandera ? 700 : 420, .05);
      });

      const celdas = [];
      for(let i = 0; i < W * H; i++){
        const n = el('button', { class:'ms-cell' });
        n.addEventListener('click', () => tocar(i));
        /* mantener pulsado también marca, como en el buscaminas de siempre */
        let largo = null;
        n.addEventListener('pointerdown', () => { largo = setTimeout(() => { largo = null; marcar(i); }, 420); });
        const soltar = () => { if(largo){ clearTimeout(largo); largo = null; } };
        n.addEventListener('pointerup', soltar);
        n.addEventListener('pointerleave', soltar);
        celdas.push(n);
        grid.append(n);
      }

      const pintar = () => {
        for(let i = 0; i < W * H; i++){
          const n = celdas[i];
          n.className = 'ms-cell' + (abierta[i] ? ' open' : '') +
                        (abierta[i] && mina[i] ? ' mine' : '') +
                        (bandera[i] && !abierta[i] ? ' flag' : '');
          if(abierta[i] && mina[i]) n.textContent = '💣';
          else if(abierta[i] && num[i] > 0){ n.textContent = num[i]; n.dataset.n = num[i]; }
          else if(bandera[i] && !abierta[i]) n.textContent = '🚩';
          else n.textContent = '';
        }
        const seg = Math.round((performance.now() - t0) / 1000);
        const vidas = '❤️'.repeat(Math.max(0, VIDAS - pisadas)) + '🖤'.repeat(pisadas);
        st.textContent = api.terminado ? 'Se acabó'
          : `${limpias}/${SEGURAS} casillas · ${vidas} · ⏱ ${seg}s`;
        pie.textContent = `Tú ${Math.round(limpias / SEGURAS * 100)}% — ${suAvance}% ${c.peer.name}`;
      };

      function marcar(i){
        if(api.terminado || abierta[i]) return;
        bandera[i] = !bandera[i];
        beep(bandera[i] ? 820 : 400, .05); vibrate(12);
        pintar();
      }

      function tocar(i){
        if(api.terminado || abierta[i]) return;
        if(modoBandera){ marcar(i); return; }
        if(bandera[i]) return;                       // marcada: hay que desmarcar primero

        if(mina[i]){
          abierta[i] = true;
          pisadas++;
          sfxCapture(); vibrate([40, 60, 40]);
          pintar();
          if(pisadas >= VIDAS){
            sfxError();
            api.perdi(`Pisó ${VIDAS} minas`);
          }
          return;
        }

        /* destapado en cascada */
        const pila = [i];
        let nuevas = 0;
        while(pila.length){
          const k = pila.pop();
          if(abierta[k] || mina[k] || bandera[k]) continue;
          abierta[k] = true; nuevas++;
          if(num[k] === 0) vecinos(k).forEach(v => { if(!abierta[v]) pila.push(v); });
        }
        limpias += nuevas;
        sfxPop(); vibrate(8);
        pintar();
        api.progress(Math.round(limpias / SEGURAS * 100));

        if(limpias >= SEGURAS){
          const seg = ((performance.now() - t0) / 1000).toFixed(1);
          sfxWin();
          api.progress(100, { force:true });
          api.gano(`Tablero limpio en ${seg}s con ${pisadas} mina${pisadas === 1 ? '' : 's'}`);
        }
      }

      verRival = (n) => { suAvance = n; pintar(); };
      pintar();
      const reloj = setInterval(pintar, 1000);
      return { destroy(){ clearInterval(reloj); } };
    },

    onRival(n){ verRival(n); },
  });
};
