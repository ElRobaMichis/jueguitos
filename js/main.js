/* ===========================================================================
   main.js — arranque, pantalla de inicio, sala y menú de juegos.
   =========================================================================== */

import { net } from './net/net.js';
import { Engine } from './core/engine.js';
import { GAMES, gameById } from './games/registry.js';
import * as store from './core/store.js';
import {
  $, $$, el, clear, showScreen, toast, colorFor, initial,
  flyEmoji, countdown, beep, vibrate, sfxPop, openSheet, closeSheet,
} from './core/ui.js';

const EMOJIS = ['❤️', '😂', '😮', '😘', '😭', '🔥', '👏', '😜'];
/* Se muestra abajo en la pantalla de inicio: si algo falla, sirve para saber
   qué versión tiene cada teléfono. Cámbialo junto con VERSION en sw.js. */
const VERSION = 'v8';

const app = {
  code: null,
  me: null,
  engine: null,
  inGame: false,
  unread: 0,
  myPick: null,
};

/* =====================================================================
   INICIO
   ===================================================================== */

function setupHome(){
  const nameInput = $('#inp-name');
  nameInput.value = store.myName();

  /* casillas del código: avanzan solas, aceptan pegar y borrar */
  const boxes = $$('#code-input input');
  boxes.forEach((b, i) => {
    b.addEventListener('input', () => {
      b.value = b.value.replace(/\D/g, '').slice(0, 1);
      if(b.value && i < 3) boxes[i + 1].focus();
    });
    b.addEventListener('keydown', (e) => {
      if(e.key === 'Backspace' && !b.value && i > 0){ boxes[i - 1].focus(); boxes[i - 1].value = ''; e.preventDefault(); }
    });
    b.addEventListener('paste', (e) => {
      const t = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 4);
      if(!t) return;
      e.preventDefault();
      [...t].forEach((c, k) => boxes[k] && (boxes[k].value = c));
      boxes[Math.min(t.length, 3)].focus();
    });
  });

  const readCode = () => boxes.map(b => b.value).join('');
  const writeCode = (c) => [...String(c)].forEach((ch, i) => boxes[i] && (boxes[i].value = ch));

  /* ¿vino por un enlace con código? */
  const fromUrl = (location.hash.match(/\d{4}/) || [])[0];
  if(fromUrl){ writeCode(fromUrl); $('#home-hint').textContent = `Te invitaron a la sala ${fromUrl}. Pon tu nombre y entra.`; }
  else if(store.lastCode()) writeCode(store.lastCode());

  const needName = () => {
    const n = nameInput.value.trim();
    if(!n){ toast('Primero escribe tu nombre 🙂'); nameInput.focus(); return null; }
    store.setMyName(n);
    return n;
  };

  $('#btn-create').addEventListener('click', () => {
    const name = needName(); if(!name) return;
    const code = String(1000 + Math.floor(Math.random() * 9000));
    writeCode(code);
    enterRoom(code, name);
  });

  $('#btn-join').addEventListener('click', () => {
    const name = needName(); if(!name) return;
    const code = readCode();
    if(code.length !== 4){ toast('El código son 4 dígitos'); boxes[0].focus(); return; }
    enterRoom(code, name);
  });
}

/* =====================================================================
   SALA
   ===================================================================== */

async function enterRoom(code, name){
  app.code = code;
  store.setLastCode(code);

  const id = store.deviceId();
  app.me = { id, name, joinedAt: store.joinedAt(code) };
  store.ensurePlayer(code, id, name);

  $('#lbl-code').textContent = code;
  showScreen('lobby');
  renderGrid();
  renderChatLog();
  renderScore();

  app.engine = new Engine({
    code,
    me: app.me,
    onExit: () => { app.inGame = false; showScreen('lobby'); clearPicks(); renderScore(); renderGrid(); },
  });

  wireNet();
  await net.join({ code, name, id, joinedAt: app.me.joinedAt });
}

function wireNet(){
  net.on('status', (s) => paintConn(s));

  net.on('peers', () => { renderPeers(); renderGrid(); renderScore(); });

  net.on('peer-online', (p) => {
    store.ensurePlayer(app.code, p.id, p.name);
    toast(`${p.name} está en línea 💚`);
    beep(880, 0.08); vibrate(30);
  });
  net.on('peer-offline', (p) => toast(`${p.name} perdió la conexión…`));

  /* Dos copias de la app en el mismo navegador comparten identidad y nunca se
     verían entre sí. Antes fallaba en silencio; ahora se avisa. */
  let avisoMismoEquipo = false;
  net.on('same-device', () => {
    if(avisoMismoEquipo) return;
    avisoMismoEquipo = true;
    $('#lobby-hint').textContent =
      'Están los dos en el mismo navegador, por eso no se ven. Abre una en otro teléfono (o en una ventana privada).';
    toast('⚠️ Las dos ventanas son del mismo navegador: no pueden verse entre sí', 6000);
  });

  /* la otra persona eligió un juego */
  net.on('pick', (peer) => {
    renderGrid();
    if(peer.pick && !app.inGame){
      const g = gameById(peer.pick);
      if(g && peer.pick !== app.myPick){
        toast(`${peer.name} quiere jugar ${g.name} ${g.emoji}`);
        beep(740, 0.09); setTimeout(() => beep(980, 0.12), 110);
        vibrate([40, 50, 40]);
      }
    }
    maybeStart();
  });

  /* chat */
  net.on('msg:chat', (d, env) => {
    net.publish({ t:'ack', d:{ id: env.i } });
    const msg = { id: env.i, from:'them', text:d.text, ts:d.ts || Date.now() };
    const log = store.pushChat(app.code, msg);
    if(log.at(-1) !== msg) return;                 // era un reenvío repetido
    appendChat(msg);
    if($('#sheet-chat').hidden){
      app.unread++;
      $('#chat-badge').textContent = app.unread;
      $('#chat-badge').classList.add('show');
      beep(660, 0.06); vibrate(25);
    }
  });
  net.on('msg:ack', (d) => net.ackDelivered(d.id));

  /* reacciones */
  net.on('msg:emoji', (d) => { flyEmoji(d.e, 3); beep(1200, 0.05); vibrate(20); });

  /* arranque de partida decidido por el anfitrión */
  net.on('msg:start', (d) => {
    if(app.inGame) return;
    launch(d.gameId, d.seed);
  });

  /* el marcador lo lleva cada quien, pero se sincroniza al terminar */
  net.on('msg:end', () => setTimeout(renderScore, 300));
}

function paintConn(s){
  const online = s === 'online';
  for(const [bar, txt] of [['#conn-bar', '#conn-text'], ['#conn-bar-game', '#conn-text-game']]){
    const b = $(bar);
    b.classList.toggle('show', !online);
    b.classList.toggle('ok', online);
    $(txt).textContent = s === 'connecting' ? 'Conectando…' : 'Sin conexión — reintentando…';
  }
  if(online && !app._greeted){
    app._greeted = true;
    toast('Conectado ✅', 1500);
  }
}

function renderPeers(){
  const wrap = clear($('#peers'));
  const list = [app.me, ...net.peerList()];
  for(const p of list){
    const isMe = p.id === app.me.id;
    wrap.append(el('div', {
      class: 'peer-chip' + (!isMe && !p.online ? ' off' : ''),
      style: { background: colorFor(p.id) },
      title: p.name,
      text: initial(p.name),
    }));
  }
}

/* --------------------------------------------------------- menú de juegos -- */

function renderGrid(){
  const grid = clear($('#game-grid'));
  const peer = net.partner();

  for(const g of GAMES){
    const mine  = app.myPick === g.id;
    const their = peer?.pick === g.id;
    const marks = el('div', { class:'pick-marks' });
    if(mine)  marks.append(el('div', { class:'pick-mark', style:{ background:colorFor(app.me.id) }, text:initial(app.me.name) }));
    if(their) marks.append(el('div', { class:'pick-mark', style:{ background:colorFor(peer.id) },   text:initial(peer.name) }));

    grid.append(el('button', {
      class: 'game-tile' + (mine && their ? ' picked-both' : mine ? ' picked-me' : their ? ' picked-them' : ''),
      style: { '--tint': g.tint },
      onclick: () => pick(g.id),
    },
      el('div', { class:'g-tag', text:g.tag }),
      el('div', { class:'g-emoji', text:g.emoji }),
      el('div', { class:'g-name', text:g.name }),
      marks,
    ));
  }

  const hint = $('#lobby-hint');
  if(!peer)            hint.textContent = `Comparte el código ${app.code} para que se una.`;
  else if(!peer.online) hint.textContent = `${peer.name} no está conectada ahora mismo.`;
  else                  hint.textContent = 'Toca un juego. Cuando los dos toquen el mismo, empieza.';
}

function pick(gameId){
  if(app.inGame) return;
  app.myPick = (app.myPick === gameId) ? null : gameId;
  net.publishPick(app.myPick);
  sfxPop(); vibrate(20);
  renderGrid();
  maybeStart();
}

function clearPicks(){
  app.myPick = null;
  net.publishPick(null);
}

/* Los dos eligieron lo mismo → el anfitrión reparte la semilla y arrancamos. */
function maybeStart(){
  if(app.inGame || !app.myPick) return;
  const peer = net.partner();
  if(!peer?.online || peer.pick !== app.myPick) return;
  if(!net.isHost()) return;                        // el invitado espera el 'start'
  const seed = (Math.random() * 2 ** 31) | 0;
  net.publishReliable({ t:'start', d:{ gameId: app.myPick, seed } });
  launch(app.myPick, seed);
}

async function launch(gameId, seed){
  const g = gameById(gameId);
  if(!g) return;
  app.inGame = true;
  clearPicks();
  closeSheet('sheet-chat'); closeSheet('sheet-score');
  showScreen('game');
  await countdown(3, `${g.emoji} ${g.name}`);
  await app.engine.start(gameId, seed);
}

/* ------------------------------------------------------------------ chat -- */

function renderChatLog(){
  const log = clear($('#chat-log'));
  const msgs = store.chatLog(app.code);
  if(!msgs.length) log.append(el('div', { class:'msg sys', text:'Aquí pueden platicar mientras juegan 💬' }));
  msgs.forEach(m => appendChat(m, false));
  log.scrollTop = log.scrollHeight;
}

function appendChat(m, scroll = true){
  const log = $('#chat-log');
  log.append(el('div', { class:'msg ' + (m.from === 'me' ? 'me' : 'them'), text:m.text }));
  if(scroll) log.scrollTop = log.scrollHeight;
}

function sendChat(text){
  text = text.trim();
  if(!text) return;
  const id = app.me.id + ':c' + Date.now().toString(36);
  const msg = { id, from:'me', text, ts:Date.now() };
  store.pushChat(app.code, msg);
  appendChat(msg);
  net.publishReliable({ t:'chat', i:id, d:{ text, ts:msg.ts } });
}

/* -------------------------------------------------------------- marcador -- */

function renderScore(){
  const sc = store.scores(app.code);
  const peer = net.partner();
  const mine = sc[app.me.id]?.total || 0;
  const their = peer ? (sc[peer.id]?.total || 0) : 0;

  $('#scoreline').innerHTML =
    `<span>${escapeHtml(app.me.name)} <b>${mine}</b></span><span>·</span>` +
    `<span><b>${their}</b> ${escapeHtml(peer?.name || '…')}</span>`;

  const body = clear($('#score-body'));
  body.append(el('div', { class:'score-total' },
    el('div', {}, el('div', { class:'n', style:{ color:colorFor(app.me.id) }, text:String(mine) }), app.me.name),
    el('div', { text:'—' }),
    el('div', {}, el('div', { class:'n', style:{ color:colorFor(peer?.id || '') }, text:String(their) }), peer?.name || '…'),
  ));

  const rows = GAMES
    .map(g => ({ g, a: sc[app.me.id]?.byGame?.[g.id] || 0, b: peer ? (sc[peer.id]?.byGame?.[g.id] || 0) : 0 }))
    .filter(r => r.a || r.b);

  if(!rows.length) body.append(el('div', { class:'msg sys', text:'Todavía no hay partidas ganadas. ¡A jugar!' }));
  rows.forEach(({ g, a, b }) => body.append(
    el('div', { class:'score-row' },
      el('span', { text:g.emoji }),
      el('span', { class:'sr-name', text:g.name }),
      el('span', { class:'sr-val', text:`${a} - ${b}` }),
    )));
}

const escapeHtml = (s = '') => s.replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

/* ------------------------------------------------------------- controles -- */

function setupChrome(){
  /* pestañas */
  $$('.tab').forEach(t => t.addEventListener('click', () => {
    const panel = t.dataset.panel;
    $$('.tab').forEach(x => x.classList.toggle('is-active', x === t));
    if(panel === 'chat'){
      openSheet('sheet-chat');
      app.unread = 0;
      $('#chat-badge').classList.remove('show');
      $('#chat-log').scrollTop = $('#chat-log').scrollHeight;
    } else closeSheet('sheet-chat');
    if(panel === 'score'){ renderScore(); openSheet('sheet-score'); } else closeSheet('sheet-score');
    if(panel === 'games'){ closeSheet('sheet-chat'); closeSheet('sheet-score'); }
  }));

  $('#chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    sendChat($('#chat-input').value);
    $('#chat-input').value = '';
  });

  /* barra de emojis */
  const bar = $('#emoji-bar');
  EMOJIS.forEach(e => bar.append(el('button', { text:e, onclick:() => {
    flyEmoji(e, 3);
    net.publish({ t:'emoji', d:{ e } });
    beep(1000, 0.05);
  } })));
  const toggleBar = () => { bar.hidden = !bar.hidden; };
  const emojiBtns = ['#btn-emoji-open', '#btn-emoji-lobby'];
  emojiBtns.forEach(sel => $(sel)?.addEventListener('click', toggleBar));
  document.addEventListener('click', (ev) => {
    if(bar.hidden) return;
    if(bar.contains(ev.target)) return;
    if(emojiBtns.some(sel => ev.target.closest?.(sel))) return;
    bar.hidden = true;
  });

  /* compartir código */
  $('#btn-share').addEventListener('click', async () => {
    const url = location.origin + location.pathname + '#' + app.code;
    const text = `¡Juguemos! Entra a ${url} con el código ${app.code} 🎮`;
    try{
      if(navigator.share) await navigator.share({ title:'Jueguitos', text, url });
      else { await navigator.clipboard.writeText(text); toast('Enlace copiado 📋'); }
    }catch{}
  });

  $('#btn-leave').addEventListener('click', () => {
    net.leave();
    app._greeted = false;
    app.code = null;
    if(app.updatePendiente){ location.reload(); return; }   // ahora sí, versión nueva
    showScreen('home');
  });

  $('#btn-quit').addEventListener('click', () => app.engine?.exit(true));

  /* al volver del segundo plano reconectamos de inmediato */
  document.addEventListener('visibilitychange', () => { if(!document.hidden) net.wake(); });
  window.addEventListener('online', () => net.wake());
}

/* ------------------------------------------------------------- arranque -- */
setupHome();
setupChrome();
$('#app-version').textContent = VERSION;

if('serviceWorker' in navigator){
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));

  /* Cuando publico una corrección, el service worker nuevo toma el control.
     Recargamos para estrenarla, pero NUNCA a media partida: si están en una
     sala, avisamos y la aplicamos cuando salgan. */
  const habiaControlador = !!navigator.serviceWorker.controller;   // false = primera instalación
  let recargando = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if(recargando || !habiaControlador) return;
    if(app.code){                                   // en una sala: ni se te ocurra
      app.updatePendiente = true;
      toast('Hay una versión nueva ✨ se aplica al salir de la sala', 4000);
      return;
    }
    recargando = true;
    location.reload();
  });
}
