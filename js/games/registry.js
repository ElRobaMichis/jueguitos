/* Catálogo de juegos. Cada uno se carga bajo demanda (import dinámico) para que
   la app abra rápido aunque la señal esté mala. */

export const GAMES = [
  /* --- tablero / por turnos ------------------------------------------- */
  { id:'gato',       name:'Gato',            emoji:'⭕', tint:'#ff4f9a', tag:'turnos', load:() => import('./gato.js') },
  { id:'conecta4',   name:'Conecta 4',       emoji:'🔴', tint:'#22d3ee', tag:'turnos', load:() => import('./conecta4.js') },
  { id:'damas',      name:'Damas',           emoji:'⚫', tint:'#a3e635', tag:'turnos', load:() => import('./damas.js') },
  { id:'reversi',    name:'Reversi',         emoji:'🟢', tint:'#34d399', tag:'turnos', load:() => import('./reversi.js') },
  { id:'domino',     name:'Dominó',          emoji:'🀰', tint:'#ffd23f', tag:'turnos', load:() => import('./domino.js') },
  { id:'escaleras',  name:'Serpientes',      emoji:'🐍', tint:'#ff7a45', tag:'azar',   load:() => import('./escaleras.js') },
  { id:'ludo',       name:'Ludo',            emoji:'🎲', tint:'#8b5cf6', tag:'azar',   load:() => import('./ludo.js') },
  { id:'batalla',    name:'Batalla Naval',   emoji:'🚢', tint:'#22d3ee', tag:'turnos', load:() => import('./batalla.js') },
  { id:'memorama',   name:'Memorama',        emoji:'🃏', tint:'#ff4f9a', tag:'carrera', load:() => import('./memorama.js') },
  { id:'loteria',    name:'Lotería',         emoji:'🎴', tint:'#f2c14e', tag:'azar',   load:() => import('./loteria.js') },
  { id:'buscaminas', name:'Buscaminas',      emoji:'💣', tint:'#f43f5e', tag:'carrera', load:() => import('./buscaminas.js') },

  /* --- palabras y dibujo ---------------------------------------------- */
  { id:'ahorcado',   name:'Ahorcado',        emoji:'🔤', tint:'#ffd23f', tag:'palabras', load:() => import('./ahorcado.js') },
  { id:'pictionary', name:'Dibuja y Adivina',emoji:'🎨', tint:'#8b5cf6', tag:'dibujo',   load:() => import('./pictionary.js') },
  { id:'basta',      name:'Basta',           emoji:'📝', tint:'#34d399', tag:'palabras', load:() => import('./basta.js') },

  /* --- para pareja ------------------------------------------------------ */
  { id:'trivia',     name:'¿Me conoces?',    emoji:'💞', tint:'#ff4f9a', tag:'pareja', load:() => import('./trivia.js') },
  { id:'verdadreto', name:'Verdad o Reto',   emoji:'🍒', tint:'#f43f5e', tag:'pareja', load:() => import('./verdadreto.js') },
  { id:'preguntas',  name:'Preguntas',       emoji:'💌', tint:'#22d3ee', tag:'pareja', load:() => import('./preguntas.js') },

  /* --- arcade / reflejos ----------------------------------------------- */
  { id:'basket',     name:'Basket',          emoji:'🏀', tint:'#ff7a45', tag:'arcade', load:() => import('./basket.js') },
  { id:'arqueria',   name:'Tiro con Arco',   emoji:'🏹', tint:'#a3e635', tag:'arcade', load:() => import('./arqueria.js') },
  { id:'pingpong',   name:'Ping Pong',       emoji:'🏓', tint:'#22d3ee', tag:'vivo',   load:() => import('./pingpong.js') },
  { id:'airhockey',  name:'Air Hockey',      emoji:'🥅', tint:'#8b5cf6', tag:'vivo',   load:() => import('./airhockey.js') },
  { id:'ritmo',      name:'Ritmo',           emoji:'🎵', tint:'#ff4f9a', tag:'arcade', load:() => import('./ritmo.js') },
  { id:'taprace',    name:'Carrera de Tap',  emoji:'⚡', tint:'#ffd23f', tag:'arcade', load:() => import('./taprace.js') },
  { id:'globos',     name:'Revienta Globos', emoji:'🎈', tint:'#34d399', tag:'arcade', load:() => import('./globos.js') },
];

export const gameById = (id) => GAMES.find(g => g.id === id);
