/* Revienta Globos — 45 s. Los dos reciben exactamente los mismos globos
   (misma semilla), así que es justo aunque cada quien juegue por su lado. */
import { duelGame, makeCanvas, pointerPos, makeRng, el, beep, vibrate } from './lib/kit.js';

const TIME = 45;
const COLORS = ['#ff4f9a', '#22d3ee', '#ffd23f', '#a3e635', '#ff7a45', '#8b5cf6'];

export default (ctx) => duelGame(ctx, {
  setup(c, P, api){
    const w = Math.min((c.el.clientWidth || 340) - 20, 400);
    const h = Math.min((c.el.clientHeight || 480) - 150, 520);
    const { cv, g } = makeCanvas(w, h);
    const st = el('div', { class:'g-status me', text:`¡Reviéntalos! ${TIME}s` });
    c.el.append(el('div', { class:'g-wrap arcade' }, st, cv));

    const rng = makeRng(c.seed);
    const balloons = [];
    let score = 0, t0 = performance.now(), raf = 0, spawnAt = 0, over = false;

    const spawn = () => {
      const r = 16 + rng() * 12;
      balloons.push({
        x: r + rng() * (w - r * 2), y: h + r,
        vy: -(38 + rng() * 46), r,
        color: COLORS[Math.floor(rng() * COLORS.length)],
        bomb: rng() < 0.14,
        sway: rng() * 6.28, pop: 0,
      });
    };

    cv.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if(over) return;
      const p = pointerPos(cv, e);
      for(let i = balloons.length - 1; i >= 0; i--){
        const b = balloons[i];
        if(b.pop) continue;
        if(Math.hypot(p.x - b.x, p.y - b.y) < b.r + 6){
          b.pop = 1;
          if(b.bomb){ score = Math.max(0, score - 3); beep(180, .18, 'sawtooth', .05); vibrate(90); }
          else       { score += 1; beep(700 + Math.random() * 400, .05, 'triangle'); vibrate(12); }
          api.setScore(score);
          return;
        }
      }
    }, { passive:false });

    let last = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const left = Math.max(0, TIME - (now - t0) / 1000);
      if(left <= 0 && !over){ over = true; api.setScore(score, { force:true }); api.done(); }

      if(!over && now > spawnAt){ spawn(); spawnAt = now + 300 + rng() * 420; }

      g.fillStyle = '#0f0b28'; g.fillRect(0, 0, w, h);
      for(let i = balloons.length - 1; i >= 0; i--){
        const b = balloons[i];
        if(b.pop){ b.pop += dt * 6; if(b.pop > 2){ balloons.splice(i, 1); continue; } }
        else{ b.y += b.vy * dt; b.sway += dt * 2; b.x += Math.sin(b.sway) * 14 * dt; }
        if(b.y < -b.r * 2){ balloons.splice(i, 1); continue; }

        const s = b.pop ? 1 + b.pop * .5 : 1;
        g.globalAlpha = b.pop ? Math.max(0, 1 - b.pop / 2) : 1;
        g.fillStyle = b.bomb ? '#2b2b3d' : b.color;
        g.beginPath(); g.ellipse(b.x, b.y, b.r * s, b.r * 1.2 * s, 0, 0, 7); g.fill();
        g.globalAlpha = 1;
        if(b.bomb){ g.font = `${b.r}px system-ui`; g.textAlign = 'center'; g.fillText('💣', b.x, b.y + b.r * .35); }
        g.strokeStyle = 'rgba(255,255,255,.35)';
        g.beginPath(); g.moveTo(b.x, b.y + b.r * 1.2 * s); g.lineTo(b.x, b.y + b.r * 1.8 * s); g.stroke();
      }

      st.textContent = over
        ? (api.theyFinished ? 'Contando…' : `Terminaste con ${score} · esperando a ${c.peer.name}`)
        : `⏱ ${Math.ceil(left)}s  ·  Tú ${score} — ${api.theirScore} ${c.peer.name}`;

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return { destroy(){ cancelAnimationFrame(raf); } };
  },
});
