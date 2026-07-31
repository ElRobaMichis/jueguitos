/* Tiro con Arco — 8 flechas. Arrastra hacia atrás para tensar y suelta.
   Hay viento (el mismo para los dos gracias a la semilla compartida). */
import { duelGame, makeCanvas, pointerPos, makeRng, el, beep, vibrate, clamp } from './lib/kit.js';

const ARROWS = 8, G = 620;
const RINGS = [[10, 12], [26, 8], [42, 5], [58, 3], [74, 1]];   // radio, puntos

export default (ctx) => duelGame(ctx, {
  setup(c, P, api){
    const w = Math.min((c.el.clientWidth || 340) - 20, 400);
    const h = Math.min((c.el.clientHeight || 480) - 150, 540);
    const { cv, g } = makeCanvas(w, h);
    const st = el('div', { class:'g-status me' });
    c.el.append(el('div', { class:'g-wrap arcade' }, st, cv));

    const rng = makeRng(c.seed ^ 0x5eed);
    const bow = { x: w * .5, y: h - 46 };
    let target = null, wind = 0, arrow = null, drag = null;
    let left = ARROWS, score = 0, over = false, flash = '', flashT = 0;

    const newTarget = () => {
      target = { x: 60 + rng() * (w - 120), y: 90 + rng() * (h * .25), sway: rng() * 6.28,
                 amp: 10 + rng() * 34, speed: .5 + rng() * .9 };
      wind = (rng() * 2 - 1) * 90;
    };
    newTarget();

    /* Se dispara deslizando HACIA la diana, desde cualquier punto. Antes había
       que jalar hacia atrás desde el arco, y como el arco está casi al fondo
       apenas quedaban 46 px para tensar: imposible apuntar con el ratón. */
    const flecha = (a) => {
      const dx = a.x - a.x0, dy = a.y - a.y0;
      const largo = Math.hypot(dx, dy);
      if(largo < 18 || dy > -10) return null;
      const k = 4.4 * Math.min(1, 175 / largo);
      return { vx: dx * k, vy: dy * k };
    };

    const onDown = (e) => {
      if(over || arrow) return;
      const p = pointerPos(cv, e);
      drag = { x0:p.x, y0:p.y, x:p.x, y:p.y };
      e.preventDefault();
    };
    const onMove = (e) => {
      if(!drag) return;
      const p = pointerPos(cv, e);
      drag.x = p.x; drag.y = p.y;
      e.preventDefault();
    };
    const onUp = (e) => {
      if(!drag || arrow) return;
      const p = pointerPos(cv, e);
      drag.x = p.x; drag.y = p.y;
      const v = flecha(drag);
      drag = null;
      if(!v) return;
      arrow = { x:bow.x, y:bow.y, vx:v.vx, vy:v.vy, done:false };
      beep(360, .07); vibrate(18);
    };
    cv.addEventListener('pointerdown', onDown, { passive:false });
    /* en la ventana: si sueltas fuera del canvas, la flecha se quedaba tensada */
    window.addEventListener('pointermove', onMove, { passive:false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);

    const hit = (d) => {
      for(const [r, pts] of RINGS) if(d <= r) return pts;
      return 0;
    };

    let last = performance.now(), raf = 0;
    const loop = (now) => {
      const dt = Math.min(0.033, (now - last) / 1000); last = now;

      target.sway += dt * target.speed;
      const tx = target.x + Math.sin(target.sway) * target.amp;
      const ty = target.y;

      if(arrow){
        arrow.vy += G * dt;
        arrow.vx += wind * dt;
        arrow.x += arrow.vx * dt;
        arrow.y += arrow.vy * dt;
        const d = Math.hypot(arrow.x - tx, arrow.y - ty);
        if(d < 76 && arrow.vy > -1e9 && !arrow.done){
          const pts = hit(d);
          if(pts){
            arrow.done = true;
            score += pts; api.setScore(score);
            flash = `+${pts}`; flashT = now + 900;
            beep(700 + pts * 40, .1); vibrate(25);
            shot();
          }
        }
        if(arrow.x < -30 || arrow.x > w + 30 || arrow.y > h + 40){
          if(!arrow.done){ flash = 'fallaste'; flashT = now + 900; }
          shot();
        }
      }

      /* --- dibujo --- */
      g.fillStyle = '#0f0b28'; g.fillRect(0, 0, w, h);
      // diana
      const cols = ['#f6f3ff', '#f43f5e', '#22d3ee', '#ffd23f', '#a3e635'];
      for(let i = RINGS.length - 1; i >= 0; i--){
        g.fillStyle = cols[i];
        g.beginPath(); g.arc(tx, ty, RINGS[i][0], 0, 7); g.fill();
      }
      g.strokeStyle = 'rgba(255,255,255,.3)';
      g.beginPath(); g.moveTo(tx, ty + RINGS.at(-1)[0]); g.lineTo(tx, h - 20); g.stroke();

      // viento
      g.fillStyle = 'rgba(255,255,255,.6)'; g.font = '13px system-ui'; g.textAlign = 'center';
      g.fillText(`viento ${wind > 0 ? '→' : '←'} ${Math.abs(Math.round(wind))}`, w / 2, 22);

      // arco + guía
      g.strokeStyle = '#a3e635'; g.lineWidth = 4;
      g.beginPath(); g.arc(bow.x, bow.y, 20, -1.1, 1.1); g.stroke();
      if(drag){
        const v = flecha(drag);
        if(v){
          /* la trayectoria prevista, ya contando el viento */
          g.strokeStyle = 'rgba(255,255,255,.55)'; g.setLineDash([4, 7]); g.lineWidth = 2;
          g.beginPath(); g.moveTo(bow.x, bow.y);
          let px = bow.x, py = bow.y, pvx = v.vx, pvy = v.vy;
          for(let k = 0; k < 55; k++){
            pvy += G * .022; pvx += wind * .022;
            px += pvx * .022; py += pvy * .022;
            if(py > h || px < 0 || px > w) break;
            g.lineTo(px, py);
          }
          g.stroke(); g.setLineDash([]);
          const fuerza = Math.min(1, Math.hypot(v.vx, v.vy) / 780);
          g.fillStyle = '#a3e635';
          g.fillRect(12, h - 14 - 60 * fuerza, 7, 60 * fuerza);
        }
        g.strokeStyle = 'rgba(255,255,255,.22)'; g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(drag.x0, drag.y0); g.lineTo(drag.x, drag.y); g.stroke();
      }else if(!arrow && left === ARROWS){
        g.fillStyle = 'rgba(255,255,255,.6)'; g.font = '13px system-ui'; g.textAlign = 'center';
        g.fillText('desliza hacia la diana para disparar', w / 2, h - 16);
      }
      if(arrow){
        const a = Math.atan2(arrow.vy, arrow.vx);
        g.save(); g.translate(arrow.x, arrow.y); g.rotate(a);
        g.fillStyle = '#fff'; g.fillRect(-14, -1.5, 28, 3);
        g.beginPath(); g.moveTo(14, 0); g.lineTo(8, -5); g.lineTo(8, 5); g.fill();
        g.restore();
      }
      if(flash && now < flashT){
        g.fillStyle = '#ffd23f'; g.font = 'bold 26px system-ui';
        g.fillText(flash, w / 2, h * .62);
      }

      st.textContent = over
        ? (api.theyFinished ? 'Contando…' : `Terminaste con ${score} · esperando a ${c.peer.name}`)
        : `🏹 ${left} flechas  ·  Tú ${score} — ${api.theirScore} ${c.peer.name}`;

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    function shot(){
      arrow = null;
      left--;
      if(left <= 0 && !over){ over = true; api.setScore(score, { force:true }); api.done(); }
      else newTarget();
    }

    return { destroy(){
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    } };
  },
});
