/* Genera los PNG del icono sin depender de ninguna librería.
   Uso:  node tools/make-icons.mjs                                            */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const crcTable = (() => {
  const t = new Int32Array(256);
  for(let n = 0; n < 256; n++){
    let c = n;
    for(let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = -1;
  for(const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
function png(w, h, rgba){
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for(let y = 0; y < h; y++){
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level:9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

function draw(S){
  const buf = Buffer.alloc(S * S * 4);
  const R = S * 0.22;                                     // radio de las esquinas
  const put = (x, y, [r, g, b], a = 255) => {
    const i = (y * S + x) * 4;
    buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a;
  };
  const inRound = (x, y) => {
    const cx = Math.min(Math.max(x, R), S - R), cy = Math.min(Math.max(y, R), S - R);
    return Math.hypot(x - cx, y - cy) <= R;
  };

  for(let y = 0; y < S; y++) for(let x = 0; x < S; x++){
    if(!inRound(x + .5, y + .5)){ put(x, y, [0, 0, 0], 0); continue; }
    const t = (x / S + y / S) / 2;
    put(x, y, mix([59, 30, 110], [74, 19, 80], t));
  }

  /* dado girado con 5 puntos */
  const c = S / 2, side = S * 0.47, ang = -0.21;
  const cos = Math.cos(ang), sin = Math.sin(ang);
  for(let y = 0; y < S; y++) for(let x = 0; x < S; x++){
    const dx = x - c, dy = y - c;
    const rx = dx * cos + dy * sin, ry = -dx * sin + dy * cos;
    if(Math.abs(rx) > side / 2 || Math.abs(ry) > side / 2) continue;
    const rr = side * .18;                                // esquinas redondeadas del dado
    const qx = Math.min(Math.abs(rx), side / 2 - rr), qy = Math.min(Math.abs(ry), side / 2 - rr);
    if(Math.hypot(Math.abs(rx) - qx, Math.abs(ry) - qy) > rr) continue;
    const t = Math.min(1, Math.max(0, (rx / side + ry / side) + .5));
    put(x, y, mix(mix([255, 210, 63], [255, 79, 154], Math.min(1, t * 1.6)), [34, 211, 238], Math.max(0, t - .55) * 2));
  }
  const dot = side * 0.155;
  for(const [ox, oy] of [[-.26, -.26], [.26, -.26], [0, 0], [-.26, .26], [.26, .26]]){
    const px = c + (ox * side * cos - oy * side * sin), py = c + (ox * side * sin + oy * side * cos);
    for(let y = Math.floor(py - dot); y <= py + dot; y++)
      for(let x = Math.floor(px - dot); x <= px + dot; x++)
        if(x >= 0 && y >= 0 && x < S && y < S && Math.hypot(x - px, y - py) <= dot) put(x, y, [23, 18, 58]);
  }

  /* corazoncito abajo */
  const hy = S * .80, hs = S * .17;
  for(let y = Math.floor(hy - hs * 1.2); y < hy + hs * 1.2; y++) for(let x = Math.floor(c - hs * 1.3); x < c + hs * 1.3; x++){
    const nx = (x - c) / hs * 1.05, ny = -(y - hy) / hs * 1.05 + .25;
    const f = Math.pow(nx * nx + ny * ny - 1, 3) - nx * nx * ny * ny * ny;
    if(f < 0 && x >= 0 && y >= 0 && x < S && y < S) put(x, y, [255, 79, 154]);
  }
  return buf;
}

mkdirSync('assets', { recursive:true });
for(const size of [192, 512, 180]){
  writeFileSync(`assets/icon-${size}.png`, png(size, size, draw(size)));
  console.log('assets/icon-' + size + '.png ✓');
}
