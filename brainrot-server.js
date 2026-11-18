// Steal a Brainrot 3D - tiny multiplayer relay server.
// Run:  npm install ws   then   node brainrot-server.js
// Put it behind TLS (Render, Railway, Fly.io, Glitch... give you wss:// for free)
// and type that wss:// address into the game's Multiplayer > Server URL box.
const { WebSocketServer } = require('ws');
const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT, maxPayload: 8192 });
const rooms = new Map(), dirty = new Set();
let nid = 1;
const clean = s => String(s || 'lobby').toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 40) || 'lobby';
const send = (w, m) => { if (w.readyState === 1) w.send(m); };
function snap(code) {
  const r = rooms.get(code); if (!r) return;
  const msg = JSON.stringify({ t: 'peers', peers: [...r].map(w => ({ peer: w.id, presence: w.pres })) });
  for (const w of r) send(w, msg);
}
setInterval(() => { for (const c of dirty) snap(c); dirty.clear(); }, 100);
function leave(ws) {
  if (!ws.room) return;
  const r = rooms.get(ws.room);
  if (r) { r.delete(ws); if (!r.size) rooms.delete(ws.room); else dirty.add(ws.room); }
  ws.room = null;
}
wss.on('connection', ws => {
  ws.id = 'p' + (nid++); ws.room = null; ws.pres = {}; ws.alive = true; ws.cnt = 0;
  ws.on('pong', () => (ws.alive = true));
  ws.on('message', raw => {
    if (++ws.cnt > 60) return;                       // max 60 messages per second per player
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (m.t === 'join') {
      leave(ws);
      const code = clean(m.room);
      if (!rooms.has(code)) { if (rooms.size >= 500) return ws.close(); rooms.set(code, new Set()); }
      const r = rooms.get(code); if (r.size >= 32) return ws.close();   // 32 players per room
      r.add(ws); ws.room = code;
      send(ws, JSON.stringify({ t: 'hello', id: ws.id })); dirty.add(code);
    } else if (!ws.room) { return; }
    else if (m.t === 'pres' && m.p && typeof m.p === 'object') {
      Object.assign(ws.pres, m.p);
      if (JSON.stringify(ws.pres).length > 4096) ws.pres = {};
      dirty.add(ws.room);
    } else if (m.t === 'emit') {
      const out = JSON.stringify({ t: 'ev', topic: String(m.topic || '').slice(0, 32), data: m.data, from: ws.id });
      if (out.length > 5000) return;
      for (const w of rooms.get(ws.room)) send(w, out);
    }
  });
  ws.on('close', () => leave(ws));
  ws.on('error', () => {});
});
setInterval(() => { for (const w of wss.clients) w.cnt = 0; }, 1000);
setInterval(() => { for (const w of wss.clients) { if (!w.alive) { w.terminate(); continue; } w.alive = false; w.ping(); } }, 15000);
console.log('Brainrot server listening on port ' + PORT);
