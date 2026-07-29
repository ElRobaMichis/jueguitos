/* ===========================================================================
   Lotería — tabla de 4×4, cada quien la suya (y sólo ve la propia).

   Las cartas se cantan solas cada 2.5 s. Puedes quitar la piedra cuando
   quieras, incluso tarde: con una conexión inestable, obligar a marcar
   dentro de la ventana de 2.5 s dejaría a alguien sin poder ganar por un
   retraso de la red que no es culpa suya.

   La trampa se castiga al final, como en la lotería de verdad: cuando gritas
   "¡Lotería!" se revisa el montón de cartas cantadas. Si marcaste alguna que
   nunca salió, pierdes — y se te dice cuál fue, para que no parezca arbitrario.
   Como la piedra se puede volver a poner, un dedazo no te condena.
   =========================================================================== */
import { turnGame, el, clear, beep, vibrate, shuffled, rngInt,
         sfxPop, sfxError, chord, sfxWin } from './lib/kit.js';
import { CARDS, cardSvg, cardName } from './lib/loteria-art.js';

const FILAS = 4, COLS = 4, CASILLAS = FILAS * COLS;
const CANTO_MS = 2500;

export default (ctx) => {
  /* --- lo mío es mío: las piedras viven aquí, sin pasar por la red --- */
  let marcas = Array(CASILLAS).fill(false);
  let tabla = null, pintada = false, ultimaCarta = -1;

  /* --- piezas permanentes --- */
  const cartaGrande = el('div', { class:'lot-canto' });
  const nombreCarta = el('div', { class:'lot-nombre' });
  const barra = el('i');
  const anterior = el('div', { class:'lot-previa' });
  const cabecera = el('div', { class:'lot-head' },
    el('div', { class:'lot-actual' }, cartaGrande, nombreCarta, el('div', { class:'lot-barra' }, barra)),
    anterior);
  const grid = el('div', { class:'lot-tabla' });
  const celdas = [];
  const marcador = el('div', { class:'g-pill' });

  const pintarMarcas = () => celdas.forEach((c, i) => c.classList.toggle('libre', marcas[i]));

  return turnGame(ctx, {
    tickMs: CANTO_MS,

    init(c, P){
      const mazo = shuffled(CARDS.map((_, i) => i), c.rng);
      const tablaDe = () => shuffled(CARDS.map((_, i) => i), c.rng).slice(0, CASILLAS);
      return {
        mazo, i: -1,
        tablas: { [P.host]: tablaDe(), [P.guest]: tablaDe() },
        prog: { [P.host]: 0, [P.guest]: 0 },
        ids: [P.host, P.guest],
      };
    },

    /* Cada quien recibe SU tabla y sólo las cartas ya cantadas: el mazo que
       falta no viaja, para que no se pueda ver el futuro. */
    view(s, who){
      return {
        carta: s.i >= 0 ? s.mazo[s.i] : null,
        previa: s.i > 0 ? s.mazo[s.i - 1] : null,
        cantadas: s.i + 1,
        total: s.mazo.length,
        tabla: s.tablas[who],
        prog: s.prog,
      };
    },

    action(s, a, from, api){
      const P = api.P;

      if(a.prog != null){ s.prog[from] = a.prog; return; }

      if(a.loteria){
        const marcadas = a.loteria || [];
        const mias = s.tablas[from] || [];
        const cantadas = new Set(s.mazo.slice(0, s.i + 1));
        const falsas = mias.filter((carta, k) => marcadas[k] && !cantadas.has(carta));
        const completa = marcadas.filter(Boolean).length >= CASILLAS;

        if(!completa) return;                       // la app ya lo evita; por si acaso
        if(falsas.length){
          const nombres = falsas.map(cardName).join(', ');
          return api.finish(P.isMe(from) ? 'them' : 'me',
                            `${P.name(from)} gritó lotería en falso: no había salido ${nombres}`);
        }
        return api.finish(P.isMe(from) ? 'me' : 'them', '¡Lotería limpia! 🎉');
      }
    },

    tick(s, api){
      if(s.i + 1 >= s.mazo.length){
        return api.finish('draw', 'Se acabó la baraja sin lotería');
      }
      s.i++;
      api.sync();
    },

    render(v, ui, c, api){
      const P = api.P;

      /* --- la tabla se arma una sola vez --- */
      if(!pintada && v.tabla){
        pintada = true;
        tabla = v.tabla;
        tabla.forEach((carta, i) => {
          const celda = el('button', { class:'lot-celda' },
            el('div', { class:'lot-art', html: cardSvg(carta) }),
            el('span', { class:'lot-cn', text: cardName(carta) }),
            el('span', { class:'lot-piedra' }));
          celda.addEventListener('click', () => {
            marcas[i] = !marcas[i];
            marcas[i] ? sfxPop() : beep(320, .05);
            vibrate(12);
            pintarMarcas();
            actualizarPie();
            api.act({ prog: marcas.filter(Boolean).length });   // sólo para que vea mi avance
          });
          celdas.push(celda);
          grid.append(celda);
        });
      }

      /* --- carta cantada --- */
      if(v.carta != null && v.carta !== ultimaCarta){
        ultimaCarta = v.carta;
        cartaGrande.innerHTML = cardSvg(v.carta);
        cartaGrande.classList.remove('entra'); void cartaGrande.offsetWidth;
        cartaGrande.classList.add('entra');
        nombreCarta.textContent = cardName(v.carta);
        barra.style.animation = 'none'; void barra.offsetWidth;
        barra.style.animation = `lotBarra ${CANTO_MS}ms linear`;
        chord([520, 700], .12);
        vibrate(15);
      }
      anterior.innerHTML = v.previa != null
        ? `<span>antes</span>${cardSvg(v.previa)}` : '<span>antes</span>';

      ui.status(v.carta == null ? 'Preparando la baraja…'
                                : `Van ${v.cantadas} de ${v.total} cartas`, 'me');

      if(!ui.center.contains(cabecera)){
        clear(ui.center);
        ui.center.append(cabecera, grid);
      }
      actualizarPie();

      function actualizarPie(){
        const mias = marcas.filter(Boolean).length;
        const suyas = v.prog?.[P.them] || 0;
        marcador.textContent = `Tú ${mias}/16 · ${P.name(P.them)} ${suyas}/16`;
        clear(ui.actions);
        ui.actions.append(marcador);
        const b = ui.btn('¡LOTERÍA!', () => {
          if(marcas.filter(Boolean).length < CASILLAS){
            sfxError();
            ui.status(`Te faltan ${CASILLAS - marcas.filter(Boolean).length} piedras`, 'them');
            return;
          }
          sfxWin();
          api.act({ loteria: marcas });
        }, 'primary');
        b.classList.toggle('lista', marcas.filter(Boolean).length >= CASILLAS);
      }
    },
  }, { scroll:true });
};
