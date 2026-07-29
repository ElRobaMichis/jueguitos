/* Emisor de eventos mínimo (más chico que EventTarget y sin CustomEvent). */
export class Emitter {
  constructor(){ this._h = new Map(); }

  on(ev, fn){
    if(!this._h.has(ev)) this._h.set(ev, new Set());
    this._h.get(ev).add(fn);
    return () => this.off(ev, fn);
  }

  once(ev, fn){
    const un = this.on(ev, (...a) => { un(); fn(...a); });
    return un;
  }

  off(ev, fn){ this._h.get(ev)?.delete(fn); }

  emit(ev, ...args){
    const set = this._h.get(ev);
    if(!set) return;
    // copia: un handler puede desuscribirse durante el emit
    for(const fn of [...set]){
      try{ fn(...args); }
      catch(err){ console.error(`[emitter] ${ev}`, err); }
    }
  }

  clear(){ this._h.clear(); }
}
