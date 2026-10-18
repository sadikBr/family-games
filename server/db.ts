/**
 * The server's only persistent data: groups, their members, and push tokens, in a small SQLite file.
 *
 *   DATA_DIR=/data bun run server      (or a Railway volume: RAILWAY_VOLUME_MOUNT_PATH is set for us)
 *
 * Without either variable the file goes to ./data — fine on a computer, but a redeploy on a host
 * without a volume starts from an empty folder, so groups would be lost (we warn once at start-up).
 */
import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import type { PlayerInfo } from '../src/shared/protocol';

export interface GroupRow {
  id: string;
  code: string;
  name: string;
  createdBy: string;
  createdAt: number;
  /** the last game this group started (a new «لنلعب» room opens on it) */
  lastGame: string | null;
}

export interface MemberRow extends PlayerInfo {
  joinedAt: number;
}

/**
 * Schema versions, applied in order (PRAGMA user_version remembers how far a file got).
 * Never edit a step that shipped: add a new one.
 */
const MIGRATIONS: string[] = [
  // 1: groups, members, push tokens
  `CREATE TABLE groups (
     id TEXT PRIMARY KEY,
     code TEXT UNIQUE NOT NULL,
     name TEXT NOT NULL,
     created_by TEXT NOT NULL,
     created_at INTEGER NOT NULL
   );
   CREATE TABLE members (
     group_id TEXT NOT NULL,
     player_id TEXT NOT NULL,
     name TEXT NOT NULL,
     avatar TEXT NOT NULL,
     color TEXT NOT NULL,
     joined_at INTEGER NOT NULL,
     PRIMARY KEY (group_id, player_id)
   );
   CREATE INDEX members_by_player ON members (player_id);
   CREATE TABLE push_tokens (
     player_id TEXT PRIMARY KEY,
     token TEXT NOT NULL,
     updated_at INTEGER NOT NULL
   );`,
  // 2: remember the group's last game
  `ALTER TABLE groups ADD COLUMN last_game TEXT;`,
];

export function migrate(db: Database, steps = MIGRATIONS) {
  const { user_version: version } = db.query('PRAGMA user_version').get() as { user_version: number };
  for (let v = version; v < steps.length; v++) {
    db.transaction(() => {
      db.run(steps[v]);
      db.run(`PRAGMA user_version = ${v + 1}`);
    })();
  }
}

/** Where the database lives, and whether that place survives a redeploy (an explicit folder or a volume). */
export function dataLocation(env: Record<string, string | undefined> = process.env) {
  const dir = env.DATA_DIR || env.RAILWAY_VOLUME_MOUNT_PATH;
  return { dir: dir || './data', persistent: !!dir };
}

type GroupSql = { id: string; code: string; name: string; created_by: string; created_at: number; last_game: string | null };
type MemberSql = { player_id: string; name: string; avatar: string; color: string; joined_at: number };

const toGroup = (r: GroupSql): GroupRow => ({ id: r.id, code: r.code, name: r.name, createdBy: r.created_by, createdAt: r.created_at, lastGame: r.last_game });
const toMember = (r: MemberSql): MemberRow => ({ id: r.player_id, name: r.name, avatar: r.avatar, color: r.color, joinedAt: r.joined_at });

export class Store {
  constructor(readonly db: Database) {
    db.run('PRAGMA journal_mode = WAL');
    db.run('PRAGMA synchronous = NORMAL');
    db.run('PRAGMA busy_timeout = 2000');
    migrate(db);
  }

  /** Open (or create) the database file in `dir` (default: see dataLocation). */
  static open(dir?: string): Store {
    const where = dataLocation();
    const folder = dir ?? where.dir;
    if (!dir && !where.persistent) {
      console.warn(`⚠ groups are saved in ${join(folder, 'family-games.db')} — set DATA_DIR (or attach a Railway volume) or they will be lost on the next redeploy`);
    }
    mkdirSync(folder, { recursive: true });
    return new Store(new Database(join(folder, 'family-games.db'), { create: true }));
  }

  close() {
    this.db.close();
  }

  /* groups */

  group(id: string): GroupRow | null {
    const r = this.db.query('SELECT * FROM groups WHERE id = ?').get(id) as GroupSql | null;
    return r ? toGroup(r) : null;
  }

  groupByCode(code: string): GroupRow | null {
    const r = this.db.query('SELECT * FROM groups WHERE code = ?').get(code) as GroupSql | null;
    return r ? toGroup(r) : null;
  }

  codeTaken(code: string) {
    return !!this.db.query('SELECT 1 FROM groups WHERE code = ?').get(code);
  }

  /** The player's groups, oldest membership first. */
  groupsOf(playerId: string): GroupRow[] {
    const rows = this.db
      .query('SELECT g.* FROM groups g JOIN members m ON m.group_id = g.id WHERE m.player_id = ? ORDER BY m.joined_at, g.created_at')
      .all(playerId) as GroupSql[];
    return rows.map(toGroup);
  }

  countGroupsOf(playerId: string): number {
    return (this.db.query('SELECT COUNT(*) AS n FROM members WHERE player_id = ?').get(playerId) as { n: number }).n;
  }

  /** A new group with its creator as the first member. */
  createGroup(g: Omit<GroupRow, 'lastGame'>, creator: PlayerInfo) {
    this.db.transaction(() => {
      this.db.query('INSERT INTO groups (id, code, name, created_by, created_at) VALUES (?, ?, ?, ?, ?)').run(g.id, g.code, g.name, g.createdBy, g.createdAt);
      this.addMember(g.id, creator, g.createdAt);
    })();
  }

  rename(id: string, name: string) {
    this.db.query('UPDATE groups SET name = ? WHERE id = ?').run(name, id);
  }

  setCreator(id: string, playerId: string) {
    this.db.query('UPDATE groups SET created_by = ? WHERE id = ?').run(playerId, id);
  }

  setLastGame(id: string, game: string) {
    this.db.query('UPDATE groups SET last_game = ? WHERE id = ?').run(game, id);
  }

  deleteGroup(id: string) {
    this.db.transaction(() => {
      this.db.query('DELETE FROM members WHERE group_id = ?').run(id);
      this.db.query('DELETE FROM groups WHERE id = ?').run(id);
    })();
  }

  /* members */

  members(groupId: string): MemberRow[] {
    return (this.db.query('SELECT * FROM members WHERE group_id = ? ORDER BY joined_at, rowid').all(groupId) as MemberSql[]).map(toMember);
  }

  isMember(groupId: string, playerId: string) {
    return !!this.db.query('SELECT 1 FROM members WHERE group_id = ? AND player_id = ?').get(groupId, playerId);
  }

  countMembers(groupId: string): number {
    return (this.db.query('SELECT COUNT(*) AS n FROM members WHERE group_id = ?').get(groupId) as { n: number }).n;
  }

  addMember(groupId: string, p: PlayerInfo, at: number) {
    this.db
      .query('INSERT OR IGNORE INTO members (group_id, player_id, name, avatar, color, joined_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(groupId, p.id, p.name, p.avatar, p.color, at);
  }

  removeMember(groupId: string, playerId: string) {
    this.db.query('DELETE FROM members WHERE group_id = ? AND player_id = ?').run(groupId, playerId);
  }

  /** The player's name / avatar / colour changed: update every group they are in. Returns true if anything changed. */
  refreshMember(p: PlayerInfo): boolean {
    const res = this.db
      .query('UPDATE members SET name = ?, avatar = ?, color = ? WHERE player_id = ? AND (name != ? OR avatar != ? OR color != ?)')
      .run(p.name, p.avatar, p.color, p.id, p.name, p.avatar, p.color);
    return res.changes > 0;
  }

  /* push tokens */

  /** One token per player, and one player per token (a phone that changed id keeps a single entry). */
  setPushToken(playerId: string, token: string, at: number) {
    this.db.transaction(() => {
      this.db.query('DELETE FROM push_tokens WHERE token = ? AND player_id != ?').run(token, playerId);
      this.db
        .query('INSERT INTO push_tokens (player_id, token, updated_at) VALUES (?, ?, ?) ON CONFLICT (player_id) DO UPDATE SET token = excluded.token, updated_at = excluded.updated_at')
        .run(playerId, token, at);
    })();
  }

  pushToken(playerId: string): string | null {
    const r = this.db.query('SELECT token FROM push_tokens WHERE player_id = ?').get(playerId) as { token: string } | null;
    return r?.token ?? null;
  }

  dropPushToken(token: string) {
    this.db.query('DELETE FROM push_tokens WHERE token = ?').run(token);
  }
}
