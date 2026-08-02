/* Canicas — mesa de feria: desliza para lanzar la canica cuesta arriba y que
   caiga en un hoyo. Cada hoyo vale distinto; el del fondo, 50. Ocho canicas
   cada quien (el mismo tablero, es puntería pura) y gana quien sume más.

   Es un duelo por puntos (duelGame), como el basket: no consume casi datos
   y aguanta cualquier señal. */
import { duelGame, makeCanvas, pointerPos, swipeShot, el, beep, vibrate, clamp,
         sfxLand, chord } from './lib/kit.js';

const CANICAS = 8;
const FRICCION = 1.7;      // frena por segundo (proporcional)
const LENTA = 55;          // por debajo de esta rapidez puede caer en un hoyo

export default (ctx) => duelGame(ctx, {
  setup(c, P, api){
    const w = Math.min((c.el.clientWidth || 340) - 20, 400);
    const h = Math.min((c.el.clientHeight || 480) - 150, 560);
    const { cv, g } = makeCanvas(w, h);
    const st = el('div', { class:'g-status me' });
    c.el.append(el('div', { class:'g-wrap arcade' }, st, cv));

    /* hoyos de la mesa, como en la feria: el más lejano paga más */
    const hoyos = [
      { x: w * 0.50, y: h * 0.14, r: 15, pts: 50 },
      { x: w * 0.28, y: h * 0.22, r: 16, pts: 30 },
      { x: w * 0.72, y: h * 0.22, r: 16, pts: 30 },
      { x: w * 0.50, y: h * 0.33, r: 17, pts: 40 },
      { x: w * 0.16, y: h * 0.42, r: 18, pts: 20 },
      { x: w * 0.84, y: h * 0.42, r: 18, pts: 20 },
      { x: w * 0.34, y: h * 0.52, r: 18, pts: 10 },
      { x: w * 0.66, y: h * 0.52, r: 18, pts: 10 },
    ];
    const R = 9;
    const casa = { x: w / 2, y: h - 40 };

    let canica = null, mira = null, quedan = CANICAS, puntos = 0, over = false;
    let aviso = '', avisoT = 0, hundiendo = null;
    const reposo = () => { canica = { x: casa.x, y: casa.y, vx: 0, vy: 0, viva: false }; };
    reposo();

    const tiro = (a) => swipeShot(a, { fuerza: 3.4, tope: 230, minimo: 18 });

    const onDown = (e) => {
      if(over || canica.viva || hundiendo) return;
      const p = pointerPos(cv, e);
      mira = { x0: p.x, y0: p.y, x: p.x, y: p.y };
      e.preventDefault();
    };
    const onMove = (e) => { if(mira){ const p = pointerPos(cv, e); mira.x = p.x; mira.y = p.y; e.preventDefault(); } };
    const onUp = (e) => {
      if(!mira) return;
      const p = pointerPos(cv, e);
      mira.x = p.x; mira.y = p.y;
      const v = tiro(mira);
      mira = null;
      if(!v) return;
      canica.vx = v.vx; canica.vy = v.vy; canica.viva = true;
      beep(360, .05); vibrate(10);
    };
    cv.addEventListener('pointerdown', onDown, { passive:false });
    window.addEventListener('pointermove', onMove, { passive:false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);

    function siguiente(){
      quedan--;
      if(quedan <= 0 && !over){
        over = true;
        api.setScore(puntos, { force:true });
        api.done();
      } else reposo();
    }

    let last = performance.now(), raf = 0;
    const loop = (now) => {
      const dt = Math.min(0.033, (now - last) / 1000); last = now;

      /* animación de caer al hoyo */
      if(hundiendo){
        hundiendo.t += dt;
        if(hundiendo.t >= 0.35){ hundiendo = null; siguiente(); }
      } else if(canica.viva){
        canica.vx *= (1 - FRICCION * dt);
        canica.vy *= (1 - FRICCION * dt);
        canica.x += canica.vx * dt;
        canica.y += canica.vy * dt;
        if(canica.x < R){ canica.x = R; canica.vx = Math.abs(canica.vx) * .8; }
        if(canica.x > w - R){ canica.x = w - R; canica.vx = -Math.abs(canica.vx) * .8; }
        if(canica.y < R){ canica.y = R; canica.vy = Math.abs(canica.vy) * .8; }

        const rapidez = Math.hypot(canica.vx, canica.vy);
        /* lenta y encima de un hoyo: cae */
        if(rapidez < LENTA){
          const hoyo = hoyos.find(o => Math.hypot(canica.x - o.x, canica.y - o.y) < o.r + 3);
          if(hoyo){
            puntos += hoyo.pts;
            api.setScore(puntos);
            aviso = '+' + hoyo.pts; avisoT = now + 900;
            chord([520 + hoyo.pts * 6, 760 + hoyo.pts * 6], .14); vibrate([15, 25, 15]);
            hundiendo = { x: hoyo.x, y: hoyo.y, t: 0 };
            canica.viva = false;
          } else if(rapidez < 10 || canica.y > h - 16){
            aviso = 'nada…'; avisoT = now + 800;
            sfxLand();
            canica.viva = false;
            siguiente();
          }
        }
        if(canica.y > h + 20){ canica.viva = false; siguiente(); }
      }

      /* ---------- dibujo ---------- */
      g.fillStyle = '#123b2a'; g.fillRect(0, 0, w, h);              // paño de feria
      g.strokeStyle = 'rgba(255,255,255,.12)';
      for(let y = h * 0.6; y > 20; y -= 34){                        // rayas de la cuesta
        g.beginPath(); g.moveTo(12, y); g.lineTo(w - 12, y); g.stroke();
      }

      for(const o of hoyos){
        g.fillStyle = '#0a2018';
        g.beginPath(); g.arc(o.x, o.y, o.r, 0, 7); g.fill();
        g.strokeStyle = '#f2c14e'; g.lineWidth = 2;
        g.beginPath(); g.arc(o.x, o.y, o.r, 0, 7); g.stroke();
        g.fillStyle = '#f2c14e'; g.font = 'bold 11px system-ui'; g.textAlign = 'center';
        g.fillText(o.pts, o.x, o.y + 4);
      }

      /* guía del tiro */
      if(mira){
        const v = tiro(mira);
        if(v){
          g.strokeStyle = 'rgba(255,255,255,.5)'; g.setLineDash([4, 7]); g.lineWidth = 2;
          g.beginPath(); g.moveTo(canica.x, canica.y);
          let px = canica.x, py = canica.y, pvx = v.vx, pvy = v.vy;
          for(let k = 0; k < 70; k++){
            pvx *= (1 - FRICCION * .022); pvy *= (1 - FRICCION * .022);
            px += pvx * .022; py += pvy * .022;
            if(py < 0 || px < 0 || px > w) break;
            g.lineTo(px, py);
          }
          g.stroke(); g.setLineDash([]);
        }
        g.strokeStyle = 'rgba(255,255,255,.2)'; g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(mira.x0, mira.y0); g.lineTo(mira.x, mira.y); g.stroke();
      }

      /* canica (o su caída al hoyo) */
      if(hundiendo){
        const esc = 1 - hundiendo.t / 0.35;
        g.fillStyle = '#cfe3ee';
        g.beginPath(); g.arc(hundiendo.x, hundiendo.y, R * esc, 0, 7); g.fill();
      } else {
        const grad = g.createRadialGradient(canica.x - 3, canica.y - 3, 1, canica.x, canica.y, R);
        grad.addColorStop(0, '#ffffff'); grad.addColorStop(.4, '#bfe0e8'); grad.addColorStop(1, '#5b8aa6');
        g.fillStyle = grad;
        g.beginPath(); g.arc(canica.x, canica.y, R, 0, 7); g.fill();
      }

      /* canicas restantes */
      for(let k = 0; k < quedan - (canica.viva || hundiendo ? 0 : 1); k++){
        g.fillStyle = '#bfe0e8';
        g.beginPath(); g.arc(16 + k * 14, h - 12, 5, 0, 7); g.fill();
      }

      if(aviso && now < avisoT){
        g.fillStyle = '#ffd23f'; g.font = 'bold 24px system-ui'; g.textAlign = 'center';
        g.fillText(aviso, w / 2, h * 0.66);
      }
      if(quedan === CANICAS && !canica.viva && !mira){
        g.fillStyle = 'rgba(255,255,255,.6)'; g.font = '13px system-ui'; g.textAlign = 'center';
        g.fillText('desliza hacia arriba para lanzar la canica', w / 2, h - 54);
      }

      st.textContent = over
        ? (api.theyFinished ? 'Contando…' : `Terminaste con ${puntos} · esperando a ${c.peer.name}`)
        : `⚪ ${quedan} canicas · Tú ${puntos} — ${api.theirScore} ${c.peer.name}`;

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return { destroy(){
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    } };
  },
});
