/* Utilidades de interfaz: DOM, toasts, hojas, emojis flotantes, cuenta regresiva. */

export const $  = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function el(tag, attrs = {}, ...kids){
  const n = document.createElement(tag);
  for(const [k, v] of Object.entries(attrs)){
    if(v == null || v === false) continue;
    if(k === 'class')       n.className = v;
    else if(k === 'style'){
      // Ojo: las variables CSS (--tint, --c) no se pueden asignar con
      // Object.assign; hay que pasar por setProperty.
      for(const [prop, val] of Object.entries(v)){
        if(prop.startsWith('--')) n.style.setProperty(prop, val);
        else n.style[prop] = val;
      }
    }
    else if(k === 'html')   n.innerHTML = v;
    else if(k === 'text')   n.textContent = v;
    else if(k.startsWith('on')) n.addEventListener(k.slice(2).toLowerCase(), v);
    else if(k === 'data')   Object.entries(v).forEach(([a, b]) => n.dataset[a] = b);
    else n.setAttribute(k, v);
  }
  for(const kid of kids.flat()){
    if(kid == null || kid === false) continue;
    n.append(kid.nodeType ? kid : document.createTextNode(kid));
  }
  return n;
}

export const clear = (node) => { while(node.firstChild) node.removeChild(node.firstChild); return node; };

/* ------------------------------------------------------------- pantallas -- */
export function showScreen(id){
  $$('.screen').forEach(s => s.classList.toggle('is-active', s.id === 'screen-' + id));
}

/* ---------------------------------------------------------------- toasts -- */
export function toast(text, ms = 2600){
  const wrap = $('#toast-wrap');
  const t = el('div', { class:'toast', text });
  wrap.append(t);
  setTimeout(() => {
    t.classList.add('out');
    setTimeout(() => t.remove(), 320);
  }, ms);
  return t;
}

/* --------------------------------------------------------- color de peer --
   El color sale del identificador del teléfono, y con seis colores a veces
   les tocaba el mismo a los dos (imposible saber de quién es cada ficha).
   Si chocan, se corre el del identificador MAYOR. La regla no depende de
   quién la calcula, así que los dos teléfonos pintan a cada quien igual. */
const PALETTE = ['#ff4f9a', '#22d3ee', '#ffd23f', '#a3e635', '#ff7a45', '#8b5cf6'];
const hashColor = (id = '') => {
  let h = 0;
  for(let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % PALETTE.length;
};
export function colorFor(id = '', otherId = null){
  let i = hashColor(id);
  if(otherId && otherId !== id && hashColor(otherId) === i && id > otherId){
    i = (i + 3) % PALETTE.length;                 // el "mayor" cede y se corre
  }
  return PALETTE[i];
}
export const initial = (name = '?') => (name.trim()[0] || '?').toUpperCase();

/* ------------------------------------------------------ emojis flotantes -- */
export function flyEmoji(char, count = 1){
  const layer = $('#fx-layer');
  for(let i = 0; i < count; i++){
    const n = el('div', { class:'fx-emoji', text:char });
    n.style.left = (12 + Math.random() * 72) + 'vw';
    n.style.bottom = '14vh';
    n.style.setProperty('--rot', (Math.random() * 60 - 30) + 'deg');
    n.style.animationDelay = (i * 0.09) + 's';
    layer.append(n);
    setTimeout(() => n.remove(), 2400 + i * 90);
  }
}

/* -------------------------------------------------------- cuenta regresiva -- */
export function countdown(from = 3, label = ''){
  return new Promise(resolve => {
    const box = $('#countdown'), num = $('#cd-num'), lab = $('#cd-label');
    lab.textContent = label;
    box.hidden = false;
    let n = from;
    const tick = () => {
      num.textContent = n > 0 ? n : '¡Va!';
      num.style.animation = 'none';
      void num.offsetWidth;                       // reinicia la animación
      num.style.animation = '';
      beep(n > 0 ? 660 : 990, n > 0 ? 0.07 : 0.18);
      vibrate(n > 0 ? 25 : 60);
      if(n < 0){ box.hidden = true; resolve(); return; }
      n--;
      setTimeout(tick, 800);
    };
    tick();
  });
}

/* ------------------------------------------------------------ sonido/vibra --
   El navegador no deja sonar nada hasta que la persona toca la pantalla, y en
   iPhone el permiso sólo se concede DURANTE ese toque. Si el primer sonido
   salía de un temporizador (una carta cantada, el dado), el audio se quedaba
   dormido y ya no se oía nada en toda la partida. Por eso lo despertamos con
   el primer toque, pase lo que pase, y otra vez al volver del segundo plano. */
let actx = null;

function audio(){
  if(!actx){
    const AC = window.AudioContext || window.webkitAudioContext;
    if(!AC) return null;
    actx = new AC();
  }
  if(actx.state === 'suspended') actx.resume();
  return actx;
}

export function unlockAudio(){
  const a = audio();
  if(!a) return;
  try{                                   // un sonido mudo: basta para desbloquear
    const s = a.createBufferSource();
    s.buffer = a.createBuffer(1, 1, a.sampleRate);
    s.connect(a.destination);
    s.start(0);
  }catch{}
}

if(typeof document !== 'undefined'){
  const despertar = () => unlockAudio();
  document.addEventListener('pointerdown', despertar, { capture:true });
  document.addEventListener('keydown', despertar, { capture:true });
  document.addEventListener('visibilitychange', () => { if(!document.hidden) audio(); });
}

export function beep(freq = 660, dur = 0.08, type = 'sine', gain = 0.05){
  try{
    if(!audio()) return;
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(gain, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
    o.connect(g).connect(actx.destination);
    o.start(); o.stop(actx.currentTime + dur);
  }catch{}
}
export function chord(freqs, dur = 0.3){ freqs.forEach((f, i) => setTimeout(() => beep(f, dur, 'triangle', 0.045), i * 70)); }

/** Ruido corto: sirve para golpes, dados y cosas que "raspan". */
function noise(dur = 0.08, gain = 0.05, filterHz = 1800){
  try{
    if(!audio()) return;
    const n = Math.floor(actx.sampleRate * dur);
    const buf = actx.createBuffer(1, n, actx.sampleRate);
    const data = buf.getChannelData(0);
    for(let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = actx.createBufferSource(); src.buffer = buf;
    const f = actx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filterHz;
    const g = actx.createGain(); g.gain.value = gain;
    src.connect(f).connect(g).connect(actx.destination);
    src.start();
  }catch{}
}

/** Tono que se desliza de una frecuencia a otra. */
function slide(from, to, dur = 0.25, gain = 0.05, type = 'sine'){
  try{
    if(!audio()) return;
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(from, actx.currentTime);
    o.frequency.exponentialRampToValueAtTime(Math.max(30, to), actx.currentTime + dur);
    g.gain.setValueAtTime(gain, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
    o.connect(g).connect(actx.destination);
    o.start(); o.stop(actx.currentTime + dur);
  }catch{}
}

export const sfxWin     = () => chord([523, 659, 784, 1047], 0.35);
export const sfxLose    = () => chord([392, 330, 262], 0.4);
export const sfxPop     = () => beep(880, 0.05, 'square', 0.04);
/* --- sonidos de juego --- */
export const sfxDice    = () => { for(let i = 0; i < 5; i++) setTimeout(() => noise(0.05, 0.05, 2600), i * 85); };
export const sfxLand    = () => { noise(0.09, 0.07, 900); beep(180, 0.09, 'sine', 0.05); };
export const sfxStep    = (i = 0) => beep(420 + Math.min(i, 12) * 26, 0.045, 'triangle', 0.035);
export const sfxLadder  = () => { [523, 659, 784, 988, 1175].forEach((f, i) => setTimeout(() => beep(f, 0.09, 'triangle', 0.04), i * 65)); };
export const sfxSnake   = () => slide(760, 150, 0.55, 0.055, 'sawtooth');
export const sfxDrop    = () => { slide(520, 190, 0.16, 0.05, 'sine'); setTimeout(() => noise(0.06, 0.05, 700), 140); };
export const sfxFlip    = () => beep(1150, 0.04, 'sine', 0.03);
export const sfxCapture = () => { noise(0.12, 0.07, 1200); slide(300, 120, 0.18, 0.05, 'square'); };
export const sfxHit     = () => beep(760, 0.035, 'square', 0.045);
export const sfxWall    = () => beep(380, 0.03, 'square', 0.03);
export const sfxGoal    = () => { slide(220, 660, 0.28, 0.055, 'triangle'); setTimeout(() => beep(880, 0.12, 'triangle', 0.05), 200); };
export const sfxError   = () => slide(300, 140, 0.22, 0.05, 'square');

export function vibrate(pattern){
  try{ navigator.vibrate?.(pattern); }catch{}
}

/* ---------------------------------------------------------------- hojas -- */
export function openSheet(id){
  const s = document.getElementById(id);
  if(!s) return;
  s.hidden = false;
  s.querySelector('[data-close]')?.addEventListener('click', () => s.hidden = true, { once:true });
}
export const closeSheet = (id) => { const s = document.getElementById(id); if(s) s.hidden = true; };

/* ------------------------------------------------------------------ misc -- */
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/** Generador con semilla: los dos teléfonos producen la misma secuencia. */
export function makeRng(seed){
  let s = (seed >>> 0) || 1;
  return function rng(){
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;  s >>>= 0;
    return s / 4294967296;
  };
}
export const rngInt   = (rng, n) => Math.floor(rng() * n);
export const shuffled = (arr, rng) => {
  const a = [...arr];
  for(let i = a.length - 1; i > 0; i--){
    const j = rngInt(rng, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
