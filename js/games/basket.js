/* Basket — 60 s encestando. Arrastra desde el balón para lanzar:
   la dirección y la distancia del arrastre marcan la fuerza. */
import { duelGame, makeCanvas, pointerPos, el, beep, vibrate, clamp } from './lib/kit.js';

const TIME = 60, G = 900;

export default (ctx) => duelGame(ctx, {
  setup(c, P, api){
    const w = Math.min((c.el.clientWidth || 340) - 20, 400);
    const h = Math.min((c.el.clientHeight || 480) - 150, 540);
    const { cv, g } = makeCanvas(w, h);
    const st = el('div', { class:'g-status me' });
    c.el.append(el('div', { class:'g-wrap arcade' }, st, cv));

    const R = 15;
    const rim = { x: w * .5, y: h * .28, w: 74, dir: 1, speed: 52 };
    let ball = null, drag = null, score = 0, streak = 0, over = false;
    const home = { x: w * .5, y: h - 60 };
    const reset = () => { ball = { x:home.x, y:home.y, vx:0, vy:0, live:false, scored:false }; };
    reset();

    const onDown = (e) => {
      if(over || ball.live) return;
      const p = pointerPos(cv, e);
      if(Math.hypot(p.x - ball.x, p.y - ball.y) < 70) drag = p;
      e.preventDefault();
    };
    const onMove = (e) => { if(drag){ drag = pointerPos(cv, e); e.preventDefault(); } };
    const onUp = (e) => {
      if(!drag) return;
      const p = pointerPos(cv, e);
      const dx = ball.x - p.x, dy = ball.y - p.y;
      drag = null;
      if(Math.hypot(dx, dy) < 14) return;
      ball.vx = clamp(dx * 3.1, -900, 900);
      ball.vy = clamp(dy * 3.1, -1500, -120);
      ball.live = true;
      beep(420, .06);
    };
    cv.addEventListener('pointerdown', onDown, { passive:false });
    cv.addEventListener('pointermove', onMove, { passive:false });
    cv.addEventListener('pointerup', onUp);

    let t0 = performance.now(), last = t0, raf = 0;
    const loop = (now) => {
      const dt = Math.min(0.033, (now - last) / 1000); last = now;
      const left = Math.max(0, TIME - (now - t0) / 1000);
      if(left <= 0 && !over){ over = true; api.setScore(score, { force:true }); api.done(); }

      /* --- aro que se pasea --- */
      rim.x += rim.dir * rim.speed * dt;
      if(rim.x < rim.w / 2 + 14){ rim.x = rim.w / 2 + 14; rim.dir = 1; }
      if(rim.x > w - rim.w / 2 - 14){ rim.x = w - rim.w / 2 - 14; rim.dir = -1; }

      /* --- balón --- */
      if(ball.live){
        ball.vy += G * dt;
        ball.x += ball.vx * dt;
        ball.y += ball.vy * dt;
        if(ball.x < R){ ball.x = R; ball.vx = Math.abs(ball.vx) * .7; }
        if(ball.x > w - R){ ball.x = w - R; ball.vx = -Math.abs(ball.vx) * .7; }

        const inX = Math.abs(ball.x - rim.x) < rim.w / 2 - 4;
        if(!ball.scored && ball.vy > 0 && Math.abs(ball.y - rim.y) < 12 && inX){
          ball.scored = true;
          streak++;
          score += 1 + (streak >= 3 ? 1 : 0);            // bonus por racha
          api.setScore(score);
          beep(880, .09); setTimeout(() => beep(1180, .12), 80);
          vibrate([20, 30, 40]);
        }
        if(ball.y > h + 60){ if(!ball.scored) streak = 0; reset(); }
      }

      /* --- dibujo --- */
      g.fillStyle = '#0f0b28'; g.fillRect(0, 0, w, h);
      // tablero
      g.fillStyle = 'rgba(255,255,255,.10)';
      g.fillRect(rim.x - 44, rim.y - 60, 88, 46);
      g.strokeStyle = 'rgba(255,255,255,.3)'; g.lineWidth = 2;
      g.strokeRect(rim.x - 18, rim.y - 38, 36, 24);
      // aro
      g.strokeStyle = '#ff7a45'; g.lineWidth = 5;
      g.beginPath(); g.moveTo(rim.x - rim.w / 2, rim.y); g.lineTo(rim.x + rim.w / 2, rim.y); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1.4;
      for(let i = 0; i <= 6; i++){
        const x = rim.x - rim.w / 2 + (rim.w / 6) * i;
        g.beginPath(); g.moveTo(x, rim.y); g.lineTo(rim.x + (x - rim.x) * .5, rim.y + 24); g.stroke();
      }
      // guía de tiro
      if(drag){
        g.strokeStyle = 'rgba(255,255,255,.5)'; g.setLineDash([5, 6]); g.lineWidth = 2;
        g.beginPath(); g.moveTo(ball.x, ball.y);
        g.lineTo(ball.x + (ball.x - drag.x), ball.y + (ball.y - drag.y));
        g.stroke(); g.setLineDash([]);
      }
      // balón
      g.fillStyle = '#ff7a45';
      g.beginPath(); g.arc(ball.x, ball.y, R, 0, 7); g.fill();
      g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 1.6;
      g.beginPath(); g.arc(ball.x, ball.y, R, 0, 7); g.stroke();
      g.beginPath(); g.moveTo(ball.x - R, ball.y); g.lineTo(ball.x + R, ball.y); g.stroke();
      g.beginPath(); g.moveTo(ball.x, ball.y - R); g.lineTo(ball.x, ball.y + R); g.stroke();

      st.textContent = over
        ? (api.theyFinished ? 'Contando…' : `Terminaste con ${score} · esperando a ${c.peer.name}`)
        : `⏱ ${Math.ceil(left)}s  ·  Tú ${score} — ${api.theirScore} ${c.peer.name}${streak >= 3 ? '  🔥' : ''}`;

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return { destroy(){ cancelAnimationFrame(raf); } };
  },
});
