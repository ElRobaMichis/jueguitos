/* Dibuja y Adivina — 4 rondas (2 dibuja cada quien), 75 s por ronda.
   Los trazos viajan como enteros de 0–255 en lotes de ~110 ms: unos pocos
   cientos de bytes por segundo aunque dibujes sin parar. */
import { turnGame, el, clear, beep, vibrate, makeCanvas, pointerPos, shuffled, clamp } from './lib/kit.js';

const PALABRAS = [
  'gato','pizza','avión','corazón','playa','guitarra','fantasma','cactus','café','luna',
  'bicicleta','helado','payaso','castillo','pulpo','sandía','robot','paraguas','tortuga','cohete',
  'zapato','árbol','estrella','dinosaurio','taco','pastel','elefante','arcoíris','llave','pingüino',
  'mariposa','sombrero','reloj','abeja','montaña','fuego','libro','sirena','dragón','hamburguesa',
];
const ROUNDS = 4, TIME = 75;
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

export default (ctx) => {
  /* ---------------- lienzo persistente (no se recrea en cada render) ------- */
  const size = clamp((ctx.el.clientWidth || 340) - 28, 240, 340);
  const { cv, g } = makeCanvas(size, size);
  cv.classList.add('pic-canvas');

  const wipe = () => { g.fillStyle = '#0f0b28'; g.fillRect(0, 0, size, size); };
  const style = () => { g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineWidth = 3.2; g.lineCap = 'round'; g.lineJoin = 'round'; };
  const dotAt = (x, y) => { style(); g.beginPath(); g.arc(x, y, 1.7, 0, 7); g.fill(); };
  const segAt = (x0, y0, x1, y1) => { style(); g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); };
  wipe();

  const U = (v) => v / 255 * size;                       // de red a píxeles
  const N = (v) => clamp(Math.round(v / size * 255), 0, 255);

  let buf = [], flushT = 0, pen = null, remote = null;
  const flush = () => { if(buf.length){ ctx.send({ dr: buf }); buf = []; } };
  const schedule = () => { if(!flushT) flushT = setTimeout(() => { flushT = 0; flush(); }, 110); };

  ctx.onMsg((m) => {
    if(m?.clr){ wipe(); remote = null; }
    if(!m?.dr) return;
    for(let k = 0; k < m.dr.length; k += 3){
      const x = U(m.dr[k]), y = U(m.dr[k + 1]), start = m.dr[k + 2];
      if(start){ remote = { x, y }; dotAt(x, y); }
      else if(remote){ segAt(remote.x, remote.y, x, y); remote = { x, y }; }
    }
  });

  const onDown = (e) => {
    const p = pointerPos(cv, e);
    pen = { x:N(p.x), y:N(p.y) };
    buf.push(pen.x, pen.y, 1);
    dotAt(U(pen.x), U(pen.y));
    schedule(); e.preventDefault();
  };
  const onMove = (e) => {
    if(!pen) return;
    const p = pointerPos(cv, e);
    const x = N(p.x), y = N(p.y);
    if(Math.abs(x - pen.x) < 2 && Math.abs(y - pen.y) < 2) return;
    segAt(U(pen.x), U(pen.y), U(x), U(y));
    buf.push(x, y, 0);
    pen = { x, y };
    schedule(); e.preventDefault();
  };
  const onUp = () => { if(pen){ pen = null; flush(); } };

  cv.addEventListener('pointerdown', onDown, { passive:false });
  window.addEventListener('pointermove', onMove, { passive:false });
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);

  /* ---------------- lógica de la partida --------------------------------- */
  /* La caja de adivinar es permanente: el reloj redibuja cada segundo y si la
     recreáramos se perdería el foco y se cerraría el teclado al escribir. */
  const guessInput = el('input', { class:'g-input', placeholder:'¿Qué es?', autocomplete:'off', enterkeyhint:'send' });
  const guessForm = el('form', { class:'guess-form' }, guessInput,
                       el('button', { class:'g-btn primary', type:'submit' }, '➤'));
  let onGuess = () => {};
  guessForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const t = guessInput.value.trim();
    if(!t) return;
    guessInput.value = '';
    vibrate(15);
    onGuess(t);
  });
  const logBox = el('div', { class:'pic-log' });

  const game = turnGame(ctx, {
    init(c, P){
      return { phase:'choose', drawer:P.host, round:1, word:'', opts:shuffled(PALABRAS, c.rng).slice(0, 3),
               t:TIME, score:{ [P.host]:0, [P.guest]:0 }, log:[] };
    },

    /* La palabra sólo la ve quien dibuja. */
    view(s, who){
      return { phase:s.phase, drawer:s.drawer, round:s.round, t:s.t, score:s.score, log:s.log,
               word: who === s.drawer ? s.word : '', len: s.word.length,
               opts: who === s.drawer ? s.opts : [] };
    },

    action(s, a, from, api){
      const P = api.P;
      if(a.pick != null && from === s.drawer && s.phase === 'choose'){
        s.word = s.opts[a.pick] || s.opts[0];
        s.phase = 'draw'; s.t = TIME; s.log = [];
        return;
      }
      if(a.guess && s.phase === 'draw' && from !== s.drawer){
        const ok = norm(a.guess) === norm(s.word);
        s.log = [{ text:a.guess, ok }, ...s.log].slice(0, 6);
        if(ok){
          s.score[from]    += Math.max(1, Math.ceil(s.t / 10));
          s.score[s.drawer] += 2;
          nextRound(s, api);
        }
        return;
      }
      if(a.skip && from === s.drawer && s.phase === 'draw') nextRound(s, api);
    },

    tick(s, api){
      if(s.phase !== 'draw') return;
      s.t--;
      if(s.t <= 0) nextRound(s, api);
      api.sync();
    },

    render(v, ui, c, api){
      const P = api.P;
      const iDraw = P.isMe(v.drawer);
      onGuess = (t) => api.act({ guess:t });

      // limpiamos todo MENOS la caja de adivinar (perdería el foco)
      clear(ui.center);
      [...ui.actions.children].forEach(n => { if(n !== guessForm) n.remove(); });
      if(iDraw || v.phase !== 'draw') guessForm.remove();

      if(v.phase === 'choose'){
        if(iDraw){
          ui.status(`Ronda ${v.round}/${ROUNDS} — escoge qué dibujar`, 'me');
          v.opts.forEach((w, i) => ui.btn(w, () => { beep(700, .07); api.act({ pick:i }); }, 'primary'));
        }else{
          ui.status(`${P.name(P.them)} está escogiendo palabra…`, 'them');
          ui.center.append(el('div', { class:'big-emoji', text:'🎨' }));
        }
        ui.center.append(el('div', { class:'g-pill', text:`${v.score[P.me]} — ${v.score[P.them]}` }));
        return;
      }

      ui.status(iDraw ? `Dibuja: ${v.word.toUpperCase()} · ${v.t}s`
                      : `Adivina · ${v.t}s · ${v.len} letras`, iDraw ? 'me' : 'them');

      cv.style.pointerEvents = iDraw ? 'auto' : 'none';
      ui.center.append(cv);

      clear(logBox);
      if(v.log?.length){
        v.log.forEach(l => logBox.append(el('span', { class:'pic-guess' + (l.ok ? ' ok' : ''), text:l.text })));
        ui.center.append(logBox);
      }

      if(iDraw){
        ui.btn('🧽 Borrar', () => { wipe(); ctx.send({ clr:1 }); beep(300, .05); });
        ui.btn('⏭ Saltar', () => api.act({ skip:1 }));
      }else if(!guessForm.parentNode){
        ui.actions.append(guessForm);
      }
    },
  }, { scroll:true });

  function nextRound(s, api){
    const P = api.P;
    s.round++;
    if(s.round > ROUNDS){
      s.phase = 'over';
      const mine = s.score[P.me], their = s.score[P.them];
      return api.finish(mine > their ? 'me' : mine < their ? 'them' : 'draw', `${mine} — ${their} puntos`);
    }
    s.drawer = P.other(s.drawer);
    s.phase = 'choose';
    s.opts = shuffled(PALABRAS, Math.random).slice(0, 3);
    s.t = TIME;
    ctx.send({ clr:1 });
    wipe();
  }

  return {
    resync: game.resync,
    destroy(){
      game.destroy();
      clearTimeout(flushT);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    },
  };
};
