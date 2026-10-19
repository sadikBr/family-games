import type { BotLevel, FxKind, GameAction, GameId, GameView } from '../src/shared/protocol';

export interface GameCtx {
  now: number;
  fx(kind: FxKind, target?: string): void;
  isConnected(id: string): boolean;
  isBot(id: string): boolean;
  playerName(id: string): string;
  /** Persistent per-room storage that survives between rounds (e.g. decks). */
  memo: Map<string, unknown>;
  /**
   * Schedule an action played by a bot after `delayMs`.
   * `key` de-duplicates: the same bot + key is only ever scheduled once per game.
   */
  bot(botId: string, key: string, delayMs: number, action: GameAction): void;
  /**
   * Tell everyone, in one short فصحى sentence, what just happened («روبو لعب ٧ أوروص وأخذ ورقتين»).
   * Shown under the turn bar on every phone, so a fast move by someone else is never missed.
   * `by` = who made the move (their avatar is shown). Broadcast to all: never put hidden information
   * in it (which card was stolen, someone's role…). Optional so tests' fake contexts can skip it.
   * `voice` = a short call read aloud by phones that turned on «قراءة الأحداث» (see Said.voice): only
   * for the moments worth hearing (a روندا, a bid, a دقة…), never for every card. An empty `text` is a
   * call that is only heard (no line under the turn bar): see voiceOnly in voice-calls-party.ts.
   */
  say?(text: string, by?: string, voice?: string): void;
  /**
   * How strong the bots should play (the room's «البوتات» setting). Optional so tests' fake contexts
   * can skip it: read it through `botLevel(ctx)` below, which defaults to 'expert'.
   */
  botLevel?(): BotLevel;
}

/** The room's bot strength ('expert' when the context doesn't say). */
export const botLevel = (ctx: GameCtx): BotLevel => ctx.botLevel?.() ?? 'expert';

export interface GameModule<S, Settings> {
  id: GameId;
  /** Action types only the room host may send. */
  hostOnly?: readonly string[];
  start(ctx: GameCtx, participants: string[], settings: Settings): S;
  act(ctx: GameCtx, s: S, by: string, a: GameAction): void;
  view(ctx: GameCtx, s: S, me: string): GameView;
  /** Called a few times per second. Return true if the state changed. */
  tick?(ctx: GameCtx, s: S): boolean;
  /** A player left the room for good. */
  onLeave?(ctx: GameCtx, s: S, id: string): void;
  /** Who the game is waiting for right now (their phone gets the your-turn alert). */
  turnOf?(s: S): string[];
  /**
   * Called after every change when bots are seated. Schedule bot actions with
   * ctx.bot(), or change state directly (return true if you did).
   */
  botPlan?(ctx: GameCtx, s: S, bots: string[]): boolean | void;
  /** Lobby settings change for this game: validate and apply the keys it knows (in place). */
  patchSettings?(settings: Settings, patch: Record<string, unknown>): void;
  /**
   * The final standing once the game is over (null while it's still going, or if it ended without
   * a result — e.g. too many players left). Tournaments award points from it.
   */
  result?(s: S): GameResult | null;
}

/**
 * How a finished game ranked its players: `places[0]` = the winner(s), `places[1]` = second, …
 * Players sharing a place (a tie, a team, everyone in a co-op game) are in the same inner array.
 * Every participant should appear exactly once (bots included — the tournament drops them itself);
 * players who left before the end may be omitted. `coop` marks games the family plays together:
 * everyone in places[0], and `won` says whether the family won.
 */
export interface GameResult {
  places: string[][];
  coop?: { won: boolean };
}

/** Thrown from game logic to send an Arabic error to the acting player. */
export class GameError extends Error {}
