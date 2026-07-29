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

   Se conecta a los TRES brokers a la vez y anuncia su presencia en todos, de
   modo que los dos jugadores se encuentran aunque cada teléfono alcance unos
   relays distintos. El juego se va por aquel donde estén los dos.

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

/* Brokers públicos. Se conecta por URL completa: la opción `servers` de
   mqtt.js ignora la ruta en el navegador y el broker cierra la conexión. */
const BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://test.mosquitto.org:8081/mqtt',
];
const CONNECT_MS   = 9000;    // tiempo máximo para que un relay conteste
const STALE_MS     = 75000;   // margen antes de dar por caído a alguien callado
const HEARTBEAT_MS = 25000;   // latido de cortesía (el broker ya vigila con keepalive)

/* La librería MQTT pesa 96 KB comprimidos: 4 veces más que toda la app. Se
   baja al entrar a una sala, no al abrir la página, para que con señal mala
   la pantalla de inicio aparezca de inmediato. */
let mqttReady = null;
function ensureMqtt(){
  if(globalThis.mqtt) return Promise.resolve();
  return mqttReady ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = new URL('../../vendor/mqtt.min.js', import.meta.url).href;
    s.onload = resolve;
    s.onerror = () => { mqttReady = null; reject(new Error('no se pudo cargar mqtt')); };
    document.head.append(s);
  });
}

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

    /* Identificador de esta pestaña. Sirve para distinguir "soy yo mismo" de
       "hay otra copia de la app con mi mismo id de dispositivo" (pasa si abres
       la app dos veces en el mismo navegador: comparten almacenamiento). */
    this.sid = Math.random().toString(36).slice(2, 10);

    this._will = await this._seal({ t:'p', d:{ ...this.me, online:false, sid:this.sid } });
    this._alive = true;

    await ensureMqtt();                            // la librería se baja al entrar, no al abrir

    /* Nos conectamos a LOS TRES brokers a la vez.
       Antes cada teléfono recordaba "el último que me funcionó" y elegía por su
       cuenta: si a uno le tocaba EMQX y al otro HiveMQ, los dos se veían en
       verde… y no se encontraban nunca, porque estaban en relays distintos.
       Ahora anunciamos nuestra presencia en todos y el juego se va por aquel
       donde estén los dos (el de menor índice, así los dos eligen el mismo). */
    this.links = BROKERS.map((url, i) => this._openLink(url, i));
    this.active = null;

    /* Latido de cortesía. Quien avisa de verdad si alguien se cae es el broker
       (last will), y cualquier jugada refresca el "lastSeen"; por eso va lento:
       a 5 s se gastaban ~180 KB por hora de estar en la sala sin jugar. */
    clearInterval(this._hb);
    this._hb = setInterval(() => {
      if(this.status !== 'online') return;
      this._checkStale();
      // sólo hablamos si llevamos rato callados
      if(Date.now() - (this._lastOut || 0) > HEARTBEAT_MS - 1000)
        this.publish({ t:'hb', d:{} }, { qos: 0 });
    }, HEARTBEAT_MS);
  }

  /** Abre (y mantiene abierto) un broker. mqtt.js reintenta solo si se cae. */
  _openLink(url, i){
    const link = { url, i, client: null, up: false, sawPeer: false };
    if(!this._alive) return link;

    const client = mqtt.connect(url, {
      clientId: `${this.me.id}-${i}-${Math.random().toString(36).slice(2, 7)}`,
      clean: true,
      keepalive: 30,
      reconnectPeriod: 3000,
      connectTimeout: CONNECT_MS,
      resubscribe: true,
      protocolVersion: 4,
      will: { topic: this.tPres(this.me.id), payload: this._will, qos: 1, retain: true },
    });
    link.client = client;

    client.on('connect', () => {
      link.up = true;
      // Ojo: mqtt.js v5 sólo acepta el mapa {topic:{qos}}; con un arreglo de
      // objetos lanza excepción y se quedaba todo a medias.
      client.subscribe({
        [this.tMsg]:          { qos: 0 },
        [`${this.base}/p/+`]: { qos: 1 },
        [`${this.base}/k/+`]: { qos: 1 },
        [this.tState]:        { qos: 1 },
      }, (err) => { if(err) console.warn('[net] subscribe', err.message); });

      this._pickActive();
      this._refreshStatus();
      this._announce();                      // "aquí estoy", en todos los relays
      this._flushOutbox();
      this.emit('reconnected');
    });

    client.on('close',   () => { link.up = false; link.sawPeer = false; this._pickActive(); this._refreshStatus(); });
    client.on('error',   (e) => console.warn('[net]', url, e?.message || e));
    client.on('message', (topic, payload) => this._onRaw(topic, payload, link));
    return link;
  }

  /** Canal de juego: el primer relay donde estemos los dos (los dos eligen igual). */
  _pickActive(){
    const links = this.links || [];
    const antes = this.active?.url;
    this.active = links.find(l => l.up && l.sawPeer) || links.find(l => l.up) || null;
    if(this.active && this.active.url !== antes){
      this.client = this.active.client;      // compatibilidad con el resto del código
      if(antes) console.info('[net] canal →', this.active.url);
    }
  }

  _refreshStatus(){
    const up = (this.links || []).some(l => l.up);
    this._setStatus(up ? 'online' : 'connecting');
  }

  /** Los mensajes pequeños y retenidos van a TODOS: así nos encontramos
      aunque cada quien alcance relays distintos. */
  _allUp(){ return (this.links || []).filter(l => l.up).map(l => l.client); }

  leave(){
    this._alive = false;
    clearInterval(this._hb);
    for(const l of this.links || []){
      try{
        // Limpia los retained propios para que la sala quede vacía de verdad.
        l.client?.publish(this.tPres(this.me.id), '', { qos: 1, retain: true });
        l.client?.publish(this.tPick(this.me.id), '', { qos: 1, retain: true });
        l.client?.end(true);
      }catch{}
    }
    this.links = [];
    this.active = null;
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

  /** Estado del juego (retained): quien se reconecte lo recibe de inmediato.
      Va a todos los relays: es chico y así se recupera desde cualquiera. */
  publishState(state){
    this._sealAndSend(this.tState, { t:'s', f:this.me.id, d:state, n:++this.seq },
                      { qos:1, retain:true }, true);
  }
  clearState(){
    for(const c of this._allUp()) try{ c.publish(this.tState, '', { qos: 1, retain: true }); }catch{}
  }

  /** Juego seleccionado en el menú (retained por jugador, en todos los relays). */
  publishPick(gameId){
    if(this.me) this.me.pick = gameId;
    this._sealAndSend(this.tPick(this.me.id), { t:'k', f:this.me.id, n:++this.seq, d:{ pick:gameId, name:this.me.name } },
                      { qos:1, retain:true }, true);
  }

  _announce(){
    this._sealAndSend(this.tPres(this.me.id),
      { t:'p', f:this.me.id, n:++this.seq, d:{ ...this.me, online:true, ts:Date.now(), sid:this.sid } },
      { qos:1, retain:true }, true);
  }

  /** `todos` = mándalo por cada relay conectado (presencia, elección, estado).
      Si no, va sólo por el canal activo (chat y jugadas). */
  _sealAndSend(topic, obj, opts, todos = false){
    // Cola secuencial: el cifrado es asíncrono y queremos preservar el orden.
    this._lastOut = Date.now();
    this._sendQ = this._sendQ.then(async () => {
      const destinos = todos ? this._allUp() : (this.active?.up ? [this.active.client] : this._allUp().slice(0, 1));
      if(!destinos.length) return;
      try{
        const buf = await this._seal(obj);
        for(const c of destinos) c.publish(topic, buf, opts);
      }catch(e){ console.warn('[net] publish', e); }
    }).catch(e => { console.warn('[net] cola de envío', e); });   // que un fallo no rompa la cadena
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

  _onRaw(topic, payload, link){
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

      /* Lo retenido llega por los tres relays: procesamos sólo la primera copia. */
      if(env.f && env.f !== this.me.id && env.n != null){
        const marca = env.f + '#' + env.n;
        if(this._seen.has(marca)) return;
        this._seen.add(marca);
        this._seenQ.push(marca);
        if(this._seenQ.length > 400) this._seen.delete(this._seenQ.shift());
      }
      try{ this._route(topic, env, link); }
      catch(e){ console.warn('[net] route', e); }
    }).catch(e => { console.warn('[net] cola de recepción', e); });
  }

  _route(topic, env, link){
    /* --- presencia --- */
    if(topic.startsWith(this.base + '/p/')){
      const d = env.d || {};
      if(d.id === this.me.id){
        /* Mi mismo id de dispositivo pero otra pestaña: los dos jugadores están
           en el mismo navegador y jamás se verían. Mejor decirlo. */
        if(d.sid && d.sid !== this.sid && d.online) this.emit('same-device');
        return;
      }
      /* Aquí está: por este relay sí nos alcanzamos. */
      if(link && d.online && !link.sawPeer){ link.sawPeer = true; this._pickActive(); }
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
      this._alive2(peer);                          // si nos habla, está ahí
      this.emit('pick', peer);
      this.emit('peers', this.peerList());
      return;
    }

    /* --- estado retenido del juego --- */
    if(topic === this.tState){
      if(env.f === this.me.id) return;
      const p = this.peers.get(env.f);
      if(p) this._alive2(p);
      this.emit('state', env.d, env.f);
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
    if(peer) this._alive2(peer);

    if(env.t === 'hb') return;                    // sólo servía para refrescar lastSeen
    this.emit('msg', env);
    this.emit('msg:' + env.t, env.d, env);
  }

  /** Cualquier mensaje suyo prueba que sigue ahí: refresca y reanima. */
  _alive2(peer){
    peer.lastSeen = Date.now();
    if(!peer.online){
      peer.online = true;
      this.emit('peer-online', peer);
      this.emit('peers', this.peerList());
    }
  }

  _dropPeer(id){
    if(this.peers.has(id)){
      const p = this.peers.get(id);
      p.online = false;
      this.emit('peer-offline', p);
      this.emit('peers', this.peerList());
    }
  }

  /* Quién está conectado lo dice el "last will" del broker, que es exacto y
     salta a los ~45 s de que muere el socket. Esto es sólo una red de
     seguridad para conexiones zombis, con una ventana holgada: si fuera
     corta, bastaría con que el otro mirara otra app un momento (el navegador
     frena los temporizadores en segundo plano) para verlo como desconectado. */
  _checkStale(){
    const now = Date.now();
    let changed = false;
    for(const p of this.peers.values()){
      if(p.online && now - (p.lastSeen || 0) > STALE_MS){ p.online = false; changed = true; this.emit('peer-offline', p); }
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
    let alguno = false;
    for(const l of this.links || []){
      if(!l.client) continue;
      if(l.client.connected) alguno = true;
      else try{ l.client.reconnect(); }catch{}
    }
    if(alguno) this._announce();
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
