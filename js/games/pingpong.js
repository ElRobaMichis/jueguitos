/* Ping Pong — cancha vertical, primero a 7.

   Cómo se reparte la autoridad (esto es lo que hace que se sienta justo):
   el anfitrión simula la pelota y lleva el marcador, PERO cada jugador decide
   los rebotes contra SU propia paleta y le avisa al otro. Antes el anfitrión
   resolvía los dos lados con la posición de la paleta del rival retrasada
   ~200 ms, y por eso la pelota parecía atravesarla. */
import { liveGame, makeCanvas, pointerPos, el, beep, vibrate, clamp,
         sfxHit, sfxWall, sfxGoal } from './lib/kit.js';

const W = 100, H = 160;
const PW = 23, PH = 3.4, R = 2.9;      // paleta más ancha y pelota un pelín mayor
const WIN = 7;
const SERVE_VY = 52;                   // saque más vivo que antes
const RAMP = 1.085, VMAX = 132;        // acelera casi el doble de rápido por golpe

export default (ctx) => liveGame(ctx, {
  setup(c, P, api){
    const size = Math.min((c.el.clientWidth || 340) - 24, 360);
    const scale = size / W;
    const { cv, g } = makeCanvas(size, H * scale);
    const st = el('div', { class:'g-status' });
    c.el.append(el('div', { class:'g-wrap arcade' }, st, cv));

    /* Estado canónico: anfitrión abajo (y = H), invitado arriba (y = 0). */
    const S = {
      ball:{ x:W / 2, y:H / 2, vx:18, vy:SERVE_VY, py:H / 2 },
      pad:{ [P.host]:W / 2, [P.guest]:W / 2 },
      score:{ [P.host]:0, [P.guest]:0 },
      serve: 0.9,
    };
    const myId = c.me.id, foeId = c.peer.id;
    const padY = (id) => id === P.host ? H - 5 : 5;
    const dirOf = (id) => id === P.host ? -1 : 1;      // hacia dónde sale la pelota

    let myX = W / 2, lastSent = 0, cooldown = 0, foeBounceAt = -9;
    let flash = 0, clock = 0;

    /* Lo que se dibuja persigue a lo que dice la red: con paquetes a
       destiempo, pintar la posición cruda haría saltar todo. */
    const view = { bx:W / 2, by:H / 2, pad:{ [P.host]:W / 2, [P.guest]:W / 2 } };
    const ease = (dt) => {
      const k = Math.min(1, dt * 16);
      view.bx += (S.ball.x - view.bx) * k;
      view.by += (S.ball.y - view.by) * k;
      if(Math.hypot(S.ball.x - view.bx, S.ball.y - view.by) > 22){ view.bx = S.ball.x; view.by = S.ball.y; }
      for(const id of [P.host, P.guest]){
        if(id === myId){ view.pad[id] = S.pad[id]; continue; }
        view.pad[id] += (S.pad[id] - view.pad[id]) * Math.min(1, dt * 18);
      }
    };

    /* --- control: mi paleta se mueve al instante, sin esperar a nadie --- */
    const onMove = (e) => {
      const p = pointerPos(cv, e);
      myX = clamp(p.x / scale, PW / 2, W - PW / 2);
      S.pad[myId] = myX;
      const now = performance.now();
      if(now - lastSent > 70){ lastSent = now; c.send({ c: myX }); }
      e.preventDefault();
    };
    cv.addEventListener('pointerdown', onMove, { passive:false });
    cv.addEventListener('pointermove', onMove, { passive:false });

    /* --- rebote contra una paleta, con barrido (no se salta ningún fotograma) --- */
    function bounceOff(id){
      const b = S.ball, py = padY(id), dir = dirOf(id);
      if(b.vy * dir > 0) return false;                  // ya va de salida
      const cruzo  = dir < 0 ? (b.py <= py && b.y + R >= py) : (b.py >= py && b.y - R <= py);
      const pegado = Math.abs(b.y - py) <= R + PH;
      if(!cruzo && !pegado) return false;
      const padX = S.pad[id];
      if(Math.abs(b.x - padX) > PW / 2 + R) return false;

      b.y  = py + dir * (R + PH);
      b.vy = dir * Math.min(VMAX, Math.abs(b.vy) * RAMP);
      b.vx = clamp(b.vx + (b.x - padX) * 4.2, -78, 78);
      flash = 0.12;
      sfxHit(); vibrate(12);
      return true;
    }

    const reset = (dir) => {
      S.ball = { x:W / 2, y:H / 2, vx:(Math.random() * 34 - 17), vy:SERVE_VY * dir, py:H / 2 };
      S.serve = 0.85;
      view.bx = W / 2; view.by = H / 2;
    };

    function integrate(dt){
      const b = S.ball;
      b.py = b.y;
      b.x += b.vx * dt; b.y += b.vy * dt;
      if(b.x < R){ b.x = R; b.vx = Math.abs(b.vx); sfxWall(); }
      if(b.x > W - R){ b.x = W - R; b.vx = -Math.abs(b.vx); sfxWall(); }
    }

    return {
      /* el rival mueve su paleta, o avisa de un rebote suyo */
      onInput(v, from){
        if(Array.isArray(v)){                            // rebote: su palabra es ley
          S.ball.x = v[0]; S.ball.y = v[1]; S.ball.vx = v[2]; S.ball.vy = v[3];
          S.ball.py = v[1];
          foeBounceAt = clock;
          flash = 0.12;
          sfxHit();
          return;
        }
        S.pad[from] = clamp(v, PW / 2, W - PW / 2);
      },

      step(dt){                                          // sólo anfitrión
        clock += dt; ease(dt);
        if(flash > 0) flash -= dt;
        if(S.serve > 0){ S.serve -= dt; return; }
        integrate(dt);

        bounceOff(myId);
        // el rebote del rival lo canta él; esto es la red por si su aviso se perdió
        if(clock - foeBounceAt > 0.22) bounceOff(foeId);

        const b = S.ball;
        if(b.y > H + 6){ S.score[P.guest]++; sfxGoal(); vibrate(70); check(P.guest); reset(-1); }
        if(b.y < -6)   { S.score[P.host]++;  sfxGoal(); vibrate(70); check(P.host);  reset(1); }
      },

      predict(dt){                                       // sólo invitado
        clock += dt; ease(dt);
        if(flash > 0) flash -= dt;
        if(S.serve > 0){ S.serve -= dt; return; }
        integrate(dt);
        if(cooldown > 0) cooldown -= dt;
        else if(bounceOff(myId)){                        // mando yo en mi paleta
          cooldown = 0.25;
          c.send({ c:[S.ball.x, S.ball.y, S.ball.vx, S.ball.vy] });
        }
      },

      snapshot(){
        return [Math.round(S.ball.x * 10), Math.round(S.ball.y * 10),
                Math.round(S.ball.vx), Math.round(S.ball.vy),
                Math.round(S.pad[P.host]), Math.round(S.pad[P.guest]),
                S.score[P.host], S.score[P.guest]];
      },
      applySnapshot(a){
        // Si acabo de rebotar, mi versión es más nueva que la que viene.
        if(cooldown <= 0){
          S.ball.x = a[0] / 10; S.ball.y = a[1] / 10;
          S.ball.vx = a[2]; S.ball.vy = a[3];
          S.ball.py = S.ball.y;
        }
        S.pad[P.host] = a[4]; S.pad[P.guest] = a[5];
        S.pad[myId] = myX;                               // la mía la mando yo
        if(S.score[P.host] !== a[6] || S.score[P.guest] !== a[7]){ sfxGoal(); vibrate(70); }
        S.score[P.host] = a[6]; S.score[P.guest] = a[7];
      },

      draw(){
        const flip = !c.isHost;
        const vy = (y) => flip ? H - y : y;
        g.fillStyle = '#0f0b28'; g.fillRect(0, 0, W * scale, H * scale);

        g.strokeStyle = 'rgba(255,255,255,.18)';
        g.setLineDash([6, 8]); g.beginPath();
        g.moveTo(0, H / 2 * scale); g.lineTo(W * scale, H / 2 * scale); g.stroke();
        g.setLineDash([]);

        g.fillStyle = 'rgba(255,255,255,.10)';
        g.font = `bold ${Math.round(9 * scale)}px system-ui`;
        g.textAlign = 'center';
        g.fillText(`${S.score[myId]} - ${S.score[foeId]}`, W / 2 * scale, (H / 2 - 5) * scale);

        const pad = (x, y, color, mine) => {
          g.save();
          if(mine){ g.shadowColor = color; g.shadowBlur = 12 * scale; }
          g.fillStyle = color;
          g.beginPath();
          g.roundRect((x - PW / 2) * scale, (y - PH / 2) * scale, PW * scale, PH * scale, 3);
          g.fill();
          g.restore();
        };
        pad(view.pad[myId],  vy(c.isHost ? H - 5 : 5), P.color(myId), true);
        pad(view.pad[foeId], vy(c.isHost ? 5 : H - 5), P.color(foeId), false);

        // estela: se ve el sentido de la pelota aunque la señal vaya mal
        const sp = Math.hypot(S.ball.vx, S.ball.vy);
        g.strokeStyle = 'rgba(255,255,255,.22)';
        g.lineWidth = R * scale * 1.3; g.lineCap = 'round';
        g.beginPath();
        g.moveTo(view.bx * scale, vy(view.by) * scale);
        g.lineTo((view.bx - S.ball.vx * .045) * scale, vy(view.by - S.ball.vy * .045) * scale);
        g.stroke();

        g.save();
        if(flash > 0){ g.shadowColor = '#fff'; g.shadowBlur = 22 * scale; }
        g.fillStyle = '#fff';
        g.beginPath(); g.arc(view.bx * scale, vy(view.by) * scale, R * scale, 0, 7); g.fill();
        g.restore();

        st.textContent = `Tú ${S.score[myId]} — ${S.score[foeId]} ${c.peer.name}   ·   primero a ${WIN}` +
                         (sp > 90 ? '   🔥' : '');
      },
    };

    function check(who){
      if(S.score[who] < WIN) return;
      api.finish(P.isMe(who) ? 'me' : 'them', `${S.score[myId]} — ${S.score[foeId]}`);
    }
  },
});
