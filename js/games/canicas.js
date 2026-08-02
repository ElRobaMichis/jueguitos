/* Frontón de canicas — como el de la feria de verdad:

   El tablero está INCLINADO: la canica sube perdiendo fuerza y la pendiente
   siempre la jala de regreso. Si tiras fuerte pasa volando sobre los hoyos
   (una canica rápida no entra), rebota en el frontón del fondo y es a la
   vuelta, ya cansada, cuando puede caer... o regresarse a tu mano y no valer
   nada. La gracia está en medir la fuerza: no hay guía de trayectoria, sólo
   la dirección y cuánta fuerza llevas.

   Ocho canicas por cabeza, mismo tablero (es puntería pura) y gana quien
   sume más. Duelo por puntos: casi no consume datos. */
import { duelGame, makeCanvas, pointerPos, swipeShot, el, beep, vibrate, clamp,
         sfxLand, sfxWall, chord } from './lib/kit.js';

const CANICAS   = 8;
const PENDIENTE = 175;    // la cuesta: acelera de regreso, px/s²
const FRICCION  = 0.8;    // resistencia a rodar (proporcional)
const CAPTURA   = 140;    // más rápido que esto, la canica pasa sobre el hoyo
const REBOTE    = 0.32;   // cuánto vive del golpe contra el frontón

export default (ctx) => duelGame(ctx, {
  setup(c, P, api){
    const w = Math.min((c.el.clientWidth || 340) - 20, 400);
    const h = Math.min((c.el.clientHeight || 480) - 150, 560);
    const { cv, g } = makeCanvas(w, h);
    const st = el('div', { class:'g-status me' });
    c.el.append(el('div', { class:'g-wrap arcade' }, st, cv));

    /* la parrilla de hoyos, como en el tablero de la foto: filas y filas,
       y las profundas pagan más; el dorado del centro es "el bueno" */
    const FILAS = [
      { y: h * 0.135, pts: [15, 25, 50, 25, 15] },
      { y: h * 0.225, pts: [10, 20, 30, 20, 10] },
      { y: h * 0.315, pts: [ 5, 15, 20, 15,  5] },
      { y: h * 0.405, pts: [ 5, 10, 10, 10,  5] },
    ];
    const hoyos = [];
    FILAS.forEach(f => f.pts.forEach((pts, i) =>
      hoyos.push({ x: w * (0.14 + 0.18 * i), y: f.y, r: pts === 50 ? 10 : 12, pts })));   // "el bueno" es más chico

    const R = 8;
    const TOPE_Y = 24;                       // el frontón
    const casa = { x: w / 2, y: h - 36 };

    let canica = null, mira = null, quedan = CANICAS, puntos = 0, over = false;
    let aviso = '', avisoT = 0, hundiendo = null, vida = 0;
    const reposo = () => { canica = { x: casa.x, y: casa.y, vx: 0, vy: 0, viva: false }; vida = 0; };
    reposo();

    const tiro = (a) => swipeShot(a, { fuerza: 3.2, tope: 200, minimo: 18 });

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

      if(hundiendo){
        hundiendo.t += dt;
        if(hundiendo.t >= 0.35){ hundiendo = null; siguiente(); }
      } else if(canica.viva){
        vida += dt;
        /* la cuesta jala de regreso; la fricción frena todo el tiempo */
        canica.vy += PENDIENTE * dt;
        canica.vx *= (1 - FRICCION * dt);
        canica.vy -= canica.vy * FRICCION * dt * 0.4;
        canica.x += canica.vx * dt;
        canica.y += canica.vy * dt;

        /* paredes y frontón */
        if(canica.x < R){ canica.x = R; canica.vx = Math.abs(canica.vx) * .7; sfxWall(); }
        if(canica.x > w - R){ canica.x = w - R; canica.vx = -Math.abs(canica.vx) * .7; sfxWall(); }
        if(canica.y < TOPE_Y + R){
          canica.y = TOPE_Y + R;
          /* la madera del frontón no es pareja: el rebote sale cada vez un
             poco distinto y con su desviación. Sin esto, el mismo tiro fuerte
             al centro embolsaba el 50 de rebote una y otra vez (comprobado:
             tres tiros idénticos, tres veces 50). */
          canica.vy = Math.abs(canica.vy) * REBOTE * (0.72 + Math.random() * 0.56);
          canica.vx += (Math.random() * 2 - 1) * 65;
          beep(240, .06, 'square', .05); vibrate(15);
        }

        const rapidez = Math.hypot(canica.vx, canica.vy);
        /* sólo una canica LENTA cae en un hoyo; rápida pasa por encima */
        if(rapidez < CAPTURA){
          const hoyo = hoyos.find(o => Math.hypot(canica.x - o.x, canica.y - o.y) < o.r + 2);
          if(hoyo){
            puntos += hoyo.pts;
            api.setScore(puntos);
            aviso = '+' + hoyo.pts; avisoT = now + 900;
            chord([520 + hoyo.pts * 5, 760 + hoyo.pts * 5], .14); vibrate([15, 25, 15]);
            hundiendo = { x: hoyo.x, y: hoyo.y, t: 0 };
            canica.viva = false;
          }
        }

        /* se regresó a tu mano: esa canica ya no vale */
        if(canica.viva && canica.vy > 0 && canica.y > casa.y - 4){
          aviso = 'se regresó…'; avisoT = now + 900;
          sfxLand();
          canica.viva = false;
          siguiente();
        }
        /* válvula de seguridad: nada de canicas eternas */
        if(canica.viva && vida > 12){ canica.viva = false; siguiente(); }
      }

      /* ---------- dibujo ---------- */
      g.fillStyle = '#1d5f8a'; g.fillRect(0, 0, w, h);              // mesa azul de feria
      g.fillStyle = '#164a6d';
      g.fillRect(0, 0, w, h * 0.46);                                // la zona de hoyos
      g.fillStyle = '#c1533a';                                      // el frontón de madera
      g.fillRect(0, 0, w, TOPE_Y);
      g.fillStyle = '#e0764f';
      g.fillRect(0, TOPE_Y - 5, w, 5);

      for(const o of hoyos){
        g.fillStyle = '#0c2b40';
        g.beginPath(); g.arc(o.x, o.y, o.r, 0, 7); g.fill();
        g.strokeStyle = o.pts === 50 ? '#ffd23f' : 'rgba(255,255,255,.4)';
        g.lineWidth = o.pts === 50 ? 2.5 : 1.4;
        g.beginPath(); g.arc(o.x, o.y, o.r, 0, 7); g.stroke();
        g.fillStyle = o.pts === 50 ? '#ffd23f' : 'rgba(255,255,255,.75)';
        g.font = 'bold 9px system-ui'; g.textAlign = 'center';
        g.fillText(o.pts, o.x, o.y + 3);
      }

      /* al apuntar: SÓLO dirección y fuerza, nada de adivinar dónde cae */
      if(mira){
        const v = tiro(mira);
        if(v){
          const ang = Math.atan2(v.vy, v.vx);
          g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 3; g.lineCap = 'round';
          g.beginPath(); g.moveTo(canica.x, canica.y);
          g.lineTo(canica.x + Math.cos(ang) * 34, canica.y + Math.sin(ang) * 34);
          g.stroke();
          const fuerza = Math.min(1, Math.hypot(v.vx, v.vy) / 640);
          g.fillStyle = `hsl(${(1 - fuerza) * 110} 80% 55%)`;
          g.fillRect(10, h - 12 - 70 * fuerza, 7, 70 * fuerza);
          g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1;
          g.strokeRect(10, h - 82, 7, 70);
        }
      }

      /* canica (o su caída al hoyo) */
      if(hundiendo){
        const esc = 1 - hundiendo.t / 0.35;
        g.fillStyle = '#e9f2f7';
        g.beginPath(); g.arc(hundiendo.x, hundiendo.y, R * esc, 0, 7); g.fill();
      } else {
        const grad = g.createRadialGradient(canica.x - 2.5, canica.y - 2.5, 1, canica.x, canica.y, R);
        grad.addColorStop(0, '#ffffff'); grad.addColorStop(.45, '#cfe3ee'); grad.addColorStop(1, '#6d93ab');
        g.fillStyle = grad;
        g.beginPath(); g.arc(canica.x, canica.y, R, 0, 7); g.fill();
      }

      /* canicas restantes */
      for(let k = 0; k < quedan - (canica.viva || hundiendo ? 0 : 1); k++){
        g.fillStyle = '#cfe3ee';
        g.beginPath(); g.arc(15 + k * 13, h - 10, 4.5, 0, 7); g.fill();
      }

      if(aviso && now < avisoT){
        g.fillStyle = '#ffd23f'; g.font = 'bold 24px system-ui'; g.textAlign = 'center';
        g.fillText(aviso, w / 2, h * 0.58);
      }
      if(quedan === CANICAS && !canica.viva && !mira){
        g.fillStyle = 'rgba(255,255,255,.65)'; g.font = '12px system-ui'; g.textAlign = 'center';
        g.fillText('suave se queda corta, fuerte rebota en el frontón', w / 2, h - 64);
        g.fillText('sólo una canica lenta cae en el hoyo', w / 2, h - 48);
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
