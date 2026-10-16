import { client } from '@/lib/client';
import type { PlayerPublic, RoomView } from '@/shared/protocol';
import { C } from '@/theme';

const UNKNOWN: PlayerPublic = { id: '?', name: '؟', avatar: 'owl', color: '#7D7AA6', connected: false };

export function helpers(room: RoomView) {
  const me = room.me;
  const isHost = room.hostId === me;
  const byId = new Map(room.players.map((p) => [p.id, p]));
  const player = (id: string | null | undefined): PlayerPublic =>
    (id && byId.get(id)) || { ...UNKNOWN, id: id ?? '?' };
  const act = (type: string, payload: Record<string, unknown> = {}) => client.act({ type, ...payload });
  return { me, isHost, player, act, players: room.players };
}

export type Helpers = ReturnType<typeof helpers>;

export const TEAM = [
  { name: 'الفريق الأحمر', color: C.red },
  { name: 'الفريق الأزرق', color: C.blue },
] as const;
