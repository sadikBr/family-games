import type { FxKind, GameAction, GameId, GameView } from '../src/shared/protocol';

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
}

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
}

/** Thrown from game logic to send an Arabic error to the acting player. */
export class GameError extends Error {}
