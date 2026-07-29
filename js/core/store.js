/* Persistencia local (localStorage) — nombre, id de dispositivo, marcador, chat. */

const K = 'jgts:';

function read(key, fallback){
  try{
    const raw = localStorage.getItem(K + key);
    return raw == null ? fallback : JSON.parse(raw);
  }catch{ return fallback; }
}
function write(key, val){
  try{ localStorage.setItem(K + key, JSON.stringify(val)); }
  catch{ /* modo privado / cuota llena: seguimos sin persistir */ }
}

/* --- identidad --- */
export function deviceId(){
  let id = read('device', null);
  if(!id){
    id = 'p' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
    write('device', id);
  }
  return id;
}

export const myName    = ()  => read('name', '');
export const setMyName = (v) => write('name', String(v || '').slice(0, 14));

export const lastCode    = ()  => read('code', '');
export const setLastCode = (v) => write('code', v);

/* Momento en que este dispositivo entró por primera vez a una sala.
   Sirve para elegir anfitrión de forma estable aunque haya reconexiones. */
export function joinedAt(code){
  const map = read('joined', {});
  if(!map[code]){ map[code] = Date.now(); write('joined', map); }
  return map[code];
}

/* --- marcador acumulado ---
   { [code]: { [peerId]: { name, total, byGame:{ [gameId]: n } } } }        */
export function scores(code){
  return read('scores', {})[code] || {};
}
export function addWin(code, peerId, name, gameId){
  const all = read('scores', {});
  const room = all[code] || (all[code] = {});
  const p = room[peerId] || (room[peerId] = { name, total: 0, byGame: {} });
  p.name = name || p.name;
  p.total++;
  p.byGame[gameId] = (p.byGame[gameId] || 0) + 1;
  write('scores', all);
  return room;
}
export function ensurePlayer(code, peerId, name){
  const all = read('scores', {});
  const room = all[code] || (all[code] = {});
  if(!room[peerId]) room[peerId] = { name, total: 0, byGame: {} };
  else if(name) room[peerId].name = name;
  write('scores', all);
  return room;
}

/* --- historial de chat (últimos 120 mensajes por sala) --- */
export function chatLog(code){ return read('chat:' + code, []); }
export function pushChat(code, msg){
  const log = chatLog(code);
  if(msg.id && log.some(m => m.id === msg.id)) return log;   // dedupe de reenvíos
  log.push(msg);
  while(log.length > 120) log.shift();
  write('chat:' + code, log);
  return log;
}

/* --- preferencias --- */
export const prefs = () => read('prefs', { sound: true, vibrate: true });
export const setPref = (k, v) => { const p = prefs(); p[k] = v; write('prefs', p); };
