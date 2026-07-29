/* ===========================================================================
   Las 53 cartas de la lotería, dibujadas a mano en SVG.

   Son ilustraciones originales, no las de la baraja comercial (esas tienen
   derechos). Ventaja de más: cada carta pesa unos cientos de bytes en vez de
   una imagen, así que la baraja entera ocupa menos que una sola foto y se ve
   nítida en cualquier pantalla.

   Todas comparten lienzo 0 0 100 100 y una paleta cálida común.
   (Se omite "el negrito" de la baraja tradicional; no hace falta y su nombre
   no tiene por qué seguir circulando.)
   =========================================================================== */

/* paleta */
const R = '#d7262f', RO = '#f04e3e', N = '#2b1c3d', B = '#f6efe0', A = '#f2c14e',
      V = '#3f8f5a', AZ = '#2f6fb3', C = '#e8a15c', M = '#8e4b8b', G = '#8a8f98',
      P = '#f6c9a8', T = '#8a5a2b', RS = '#e8628a', VD = '#7cc06a';

export const CARDS = [
  { n:'El gallo', bg:'#f7e3b5', a:
    `<path d="M62 34c0-9-7-15-16-15-10 0-18 8-18 18 0 9 5 15 12 19l-4 22h9l3-16 4 16h9l-3-22c7-4 10-11 8-22z" fill="${R}"/>
     <path d="M46 15c2-6 8-6 8 0 3-6 9-4 7 3-3 8-11 9-15 4z" fill="${RO}"/>
     <path d="M30 30l-12-6 10 12z" fill="${A}"/>
     <circle cx="38" cy="30" r="2.6" fill="${N}"/>
     <path d="M70 40c8-6 14-2 12 8-2 9-9 14-16 12 4-6 5-14 4-20z" fill="${RO}"/>` },

  { n:'El diablito', bg:'#f3c9c2', a:
    `<path d="M50 24c-13 0-22 9-22 21s9 24 22 24 22-12 22-24-9-21-22-21z" fill="${R}"/>
     <path d="M30 26c-4-8-3-14-1-16 3 3 8 8 10 13z" fill="${N}"/>
     <path d="M70 26c4-8 3-14 1-16-3 3-8 8-10 13z" fill="${N}"/>
     <circle cx="42" cy="42" r="3.4" fill="${N}"/><circle cx="58" cy="42" r="3.4" fill="${N}"/>
     <path d="M40 54c6 6 14 6 20 0" stroke="${N}" stroke-width="3" fill="none" stroke-linecap="round"/>` },

  { n:'La dama', bg:'#e9d7ef', a:
    `<circle cx="50" cy="34" r="14" fill="${P}"/>
     <path d="M34 32c0-12 8-18 16-18s16 6 16 18c-4-6-10-8-16-8s-12 2-16 8z" fill="${N}"/>
     <path d="M28 84c2-18 10-28 22-28s20 10 22 28z" fill="${M}"/>
     <circle cx="44" cy="34" r="2" fill="${N}"/><circle cx="56" cy="34" r="2" fill="${N}"/>
     <path d="M46 42c3 3 5 3 8 0" stroke="${R}" stroke-width="2.4" fill="none" stroke-linecap="round"/>` },

  { n:'El catrín', bg:'#cfe0ef', a:
    `<circle cx="50" cy="40" r="13" fill="${P}"/>
     <rect x="34" y="16" width="32" height="14" rx="2" fill="${N}"/>
     <rect x="28" y="28" width="44" height="4" rx="2" fill="${N}"/>
     <path d="M30 84c2-14 9-22 20-22s18 8 20 22z" fill="${N}"/>
     <path d="M44 62l6 8 6-8-6-4z" fill="${B}"/>
     <path d="M43 46c3-2 5-2 7 0m0 0c2-2 4-2 7 0" stroke="${N}" stroke-width="2.6" fill="none"/>` },

  { n:'El paraguas', bg:'#d9e8dc', a:
    `<path d="M18 52c0-19 14-30 32-30s32 11 32 30c-6-5-11-5-16 0-5-5-11-5-16 0-5-5-11-5-16 0-5-5-10-5-16 0z" fill="${R}"/>
     <path d="M50 52v24c0 6-4 9-9 9s-9-3-9-8" stroke="${T}" stroke-width="4" fill="none" stroke-linecap="round"/>
     <path d="M50 22v-6" stroke="${T}" stroke-width="3" stroke-linecap="round"/>` },

  { n:'La sirena', bg:'#bfe0e8', a:
    `<circle cx="50" cy="28" r="10" fill="${P}"/>
     <path d="M38 26c0-10 6-14 12-14s12 4 12 14c-3-5-7-7-12-7s-9 2-12 7z" fill="${A}"/>
     <path d="M42 38h16c4 8 4 16 0 24h-16c-4-8-4-16 0-24z" fill="${P}"/>
     <path d="M42 62h16c6 10 4 20-8 24-12-4-14-14-8-24z" fill="${V}"/>
     <path d="M50 86c-8 4-14 2-16-2 6 0 10-2 16-6 6 4 10 6 16 6-2 4-8 6-16 2z" fill="${VD}"/>` },

  { n:'La escalera', bg:'#e6ddcb', a:
    `<rect x="28" y="14" width="8" height="72" rx="3" fill="${T}"/>
     <rect x="64" y="14" width="8" height="72" rx="3" fill="${T}"/>
     <rect x="34" y="26" width="32" height="7" fill="${C}"/>
     <rect x="34" y="42" width="32" height="7" fill="${C}"/>
     <rect x="34" y="58" width="32" height="7" fill="${C}"/>
     <rect x="34" y="74" width="32" height="7" fill="${C}"/>` },

  { n:'La botella', bg:'#d7e6d9', a:
    `<path d="M44 16h12v14l8 12v42a4 4 0 0 1-4 4H40a4 4 0 0 1-4-4V42l8-12z" fill="${V}"/>
     <rect x="42" y="12" width="16" height="7" rx="2" fill="${R}"/>
     <rect x="38" y="52" width="24" height="18" rx="2" fill="${B}"/>` },

  { n:'El barril', bg:'#efdcc0', a:
    `<path d="M32 22h36c6 10 6 46 0 56H32c-6-10-6-46 0-56z" fill="${T}"/>
     <rect x="28" y="32" width="44" height="7" fill="${G}"/>
     <rect x="28" y="60" width="44" height="7" fill="${G}"/>
     <path d="M50 22v56" stroke="${N}" stroke-width="1.6" opacity=".35"/>` },

  { n:'El árbol', bg:'#cfe4d2', a:
    `<rect x="45" y="56" width="10" height="30" fill="${T}"/>
     <circle cx="50" cy="38" r="20" fill="${V}"/>
     <circle cx="34" cy="48" r="13" fill="${VD}"/>
     <circle cx="66" cy="48" r="13" fill="${VD}"/>` },

  { n:'El melón', bg:'#e7f0d4', a:
    `<path d="M16 56a34 34 0 0 1 68 0z" fill="${VD}"/>
     <path d="M22 56a28 28 0 0 1 56 0z" fill="#f6a86b"/>
     <circle cx="40" cy="46" r="2.4" fill="${T}"/><circle cx="50" cy="42" r="2.4" fill="${T}"/>
     <circle cx="60" cy="46" r="2.4" fill="${T}"/><circle cx="50" cy="51" r="2.4" fill="${T}"/>` },

  { n:'El valiente', bg:'#f1d7bf', a:
    `<circle cx="42" cy="30" r="11" fill="${P}"/>
     <path d="M24 84c2-16 8-24 18-24s16 8 18 24z" fill="${AZ}"/>
     <path d="M64 74l14-44 5 2-14 44z" fill="${G}"/>
     <path d="M62 76l8 2-2 6-8-2z" fill="${T}"/>
     <path d="M36 34c3-2 5-2 7 0" stroke="${N}" stroke-width="2.4" fill="none"/>` },

  { n:'El gorrito', bg:'#dce8f3', a:
    `<path d="M26 62c0-18 10-28 24-28s24 10 24 28z" fill="${AZ}"/>
     <rect x="20" y="62" width="60" height="9" rx="4" fill="${R}"/>
     <circle cx="50" cy="30" r="5" fill="${A}"/>` },

  { n:'La muerte', bg:'#dfe3e6', a:
    `<path d="M50 16c-15 0-25 11-25 25 0 9 5 15 10 19v10h30V60c5-4 10-10 10-19 0-14-10-25-25-25z" fill="${B}"/>
     <circle cx="40" cy="42" r="6.5" fill="${N}"/><circle cx="60" cy="42" r="6.5" fill="${N}"/>
     <path d="M50 50l-4 8h8z" fill="${N}"/>
     <path d="M38 66h4v8h-4zm10 0h4v8h-4zm10 0h4v8h-4z" fill="${N}"/>` },

  { n:'La pera', bg:'#eef0d2', a:
    `<path d="M50 30c8 0 10 8 8 14-2 5 8 10 8 22 0 12-8 20-16 20s-16-8-16-20c0-12 10-17 8-22-2-6 0-14 8-14z" fill="${VD}"/>
     <path d="M50 30c0-6 4-10 8-11-1 6-3 9-8 11z" fill="${V}"/>` },

  { n:'La bandera', bg:'#e8eef2', a:
    `<rect x="24" y="18" width="4" height="68" rx="2" fill="${T}"/>
     <rect x="28" y="20" width="16" height="30" fill="${V}"/>
     <rect x="44" y="20" width="16" height="30" fill="${B}"/>
     <rect x="60" y="20" width="16" height="30" fill="${R}"/>
     <circle cx="52" cy="35" r="5" fill="${T}"/>` },

  { n:'El bandolón', bg:'#f0e0c8', a:
    `<ellipse cx="46" cy="62" rx="24" ry="20" fill="${T}"/>
     <circle cx="46" cy="62" r="7" fill="${N}"/>
     <rect x="58" y="20" width="8" height="34" rx="3" transform="rotate(18 62 37)" fill="${C}"/>
     <path d="M30 58h32M30 64h32M30 70h32" stroke="${B}" stroke-width="1.2" opacity=".8"/>` },

  { n:'El violoncello', bg:'#e3d5e8', a:
    `<path d="M50 34c10 0 16 8 16 16 0 6-3 10-6 12 3 3 6 7 6 13 0 9-7 15-16 15s-16-6-16-15c0-6 3-10 6-13-3-2-6-6-6-12 0-8 6-16 16-16z" fill="${T}"/>
     <rect x="47" y="10" width="6" height="28" rx="2" fill="${N}"/>
     <path d="M50 38v42" stroke="${B}" stroke-width="1.4"/>` },

  { n:'La garza', bg:'#cfe6ef', a:
    `<path d="M40 80c-8-4-12-12-12-20 0-12 10-20 22-20 6 0 12 2 16 6l-6 6c-3-2-6-3-10-3-8 0-14 5-14 12 0 8 6 14 14 16z" fill="${B}"/>
     <path d="M60 40c2-12 6-20 6-26 0-4-4-6-8-4" stroke="${B}" stroke-width="7" fill="none" stroke-linecap="round"/>
     <path d="M56 12l10 3-10 4z" fill="${A}"/>
     <circle cx="61" cy="15" r="1.8" fill="${N}"/>
     <path d="M40 80l6 8m6-8l4 8" stroke="${A}" stroke-width="3" stroke-linecap="round"/>` },

  { n:'El pájaro', bg:'#dfeed6', a:
    `<ellipse cx="48" cy="54" rx="20" ry="16" fill="${AZ}"/>
     <circle cx="66" cy="42" r="10" fill="${AZ}"/>
     <path d="M74 42l10 3-10 4z" fill="${A}"/>
     <circle cx="68" cy="40" r="2" fill="${N}"/>
     <path d="M28 54c8-8 18-6 22 2-8 6-16 6-22-2z" fill="#5a92d1"/>
     <path d="M44 70l-2 12m10-12l2 12" stroke="${A}" stroke-width="3" stroke-linecap="round"/>` },

  { n:'La mano', bg:'#f3ded1', a:
    `<path d="M36 52V26a5 5 0 0 1 10 0v22V22a5 5 0 0 1 10 0v26V28a5 5 0 0 1 10 0v30c0 16-8 28-22 28s-20-10-20-22c0-8 4-12 12-12z" fill="${P}"/>
     <path d="M36 52c-8 0-12 4-12 12" stroke="${C}" stroke-width="2" fill="none"/>` },

  { n:'La bota', bg:'#e6dccf', a:
    `<path d="M38 14h16v40c0 6 4 8 12 10 8 2 12 6 12 14v6H32V14z" fill="${T}"/>
     <rect x="28" y="78" width="56" height="8" rx="3" fill="${N}"/>
     <path d="M38 30h16M38 44h16" stroke="${C}" stroke-width="2.4"/>` },

  { n:'La luna', bg:'#20305c', a:
    `<path d="M62 16c-18 2-32 16-32 34s14 32 32 34c-10-8-16-20-16-34s6-26 16-34z" fill="${A}"/>
     <circle cx="42" cy="42" r="2.6" fill="${N}"/>
     <path d="M40 56c4 3 8 2 10-2" stroke="${N}" stroke-width="2.4" fill="none" stroke-linecap="round"/>
     <circle cx="74" cy="26" r="2.4" fill="${B}"/><circle cx="80" cy="60" r="2" fill="${B}"/>` },

  { n:'El cotorro', bg:'#e9f0cf', a:
    `<path d="M56 22c14 0 22 12 22 26s-8 30-22 30c-10 0-16-8-16-18 0-16 4-38 16-38z" fill="${V}"/>
     <circle cx="62" cy="34" r="2.6" fill="${N}"/>
     <path d="M44 34c-8 0-12 6-8 10 3 3 8 2 10-2z" fill="${A}"/>
     <path d="M46 40c-4 3-4 8 0 10 3-2 5-6 4-10z" fill="${RO}"/>
     <rect x="24" y="76" width="52" height="6" rx="3" fill="${T}"/>
     <path d="M56 78l-2 6m8-6l2 6" stroke="${G}" stroke-width="3" stroke-linecap="round"/>` },

  { n:'El borracho', bg:'#efd9c4', a:
    `<circle cx="46" cy="32" r="11" fill="${P}"/>
     <circle cx="41" cy="34" r="3" fill="#e79a9a"/><circle cx="51" cy="34" r="3" fill="#e79a9a"/>
     <path d="M28 86c2-18 8-28 18-28s16 10 18 28z" fill="${M}"/>
     <path d="M66 46h12v26H66z" fill="${V}"/><rect x="69" y="40" width="6" height="8" fill="${V}"/>
     <path d="M40 42c4 2 8 2 12 0" stroke="${N}" stroke-width="2.2" fill="none" stroke-linecap="round"/>` },

  { n:'El corazón', bg:'#f6d3d8', a:
    `<path d="M50 84C26 66 16 54 16 40c0-12 9-20 20-20 7 0 12 3 14 8 2-5 7-8 14-8 11 0 20 8 20 20 0 14-10 26-34 44z" fill="${R}"/>
     <path d="M34 32c-4 2-6 6-6 10" stroke="${B}" stroke-width="3" fill="none" stroke-linecap="round" opacity=".7"/>` },

  { n:'La sandía', bg:'#dff0d8', a:
    `<path d="M12 30a38 38 0 0 0 76 0z" fill="${V}"/>
     <path d="M18 30a32 32 0 0 0 64 0z" fill="${B}"/>
     <path d="M22 30a28 28 0 0 0 56 0z" fill="${RO}"/>
     <ellipse cx="38" cy="42" rx="2.4" ry="3.4" fill="${N}"/>
     <ellipse cx="50" cy="48" rx="2.4" ry="3.4" fill="${N}"/>
     <ellipse cx="62" cy="42" rx="2.4" ry="3.4" fill="${N}"/>` },

  { n:'El tambor', bg:'#ecd9bd', a:
    `<rect x="24" y="36" width="52" height="34" rx="4" fill="${R}"/>
     <ellipse cx="50" cy="36" rx="26" ry="8" fill="${B}"/>
     <ellipse cx="50" cy="70" rx="26" ry="8" fill="#c8b28c"/>
     <path d="M26 40l10 26m14-26l-10 26m24-26l10 26m4-26l-10 26" stroke="${B}" stroke-width="2" opacity=".85"/>
     <path d="M66 20l10 14m8-12l-10 14" stroke="${T}" stroke-width="4" stroke-linecap="round"/>` },

  { n:'El camarón', bg:'#fbe0cf', a:
    `<path d="M74 30c-24-6-46 6-46 26 0 14 12 24 26 24 8 0 14-4 14-10 0-8-8-10-14-8 6-14 14-22 20-22z" fill="#f0774a"/>
     <circle cx="70" cy="34" r="2.4" fill="${N}"/>
     <path d="M76 26l10-6m-8 10l12-2" stroke="#f0774a" stroke-width="2.6" stroke-linecap="round"/>
     <path d="M40 40l-8-8m2 18l-12-4m14 14l-10 8" stroke="#f0774a" stroke-width="3" stroke-linecap="round"/>` },

  { n:'Las jaras', bg:'#e7ddc8', a:
    `<path d="M22 78L74 26m-52 52l-6 6m58-58l6-6" stroke="${T}" stroke-width="3.4" stroke-linecap="round"/>
     <path d="M74 26l-4-10 14 4z" fill="${G}"/>
     <path d="M34 66L86 14" stroke="${T}" stroke-width="3.4" stroke-linecap="round"/>
     <path d="M86 14l-4-10 14 4z" fill="${G}" transform="translate(-2 2)"/>
     <path d="M22 78l10-4-6 10z" fill="${R}"/>` },

  { n:'El músico', bg:'#e3dcef', a:
    `<circle cx="42" cy="30" r="11" fill="${P}"/>
     <path d="M26 86c2-18 8-28 18-28s16 10 18 28z" fill="${R}"/>
     <path d="M52 36c10-4 20 0 24 8 3 6 0 12-6 12" stroke="${A}" stroke-width="5" fill="none" stroke-linecap="round"/>
     <path d="M70 56l14-6-2 12z" fill="${A}"/>` },

  { n:'La araña', bg:'#e0e2e6', a:
    `<ellipse cx="50" cy="52" rx="16" ry="18" fill="${N}"/>
     <circle cx="50" cy="34" r="9" fill="${N}"/>
     <circle cx="46" cy="32" r="2.2" fill="${R}"/><circle cx="54" cy="32" r="2.2" fill="${R}"/>
     <path d="M34 42L16 30m18 22H14m20 12L18 76m48-34l18-12M66 52h20M66 64l16 12" stroke="${N}" stroke-width="3.4" stroke-linecap="round"/>` },

  { n:'El soldado', bg:'#dbe4d5', a:
    `<circle cx="44" cy="34" r="11" fill="${P}"/>
     <path d="M30 26h28v6H30z" fill="${V}"/><path d="M32 20h24v6H32z" fill="${V}"/>
     <path d="M26 86c2-18 8-28 18-28s16 10 18 28z" fill="${V}"/>
     <path d="M62 30l4 48" stroke="${T}" stroke-width="4" stroke-linecap="round"/>` },

  { n:'La estrella', bg:'#22355f', a:
    `<path d="M50 12l10 26 28 2-22 18 8 28-24-16-24 16 8-28-22-18 28-2z" fill="${A}"/>
     <circle cx="24" cy="24" r="2.2" fill="${B}"/><circle cx="80" cy="72" r="2" fill="${B}"/>` },

  { n:'El cazo', bg:'#e6e0d4', a:
    `<path d="M22 40h48v22c0 10-8 18-18 18h-12c-10 0-18-8-18-18z" fill="${G}"/>
     <rect x="18" y="34" width="56" height="8" rx="3" fill="${N}"/>
     <rect x="70" y="34" width="22" height="7" rx="3" fill="${T}"/>
     <path d="M36 28c0-6 6-6 6-12m10 12c0-6 6-6 6-12" stroke="${B}" stroke-width="2.6" fill="none" stroke-linecap="round" opacity=".8"/>` },

  { n:'El mundo', bg:'#cfe3ee', a:
    `<circle cx="50" cy="50" r="32" fill="${AZ}"/>
     <path d="M28 34c10 4 14 12 12 18 8 2 10 10 6 16 10 0 16-8 14-16 8-4 6-14-2-18-10-4-22-4-30 0z" fill="${VD}"/>
     <ellipse cx="50" cy="50" rx="32" ry="13" fill="none" stroke="${B}" stroke-width="1.6" opacity=".7"/>
     <path d="M50 18v64" stroke="${B}" stroke-width="1.6" opacity=".7"/>` },

  { n:'El apache', bg:'#eddbc6', a:
    `<circle cx="50" cy="44" r="14" fill="#c98a5e"/>
     <path d="M28 86c2-18 10-28 22-28s20 10 22 28z" fill="${T}"/>
     <rect x="32" y="28" width="36" height="7" rx="3" fill="${R}"/>
     <path d="M50 28l-4-18 8 4 2-6 4 20z" fill="${B}"/>
     <circle cx="44" cy="44" r="2" fill="${N}"/><circle cx="56" cy="44" r="2" fill="${N}"/>` },

  { n:'El nopal', bg:'#e3eed6', a:
    `<path d="M44 86V44c0-10 12-10 12 0v42z" fill="${V}"/>
     <path d="M44 56c-12 0-16-6-16-14s10-10 12-2c2 6 4 10 4 16z" fill="${VD}"/>
     <path d="M56 66c12 0 16-6 16-14s-10-10-12-2c-2 6-4 10-4 16z" fill="${VD}"/>
     <circle cx="50" cy="40" r="3" fill="${R}"/><circle cx="34" cy="46" r="2.6" fill="${R}"/>` },

  { n:'El alacrán', bg:'#efe2c8', a:
    `<path d="M40 54c0-8 6-12 12-12s12 4 12 12-6 12-12 12-12-4-12-12z" fill="${T}"/>
     <path d="M64 50c10-2 16 2 16 10s-4 16-12 16c4-6 4-12 0-14 6-4 4-10-4-12z" fill="${T}"/>
     <path d="M40 48l-12-6m12 14H26m14 10l-10 8" stroke="${T}" stroke-width="3.4" stroke-linecap="round"/>
     <path d="M46 42l-8-10-8 4m28 6l8-10 8 4" stroke="${T}" stroke-width="3.4" fill="none" stroke-linecap="round"/>` },

  { n:'La rosa', bg:'#f7dbe4', a:
    `<circle cx="50" cy="40" r="22" fill="${RS}"/>
     <circle cx="50" cy="40" r="14" fill="${R}"/>
     <circle cx="50" cy="40" r="6" fill="${RS}"/>
     <path d="M50 62v24" stroke="${V}" stroke-width="4" stroke-linecap="round"/>
     <path d="M50 72c-10-2-14-8-14-14 8 0 14 6 14 14z" fill="${V}"/>` },

  { n:'La calavera', bg:'#f0e6d8', a:
    `<path d="M50 14c-16 0-27 12-27 27 0 10 5 17 11 21v10h32V62c6-4 11-11 11-21 0-15-11-27-27-27z" fill="${B}"/>
     <circle cx="39" cy="42" r="7" fill="${N}"/><circle cx="61" cy="42" r="7" fill="${N}"/>
     <path d="M50 50l-5 9h10z" fill="${N}"/>
     <path d="M36 68h6v8h-6zm11 0h6v8h-6zm11 0h6v8h-6z" fill="${N}"/>
     <circle cx="39" cy="42" r="2" fill="${RS}"/><circle cx="61" cy="42" r="2" fill="${RS}"/>` },

  { n:'La campana', bg:'#efe6cd', a:
    `<path d="M50 18c14 0 20 12 20 26 0 12 4 18 6 22H24c2-4 6-10 6-22 0-14 6-26 20-26z" fill="${A}"/>
     <rect x="20" y="66" width="60" height="8" rx="4" fill="#d8a72f"/>
     <circle cx="50" cy="80" r="6" fill="#d8a72f"/>
     <rect x="47" y="10" width="6" height="10" rx="3" fill="${T}"/>` },

  { n:'El cantarito', bg:'#f0dfd0', a:
    `<path d="M36 34h28c8 8 10 20 10 28 0 14-10 24-24 24s-24-10-24-24c0-8 2-20 10-28z" fill="${C}"/>
     <rect x="38" y="24" width="24" height="12" rx="4" fill="#d98f4f"/>
     <path d="M74 46c10 0 12 14 2 18" stroke="#d98f4f" stroke-width="6" fill="none" stroke-linecap="round"/>
     <path d="M32 60h36" stroke="${B}" stroke-width="3" opacity=".75"/>` },

  { n:'El venado', bg:'#e8dcc6', a:
    `<path d="M50 40c12 0 18 10 18 22s-8 24-18 24-18-12-18-24 6-22 18-22z" fill="${T}"/>
     <path d="M38 40l-8-14-10-2 4 10-8 2 12 8m34-4l8-14 10-2-4 10 8 2-12 8" stroke="${T}" stroke-width="3.4" fill="none" stroke-linecap="round"/>
     <circle cx="43" cy="56" r="2.4" fill="${N}"/><circle cx="57" cy="56" r="2.4" fill="${N}"/>
     <ellipse cx="50" cy="68" rx="6" ry="4" fill="${N}"/>` },

  { n:'El sol', bg:'#f7e9c0', a:
    `<circle cx="50" cy="50" r="22" fill="${A}"/>
     <path d="M50 10v12m0 56v12M10 50h12m56 0h12M22 22l8 8m40 40l8 8M78 22l-8 8M30 70l-8 8" stroke="#e8a51f" stroke-width="5" stroke-linecap="round"/>
     <circle cx="43" cy="46" r="2.6" fill="${N}"/><circle cx="57" cy="46" r="2.6" fill="${N}"/>
     <path d="M42 58c5 5 11 5 16 0" stroke="${N}" stroke-width="2.6" fill="none" stroke-linecap="round"/>` },

  { n:'La corona', bg:'#efe3f0', a:
    `<path d="M20 70V34l14 12 16-22 16 22 14-12v36z" fill="${A}"/>
     <rect x="20" y="70" width="60" height="10" rx="3" fill="#d8a72f"/>
     <circle cx="34" cy="42" r="4" fill="${R}"/><circle cx="50" cy="34" r="4" fill="${AZ}"/>
     <circle cx="66" cy="42" r="4" fill="${V}"/>` },

  { n:'La chalupa', bg:'#cfe4ea', a:
    `<path d="M14 60h72c-4 14-16 20-36 20s-32-6-36-20z" fill="${T}"/>
     <path d="M30 60c0-10 4-16 10-16s10 6 10 16z" fill="${VD}"/>
     <circle cx="40" cy="42" r="5" fill="${RS}"/><circle cx="56" cy="48" r="5" fill="${A}"/>
     <circle cx="66" cy="52" r="4" fill="${R}"/>
     <path d="M14 78c8 4 16 4 24 0s16-4 24 0 16 4 24 0" stroke="${AZ}" stroke-width="3" fill="none"/>` },

  { n:'El pino', bg:'#d9e8d6', a:
    `<rect x="46" y="70" width="8" height="16" fill="${T}"/>
     <path d="M50 12l16 24H34zm0 18l20 26H30zm0 18l24 26H26z" fill="${V}"/>` },

  { n:'El pescado', bg:'#cfe6ef', a:
    `<path d="M74 50c0 12-14 20-28 20s-26-8-26-20 12-20 26-20 28 8 28 20z" fill="${AZ}"/>
     <path d="M74 50l14-12v24z" fill="#245c96"/>
     <circle cx="34" cy="45" r="3" fill="${B}"/><circle cx="34" cy="45" r="1.4" fill="${N}"/>
     <path d="M48 34c4 6 4 26 0 32" stroke="#245c96" stroke-width="2.4" fill="none"/>` },

  { n:'La palma', bg:'#e6efd2', a:
    `<path d="M48 86c-2-24 0-40 4-52l7 2c-5 12-6 28-4 50z" fill="${T}"/>
     <path d="M52 34c-12-6-24-4-30 4 10-2 20 0 28 4zm0 0c12-8 24-8 30 0-10-2-20 0-28 6zm0 0c-4-12-14-18-24-16 8 4 16 8 22 18zm0 0c8-10 18-14 26-10-8 2-18 6-24 14z" fill="${V}"/>
     <circle cx="52" cy="34" r="4" fill="${T}"/>` },

  { n:'La maceta', bg:'#eee2d4', a:
    `<path d="M32 56h36l-5 30H37z" fill="#c96a3c"/>
     <rect x="28" y="48" width="44" height="10" rx="3" fill="#e07a48"/>
     <path d="M50 48V30" stroke="${V}" stroke-width="4"/>
     <circle cx="42" cy="26" r="9" fill="${VD}"/><circle cx="58" cy="26" r="9" fill="${V}"/>
     <circle cx="50" cy="16" r="8" fill="${VD}"/>` },

  { n:'El arpa', bg:'#f0e7d2', a:
    `<path d="M28 84V26c22 2 38 22 40 58z" fill="none" stroke="${T}" stroke-width="6" stroke-linejoin="round"/>
     <path d="M36 80V34m8 46V40m8 40V48m8 32V58" stroke="${A}" stroke-width="2.4"/>
     <rect x="22" y="80" width="52" height="7" rx="3" fill="${T}"/>` },

  { n:'La rana', bg:'#dff0d4', a:
    `<ellipse cx="50" cy="58" rx="26" ry="20" fill="${V}"/>
     <circle cx="38" cy="36" r="10" fill="${V}"/><circle cx="62" cy="36" r="10" fill="${V}"/>
     <circle cx="38" cy="36" r="5" fill="${B}"/><circle cx="62" cy="36" r="5" fill="${B}"/>
     <circle cx="38" cy="37" r="2.4" fill="${N}"/><circle cx="62" cy="37" r="2.4" fill="${N}"/>
     <path d="M40 64c6 5 14 5 20 0" stroke="${N}" stroke-width="2.6" fill="none" stroke-linecap="round"/>
     <path d="M26 72l-8 10m56-10l8 10" stroke="${V}" stroke-width="6" stroke-linecap="round"/>` },
];

/** SVG completo de una carta, listo para meter en el HTML. */
export function cardSvg(i){
  const c = CARDS[i];
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-label="${c.n}">` +
         `<rect width="100" height="100" fill="${c.bg}"/>${c.a}</svg>`;
}
export const cardName = (i) => CARDS[i].n;
