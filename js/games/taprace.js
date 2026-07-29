/* Carrera de Tap — 15 segundos picando lo más rápido posible. */
import { duelGame, el, beep, vibrate } from './lib/kit.js';

const TIME = 15;

export default (ctx) => {
  let paint = () => {};

  return duelGame(ctx, {
    setup(c, P, api){
      let taps = 0, left = TIME, started = false, timer = null;

      const st = el('div', { class:'g-status me', text:`¡Pica el botón ${TIME} segundos!` });
      const barMe   = el('b', { style:{ background:P.color(c.me.id) } });
      const barThem = el('b', { style:{ background:P.color(c.peer.id) } });
      const bars = el('div', { class:'tap-bars' },
        el('div', { class:'tap-bar' }, el('span', { class:'tap-who', text:'Tú' }), barMe),
        el('div', { class:'tap-bar' }, el('span', { class:'tap-who', text:c.peer.name }), barThem));
      const num = el('div', { class:'tap-count', text:'0' });
      const btn = el('button', { class:'tap-btn', text:'👆' });
      c.el.append(el('div', { class:'g-wrap arcade' }, st, bars, num, btn));

      paint = () => {
        const max = Math.max(20, taps, api.theirScore);
        barMe.style.width   = (taps / max * 100) + '%';
        barThem.style.width = (api.theirScore / max * 100) + '%';
        num.textContent = taps;
      };
      paint();

      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if(left <= 0) return;
        if(!started){
          started = true;
          timer = setInterval(() => {
            left--;
            st.textContent = `⏱ ${left}s`;
            if(left <= 0){
              clearInterval(timer);
              btn.disabled = true;
              st.textContent = api.theyFinished ? 'Contando…' : `Terminaste con ${taps} · esperando a ${c.peer.name}`;
              api.setScore(taps, { force:true });
              api.done();
            }
          }, 1000);
        }
        taps++;
        beep(300 + Math.min(600, taps * 4), .02, 'square', .03);
        vibrate(8);
        api.setScore(taps);
        paint();
        btn.animate?.([{ transform:'scale(.9)' }, { transform:'scale(1)' }], 90);
      }, { passive:false });

      return { destroy(){ clearInterval(timer); } };
    },

    onScores(){ paint(); },
  });
};
