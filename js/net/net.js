/* ===========================================================================
   net.js — sincronización en tiempo real sin backend propio.

   Cómo funciona
   -------------
   La app es 100% estática (sirve en GitHub Pages). La "sala" vive en brokers
   MQTT públicos sobre WebSocket seguro (wss). MQTT es ideal para conexiones
   móviles inestables: paquetes minúsculos, keepalive, "last will" (avisa
   cuando alguien se cae) y mensajes "retained" (quien se reconecta recibe al
   instante el estado actual sin pedir nada).

   Nos conectamos a los TRES brokers a la vez:
     - presencia, elección de juego y estado del tablero van por TODOS;
     - los mensajes fiables (jugadas, chat, revancha) van por TODOS y se
       REINTENTAN cada ~3 s hasta recibir su acuse — así no se pierden aunque
       un relay se muera justo en ese momento;
     - sólo el chorro rápido (instantáneas del ping pong, trazos del dibujo)
       va por un único canal "activo", vigilado: si se queda mudo 4 s
       habiendo otro relay vivo, se cambia.

   Topics (base = jgts/1/<hash del código>):
     <base>/m        mensajes efímeros  (chat, emojis, jugadas, acuses)
     <base>/p/<id>   presencia          (retained + last will)
     <base>/k/<id>   juego elegido      (retained)
     <base>/s        estado del juego   (retained, lo publica el anfitrión)

   Lecciones que este archivo ya pagó caras (no repetirlas):
     - Los brokers públicos guardan lo retenido PARA SIEMPRE. Con códigos de
       4 dígitos, una sala "nueva" casi siempre pisa una vieja: nada de crear
       jugadores a partir de mensajes retenidos; los desconocidos se ignoran
       y a los 30 s se limpia su basura del broker.
     - Las 3 copias retenidas de presencia llegan en orden aleatorio: se
       ordenan por su fecha, y una despedida no vale si acabamos de oírlo.
     - Un mensaje fiable sin acuse se reenviaba en cada reconexión… semanas
       después: un 'start' viejo lanzaba un juego en un solo teléfono.

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
const RETRY_MS     = 2900;    // reintento de mensajes fiables sin acuse
const OUTBOX_TTL   = 300000;  // 5 min: después, un mensaje fiable caduca
const GC_MS        = 30000;   // limpieza de fantasmas retenidos de sesiones viejas

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
    this.client   = null;          // canal activo (compatibilidad)
    this.code     = null;
    this.me       = null;          // { id, name, joinedAt }
    this.peers    = new Map();     // id -> { id, name, joinedAt, online, pick, lastSeen, presTs }
    this.status   = 'idle';        // idle | connecting | online | offline
    this.seq      = 0;
    this._seen    = new Set();     // marcas f#sesión#n: copias del mismo envío
    this._seenQ   = [];
    this._seenI   = new Set();     // ids de mensajes fiables ya procesados
    this._seenIQ  = [];
    this._outbox  = [];            // fiables sin acuse: { env, t0, last, tries }
    this._pendingPicks = new Map();// elecciones retenidas de gente aún no vista
    this._ghosts  = new Set();     // despedidas retenidas de gente aún no vista
    this._sendQ   = Promise.resolve();
    this._recvQ   = Promise.resolve();
  }

  /* ---------------------------------------------------------------- join -- */
  async join({ code, name, id, joinedAt }){
    this.code = code;
    this.me   = { id, name, joinedAt };
    this.key  = await deriveKey(code);

    /* Borrón y cuenta nueva: si se entra a una sala sin haber salido bien de
       la anterior, nada de arrastrar jugadores, marcas ni pendientes viejos. */
    this.peers.clear();
    this._outbox = [];
    this._seen.clear();  this._seenQ.length = 0;
    this._seenI.clear(); this._seenIQ.length = 0;
    this._pendingPicks = new Map();
    this._ghosts = new Set();

    const hash  = await sha256Hex(code + SALT);
    this.base   = `${PROTO}/${hash.slice(0, 20)}`;
    this.tMsg   = `${this.base}/m`;
    this.tState = `${this.base}/s`;
    this.tPres  = (pid) => `${this.base}/p/${pid}`;
    this.tPick  = (pid) => `${this.base}/k/${pid}`;

    /* Identificador de esta pestaña. Distingue "soy yo mismo" de "hay otra
       copia de la app con mi mismo id de dispositivo" (dos pestañas del mismo
       navegador comparten almacenamiento), y además hace únicas las marcas
       anti-repetidos entre sesiones. */
    this.sid = Math.random().toString(36).slice(2, 10);

    this._will = await this._seal({ t:'p', d:{ ...this.me, online:false, sid:this.sid } });
    this._alive = true;

    await ensureMqtt();                            // la librería se baja al entrar, no al abrir

    this.links = BROKERS.map((url, i) => this._openLink(url, i));
    this.active = null;

    /* Latido de cortesía por TODOS los relays: mantiene fresco el "lastSeen"
       y le da al vigilante con qué comparar qué relay sigue sirviendo. */
    clearInterval(this._hb);
    this._hb = setInterval(() => {
      if(this.status !== 'online') return;
      this._checkStale();
      if(Date.now() - (this._lastOut || 0) > HEARTBEAT_MS - 1000)
        this.publish({ t:'hb', d:{} }, { qos: 0, todos: true });
    }, HEARTBEAT_MS);

    /* Vigilante del canal rápido + reintentos de los mensajes fiables. */
    clearInterval(this._wd);
    this._wd = setInterval(() => {
      if(!this._alive) return;
      this._watchdog();
      this._retryOutbox();
    }, 3000);

    /* Basura de sesiones pasadas: elecciones y despedidas retenidas de gente
       que nunca dio señales de vida se limpian del broker pasado un rato.
       Sin esto, una sala "nueva" heredaba fantasmas de salas viejas. */
    clearTimeout(this._gc);
    this._gc = setTimeout(() => this._gcGhosts(), GC_MS);
  }

  /** Abre (y mantiene abierto) un broker. mqtt.js reintenta solo si se cae. */
  _openLink(url, i){
    const link = { url, i, client: null, up: false, sawPeer: false, lastPeer: 0 };
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

    client.on('close',   () => { link.up = false; link.sawPeer = false; link.lastPeer = 0;
                                 this._pickActive(); this._refreshStatus(); });
    client.on('error',   (e) => console.warn('[net]', url, e?.message || e));
    client.on('message', (topic, payload) => this._onRaw(topic, payload, link));
    return link;
  }

  /** Canal rápido: el relay por el que nos hayamos oído más recientemente.
      No hace falta que los dos usen el mismo: cada quien escucha en los tres. */
  _pickActive(){
    const links = (this.links || []).filter(l => l.up);
    const antes = this.active?.url;
    const oidos = links.filter(l => l.sawPeer)
                       .sort((a, b) => (b.lastPeer || 0) - (a.lastPeer || 0) || a.i - b.i);
    this.active = oidos[0] || links[0] || null;
    if(this.active && this.active.url !== antes){
      this.client = this.active.client;      // compatibilidad con el resto del código
      if(antes) console.info('[net] canal →', this.active.url);
    }
  }

  /** Si el canal activo se queda mudo pero por otro sí nos oímos, cambiamos. */
  _watchdog(){
    const a = this.active;
    if(!a || !a.up){ this._pickActive(); return; }
    const ahora = Date.now();
    if(ahora - (a.lastPeer || 0) < 4000) return;                 // va bien
    const mejor = (this.links || [])
      .filter(l => l.up && l !== a)
      .sort((x, y) => (y.lastPeer || 0) - (x.lastPeer || 0))[0];
    if(mejor && (mejor.lastPeer || 0) > (a.lastPeer || 0) + 1500){
      this.active = mejor;
      this.client = mejor.client;
      console.info('[net] el canal se quedó mudo →', mejor.url);
      this._flushOutbox();
    }
  }

  _refreshStatus(){
    const up = (this.links || []).some(l => l.up);
    this._setStatus(up ? 'online' : 'connecting');
  }

  _allUp(){ return (this.links || []).filter(l => l.up).map(l => l.client); }

  leave(){
    this._alive = false;
    clearInterval(this._hb);
    clearInterval(this._wd);
    clearTimeout(this._gc);
    for(const l of this.links || []){
      try{
        // Limpia los retained propios para que la sala quede vacía de verdad.
        l.client?.publish(this.tPres(this.me.id), '', { qos: 0, retain: true });
        l.client?.publish(this.tPick(this.me.id), '', { qos: 0, retain: true });
        /* Cierre SUAVE: espera a que salgan los paquetes de limpieza. Con el
           cierre forzado se quedaban sin enviar, y la elección retenida
           sobrevivía como fantasma para la siguiente sala con ese código. */
        l.client?.end(false);
      }catch{}
    }
    this.links = [];
    this.active = null;
    this.client = null;
    this.peers.clear();
    this._outbox = [];
    this._pendingPicks.clear();
    this._ghosts.clear();
    this._setStatus('idle');
  }

  /* --------------------------------------------------------------- envío -- */

  /** Publica un sobre en el topic de mensajes.
      `todos` = por cada relay conectado; si no, sólo por el canal rápido. */
  publish(env, { qos = 0, todos = false } = {}){
    env.f = this.me.id;
    env.s = this.sid;                          // sesión: hace únicas las marcas
    env.n = ++this.seq;
    this._sealAndSend(this.tMsg, env, { qos, retain: false }, todos);
  }

  /** Mensaje fiable: viaja por TODOS los relays y se reintenta cada ~3 s
      hasta que llegue su acuse. Chat, jugadas, revancha, inicio y salida. */
  publishReliable(env){
    env.i = env.i || (this.me.id + ':' + (++this.seq));
    this._outbox.push({ env: { ...env }, t0: Date.now(), last: 0, tries: 0 });
    if(this._outbox.length > 60) this._outbox.shift();
    this._retryOutbox(true);
  }

  _retryOutbox(soloNuevos = false){
    const ahora = Date.now();
    this._outbox = this._outbox.filter(o => ahora - o.t0 < OUTBOX_TTL && o.tries < 90);
    for(const o of this._outbox){
      if(soloNuevos ? o.last : (ahora - o.last < RETRY_MS)) continue;
      o.last = ahora;
      o.tries++;
      this.publish({ ...o.env }, { qos: 1, todos: true });
    }
  }

  /** Reenvío inmediato de todo lo pendiente (reconexión, peer que vuelve). */
  _flushOutbox(){
    for(const o of this._outbox) o.last = 0;
    this._retryOutbox();
  }

  ackDelivered(msgId){
    if(!msgId) return;
    this._outbox = this._outbox.filter(o => o.env.i !== msgId);
  }

  /** Estado del juego (retained, todos los relays): quien se reconecte lo
      recibe al instante desde cualquiera. */
  publishState(state){
    this._sealAndSend(this.tState,
      { t:'s', f:this.me.id, s:this.sid, n:++this.seq, d:state },
      { qos:1, retain:true }, true);
  }
  clearState(){
    for(const c of this._allUp()) try{ c.publish(this.tState, '', { qos: 1, retain: true }); }catch{}
  }

  /** Juego seleccionado en el menú (retained por jugador, todos los relays). */
  publishPick(gameId){
    if(this.me) this.me.pick = gameId;
    this._sealAndSend(this.tPick(this.me.id),
      { t:'k', f:this.me.id, s:this.sid, n:++this.seq, d:{ pick:gameId, name:this.me.name } },
      { qos:1, retain:true }, true);
  }

  _announce(){
    this._sealAndSend(this.tPres(this.me.id),
      { t:'p', f:this.me.id, s:this.sid, n:++this.seq,
        d:{ ...this.me, online:true, ts:Date.now(), sid:this.sid } },
      { qos:1, retain:true }, true);
  }

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

  /* ------------------------------------------------------------ recepción -- */

  _onRaw(topic, payload, link){
    if(!payload || payload.length === 0){        // retained borrado
      if(topic.includes('/p/')) this._dropPeer(topic.split('/p/')[1]);
      if(topic.includes('/k/')){
        const p = this.peers.get(topic.split('/k/')[1]);
        if(p && p.pick != null){ p.pick = null; this.emit('pick', p); this.emit('peers', this.peerList()); }
      }
      if(topic === this.tState) this.emit('state', null);
      return;
    }
    this._recvQ = this._recvQ.then(async () => {
      let env;
      try{ env = await this._open(payload); }
      catch{ return; }                            // no es de nuestra sala (código distinto)
      if(!env) return;

      /* Antes de descartar copias: apuntar que por ESTE relay sí nos llegó
         algo suyo (el vigilante compara la frescura de cada relay). */
      const suyo = (env.f && env.f !== this.me.id) ||
                   (topic.startsWith(this.base + '/p/') && env.d?.id !== this.me.id);
      if(link && suyo){ link.lastPeer = Date.now(); link.sawPeer = true; }

      /* Un mismo envío llega por hasta tres relays: sólo la primera copia.
         La marca lleva la SESIÓN: sin ella, un mensaje retenido de una sesión
         vieja podía hacer descartar uno legítimo de la actual con el mismo
         número. */
      if(env.f && env.f !== this.me.id && env.n != null){
        const marca = env.f + '#' + (env.s || '') + '#' + env.n;
        if(this._seen.has(marca)) return;
        this._seen.add(marca);
        this._seenQ.push(marca);
        if(this._seenQ.length > 1500) this._seen.delete(this._seenQ.shift());
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
      const prev = this.peers.get(d.id);

      if(!d.online){
        /* Una despedida retenida sólo vale para alguien que conocimos: los
           brokers guardan despedidas de sesiones viejas para siempre y
           aplicarlas creaba fantasmas "desconectados" en salas nuevas. */
        if(!prev){ this._ghosts.add(d.id); return; }
        /* Y si lo oímos hace nada, la despedida es rezagada de otro relay. */
        if(Date.now() - (prev.lastSeen || 0) < 10000) return;
        if(prev.online){
          prev.online = false;
          this.emit('peer-offline', prev);
          this.emit('peers', this.peerList());
        }
        return;
      }

      /* Está en línea. De las copias retenidas gana la más nueva. */
      const ts = d.ts || 0;
      if(prev && ts && (prev.presTs || 0) > ts) return;
      const peer = {
        ...(prev || {}), id:d.id, name:d.name, joinedAt:d.joinedAt,
        online:true, lastSeen:Date.now(), presTs:ts,
      };
      /* Si su elección llegó antes que su presencia, se aplica ahora. */
      let pickAplicado = false;
      if(this._pendingPicks.has(d.id)){
        peer.pick = this._pendingPicks.get(d.id);
        this._pendingPicks.delete(d.id);
        pickAplicado = true;
      }
      this.peers.set(d.id, peer);
      this._ghosts.delete(d.id);
      if(!prev || !prev.online){
        this.emit('peer-online', peer);
        this._flushOutbox();                    // reenvía lo que no recibió
      }
      if(pickAplicado) this.emit('pick', peer);
      this.emit('peers', this.peerList());
      return;
    }

    /* --- selección de juego --- */
    if(topic.startsWith(this.base + '/k/')){
      const id = topic.split('/k/')[1];
      if(id === this.me.id) return;
      const peer = this.peers.get(id);
      if(!peer){
        /* No inventamos jugadores por una elección retenida (los brokers las
           guardan de sesiones viejas). Se aplica si aparece su presencia. */
        this._pendingPicks.set(id, env.d?.pick ?? null);
        return;
      }
      peer.pick = env.d?.pick ?? null;
      if(env.d?.name) peer.name = env.d.name;
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

    /* acuse: el emisor deja de reintentar ese mensaje */
    if(env.t === 'ak'){ this.ackDelivered(env.d?.id); return; }

    if(env.i){
      /* Se confirma SIEMPRE, aunque sea una copia repetida: si el primer
         acuse se perdió, el emisor seguiría reintentando eternamente. */
      this.publish({ t:'ak', d:{ id: env.i } }, { todos: true });
      if(this._seenI.has(env.i)) return;
      this._seenI.add(env.i);
      this._seenIQ.push(env.i);
      if(this._seenIQ.length > 1500) this._seenI.delete(this._seenIQ.shift());
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
      if(!p.online) return;
      p.online = false;
      this.emit('peer-offline', p);
      this.emit('peers', this.peerList());
    }
  }

  /* Quién está conectado lo dice el "last will" del broker (~45 s tras morir
     el socket). Esto es sólo la red de seguridad para conexiones zombis, con
     ventana holgada: el navegador congela los temporizadores en segundo
     plano y una ventana corta desconectaría a quien sólo miró otra app. */
  _checkStale(){
    const now = Date.now();
    let changed = false;
    for(const p of this.peers.values()){
      if(p.online && now - (p.lastSeen || 0) > STALE_MS){ p.online = false; changed = true; this.emit('peer-offline', p); }
    }
    if(changed) this.emit('peers', this.peerList());
  }

  /** Borra del broker la basura retenida de sesiones viejas: elecciones y
      despedidas de identidades que nunca dieron señales de vida aquí. */
  _gcGhosts(){
    if(!this._alive) return;
    const basura = new Set([...this._pendingPicks.keys(), ...this._ghosts]);
    for(const id of basura){
      if(this.peers.get(id)?.online) continue;
      for(const c of this._allUp()){
        try{
          c.publish(this.tPick(id), '', { qos:0, retain:true });
          c.publish(this.tPres(id), '', { qos:0, retain:true });
        }catch{}
      }
      this._pendingPicks.delete(id);
    }
    this._ghosts.clear();
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
    if(alguno){ this._announce(); this._flushOutbox(); }
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
