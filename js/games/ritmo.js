/* Ritmo — las flechas caen y hay que picarlas justo cuando cruzan la línea.
   Los dos reciben exactamente la misma secuencia (semilla compartida). */
import { duelGame, makeCanvas, makeRng, el, beep, vibrate } from './lib/kit.js';

const LANES = ['⬅', '⬇', '⬆', '➡'];
const COLORS = ['#ff4f9a', '#22d3ee', '#a3e635', '#ffd23f'];
const BPM = 124, BEAT = 60 / BPM, FALL = 1.5, SONG = 62;
const PERFECT = 0.065, GOOD = 0.145;

export default (ctx) => duelGame(ctx, {
  setup(c, P, api){
    const w = Math.min((c.el.clientWidth || 340) - 20, 380);
    const h = Math.min((c.el.clientHeight || 480) - 210, 420);
    const { cv, g } = makeCanvas(w, h);
    const st = el('div', { class:'g-status me' });

    /* --- pista generada con la semilla --- */
    const rng = makeRng(c.seed);
    const notes = [];
    for(let t = 2; t < SONG; t += BEAT / 2){
      const r = rng();
      if(r < 0.42) continue;
      notes.push({ t, lane: Math.floor(rng() * 4), hit: 0 });
      if(r > 0.94) notes.push({ t, lane: Math.floor(rng() * 4), hit: 0 });   // acorde doble
    }

    const pads = el('div', { class:'rit-pads' });
    LANES.forEach((sym, i) => {
      const b = el('button', { class:'rit-pad', style:{ '--c':COLORS[i] }, text:sym });
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); tap(i, b); }, { passive:false });
      pads.append(b);
    });
    c.el.append(el('div', { class:'g-wrap arcade' }, st, cv, pads));

    const lineY = h - 54, laneW = w / 4;
    let score = 0, combo = 0, best = 0, over = false;
    let t0 = performance.now(), raf = 0, flash = null, lastBeat = -1;

    const now = () => (performance.now() - t0) / 1000;

    function tap(lane, node){
      if(over) return;
      const t = now();
      let hitNote = null, bestD = 1e9;
      for(const n of notes){
        if(n.lane !== lane || n.hit) continue;
        const d = Math.abs(n.t - t);
        if(d < bestD){ bestD = d; hitNote = n; }
      }
      node.animate?.([{ transform:'scale(.9)', filter:'brightness(1.9)' }, { transform:'scale(1)' }], 130);
      if(!hitNote || bestD > GOOD){ combo = 0; flash = { txt:'…', c:'#8b8ba7', t:now() }; return; }
      hitNote.hit = bestD <= PERFECT ? 2 : 1;
      combo++; best = Math.max(best, combo);
      score += (hitNote.hit === 2 ? 100 : 50) + Math.min(combo, 20) * 2;
      api.setScore(score);
      flash = { txt: hitNote.hit === 2 ? '¡PERFECTO!' : 'bien', c: hitNote.hit === 2 ? '#ffd23f' : '#a3e635', t:now() };
      beep(hitNote.hit === 2 ? 980 : 700, .05, 'triangle');
      vibrate(hitNote.hit === 2 ? 22 : 12);
    }

    const loop = () => {
      const t = now();
      if(t > SONG && !over){ over = true; api.setScore(score, { force:true }); api.done(); }

      // metrónomo suave
      const beatN = Math.floor(t / BEAT);
      if(beatN !== lastBeat && t > 1 && !over){ lastBeat = beatN; beep(beatN % 4 === 0 ? 300 : 220, .02, 'sine', .018); }

      g.fillStyle = '#0f0b28'; g.fillRect(0, 0, w, h);

      for(let i = 0; i < 4; i++){
        g.fillStyle = i % 2 ? 'rgba(255,255,255,.035)' : 'rgba(255,255,255,.015)';
        g.fillRect(i * laneW, 0, laneW, h);
        g.strokeStyle = COLORS[i] + '99'; g.lineWidth = 2;
        g.beginPath(); g.arc(i * laneW + laneW / 2, lineY, 20, 0, 7); g.stroke();
      }
      g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(0, lineY); g.lineTo(w, lineY); g.stroke();

      for(const n of notes){
        const dt = n.t - t;
        if(dt > FALL || dt < -0.35) continue;
        if(n.hit) continue;
        if(dt < -GOOD && !n.missed){ n.missed = 1; combo = 0; }
        const y = lineY - (dt / FALL) * lineY;
        const x = n.lane * laneW + laneW / 2;
        g.fillStyle = COLORS[n.lane];
        g.globalAlpha = dt < -GOOD ? .3 : 1;
        g.beginPath(); g.roundRect(x - 19, y - 13, 38, 26, 9); g.fill();
        g.globalAlpha = 1;
        g.fillStyle = '#0f0b28'; g.font = 'bold 17px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(LANES[n.lane], x, y + 1);
      }

      if(flash && t - flash.t < .55){
        g.fillStyle = flash.c; g.font = 'bold 21px system-ui'; g.textAlign = 'center';
        g.fillText(flash.txt, w / 2, lineY - 58);
      }
      if(combo > 2){
        g.fillStyle = 'rgba(255,255,255,.75)'; g.font = 'bold 15px system-ui';
        g.fillText(`combo ×${combo}`, w / 2, 26);
      }

      st.textContent = over
        ? (api.theyFinished ? 'Contando…' : `${score} pts · esperando a ${c.peer.name}`)
        : `⏱ ${Math.max(0, Math.ceil(SONG - t))}s  ·  Tú ${score} — ${api.theirScore} ${c.peer.name}`;

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return { destroy(){ cancelAnimationFrame(raf); } };
  },
});
