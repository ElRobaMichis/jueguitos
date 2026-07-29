/* ===========================================================================
   net.js — sincronización en tiempo real sin backend propio.

   Cómo funciona
   -------------
   La app es 100% estática (sirve en GitHub Pages). La "sala" vive en un broker
   MQTT público sobre WebSocket seguro (wss). MQTT es ideal para conexiones
   móviles inestables: paquetes minúsculos (2–4 bytes de cabecera), keepalive
   configurable, QoS 1 con reintento automático, "last will" (avisa cuando
   alguien se cae) y mensajes "retained" (el que se reconecta recibe al
   instante el estado actual sin pedir nada).

   Se conecta a una lista de brokers; si uno falla, mqtt.js rota al siguiente.

   Topics (base = jgts/1/<hash del código>):
     <base>/m        mensajes efímeros  (chat, emojis, jugadas, ping)
     <base>/p/<id>   presencia          (retained + last will)
     <base>/k/<id>   juego elegido      (retained)
     <base>/s        estado del juego   (retained, lo publica el anfitrión)

   Privacidad: el topic se deriva de un hash del código, y todo el contenido
   va cifrado con AES-GCM usando una llave derivada del propio código. El
   broker sólo ve bytes.
   =========================================================================== */

import { Emitter } from '../core/emitter.js';

/* Brokers públicos, en orden de preferencia. Se conecta por URL completa:
   la opción `servers` de mqtt.js ignora la ruta en el navegador y el broker
   cierra la conexión, así que la rotación la hacemos nosotros. */
const BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://test.mosquitto.org:8081/mqtt',
];
const CONNECT_MS = 9000;      // si un broker no responde en 9 s, al siguiente
const REVIVE_MS  = 16000;     // si tras caerse no vuelve en 16 s, al siguiente

const PROTO   = 'jgts/1';
const SALT    = 'jueguitos-sal-2024';
const enc     = new TextEncoder();
const dec     = new TextDecoder();

/* --- utilidades de cripto ------------------------------------------------ */

async function sha256Hex(str){
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(str));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function deriveKey(code){
  const base = await crypto.subtle.importKey('raw', enc.encode(code + SALT), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode(SALT), iterations: 60000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/* ========================================================================== */

export class Net extends Emitter {
  constructor(){
    super();
    this.client   = null;
    this.code     = null;
    this.me       = null;          // { id, name, joinedAt }
    this.peers    = new Map();     // id -> { id, name, joinedAt, online, pick, lastSeen }
    this.status   = 'idle';        // idle | connecting | online | offline
    this.seq      = 0;
    this._seen    = new Set();     // ids de mensajes ya procesados (dedupe)
    this._seenQ   = [];
    this._outbox  = [];            // mensajes fiables aún no confirmados por el peer
    this._sendQ   = Promise.resolve();
    this._recvQ   = Promise.resolve();
    this.rtt      = null;
  }

  /* ---------------------------------------------------------------- join -- */
  async join({ code, name, id, joinedAt }){
    this.code = code;
    this.me   = { id, name, joinedAt };
    this.key  = await deriveKey(code);

    const hash  = await sha256Hex(code + SALT);
    this.base   = `${PROTO}/${hash.slice(0, 20)}`;
    this.tMsg   = `${this.base}/m`;
    this.tState = `${this.base}/s`;
    this.tPres  = (pid) => `${this.base}/p/${pid}`;
    this.tPick  = (pid) => `${this.base}/k/${pid}`;

    this._will = await this._seal({ t:'p', d:{ ...this.me, online:false } });
    this._alive = true;

    // Empezamos por el último broker que funcionó en este teléfono.
    let start = 0;
    try{ start = Math.max(0, BROKERS.indexOf(localStorage.getItem('jgts:broker'))); }catch{}
    this._connectTo(start);

    // Latido: mantiene fresco el "lastSeen" del otro lado.
    clearInterval(this._hb);
    this._hb = setInterval(() => {
      if(this.status === 'online'){
        this.publish({ t:'hb', d:{ ts: Date.now() } }, { qos: 0 });
        this._checkStale();
      }
    }, 5000);
  }

  /** Conecta a un broker; si no responde o muere, salta al siguiente. */
  _connectTo(i){
    if(!this._alive) return;
    const url = BROKERS[i % BROKERS.length];
    this._brokerIdx = i;
    this._setStatus('connecting');

    const client = mqtt.connect(url, {
      clientId: `${this.me.id}-${Math.random().toString(36).slice(2, 7)}`,
      clean: true,
      keepalive: 30,
      reconnectPeriod: 2000,
      connectTimeout: CONNECT_MS,
      resubscribe: true,
      protocolVersion: 4,
      will: { topic: this.tPres(this.me.id), payload: this._will, qos: 1, retain: true },
    });
    this.client = client;

    let connected = false;
    const rotate = () => {
      if(!this._alive || this.client !== client) return;
      clearTimeout(this._giveUp);
      try{ client.end(true); }catch{}
      console.warn('[net] broker sin respuesta:', url, '→ probando el siguiente');
      this._connectTo(i + 1);
    };
    // Si nunca llega a conectar, rotamos; si se cae y no revive, también.
    this._giveUp = setTimeout(rotate, CONNECT_MS + 1000);

    client.on('connect', () => {
      if(this.client !== client) return;
      connected = true;
      clearTimeout(this._giveUp);
      try{ localStorage.setItem('jgts:broker', url); }catch{}

      // Ojo: mqtt.js v5 sólo acepta el mapa {topic: {qos}}; con un arreglo de
      // objetos lanza excepción y se quedaba todo a medias.
      client.subscribe({
        [this.tMsg]:          { qos: 0 },
        [`${this.base}/p/+`]: { qos: 1 },
        [`${this.base}/k/+`]: { qos: 1 },
        [this.tState]:        { qos: 1 },
      }, (err) => { if(err) console.warn('[net] subscribe', err.message); });

      this._announce();
      this._setStatus('online');
      this._flushOutbox();
      this.emit('reconnected');
    });

    client.on('reconnect', () => { if(this.client === client) this._setStatus('connecting'); });
    client.on('close', () => {
      if(this.client !== client || !this._alive) return;
      this._setStatus('offline');
      clearTimeout(this._giveUp);
      this._giveUp = setTimeout(rotate, connected ? REVIVE_MS : CONNECT_MS);
    });
    client.on('error',   (e) => console.warn('[net] error', e?.message || e));
    client.on('message', (topic, payload) => { if(this.client === client) this._onRaw(topic, payload); });
  }

  leave(){
    this._alive = false;
    clearInterval(this._hb);
    clearTimeout(this._giveUp);
    if(this.client){
      try{
        // Limpia los retained propios para que la sala quede vacía de verdad.
        this.client.publish(this.tPres(this.me.id), '', { qos: 1, retain: true });
        this.client.publish(this.tPick(this.me.id), '', { qos: 1, retain: true });
        this.client.end(true);
      }catch{}
    }
    this.client = null;
    this.peers.clear();
    this._setStatus('idle');
  }

  /* --------------------------------------------------------------- envío -- */

  /** Publica un sobre en el topic de mensajes. */
  publish(env, { qos = 0 } = {}){
    env.f = this.me.id;
    env.n = ++this.seq;
    this._sealAndSend(this.tMsg, env, { qos, retain: false });
  }

  /** Mensaje fiable: se reintenta si la otra persona estaba desconectada. */
  publishReliable(env){
    env.i = env.i || (this.me.id + ':' + (++this.seq));
    this._outbox.push(env);
    if(this._outbox.length > 40) this._outbox.shift();
    this.publish(env, { qos: 1 });
  }

  /** Estado del juego (retained): quien se reconecte lo recibe de inmediato. */
  publishState(state){
    this._sealAndSend(this.tState, { t:'s', f:this.me.id, d:state, n:++this.seq }, { qos:1, retain:true });
  }
  clearState(){
    if(this.client) this.client.publish(this.tState, '', { qos: 1, retain: true });
  }

  /** Juego seleccionado en el menú (retained por jugador). */
  publishPick(gameId){
    if(this.me) this.me.pick = gameId;
    this._sealAndSend(this.tPick(this.me.id), { t:'k', f:this.me.id, d:{ pick:gameId, name:this.me.name } },
                      { qos:1, retain:true });
  }

  _announce(){
    this._sealAndSend(this.tPres(this.me.id),
      { t:'p', d:{ ...this.me, online:true, ts:Date.now() } }, { qos:1, retain:true });
  }

  _sealAndSend(topic, obj, opts){
    // Cola secuencial: el cifrado es asíncrono y queremos preservar el orden.
    this._sendQ = this._sendQ.then(async () => {
      if(!this.client) return;
      try{
        const buf = await this._seal(obj);
        this.client.publish(topic, buf, opts);
      }catch(e){ console.warn('[net] publish', e); }
    });
  }

  async _seal(obj){
    const iv  = crypto.getRandomValues(new Uint8Array(12));
    const ct  = await crypto.subtle.encrypt({ name:'AES-GCM', iv }, this.key, enc.encode(JSON.stringify(obj)));
    const out = new Uint8Array(12 + ct.byteLength);
    out.set(iv, 0);
    out.set(new Uint8Array(ct), 12);
    return out;
  }

  async _open(payload){
    const bytes = new Uint8Array(payload);
    if(bytes.length < 13) return null;
    const pt = await crypto.subtle.decrypt(
      { name:'AES-GCM', iv: bytes.slice(0, 12) }, this.key, bytes.slice(12));
    return JSON.parse(dec.decode(pt));
  }

  _flushOutbox(){
    for(const env of this._outbox) this.publish({ ...env }, { qos: 1 });
  }
  ackDelivered(msgId){
    this._outbox = this._outbox.filter(m => m.i !== msgId);
  }

  /* ------------------------------------------------------------ recepción -- */

  _onRaw(topic, payload){
    if(!payload || payload.length === 0){        // retained borrado
      if(topic.includes('/p/')) this._dropPeer(topic.split('/p/')[1]);
      if(topic === this.tState) this.emit('state', null);
      return;
    }
    this._recvQ = this._recvQ.then(async () => {
      let env;
      try{ env = await this._open(payload); }
      catch{ return; }                            // no es de nuestra sala (código distinto)
      if(!env) return;
      this._route(topic, env);
    });
  }

  _route(topic, env){
    /* --- presencia --- */
    if(topic.startsWith(this.base + '/p/')){
      const d = env.d || {};
      if(d.id === this.me.id) return;
      const prev = this.peers.get(d.id);
      const peer = {
        ...(prev || {}), id:d.id, name:d.name, joinedAt:d.joinedAt,
        online:!!d.online, lastSeen:Date.now(),
      };
      this.peers.set(d.id, peer);
      if(!prev || prev.online !== peer.online){
        this.emit(peer.online ? 'peer-online' : 'peer-offline', peer);
        if(peer.online) this._flushOutbox();     // reenvía lo que no recibió
      }
      this.emit('peers', this.peerList());
      return;
    }

    /* --- selección de juego --- */
    if(topic.startsWith(this.base + '/k/')){
      const id = topic.split('/k/')[1];
      if(id === this.me.id) return;
      const peer = this.peers.get(id) || { id, name:env.d?.name, online:true };
      peer.pick = env.d?.pick ?? null;
      this.peers.set(id, peer);
      this.emit('pick', peer);
      this.emit('peers', this.peerList());
      return;
    }

    /* --- estado retenido del juego --- */
    if(topic === this.tState){
      if(env.f !== this.me.id) this.emit('state', env.d, env.f);
      return;
    }

    /* --- mensajes efímeros --- */
    if(env.f === this.me.id) return;              // eco propio
    if(env.i){                                    // dedupe de mensajes fiables
      if(this._seen.has(env.i)) return;
      this._seen.add(env.i);
      this._seenQ.push(env.i);
      if(this._seenQ.length > 300) this._seen.delete(this._seenQ.shift());
    }

    const peer = this.peers.get(env.f);
    if(peer){ peer.lastSeen = Date.now(); if(!peer.online){ peer.online = true; this.emit('peer-online', peer); this.emit('peers', this.peerList()); } }

    if(env.t === 'hb') return;                    // sólo servía para refrescar lastSeen
    this.emit('msg', env);
    this.emit('msg:' + env.t, env.d, env);
  }

  _dropPeer(id){
    if(this.peers.has(id)){
      const p = this.peers.get(id);
      p.online = false;
      this.emit('peer-offline', p);
      this.emit('peers', this.peerList());
    }
  }

  /* Si no sabemos nada de alguien en 16s lo marcamos desconectado.
     (El last will cubre las caídas limpias; esto cubre las de red.) */
  _checkStale(){
    const now = Date.now();
    let changed = false;
    for(const p of this.peers.values()){
      if(p.online && now - (p.lastSeen || 0) > 16000){ p.online = false; changed = true; this.emit('peer-offline', p); }
    }
    if(changed) this.emit('peers', this.peerList());
  }

  _setStatus(s){
    if(this.status === s) return;
    this.status = s;
    this.emit('status', s);
  }

  /* ------------------------------------------------------------- helpers -- */

  /** Al volver del segundo plano el socket suele estar muerto: forzamos reconexión. */
  wake(){
    if(!this.client) return;
    if(!this.client.connected){
      try{ this.client.reconnect(); }catch{}
    }else{
      this._announce();
    }
  }

  peerList(){ return [...this.peers.values()]; }
  partner(){ return this.peerList()[0] || null; }          // app de 2 jugadores
  partnerOnline(){ return !!this.partner()?.online; }

  /** Anfitrión = quien entró primero (estable entre reconexiones). */
  isHost(){
    const other = this.partner();
    if(!other) return true;
    if(other.joinedAt == null) return true;
    if(this.me.joinedAt !== other.joinedAt) return this.me.joinedAt < other.joinedAt;
    return this.me.id < other.id;
  }
}

export const net = new Net();
