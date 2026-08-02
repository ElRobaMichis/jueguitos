/* Carrera de Patitos — juego de feria: mantén presionado para disparar agua
   y apunta al blanco que se pasea. Mientras el chorro le atina, tu patito
   avanza por el canal. Gana el primero en llegar a la meta.

   Es una carrera (raceGame): cada quien dispara en su pantalla y sólo viaja
   el avance del patito; el rival se ve nadando arriba en tiempo real. */
import { raceGame, makeCanvas, pointerPos, el, beep, vibrate, clamp,
         sfxWin, chord } from './lib/kit.js';

const META = 100;
const LLENADO = 15;        // % por segundo con el chorro clavado en el blanco

export default (ctx) => {
  let verRival = () => {};

  return raceGame(ctx, {
    setup(c, P, api){
      const w = Math.min((c.el.clientWidth || 340) - 20, 400);
      const h = Math.min((c.el.clientHeight || 480) - 150, 560);
      const { cv, g } = makeCanvas(w, h);
      const st = el('div', { class:'g-status me', text:'Mantén presionado y apunta al blanco' });
      c.el.append(el('div', { class:'g-wrap arcade' }, st, cv));

      /* carriles de la carrera (arriba) */
      const carril = { x0: 26, x1: w - 26, yMio: 66, ySuyo: 30 };
      /* blanco que se pasea y pistola */
      const blanco = { x: w * 0.3, y: h * 0.46, r: 24, dir: 1 };
      const pistola = { x: w / 2, y: h - 24 };

      let fill = 0, suyo = 0, disparando = false, mira = { x: w / 2, y: h * 0.4 };
      let dando = false, ondas = 0, chorroT = 0;

      const onDown = (e) => { disparando = true; mira = pointerPos(cv, e); e.preventDefault(); };
      const onMove = (e) => { if(disparando){ mira = pointerPos(cv, e); e.preventDefault(); } };
      const onUp = () => { disparando = false; };
      cv.addEventListener('pointerdown', onDown, { passive:false });
      window.addEventListener('pointermove', onMove, { passive:false });
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);

      /* patito de feria dibujado a mano */
      const pato = (x, y, esc, colorMono) => {
        g.save();
        g.translate(x, y); g.scale(esc, esc);
        g.fillStyle = '#f7c948';                                   // cuerpo
        g.beginPath(); g.ellipse(0, 0, 15, 11, 0, 0, 7); g.fill();
        g.beginPath(); g.arc(9, -9, 8, 0, 7); g.fill();            // cabeza
        g.fillStyle = '#f08a24';                                   // pico
        g.beginPath(); g.moveTo(16, -9); g.lineTo(24, -7); g.lineTo(16, -5); g.fill();
        g.fillStyle = '#1c1430';
        g.beginPath(); g.arc(11, -10, 1.7, 0, 7); g.fill();        // ojo
        g.fillStyle = colorMono;                                   // moño del jugador
        g.beginPath(); g.arc(4, -14, 4, 0, 7); g.fill();
        g.beginPath(); g.arc(9, -16, 3.2, 0, 7); g.fill();
        g.restore();
      };

      let last = performance.now(), raf = 0;
      const loop = (now) => {
        const dt = Math.min(0.04, (now - last) / 1000); last = now;
        ondas += dt;

        /* el blanco se pasea, y más rápido cuanto más cerca estés de ganar */
        blanco.x += blanco.dir * (70 + fill * 1.2) * dt;
        if(blanco.x < blanco.r + 12){ blanco.x = blanco.r + 12; blanco.dir = 1; }
        if(blanco.x > w - blanco.r - 12){ blanco.x = w - blanco.r - 12; blanco.dir = -1; }

        /* ¿el chorro atina? línea pistola→mira evaluada a la altura del blanco */
        dando = false;
        if(disparando && !api.terminado && mira.y < pistola.y - 30){
          const t = (blanco.y - pistola.y) / (mira.y - pistola.y);
          if(t > 0){
            const sx = pistola.x + (mira.x - pistola.x) * t;
            if(Math.abs(sx - blanco.x) < blanco.r){
              dando = true;
              fill = Math.min(META, fill + LLENADO * dt);
              api.progress(Math.floor(fill));
              chorroT += dt;
              if(chorroT > 0.12){ chorroT = 0; beep(700 + fill * 4, .03, 'triangle', .03); }
              if(fill >= META){
                sfxWin(); vibrate([40, 60, 80]);
                api.progress(META, { force:true });
                api.gano('¡Su patito cruzó la meta! 🦆');
              }
            }
          }
        }

        /* ---------- dibujo ---------- */
        g.fillStyle = '#0f0b28'; g.fillRect(0, 0, w, h);

        /* canal de agua con los dos patitos */
        g.fillStyle = '#153e63';
        g.fillRect(10, 14, w - 20, 74);
        g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 1;
        for(let k = 0; k < 5; k++){
          g.beginPath();
          for(let x = 14; x < w - 14; x += 8)
            g.lineTo(x, 26 + k * 15 + Math.sin(ondas * 3 + x * .12 + k) * 2);
          g.stroke();
        }
        g.setLineDash([4, 5]);
        g.strokeStyle = '#f7c948';
        g.beginPath(); g.moveTo(carril.x1 + 8, 16); g.lineTo(carril.x1 + 8, 86); g.stroke();  // meta
        g.setLineDash([]);
        const lerp = (p) => carril.x0 + (carril.x1 - carril.x0) * (p / META);
        pato(lerp(suyo), carril.ySuyo + Math.sin(ondas * 4) * 2, 1, P.color(P.them));
        pato(lerp(fill), carril.yMio + Math.sin(ondas * 4 + 2) * 2, 1, P.color(P.me));

        /* blanco de feria */
        const cols = ['#f6f3ff', '#f43f5e', '#f6f3ff', '#f43f5e'];
        for(let i = 3; i >= 0; i--){
          g.fillStyle = dando && i === 3 ? '#ffd23f' : cols[i];
          g.beginPath(); g.arc(blanco.x, blanco.y, blanco.r * (i + 1) / 4, 0, 7); g.fill();
        }

        /* chorro de agua */
        if(disparando){
          g.strokeStyle = 'rgba(110,190,255,.85)'; g.lineWidth = 3.4; g.lineCap = 'round';
          const fin = { x: mira.x, y: Math.min(mira.y, pistola.y - 20) };
          g.beginPath(); g.moveTo(pistola.x, pistola.y - 12);
          g.quadraticCurveTo((pistola.x + fin.x) / 2, (pistola.y + fin.y) / 2 + 12, fin.x, fin.y);
          g.stroke();
          g.fillStyle = 'rgba(110,190,255,.7)';
          for(let k = 0; k < 4; k++){
            g.beginPath();
            g.arc(fin.x + (Math.random() * 14 - 7), fin.y + (Math.random() * 10 - 5), 2, 0, 7);
            g.fill();
          }
        }

        /* pistola */
        g.fillStyle = '#8b5cf6';
        g.beginPath(); g.roundRect(pistola.x - 13, pistola.y - 14, 26, 20, 5); g.fill();
        g.fillStyle = '#22d3ee';
        g.beginPath(); g.roundRect(pistola.x - 4, pistola.y - 22, 8, 10, 3); g.fill();

        /* barras de avance */
        g.fillStyle = 'rgba(255,255,255,.6)'; g.font = '11px system-ui'; g.textAlign = 'left';
        g.fillText(`${P.name(P.them)} ${suyo}%`, 14, 106);
        g.fillText(`Tú ${Math.floor(fill)}%`, 14, 120);

        st.textContent = api.terminado ? 'Se acabó la carrera'
          : (dando ? '¡Le estás dando! 💦' : 'Mantén presionado y apunta al blanco');

        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);

      verRival = (n) => { suyo = clamp(n, 0, META); };

      return { destroy(){
        cancelAnimationFrame(raf);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
      } };
    },

    onRival(n){ verRival(n); },
  });
};
