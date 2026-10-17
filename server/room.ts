import type { ServerWebSocket } from 'bun';

import {
  BOT_GAMES,
  type QuizCategory,
  type TriviaCategory,
  DEFAULT_SETTINGS,
  GAME_IDS,
  MAX_BOTS,
  MAX_PLAYERS as GAME_MAX_PLAYERS,
  MIN_PLAYERS,
  type AllSettings,
  type Fx,
  type FxKind,
  type GameAction,
  type GameId,
  type PlayerInfo,
  type PlayerPublic,
  type RoomAction,
  type RoomView,
  type ServerMsg,
} from '../src/shared/protocol';
import { HEADSUP_CATEGORIES, IMPOSTER_CATEGORIES } from './content';
import { headsup } from './games/headsup';
import { imposter } from './games/imposter';
import { kanza } from './games/kanza';
import { unoflip } from './games/unoflip';
import { ludo } from './games/ludo';
import { codenames } from './games/codenames';
import { dama } from './games/dama';
import { battleship } from './games/battleship';
import { chess } from './games/chess';
import { connect4 } from './games/connect4';
import { estate } from './games/estate';
import { kdab } from './games/kdab';
import { kharbga } from './games/kharbga';
import { memory } from './games/memory';
import { phase10 } from './games/phase10';
import { scrabble } from './games/scrabble';
import { charades } from './games/charades';
import { spy } from './games/spy';
import { survey } from './games/survey';
import { dots } from './games/dots';
import { mancala } from './games/mancala';
import { life } from './games/life';
import { blocks } from './games/blocks';
import { codebreak } from './games/codebreak';
import { boggle } from './games/boggle';
import { sudoku } from './games/sudoku';
import { trivia } from './games/trivia';
import { wave } from './games/wave';
import { wordle } from './games/wordle';
import { xo } from './games/xo';
import { hajj } from './games/hajj';
import { huroof } from './games/huroof';
import { ladders } from './games/ladders';
import { quiz } from './games/quiz';
import { surah } from './games/surah';
import { whois } from './games/whois';
import { draw } from './games/draw';
import { konkan } from './games/konkan';
import { names } from './games/names';
import { potato } from './games/potato';
import { ronda } from './games/ronda';
import { taboo } from './games/taboo';
import { tris } from './games/tris';
import { werewolf } from './games/werewolf';
import { GameError, type GameCtx, type GameModule } from './types';
import { clamp, isNum, isStr } from './util';

export interface SockData {
  player: PlayerInfo | null;
  code: string | null;
}
export type Sock = ServerWebSocket<SockData>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyModule = GameModule<any, any>;

const MODULES: Record<GameId, AnyModule> = {
  imposter,
  names,
  headsup,
  taboo,
  potato,
  werewolf,
  ronda,
  kanza,
  tris,
  konkan,
  unoflip,
  ludo,
  codenames,
  dama,
  estate,
  draw,
  huroof,
  quiz,
  whois,
  surah,
  hajj,
  ladders,
  connect4,
  chess,
  kdab,
  wave,
  wordle,
  kharbga,
  battleship,
  xo,
  sudoku,
  trivia,
  memory,
  phase10,
  scrabble,
  charades,
  spy,
  survey,
  dots,
  mancala,
  life,
  blocks,
  codebreak,
  boggle,
};
const MAX_PLAYERS = 20;
/** A person offline this long on a bot-capable game gets a bot playing for them until they're back. */
const AUTOPILOT_MS = Number(process.env.AUTOPILOT_MS ?? 20_000);
/** A host offline this long hands the room to a connected player. */
const HOST_HANDOVER_MS = Number(process.env.HOST_HANDOVER_MS ?? 15_000);
/** Card games where a seat can't disappear mid-hand: someone who leaves is replaced by a bot. */
const KEEP_SEATS: GameId[] = ['ronda', 'kanza', 'tris'];
/** Tests set BOT_SPEED=0.05 to make bots play 20× faster. */
const BOT_SPEED = Number(process.env.BOT_SPEED ?? 1) || 1;

const BOT_PERSONAS = [
  { name: 'روبو', avatar: 'robot', color: '#22B8B0' },
  { name: 'بيبو', avatar: 'robot', color: '#7B61D9' },
  { name: 'زازا', avatar: 'robot', color: '#F08A3E' },
  { name: 'تيتو', avatar: 'robot', color: '#4F5BD5' },
  { name: 'لولو', avatar: 'robot', color: '#E86FA6' },
  { name: 'بومبا', avatar: 'robot', color: '#C98A14' },
  { name: 'نونو', avatar: 'robot', color: '#2FB67C' },
  { name: 'فوفو', avatar: 'robot', color: '#3D9BE9' },
];

const categoriesInfo = {
  imposter: IMPOSTER_CATEGORIES.map(({ key, label, emoji }) => ({ key, label, emoji })),
  headsup: HEADSUP_CATEGORIES.map(({ key, label, emoji }) => ({ key, label, emoji })),
};

export function send(ws: Sock, msg: ServerMsg) {
  try {
    ws.send(JSON.stringify(msg));
  } catch {
    // socket already closed
  }
}

interface BotJob {
  at: number;
  botId: string;
  action: GameAction;
  seq: number;
  key: string;
}

export class Room {
  hostId: string;
  game: GameId;
  status: 'lobby' | 'playing' = 'lobby';
  players: PlayerPublic[] = [];
  sockets = new Map<string, Sock>();
  /** voice chat: who joined, and whether they're muted */
  private voice = new Map<string, { muted: boolean }>();
  settings: AllSettings = structuredClone(DEFAULT_SETTINGS);
  state: unknown = null;
  memo = new Map<string, unknown>();
  fx: Fx | null = null;
  private fxCounter = 0;
  private gameSeq = 0;
  private botJobs: BotJob[] = [];
  private botKeys = new Set<string>();
  private botCounter = 0;
  /** when each person went offline (removed when they come back) */
  private offlineSince = new Map<string, number>();
  /** people a bot is currently playing for (see AUTOPILOT_MS) */
  private autopilot = new Set<string>();
  /** players the host removed: they can't come back into this room */
  private kicked = new Set<string>();
  /** who took part when the current game started */
  private seated: string[] = [];
  lastActivity = Date.now();

  constructor(
    public readonly code: string,
    host: PlayerInfo,
    game: GameId,
  ) {
    this.hostId = host.id;
    this.game = game;
  }

  get module(): AnyModule {
    return MODULES[this.game];
  }

  private ctx(): GameCtx {
    const now = Date.now();
    return {
      now,
      fx: (kind: FxKind, target?: string) => {
        this.fx = { id: ++this.fxCounter, kind, target };
      },
      isConnected: (id) => this.players.some((p) => p.id === id && p.connected),
      isBot: (id) => this.autopilot.has(id) || this.players.some((p) => p.id === id && p.bot),
      playerName: (id) => this.players.find((p) => p.id === id)?.name ?? '؟',
      memo: this.memo,
      bot: (botId, key, delayMs, action) => {
        const k = `${this.gameSeq}|${botId}|${key}`;
        if (this.botKeys.has(k)) return;
        this.botKeys.add(k);
        this.botJobs.push({ at: now + delayMs * BOT_SPEED, botId, action, seq: this.gameSeq, key: k });
      },
    };
  }

  private humans() {
    return this.players.filter((p) => !p.bot);
  }

  isEmpty() {
    return this.humans().every((p) => !p.connected);
  }

  join(info: PlayerInfo, ws: Sock) {
    if (this.kicked.has(info.id)) throw new GameError('أخرجك المضيف من هذه الغرفة');
    const existing = this.players.find((p) => p.id === info.id);
    if (!existing && this.players.length >= MAX_PLAYERS) {
      throw new GameError('الغرفة ممتلئة');
    }
    const old = this.sockets.get(info.id);
    if (old && old !== ws) {
      old.data.code = null;
      try {
        old.close(4000, 'replaced');
      } catch {}
    }
    if (existing) {
      // a person coming back takes their seat over from the bot that played for them
      Object.assign(existing, info, { connected: true, bot: false });
      this.offlineSince.delete(info.id);
      if (this.autopilot.delete(info.id)) this.cancelBotJobs(info.id);
    } else {
      this.players.push({ ...info, connected: true });
      this.fx = { id: ++this.fxCounter, kind: 'join', target: info.id };
    }
    this.sockets.set(info.id, ws);
    ws.data.code = this.code;
    this.touch();
    this.broadcast();
  }

  /* ---------------------------------------------------------------- */
  /* Voice chat: the server only keeps the list and passes the WebRTC   */
  /* set-up messages between phones; the sound goes phone to phone.     */
  /* ---------------------------------------------------------------- */

  voiceAction(id: string, a: 'join' | 'leave' | 'mute', muted?: boolean) {
    if (!this.sockets.has(id)) return;
    if (a === 'join') this.voice.set(id, { muted: !!muted });
    else if (a === 'leave') this.voice.delete(id);
    else {
      const v = this.voice.get(id);
      if (!v) return;
      v.muted = !!muted;
    }
    this.broadcast();
  }

  /** Pass a WebRTC message to another phone, only between two members of this room's voice chat. */
  relaySignal(from: string, to: string, data: unknown) {
    if (!this.voice.has(from) || !this.voice.has(to) || from === to) return;
    const ws = this.sockets.get(to);
    if (!ws) return;
    send(ws, { t: 'signal', from, data: data as never });
  }

  disconnect(id: string, ws: Sock) {
    if (this.sockets.get(id) !== ws) return; // an older socket closed
    this.sockets.delete(id);
    this.voice.delete(id); // they rejoin voice themselves when they reconnect
    const p = this.players.find((x) => x.id === id);
    if (p) p.connected = false;
    if (p && !p.bot) this.offlineSince.set(id, Date.now());
    this.broadcast();
  }

  private isSeated(id: string) {
    return this.seated.includes(id);
  }

  /** Forget the bot moves planned for someone (they're back, or gone). */
  private cancelBotJobs(id: string) {
    this.botJobs = this.botJobs.filter((j) => j.botId !== id);
    for (const k of [...this.botKeys]) if (k.startsWith(`${this.gameSeq}|${id}|`)) this.botKeys.delete(k);
  }

  /**
   * Housekeeping, a few times a second: hand the room to a connected player when the host has been
   * offline for a while, and let a bot play for people who have been offline on a bot-capable game.
   * Returns true if anything changed.
   */
  private maintain(now: number): boolean {
    let changed = false;
    const host = this.players.find((p) => p.id === this.hostId);
    const hostAway = !host || (!host.connected && now - (this.offlineSince.get(this.hostId) ?? now) >= HOST_HANDOVER_MS);
    if (hostAway) {
      const next = this.humans().find((p) => p.connected && p.id !== this.hostId);
      if (next) {
        this.hostId = next.id;
        changed = true;
      }
    }
    const want = new Set<string>();
    if (this.status === 'playing' && BOT_GAMES.includes(this.game)) {
      for (const [id, since] of this.offlineSince) if (now - since >= AUTOPILOT_MS && this.players.some((p) => p.id === id)) want.add(id);
    }
    if (want.size !== this.autopilot.size || [...want].some((id) => !this.autopilot.has(id))) {
      this.autopilot = want;
      changed = true;
    }
    return changed;
  }

  leave(id: string, kicked = false) {
    const ws = this.sockets.get(id);
    if (ws) {
      ws.data.code = null;
      send(ws, { t: 'left', kicked });
    }
    this.sockets.delete(id);
    this.offlineSince.delete(id);
    this.autopilot.delete(id);
    this.voice.delete(id);
    const p = this.players.find((x) => x.id === id);
    if (p && !p.bot && this.status === 'playing' && this.state && KEEP_SEATS.includes(this.game) && this.isSeated(id)) {
      // the hand can't lose a seat: a bot takes it over for the rest of the game
      p.bot = true;
      p.connected = true;
      p.name = `${p.name} 🤖`;
      if (this.hostId === id) this.passHost();
      this.afterChange();
      return;
    }
    this.players = this.players.filter((p) => p.id !== id);
    if (this.status === 'playing' && this.state) {
      this.module.onLeave?.(this.ctx(), this.state, id);
    }
    if (this.hostId === id) this.passHost();
    this.afterChange();
  }

  private passHost() {
    const humans = this.humans().filter((p) => p.id !== this.hostId);
    const next = humans.find((p) => p.connected) ?? humans[0];
    if (next) this.hostId = next.id;
  }

  touch() {
    this.lastActivity = Date.now();
  }

  private addBot() {
    const bots = this.players.filter((p) => p.bot);
    if (bots.length >= MAX_BOTS) throw new GameError('وصلتم للحد الأقصى من البوتات');
    if (this.players.length >= MAX_PLAYERS) throw new GameError('الغرفة ممتلئة');
    const used = new Set(bots.map((b) => b.name));
    const persona = BOT_PERSONAS.find((p) => !used.has(p.name)) ?? BOT_PERSONAS[0];
    this.botCounter += 1;
    const bot: PlayerPublic = {
      id: `bot-${this.code}-${this.botCounter}`,
      ...persona,
      connected: true,
      bot: true,
    };
    this.players.push(bot);
    this.fx = { id: ++this.fxCounter, kind: 'join', target: bot.id };
  }

  roomAction(by: string, a: RoomAction) {
    this.touch();
    const isHost = by === this.hostId;
    switch (a.type) {
      case 'game': {
        if (!isHost || this.status !== 'lobby' || !GAME_IDS.includes(a.game)) return;
        this.game = a.game;
        break;
      }
      case 'settings': {
        if (!isHost || this.status !== 'lobby' || !GAME_IDS.includes(a.game)) return;
        this.patchSettings(a.game, a.patch ?? {});
        break;
      }
      case 'addBot': {
        if (!isHost || this.status !== 'lobby') return;
        this.addBot();
        break;
      }
      case 'start': {
        if (!isHost) return;
        const botsAllowed = BOT_GAMES.includes(this.game);
        const participants = this.players
          .filter((p) => p.connected && (botsAllowed || !p.bot))
          .map((p) => p.id);
        const min = MIN_PLAYERS[this.game];
        if (participants.length < min) {
          const hint = botsAllowed ? ' — أو أضيفوا بوتات' : '';
          throw new GameError(`هذه اللعبة تحتاج ${min} لاعبين على الأقل${hint}`);
        }
        const max = GAME_MAX_PLAYERS[this.game];
        if (max && participants.length > max) {
          throw new GameError(`هذه اللعبة لـ ${max} لاعبين كحد أقصى — أخرجوا بعض البوتات أو اللاعبين`);
        }
        const settings = structuredClone(this.settings[this.game]);
        if (this.game === 'werewolf') {
          const ww = settings as AllSettings['werewolf'];
          const narratorOk = ww.narratorId && participants.includes(ww.narratorId) && !this.players.find((p) => p.id === ww.narratorId)?.bot;
          if (!narratorOk) ww.narratorId = this.hostId;
        }
        this.gameSeq += 1;
        this.botJobs = [];
        const ctx = this.ctx();
        this.seated = participants;
        this.state = this.module.start(ctx, participants, settings);
        this.status = 'playing';
        break;
      }
      case 'lobby': {
        if (!isHost) return;
        this.status = 'lobby';
        this.state = null;
        this.botJobs = [];
        break;
      }
      case 'kick': {
        if (!isHost || a.id === by) return;
        const target = this.players.find((p) => p.id === a.id);
        if (target && !target.bot) this.kicked.add(a.id);
        this.leave(a.id, true);
        return;
      }
      default:
        return;
    }
    this.afterChange();
  }

  gameAction(by: string, a: GameAction) {
    if (this.status !== 'playing' || !this.state || !isStr(a?.type)) return;
    this.touch();
    if (this.module.hostOnly?.includes(a.type) && by !== this.hostId) {
      throw new GameError('هذا الزر للمضيف فقط');
    }
    this.module.act(this.ctx(), this.state, by, a);
    this.afterChange();
  }

  tick() {
    const housekeeping = this.maintain(Date.now());
    if (this.status !== 'playing' || !this.state) {
      if (housekeeping) this.broadcast();
      return;
    }
    let changed = housekeeping;
    if (this.module.tick && this.module.tick(this.ctx(), this.state)) changed = true;

    // run due bot actions
    const now = Date.now();
    const due = this.botJobs.filter((j) => j.at <= now);
    if (due.length) {
      this.botJobs = this.botJobs.filter((j) => j.at > now);
      for (const job of due) {
        if (job.seq !== this.gameSeq || !this.state) continue;
        if (!this.players.some((p) => p.id === job.botId)) continue;
        try {
          this.module.act(this.ctx(), this.state, job.botId, job.action);
          changed = true;
        } catch (e) {
          if (!(e instanceof GameError)) console.error('bot error', e);
          // refused (e.g. too early): let the bot think again on the next plan
          this.botKeys.delete(job.key);
          changed = true;
        }
      }
    }
    if (changed) this.afterChange();
  }

  /** Let bots react, then send everyone the new state. */
  private afterChange() {
    if (this.status === 'playing' && this.state && this.module.botPlan) {
      const bots = this.players.filter((p) => p.bot || this.autopilot.has(p.id)).map((p) => p.id);
      if (bots.length) {
        try {
          this.module.botPlan(this.ctx(), this.state, bots);
        } catch (e) {
          console.error('botPlan error', e);
        }
      }
    }
    this.broadcast();
  }

  private patchSettings(game: GameId, patch: Record<string, unknown>) {
    const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
    const int = (v: unknown, d: number, min: number, max: number) =>
      isNum(v) ? clamp(Math.round(v), min, max) : d;
    const cat = (v: unknown, d: string, keys: string[]) =>
      isStr(v) && (v === 'random' || keys.includes(v)) ? v : d;
    // newer games validate their own settings
    const own = MODULES[game].patchSettings;
    if (own) {
      own(this.settings[game], patch);
      return;
    }
    switch (game) {
      case 'imposter': {
        const s = this.settings.imposter;
        s.category = cat(patch.category, s.category, IMPOSTER_CATEGORIES.map((c) => c.key));
        s.imposters = int(patch.imposters, s.imposters, 0, 3);
        s.hintForImposter = bool(patch.hintForImposter, s.hintForImposter);
        s.rounds = int(patch.rounds, s.rounds ?? 5, 1, 15);
        break;
      }
      case 'names': {
        const s = this.settings.names;
        s.rounds = int(patch.rounds, s.rounds, 1, 15);
        s.seconds = int(patch.seconds, s.seconds, 30, 240);
        s.stop = bool(patch.stop, s.stop);
        if (patch.dict === 'off' || patch.dict === 'warn' || patch.dict === 'strict') s.dict = patch.dict;
        break;
      }
      case 'headsup': {
        const s = this.settings.headsup;
        s.category = cat(patch.category, s.category, HEADSUP_CATEGORIES.map((c) => c.key));
        s.seconds = int(patch.seconds, s.seconds, 30, 180);
        s.turnsEach = int(patch.turnsEach, s.turnsEach, 1, 3);
        break;
      }
      case 'taboo': {
        const s = this.settings.taboo;
        s.seconds = int(patch.seconds, s.seconds, 30, 180);
        s.turnsEach = int(patch.turnsEach, s.turnsEach, 1, 6);
        break;
      }
      case 'potato': {
        const s = this.settings.potato;
        s.rounds = int(patch.rounds, s.rounds, 1, 15);
        s.minFuse = int(patch.minFuse, s.minFuse, 5, 60);
        s.maxFuse = int(patch.maxFuse, s.maxFuse, 10, 120);
        if (s.maxFuse < s.minFuse) s.maxFuse = s.minFuse;
        break;
      }
      case 'ronda':
        this.settings.ronda.target = int(patch.target, this.settings.ronda.target, 11, 101);
        break;
      case 'kanza':
        this.settings.kanza.hands = int(patch.hands, this.settings.kanza.hands, 1, 10);
        break;
      case 'tris':
        this.settings.tris.target = int(patch.target, this.settings.tris.target, 11, 61);
        break;
      case 'konkan':
        this.settings.konkan.limit = int(patch.limit, this.settings.konkan.limit, 30, 300);
        break;
      case 'unoflip':
        this.settings.unoflip.target = int(patch.target, this.settings.unoflip.target, 50, 500);
        break;
      case 'ludo':
        this.settings.ludo.exitOnOne = bool(patch.exitOnOne, this.settings.ludo.exitOnOne);
        this.settings.ludo.podium = bool(patch.podium, this.settings.ludo.podium ?? false);
        this.settings.ludo.quick = bool(patch.quick, this.settings.ludo.quick ?? false);
        break;
      case 'codenames':
        this.settings.codenames.assassin = bool(patch.assassin, this.settings.codenames.assassin);
        break;
      case 'dama':
        this.settings.dama.flyingKings = bool(patch.flyingKings, this.settings.dama.flyingKings);
        this.settings.dama.backCapture = bool(patch.backCapture, this.settings.dama.backCapture);
        this.settings.dama.maxCapture = bool(patch.maxCapture, this.settings.dama.maxCapture);
        break;
      case 'kharbga':
      case 'battleship':
      case 'xo':
        if (patch.level === 1 || patch.level === 2) this.settings[game].level = patch.level;
        break;
      case 'sudoku':
        if (patch.level === 'easy' || patch.level === 'medium' || patch.level === 'hard') this.settings.sudoku.level = patch.level;
        break;
      case 'trivia': {
        const q = this.settings.trivia;
        q.rounds = int(patch.rounds, q.rounds, 5, 30);
        q.seconds = int(patch.seconds, q.seconds, 10, 30);
        q.category = cat(patch.category, q.category, ['all', 'morocco', 'geography', 'science', 'sport', 'animals', 'mixed']) as TriviaCategory;
        break;
      }
      case 'memory':
        if ([8, 10, 12, 15].includes(patch.pairs as number)) this.settings.memory.pairs = patch.pairs as number;
        break;
      case 'connect4':
        if (patch.level === 1 || patch.level === 2) this.settings.connect4.level = patch.level;
        break;
      case 'chess':
        if (patch.level === 1 || patch.level === 2) this.settings.chess.level = patch.level;
        break;
      case 'kdab':
        this.settings.kdab.maxPlay = int(patch.maxPlay, this.settings.kdab.maxPlay, 1, 4);
        break;
      case 'wave':
        this.settings.wave.rounds = int(patch.rounds, this.settings.wave.rounds, 1, 3);
        break;
      case 'wordle':
        this.settings.wordle.rounds = int(patch.rounds, this.settings.wordle.rounds, 1, 10);
        break;
      case 'huroof':
        this.settings.huroof.seconds = int(patch.seconds, this.settings.huroof.seconds, 10, 40);
        break;
      case 'quiz': {
        const q = this.settings.quiz;
        q.rounds = int(patch.rounds, q.rounds, 5, 30);
        q.seconds = int(patch.seconds, q.seconds, 10, 30);
        q.category = cat(patch.category, q.category, ['all', 'quran', 'prophets', 'seerah', 'companions', 'worship', 'history', 'places', 'hajj']) as QuizCategory;
        break;
      }
      case 'whois':
        this.settings.whois.rounds = int(patch.rounds, this.settings.whois.rounds, 4, 20);
        if (typeof patch.typed === 'boolean') this.settings.whois.typed = patch.typed;
        break;
      case 'surah': {
        const q = this.settings.surah;
        q.rounds = int(patch.rounds, q.rounds, 5, 30);
        q.seconds = int(patch.seconds, q.seconds, 10, 40);
        if (patch.level === 'easy' || patch.level === 'medium' || patch.level === 'hard') q.level = patch.level;
        break;
      }
      case 'hajj':
        this.settings.hajj.questions = bool(patch.questions, this.settings.hajj.questions);
        break;
      case 'ladders':
        this.settings.ladders.exact = bool(patch.exact, this.settings.ladders.exact);
        break;
      case 'estate':
        this.settings.estate.startCash = int(patch.startCash, this.settings.estate.startCash, 1000, 3000);
        this.settings.estate.rounds = int(patch.rounds, this.settings.estate.rounds, 0, 60);
        break;
      case 'draw':
        this.settings.draw.rounds = int(patch.rounds, this.settings.draw.rounds, 1, 5);
        this.settings.draw.seconds = int(patch.seconds, this.settings.draw.seconds, 40, 150);
        break;
      case 'werewolf': {
        const s = this.settings.werewolf;
        if ('narratorId' in patch) {
          const v = patch.narratorId;
          s.narratorId = isStr(v) && this.players.some((p) => p.id === v && !p.bot) ? v : null;
        }
        s.wolves = int(patch.wolves, s.wolves, 0, 5);
        s.seer = bool(patch.seer, s.seer);
        s.doctor = bool(patch.doctor, s.doctor);
        s.hunter = bool(patch.hunter, s.hunter);
        s.witch = bool(patch.witch, s.witch);
        s.guard = bool(patch.guard, s.guard);
        s.mayor = bool(patch.mayor, s.mayor);
        s.tanner = bool(patch.tanner, s.tanner);
        s.whitewolf = bool(patch.whitewolf, s.whitewolf);
        s.bigwolf = bool(patch.bigwolf, s.bigwolf);
        break;
      }
    }
  }

  viewFor(me: string): RoomView {
    const ctx = this.ctx();
    return {
      code: this.code,
      hostId: this.hostId,
      me,
      game: this.game,
      status: this.status,
      players: this.players.map((p) => (this.autopilot.has(p.id) ? { ...p, auto: true } : p)),
      settings: this.settings,
      view: this.status === 'playing' && this.state ? this.module.view(ctx, this.state, me) : null,
      fx: this.fx,
      categories: categoriesInfo,
      myTurn: this.status === 'playing' && !!this.state && !!this.module.turnOf?.(this.state).includes(me),
      voice: [...this.voice].map(([id, v]) => ({ id, muted: v.muted })),
    };
  }

  broadcast() {
    const now = Date.now();
    for (const [id, ws] of this.sockets) {
      try {
        send(ws, { t: 'state', room: this.viewFor(id), now });
      } catch (e) {
        console.error('view error', e);
      }
    }
  }
}
