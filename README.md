# 🎲 Jueguitos

**En línea:** https://elrobamichis.github.io/jueguitos/

Una app de **23 juegos para dos**, pensada para jugar a distancia desde el
teléfono. Uno crea la sala, comparte un código de 4 dígitos, y a jugar.

- 100 % estática: se publica tal cual en **GitHub Pages**, sin backend que mantener.
- Sincronización en **tiempo real** aguantando 3G, cambios de red y pantalla apagada.
- Se instala en el celular como app (PWA) y abre aunque no haya señal.
- Chat, reacciones con emoji y marcador acumulado entre los dos.

---

## Cómo se publica en GitHub Pages

```bash
git init && git add -A && git commit -m "Jueguitos"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/jueguitos.git
git push -u origin main
```

Después, en GitHub: **Settings → Pages → Source: Deploy from a branch →
`main` / `/ (root)` → Save**. En un par de minutos queda en:

```
https://TU-USUARIO.github.io/jueguitos/
```

Esa liga es la que abren los dos. No hay nada que configurar ni que encender.

### Para probar en tu compu

```bash
python3 -m http.server 8123
```

y abre `http://localhost:8123`. (Tiene que ser por `http://`, no abriendo el
archivo directo, porque la app usa módulos de JavaScript.)

---

## Cómo se juega

1. Los dos abren la página y escriben su nombre.
2. Uno pulsa **Crear sala** → le sale un código de 4 dígitos (ej. `4821`).
3. El otro escribe ese código y pulsa **Entrar a la sala**.
4. En el menú, cada quien toca el juego que quiere. Aparece un círculo con la
   inicial de quien lo eligió.
5. Cuando los dos tocan **el mismo** juego, sale la cuenta regresiva 3-2-1 y
   empieza.
6. Al terminar: **Revancha** (tiene que aceptar el otro) o **Volver al menú**.

El botón 🔗 comparte una liga que ya trae el código, para mandarla por WhatsApp.

---

## Los 23 juegos

| Tablero y turnos | Palabras y dibujo | Para pareja | Arcade |
|---|---|---|---|
| Gato | Ahorcado | ¿Me conoces? | Basket |
| Conecta 4 | Dibuja y Adivina | Verdad o Reto | Tiro con Arco |
| Damas | Basta | Preguntas | Ping Pong |
| Reversi | | | Air Hockey |
| Dominó | | | Ritmo |
| Serpientes y Escaleras | | | Carrera de Tap |
| Ludo | | | Revienta Globos |
| Batalla Naval | | | |
| Memorama | | | |
| Buscaminas (a dos) | | | |

---

## Cómo funciona la conexión (y por qué así)

GitHub Pages sólo sirve archivos: no puede correr un servidor. Así que la sala
vive en un **broker MQTT público sobre WebSocket seguro** (`wss`), que es un
relay de mensajes gratuito y sin registro.

Se eligió MQTT en vez de las alternativas por lo siguiente:

| Opción | Problema para este caso |
|---|---|
| WebRTC / P2P directo | Con redes móviles (CGNAT) falla seguido y necesitaría un servidor TURN de pago. |
| Firebase / Supabase | Hay que crear cuenta, meter llaves y vigilar la cuota gratis. |
| Servidor propio (Render, Fly…) | Se duerme, se cae, hay que mantenerlo. |
| **MQTT público (lo que usamos)** | Cero configuración, funciona detrás de cualquier NAT, paquetes de 2–4 bytes de cabecera y reconexión automática. |

### Detalles que lo hacen estable con mala señal

- **Tres brokers en cascada** (EMQX → HiveMQ → Mosquitto): si uno se cae, el
  cliente rota al siguiente solo.
- **Presencia con *last will***: si a alguien se le muere la red, el broker
  avisa al otro automáticamente y la partida se pausa en vez de romperse.
- **Estado retenido**: el anfitrión publica una instantánea del tablero en un
  mensaje "retained". Quien se reconecte la recibe *al instante*, sin pedir
  nada: se puede cerrar la app a media partida y volver.
- **Reenvío de lo importante**: chat y jugadas van con QoS 1 y con reintento;
  las cosas efímeras (posición de la pelota) van con QoS 0, porque llega otra
  actualización en 60 ms.
- **Un solo dueño de la verdad**: el anfitrión calcula y publica; el invitado
  manda intenciones. Nunca se desincronizan los tableros.

### Medido en la app publicada

| Prueba | Resultado |
|---|---|
| Ida y vuelta de un mensaje (jugador → broker → jugador → broker → jugador) | 394–425 ms, mediana **409 ms** |
| Retraso de una jugada en llegar | ~**200 ms** |
| Entrega a 15 mensajes/s (ritmo de Ping Pong), QoS 0 | **45 de 45** |
| Tiempo en conectar al broker | ~1.0 s (EMQX), 1.2 s (HiveMQ), 1.7 s (Mosquitto) |

Medido desde México con los tres brokers respondiendo parecido (180–210 ms),
por eso EMQX va primero en la lista.

### Cuántos datos gasta

| Tipo de juego | Consumo aproximado |
|---|---|
| Por turnos (gato, dominó, ludo, batalla…) | ~200 bytes por jugada. Una partida entera son unos **20–60 KB**. |
| Dibujar y adivinar | ~0.5 KB/s mientras dibujas. |
| Ping Pong / Air Hockey (los únicos en vivo) | ~2.5 KB/s → una partida de 3 minutos son unos **450 KB**. |
| Estar en la sala sin jugar | Un latido cada 5 s: prácticamente nada. |

### Privacidad

El topic del broker se deriva de un hash del código, y **todo el contenido va
cifrado con AES-GCM** con una llave derivada del propio código (PBKDF2). El
broker sólo ve bytes. Aun así, no es una app para mandar cosas sensibles: son
4 dígitos y el broker es público.

---

## Estructura

```
index.html              pantallas (inicio / sala / juego)
css/app.css             interfaz general
css/games.css           tableros y piezas
js/main.js              inicio, sala, menú, chat, marcador
js/net/net.js           transporte MQTT, presencia, reconexión, cifrado
js/core/engine.js       ciclo de vida de una partida (pausa, resultado, revancha)
js/core/{ui,store,emitter}.js
js/games/registry.js    catálogo (carga cada juego bajo demanda)
js/games/lib/kit.js     motores: turnGame · liveGame · duelGame
js/games/*.js           un archivo por juego
sw.js                   caché offline
tools/make-icons.mjs    genera los PNG del icono
tools/selftest.mjs      simula dos jugadores y juega partidas solo
```

### Agregar un juego nuevo

1. Crea `js/games/mijuego.js` con `export default (ctx) => turnGame(ctx, {...})`.
2. Añádelo a la lista de `js/games/registry.js`.

`turnGame` te da turnos, estado compartido, reconexión y resultado gratis; sólo
escribes `init`, `action` y `render` (y `view` si hay que esconderle cartas al
rival).

### Probar sin navegador

```bash
node tools/selftest.mjs          # todos los juegos por turnos
node tools/selftest.mjs ludo     # sólo uno
```

Monta dos jugadores con un DOM falso, los conecta entre sí y juega partidas
pulsando botones al azar hasta que alguien gana.
