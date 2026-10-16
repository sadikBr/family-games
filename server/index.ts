/**
 * Family Games realtime server
 *
 *   bun run server
 *
 * Every phone connects here over WebSocket. The server is the single source of truth:
 * it deals the secret words/roles and sends each player only what they are allowed to see.
 */
import { networkInterfaces } from 'node:os';

import { DEFAULT_PORT, GAME_IDS, type ClientMsg, type PlayerInfo } from '../src/shared/protocol';
import { Room, send, type Sock, type SockData } from './room';
import { GameError } from './types';
import { isStr } from './util';

const PORT = Number(process.env.PORT ?? DEFAULT_PORT);
const ROOM_TTL_MS = 1000 * 60 * 60 * 3; // forget rooms nobody touched for 3h
const EMPTY_ROOM_TTL_MS = 1000 * 60 * 30; // or 30 min after everyone left

const rooms = new Map<string, Room>();

function newCode(): string {
  for (let i = 0; i < 1000; i++) {
    const code = String(Math.floor(1000 + Math.random() * 9000));
    if (!rooms.has(code)) return code;
  }
  throw new Error('no free room codes');
}

function cleanPlayer(p: unknown): PlayerInfo | null {
  if (!p || typeof p !== 'object') return null;
  const o = p as Record<string, unknown>;
  if (!isStr(o.id) || o.id.length < 4 || o.id.length > 64) return null;
  const name = isStr(o.name) ? o.name.trim().slice(0, 20) : '';
  return {
    id: o.id,
    name: name || 'لاعب',
    avatar: isStr(o.avatar) ? o.avatar.slice(0, 16) : 'cat',
    color: isStr(o.color) && /^#[0-9a-fA-F]{6}$/.test(o.color) ? o.color : '#FF6B6B',
  };
}

function handle(ws: Sock, msg: ClientMsg) {
  if (msg.t === 'ping') return send(ws, { t: 'pong', now: Date.now() });

  if (msg.t === 'hello') {
    const player = cleanPlayer(msg.player);
    if (!player) return send(ws, { t: 'error', message: 'بيانات اللاعب غير صالحة' });
    ws.data.player = player;
    send(ws, { t: 'welcome', now: Date.now() });
    return;
  }

  const player = ws.data.player;
  if (!player) return send(ws, { t: 'error', message: 'أعد الاتصال من فضلك' });
  const room = ws.data.code ? rooms.get(ws.data.code) : undefined;

  switch (msg.t) {
    case 'create': {
      if (!GAME_IDS.includes(msg.game)) return;
      if (room) room.leave(player.id);
      const code = newCode();
      const r = new Room(code, player, msg.game);
      rooms.set(code, r);
      r.join(player, ws);
      console.log(`room ${code} created by ${player.name} (${msg.game})`);
      return;
    }
    case 'join': {
      const code = isStr(msg.code) ? msg.code.trim() : '';
      const target = rooms.get(code);
      if (!target) {
        return send(ws, { t: 'error', code: 'no_room', message: 'لم نجد هذه الغرفة تأكد من الرمز' });
      }
      if (room && room !== target) room.leave(player.id);
      target.join(player, ws);
      return;
    }
    case 'leave': {
      if (room) room.leave(player.id);
      else send(ws, { t: 'left' });
      return;
    }
    case 'room': {
      if (!room) return send(ws, { t: 'error', code: 'no_room', message: 'لست في غرفة' });
      room.roomAction(player.id, msg.action);
      return;
    }
    case 'act': {
      if (!room) return send(ws, { t: 'error', code: 'no_room', message: 'لست في غرفة' });
      room.gameAction(player.id, msg.action);
      return;
    }
  }
}

const server = Bun.serve({
  port: PORT,
  hostname: '0.0.0.0',
  fetch(req, srv) {
    const url = new URL(req.url);
    if (url.pathname === '/ws') {
      const ok = srv.upgrade(req, { data: { player: null, code: null } satisfies SockData });
      return ok ? undefined : new Response('upgrade failed', { status: 400 });
    }
    if (url.pathname === '/health') {
      return Response.json({ ok: true, rooms: rooms.size });
    }
    return new Response('Family Games server is running');
  },
  websocket: {
    data: {} as SockData,
    idleTimeout: 60,
    message(ws, raw) {
      let msg: ClientMsg;
      try {
        msg = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw));
      } catch {
        return;
      }
      try {
        handle(ws, msg);
      } catch (e) {
        if (e instanceof GameError) send(ws, { t: 'error', message: e.message });
        else {
          console.error(e);
          send(ws, { t: 'error', message: 'حدث خطأ غير متوقع' });
        }
      }
    },
    close(ws) {
      const { player, code } = ws.data;
      if (player && code) rooms.get(code)?.disconnect(player.id, ws);
    },
  },
});

// timers (round clocks, the hot potato fuse...) + cleanup
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    try {
      room.tick();
    } catch (e) {
      console.error(e);
    }
    const idle = now - room.lastActivity;
    if (idle > ROOM_TTL_MS || (room.isEmpty() && idle > EMPTY_ROOM_TTL_MS)) {
      rooms.delete(code);
      console.log(`room ${code} closed`);
    }
  }
}, 200);

const ips = Object.values(networkInterfaces())
  .flat()
  .filter((i) => i && i.family === 'IPv4' && !i.internal)
  .map((i) => i!.address);

console.log(`\n Family Games server ready on port ${server.port}`);
for (const ip of ips) console.log(`   phones connect to: ws://${ip}:${server.port}/ws`);
console.log('');
