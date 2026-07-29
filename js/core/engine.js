/* ===========================================================================
   engine.js — ciclo de vida de una partida.

   Se encarga de todo lo que es igual en los 23 juegos: cargar el módulo,
   armar el contexto de red, pausar si la otra persona pierde señal, mostrar
   el resultado, la revancha y anotar en el marcador. Cada juego sólo tiene
   que preocuparse por su propia lógica.
   =========================================================================== */

import { net } from '../net/net.js';
import { gameById } from '../games/registry.js';
import { addWin } from './store.js';
import { $, el, clear, makeRng, toast, vibrate, sfxWin, sfxLose, colorFor, initial } from './ui.js';

export class Engine {
  constructor({ code, me, onExit }){
    this.code   = code;
    this.me     = me;
    this.onExit = onExit;
    this.session = null;
  }

  /* ------------------------------------------------------------- iniciar -- */
  async start(gameId, seed){
    const def = gameById(gameId);
    if(!def){ toast('Ese juego no existe 🤔'); this.onExit?.(); return; }

    await this.destroy();                          // por si quedaba algo vivo

    const host = $('#game-host');
    clear(host);
    $('#game-title').textContent = def.name;

    const peer  = net.partner() || { id:'?', name:'…' };
    const sid   = `${gameId}:${seed}`;
    const unsub = [];
    const S = this.session = {
      def, gameId, seed, sid, peer, unsub,
      ended:false, scored:false, wantRematch:false, peerRematch:false, mod:null, api:null,
    };

    /* -- contexto que recibe el juego -- */
    const ctx = {
      el: host,
      me: this.me,
      peer,
      isHost: net.isHost(),
      seed,
      rng: makeRng(seed),
      random(){ return this.rng(); },

      /* red */
      send: (d, opts) => { if(!S.ended) net.publish({ t:'g', sid, d }, opts); },
      sendReliable: (d) => { if(!S.ended) net.publishReliable({ t:'g', sid, d }); },
      onMsg: (fn) => { const u = net.on('msg:g', (d, env) => { if(env.sid === sid) fn(d, env.f); }); unsub.push(u); },

      /* instantánea retenida: quien se reconecte la recibe al instante */
      saveState: (state) => { if(!S.ended) net.publishState({ sid, state }); },
      onState:   (fn) => { const u = net.on('state', (payload, from) => { if(payload?.sid === sid) fn(payload.state, from); }); unsub.push(u); },

      /* utilidades */
      toast, vibrate,
      peerOnline: () => net.partnerOnline(),
      onPeerChange: (fn) => {
        unsub.push(net.on('peer-online',  () => fn(true)));
        unsub.push(net.on('peer-offline', () => fn(false)));
      },

      /* fin de partida: 'me' | 'them' | 'draw' */
      finish: (result, text) => this._finish(result, text),
    };

    try{
      S.mod = await def.load();
      S.api = await S.mod.default(ctx);            // el juego devuelve {destroy?}
    }catch(err){
      console.error('[engine] no se pudo cargar', gameId, err);
      toast('No se pudo cargar el juego 😖');
      this.onExit?.();
      return;
    }

    /* -- pausa por desconexión -- */
    unsub.push(net.on('peer-offline', () => this._pause(true)));
    unsub.push(net.on('peer-online',  () => this._pause(false)));

    /* -- mensajes de control -- */
    unsub.push(net.on('msg:end', (d, env) => {
      if(env.sid !== sid || S.ended) return;
      this._showResult(d.winnerId, d.text, false);
    }));
    unsub.push(net.on('msg:rematch', (d, env) => {
      if(env.sid !== sid) return;
      S.peerRematch = true;
      this._paintRematch();
      if(S.wantRematch) this._goRematch();
    }));
    unsub.push(net.on('msg:rego', (d, env) => {
      if(env.sid !== sid) return;
      this.start(gameId, d.seed);
    }));
    unsub.push(net.on('msg:quit', (d, env) => {
      if(env.sid !== sid) return;
      toast(`${peer.name} salió del juego`);
      this.exit(false);
    }));

    if(!net.partnerOnline()) this._pause(true);
  }

  /* --------------------------------------------------------------- fin --- */
  _finish(result, text){
    const S = this.session;
    if(!S || S.ended) return;
    const winnerId = result === 'me'   ? this.me.id
                   : result === 'them' ? S.peer.id
                   : null;
    net.publishReliable({ t:'end', sid:S.sid, d:{ winnerId, text } });
    net.clearState();
    this._showResult(winnerId, text, true);
  }

  _showResult(winnerId, text, iDeclared){
    const S = this.session;
    if(!S || S.ended) return;
    S.ended = true;

    const won  = winnerId === this.me.id;
    const draw = !winnerId;

    if(!S.scored && winnerId){
      addWin(this.code, winnerId, winnerId === this.me.id ? this.me.name : S.peer.name, S.gameId);
      S.scored = true;
    }

    won ? sfxWin() : (draw ? null : sfxLose());
    vibrate(won ? [40, 60, 40, 60, 90] : 120);

    const overlay = el('div', { class:'result-overlay' },
      el('div', { class:'result-card' },
        el('div', { class:'result-emoji', text: draw ? '🤝' : (won ? '🏆' : '💔') }),
        el('div', { class:'result-title', text: draw ? '¡Empate!' : (won ? '¡Ganaste!' : `Ganó ${S.peer.name}`) }),
        el('div', { class:'result-sub', text: text || (draw ? 'Quedaron parejos' : (won ? '¡Bien hecho!' : 'La próxima es tuya')) }),
        el('div', { class:'result-actions' },
          el('button', { class:'g-btn primary', onclick:() => this._askRematch() }, '🔁 Revancha'),
          el('button', { class:'g-btn', onclick:() => this.exit(true) }, '🏠 Volver al menú'),
          el('div', { class:'rematch-wait', id:'rematch-wait' })
        )
      )
    );
    this.session.overlay = overlay;
    $('#game-host').append(overlay);
    this._paintRematch();
  }

  _askRematch(){
    const S = this.session;
    S.wantRematch = true;
    net.publishReliable({ t:'rematch', sid:S.sid, d:{} });
    this._paintRematch();
    if(S.peerRematch) this._goRematch();
  }

  _goRematch(){
    const S = this.session;
    if(S.rematching) return;
    S.rematching = true;
    if(net.isHost()){
      const seed = (Math.random() * 2 ** 31) | 0;
      net.publishReliable({ t:'rego', sid:S.sid, d:{ seed } });
      setTimeout(() => this.start(S.gameId, seed), 120);
    }
    // el invitado espera el 'rego' del anfitrión
  }

  _paintRematch(){
    const S = this.session;
    const w = document.getElementById('rematch-wait');
    if(!w || !S) return;
    if(S.wantRematch && !S.peerRematch)      w.textContent = `Esperando a ${S.peer.name}…`;
    else if(!S.wantRematch && S.peerRematch) w.textContent = `${S.peer.name} quiere revancha 👀`;
    else w.textContent = '';
  }

  /* -------------------------------------------------------------- pausa -- */
  _pause(on){
    const S = this.session;
    if(!S || S.ended) return;
    let p = document.getElementById('pause-overlay');
    if(on){
      if(p) return;
      p = el('div', { class:'result-overlay', id:'pause-overlay' },
        el('div', { class:'result-card' },
          el('div', { class:'result-emoji', text:'📡' }),
          el('div', { class:'result-title', text:'Sin conexión' }),
          el('div', { class:'result-sub', text:`Esperando a que ${S.peer.name} vuelva… la partida sigue guardada.` }),
          el('div', { class:'result-actions' },
            el('button', { class:'g-btn', onclick:() => this.exit(true) }, '🏠 Volver al menú'))
        ));
      $('#game-host').append(p);
    }else{
      p?.remove();
      // Al volver, el anfitrión reenvía el estado para resincronizar.
      if(net.isHost()) S.api?.resync?.();
    }
  }

  /* --------------------------------------------------------------- salir -- */
  exit(notify = true){
    const S = this.session;
    if(S && notify && !S.ended) net.publishReliable({ t:'quit', sid:S.sid, d:{} });
    this.destroy();
    this.onExit?.();
  }

  async destroy(){
    const S = this.session;
    if(!S) return;
    this.session = null;
    S.unsub.forEach(u => { try{ u(); }catch{} });
    try{ await S.api?.destroy?.(); }catch(e){ console.warn(e); }
    if(net.isHost()) net.clearState();
    clear($('#game-host'));
  }
}
