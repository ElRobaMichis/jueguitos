/* Air Hockey — arrastra tu mazo, mete gol en la portería de enfrente. */
import { liveGame, makeCanvas, pointerPos, el, beep, vibrate, clamp } from './lib/kit.js';

const W = 100, H = 160, MR = 7, PR = 4.4, GOAL = 34, WIN = 7;

export default (ctx) => liveGame(ctx, {
  setup(c, P, api){
    const size = Math.min((c.el.clientWidth || 340) - 24, 360);
    const k = size / W;
    const { cv, g } = makeCanvas(size, H * k);
    const st = el('div', { class:'g-status' });
    c.el.append(el('div', { class:'g-wrap arcade' }, st, cv));

    const S = {
      puck:{ x:W / 2, y:H / 2, vx:0, vy:0 },
      m:{ [P.host]:{ x:W / 2, y:H - 20 }, [P.guest]:{ x:W / 2, y:20 } },
      score:{ [P.host]:0, [P.guest]:0 },
      hold: 0.8,
    };
    let mine = { x:W / 2, y:H - 20 }, lastSent = 0;
    /* Lo dibujado persigue a lo que dice la red: con paquetes irregulares,
       pintar la posición cruda haría saltar el disco y el mazo. */
    const view = { p:{ x:W / 2, y:H / 2 }, m:{ [P.host]:{ x:W / 2, y:H - 20 }, [P.guest]:{ x:W / 2, y:20 } } };
    const ease = (dt) => {
      const k = Math.min(1, dt * 14);
      view.p.x += (S.puck.x - view.p.x) * k;
      view.p.y += (S.puck.y - view.p.y) * k;
      if(Math.hypot(S.puck.x - view.p.x, S.puck.y - view.p.y) > 22){ view.p = { ...S.puck }; }
      for(const id of [P.host, P.guest]){
        if(id === c.me.id){ view.m[id] = { ...S.m[id] }; continue; }   // el mío, al instante
        const q = Math.min(1, dt * 16);
        view.m[id].x += (S.m[id].x - view.m[id].x) * q;
        view.m[id].y += (S.m[id].y - view.m[id].y) * q;
      }
    };
    const flip = !c.isHost;
    const fy = (y) => flip ? H - y : y;

    const onMove = (e) => {
      const p = pointerPos(cv, e);
      const x = clamp(p.x / k, MR, W - MR);
      let y = clamp(p.y / k, MR, H - MR);
      if(flip) y = H - y;
      // cada quien sólo se mueve en su mitad
      y = c.isHost ? clamp(y, H / 2 + MR, H - MR) : clamp(y, MR, H / 2 - MR);
      mine = { x, y };
      S.m[c.me.id] = mine;
      const now = performance.now();
      if(!c.isHost && now - lastSent > 60){ lastSent = now; c.send({ c: [x, y] }); }
      e.preventDefault();
    };
    cv.addEventListener('pointerdown', onMove, { passive:false });
    cv.addEventListener('pointermove', onMove, { passive:false });

    const reset = (dir) => { S.puck = { x:W / 2, y:H / 2, vx:0, vy:0 }; S.hold = 0.9; };

    return {
      onInput(v, from){ S.m[from] = { x:v[0], y:v[1] }; },

      step(dt){
        ease(dt);
        if(S.hold > 0){ S.hold -= dt; return; }
        const p = S.puck;
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.vx *= 0.995; p.vy *= 0.995;

        if(p.x < PR){ p.x = PR; p.vx = Math.abs(p.vx) * .92; }
        if(p.x > W - PR){ p.x = W - PR; p.vx = -Math.abs(p.vx) * .92; }

        const inGoal = Math.abs(p.x - W / 2) < GOAL / 2;
        if(p.y < PR){
          if(inGoal){ S.score[P.host]++; done(P.host); reset(); return; }
          p.y = PR; p.vy = Math.abs(p.vy) * .92;
        }
        if(p.y > H - PR){
          if(inGoal){ S.score[P.guest]++; done(P.guest); reset(); return; }
          p.y = H - PR; p.vy = -Math.abs(p.vy) * .92;
        }

        for(const id of [P.host, P.guest]){
          const m = S.m[id];
          const dx = p.x - m.x, dy = p.y - m.y;
          const d = Math.hypot(dx, dy);
          if(d < MR + PR && d > 0.001){
            const nx = dx / d, ny = dy / d;
            p.x = m.x + nx * (MR + PR + 0.2);
            p.y = m.y + ny * (MR + PR + 0.2);
            const speed = Math.max(38, Math.hypot(p.vx, p.vy) * 1.03);
            p.vx = nx * speed; p.vy = ny * speed;
            beep(620, .03);
          }
        }
      },

      snapshot(){
        return [Math.round(S.puck.x * 10), Math.round(S.puck.y * 10), Math.round(S.puck.vx), Math.round(S.puck.vy),
                Math.round(S.m[P.host].x), Math.round(S.m[P.host].y),
                Math.round(S.m[P.guest].x), Math.round(S.m[P.guest].y),
                S.score[P.host], S.score[P.guest]];
      },
      applySnapshot(a){
        S.puck = { x:a[0] / 10, y:a[1] / 10, vx:a[2], vy:a[3] };
        S.m[P.host] = { x:a[4], y:a[5] };
        S.m[P.guest] = { x:a[6], y:a[7] };
        S.m[c.me.id] = mine;
        if(S.score[P.host] !== a[8] || S.score[P.guest] !== a[9]){ beep(340, .16); vibrate(60); }
        S.score[P.host] = a[8]; S.score[P.guest] = a[9];
      },
      predict(dt){
        S.puck.x += S.puck.vx * dt; S.puck.y += S.puck.vy * dt;
        if(S.puck.x < PR || S.puck.x > W - PR) S.puck.vx *= -1;   // rebote lateral previsible
        ease(dt);
      },

      draw(){
        g.fillStyle = '#0f0b28'; g.fillRect(0, 0, W * k, H * k);
        g.strokeStyle = 'rgba(255,255,255,.16)'; g.lineWidth = 1.2;
        g.beginPath(); g.moveTo(0, H / 2 * k); g.lineTo(W * k, H / 2 * k); g.stroke();
        g.beginPath(); g.arc(W / 2 * k, H / 2 * k, 14 * k, 0, 7); g.stroke();

        for(const yy of [0, H]){
          g.fillStyle = 'rgba(255,255,255,.14)';
          g.fillRect((W / 2 - GOAL / 2) * k, (yy === 0 ? 0 : H - 2) * k, GOAL * k, 2 * k);
        }

        const disc = (x, y, r, col) => { g.fillStyle = col; g.beginPath(); g.arc(x * k, fy(y) * k, r * k, 0, 7); g.fill(); };
        disc(view.m[c.me.id].x,   view.m[c.me.id].y,   MR, P.color(c.me.id));
        disc(view.m[c.peer.id].x, view.m[c.peer.id].y, MR, P.color(c.peer.id));
        disc(view.p.x, view.p.y, PR, '#fff');

        st.textContent = `Tú ${S.score[c.me.id]} — ${S.score[c.peer.id]} ${c.peer.name}   ·   primero a ${WIN}`;
      },
    };

    function done(who){
      if(S.score[who] >= WIN) api.finish(P.isMe(who) ? 'me' : 'them', `${S.score[c.me.id]} — ${S.score[c.peer.id]}`);
    }
  },
});
