/* Ping Pong — cancha vertical, primero a 7.
   El anfitrión simula la física y manda ~15 instantáneas por segundo; el
   invitado mueve su raqueta al instante (sin esperar respuesta) y sólo
   corrige la pelota con lo que le llega. */
import { liveGame, makeCanvas, pointerPos, el, clear, beep, vibrate, clamp } from './lib/kit.js';

const W = 100, H = 160, PW = 20, PH = 3, R = 2.6, WIN = 7;

export default (ctx) => liveGame(ctx, {
  setup(c, P, api){
    const size = Math.min((c.el.clientWidth || 340) - 24, 360);
    const scale = size / W;
    const { cv, g } = makeCanvas(size, H * scale);
    const wrap = el('div', { class:'g-wrap arcade' },
      el('div', { class:'g-status', id:'pp-st' }), cv);
    c.el.append(wrap);
    const st = wrap.querySelector('#pp-st');

    /* Estado canónico: el anfitrión abajo (y = H), el invitado arriba (y = 0). */
    const S = {
      ball:{ x:W / 2, y:H / 2, vx:26, vy:38 },
      pad:{ [P.host]:W / 2, [P.guest]:W / 2 },
      score:{ [P.host]:0, [P.guest]:0 },
      serve: 0.9,
    };
    let myX = W / 2, lastSent = 0;
    /* Lo que se dibuja va persiguiendo a lo que dice la red. Con la señal
       irregular del campo, los paquetes llegan a destiempo; si pintáramos su
       posición tal cual, la pelota y la raqueta darían saltos. */
    const view = { bx:W / 2, by:H / 2, pad:{ [P.host]:W / 2, [P.guest]:W / 2 } };
    const ease = (dt) => {
      const k = Math.min(1, dt * 14);
      view.bx += (S.ball.x - view.bx) * k;
      view.by += (S.ball.y - view.by) * k;
      if(Math.hypot(S.ball.x - view.bx, S.ball.y - view.by) > 22){ view.bx = S.ball.x; view.by = S.ball.y; }
      for(const id of [P.host, P.guest]){
        if(id === c.me.id){ view.pad[id] = S.pad[id]; continue; }   // la mía, al instante
        view.pad[id] += (S.pad[id] - view.pad[id]) * Math.min(1, dt * 16);
      }
    };

    /* Yo siempre me veo abajo: si soy el invitado, volteo la cancha al dibujar. */
    const flip = !c.isHost;
    const vy = (y) => flip ? H - y : y;

    /* --- control --- */
    const onMove = (e) => {
      const p = pointerPos(cv, e);
      myX = clamp(p.x / scale, PW / 2, W - PW / 2);
      S.pad[c.me.id] = myX;
      const now = performance.now();
      if(!c.isHost && now - lastSent > 60){ lastSent = now; c.send({ c: myX }); }
      e.preventDefault();
    };
    cv.addEventListener('pointerdown', onMove, { passive:false });
    cv.addEventListener('pointermove', onMove, { passive:false });

    const reset = (dir) => {
      S.ball = { x:W / 2, y:H / 2, vx:(Math.random() * 30 - 15), vy:38 * dir };
      S.serve = 0.8;
    };

    return {
      onInput(x, from){ S.pad[from] = clamp(x, PW / 2, W - PW / 2); },

      step(dt){
        ease(dt);
        if(S.serve > 0){ S.serve -= dt; return; }
        const b = S.ball;
        b.x += b.vx * dt; b.y += b.vy * dt;

        if(b.x < R){ b.x = R; b.vx = Math.abs(b.vx); }
        if(b.x > W - R){ b.x = W - R; b.vx = -Math.abs(b.vx); }

        const hit = (padX, py, sign) => {
          if(Math.abs(b.y - py) > R + PH) return false;
          if(Math.abs(b.x - padX) > PW / 2 + R) return false;
          b.vy = sign * Math.abs(b.vy) * 1.045;
          b.vx += (b.x - padX) * 3.2;
          b.vx = clamp(b.vx, -70, 70);
          b.y = py + sign * (R + PH);
          return true;
        };

        if(b.vy > 0 && hit(S.pad[P.host],  H - 4, -1)) beep(700, .04);
        if(b.vy < 0 && hit(S.pad[P.guest], 4,      1)) beep(560, .04);

        if(b.y > H + 6){ S.score[P.guest]++; check(P.guest); reset(-1); }
        if(b.y < -6)   { S.score[P.host]++;  check(P.host);  reset(1); }
      },

      snapshot(){
        return [Math.round(S.ball.x * 10), Math.round(S.ball.y * 10),
                Math.round(S.ball.vx), Math.round(S.ball.vy),
                Math.round(S.pad[P.host]), Math.round(S.pad[P.guest]),
                S.score[P.host], S.score[P.guest]];
      },
      applySnapshot(a){
        S.ball.x = a[0] / 10; S.ball.y = a[1] / 10; S.ball.vx = a[2]; S.ball.vy = a[3];
        S.pad[P.host] = a[4]; S.pad[P.guest] = a[5];
        S.pad[c.me.id] = myX;                                   // mi raqueta manda la mía
        if(S.score[P.host] !== a[6] || S.score[P.guest] !== a[7]){ beep(400, .12); vibrate(40); }
        S.score[P.host] = a[6]; S.score[P.guest] = a[7];
      },
      /* El invitado adelanta la pelota entre paquetes para que se vea fluida. */
      predict(dt){
        S.ball.x += S.ball.vx * dt; S.ball.y += S.ball.vy * dt;
        if(S.ball.x < R || S.ball.x > W - R) S.ball.vx *= -1;   // rebote de pared previsible
        ease(dt);
      },

      draw(){
        g.fillStyle = '#0f0b28'; g.fillRect(0, 0, W * scale, H * scale);
        g.strokeStyle = 'rgba(255,255,255,.18)';
        g.setLineDash([6, 8]); g.beginPath();
        g.moveTo(0, H / 2 * scale); g.lineTo(W * scale, H / 2 * scale); g.stroke();
        g.setLineDash([]);

        g.fillStyle = 'rgba(255,255,255,.10)';
        g.font = `bold ${22 * scale / 3}px system-ui`;
        g.textAlign = 'center';
        g.fillText(`${S.score[c.me.id]} - ${S.score[c.peer.id]}`, W / 2 * scale, (H / 2 - 6) * scale);

        const pad = (x, y, color) => {
          g.fillStyle = color;
          g.beginPath();
          g.roundRect((x - PW / 2) * scale, (y - PH / 2) * scale, PW * scale, PH * scale, 3);
          g.fill();
        };
        pad(view.pad[c.me.id],   vy(c.isHost ? H - 2 : 2), P.color(c.me.id));
        pad(view.pad[c.peer.id], vy(c.isHost ? 2 : H - 2), P.color(c.peer.id));

        g.fillStyle = '#fff';
        g.beginPath(); g.arc(view.bx * scale, vy(view.by) * scale, R * scale, 0, 7); g.fill();

        st.textContent = `Tú ${S.score[c.me.id]} — ${S.score[c.peer.id]} ${c.peer.name}   ·   primero a ${WIN}`;
      },
    };

    function check(who){
      if(S.score[who] < WIN) return;
      api.finish(P.isMe(who) ? 'me' : 'them', `${S.score[c.me.id]} — ${S.score[c.peer.id]}`);
    }
  },
});
