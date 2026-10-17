/**
 * «المراحل العشر» — the types shared by the server and the app: settings, the view each phone gets, the
 * default settings, and the game's card on the home screen (title, how-to).
 */
import type { FeedItem } from '../protocol';

export interface Phase10Settings {
  /** short game: only the five even phases (2, 4, 6, 8, 10) */
  short: boolean;
}

/** The four card colours (ours: deliberately not the brand's red/blue/green/yellow). */
export type P10Color = 'orange' | 'purple' | 'teal' | 'pink';
export const P10_COLORS: P10Color[] = ['orange', 'purple', 'teal', 'pink'];

export interface P10Card {
  id: string;
  kind: 'num' | 'wild' | 'skip';
  /** 1..12 for number cards */
  n?: number;
  color?: P10Color;
}

/** set = same number (any colours), run = consecutive numbers (any colours), color = one colour. */
export type P10GroupKind = 'set' | 'run' | 'color';

export interface P10Req {
  kind: P10GroupKind;
  size: number;
}

/** The classic ten phases, by number (index 0 = phase 1). */
export const P10_PHASES: P10Req[][] = [
  [{ kind: 'set', size: 3 }, { kind: 'set', size: 3 }],
  [{ kind: 'set', size: 3 }, { kind: 'run', size: 4 }],
  [{ kind: 'set', size: 4 }, { kind: 'run', size: 4 }],
  [{ kind: 'run', size: 7 }],
  [{ kind: 'run', size: 8 }],
  [{ kind: 'run', size: 9 }],
  [{ kind: 'set', size: 4 }, { kind: 'set', size: 4 }],
  [{ kind: 'color', size: 7 }],
  [{ kind: 'set', size: 5 }, { kind: 'set', size: 2 }],
  [{ kind: 'set', size: 5 }, { kind: 'set', size: 3 }],
];

export const SHORT_PHASES = [2, 4, 6, 8, 10];
export const FULL_PHASES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export const reqLabel = (r: P10Req) =>
  r.kind === 'set' ? `مجموعة من ${r.size}` : r.kind === 'run' ? `متتالية من ${r.size}` : `${r.size} أوراق من لون واحد`;

/** «مجموعة من 3 + متتالية من 4» */
export function phaseLabel(phase: number): string {
  const reqs = P10_PHASES[phase - 1] ?? [];
  if (reqs.length === 2 && reqs[0].kind === reqs[1].kind && reqs[0].size === reqs[1].size) {
    return reqs[0].kind === 'set' ? `مجموعتان من ${reqs[0].size}` : `متتاليتان من ${reqs[0].size}`;
  }
  return reqs.map(reqLabel).join(' + ');
}

export interface P10Group {
  id: number;
  owner: string;
  kind: P10GroupKind;
  cards: P10Card[];
}

export interface P10HandRow {
  id: string;
  cards: P10Card[];
  points: number;
  /** the phase number they were on during this hand */
  phase: number;
  /** completed it (they move on) */
  done: boolean;
}

export interface Phase10View {
  game: 'phase10';
  phase: 'play' | 'handEnd' | 'final';
  participants: string[];
  /** still in the game (people who left are dropped) */
  active: string[];
  turn: string;
  step: 'draw' | 'play';
  hand: number;
  /** the phase numbers of this game, in order (1..10, or 2,4,6,8,10) */
  phases: number[];
  myHand: P10Card[];
  counts: Record<string, number>;
  /** index into `phases` each player is working on (= phases.length when they finished them all) */
  progress: Record<string, number>;
  /** laid their phase down this hand */
  laid: string[];
  groups: P10Group[];
  /** players who lose their next turn */
  skipped: string[];
  discardTop: P10Card | null;
  stockLeft: number;
  scores: Record<string, number>;
  feed: FeedItem[];
  handWinner: string | null;
  handSummary: P10HandRow[] | null;
  winner: string | null;
  /** when the next hand starts by itself (server time) */
  nextAt: number | null;
  /** id of the last skip played (for a one-shot call-out) */
  skipEvent: { id: number; by: string; target: string } | null;
}

/** pause between hands before the next one deals itself (the host can deal sooner) */
export const P10_HAND_END_MS = 30_000;

export const PHASE10_DEFAULTS: Phase10Settings = { short: false };

export const PHASE10_INFO = {
  title: 'المراحل العشر',
  tagline: 'عشر مراحل من المجموعات والمتتاليات… من يكملها أولاً؟',
  color: '#E2475F',
  maxPlayers: 6,
  howTo: [
    'من 2 إلى 6 لاعبين، 10 أوراق لكل لاعب. الأوراق: أرقام من 1 إلى 12 بأربعة ألوان (لكل لون شكل: مثلث، معيّن، دائرة، مربع)، و8 «جوكر» و4 «تخطَّ».',
    'في دورك: اسحب ورقة من الكومة أو الورقة المكشوفة، ثم ضع مرحلتك إن استطعت، ثم ارمِ ورقة.',
    'مجموعة = أوراق لها الرقم نفسه (أي لون). متتالية = أرقام متتابعة (أي لون). لون واحد = أوراق من اللون نفسه. يمكن أن تكون أطول من المطلوب.',
    '«جوكر» يعوّض أي رقم أو لون، لكن لا يجوز أن تتكوّن مجموعة من الجوكر وحده. رمي «تخطَّ» يجعل لاعباً تختاره يفقد دوره القادم، ولا تُسحب من المرمية.',
    'بعد وضع مرحلتك فقط، يمكنك إضافة أوراق إلى أي مجموعة على الطاولة (لك أو لغيرك) لتتخلّص من أوراقك.',
    'تنتهي اليد عندما يُنهي لاعب أوراقه. من أكمل مرحلته ينتقل إلى التالية، والباقون يعيدون المرحلة نفسها.',
    'نقاط الأوراق الباقية في اليد: 1–9 = 5، 10–12 = 10، تخطَّ = 15، جوكر = 25.',
    'أول من يُكمل المرحلة الأخيرة يفوز. إذا أكملها أكثر من لاعب في اليد نفسها، يفوز صاحب أقل نقاط.',
    'المراحل: 1) مجموعتان من 3 · 2) مجموعة من 3 + متتالية من 4 · 3) مجموعة من 4 + متتالية من 4 · 4) متتالية من 7 · 5) متتالية من 8 · 6) متتالية من 9 · 7) مجموعتان من 4 · 8) 7 أوراق من لون واحد · 9) مجموعة من 5 + مجموعة من 2 · 10) مجموعة من 5 + مجموعة من 3.',
    'اللعبة القصيرة: المراحل الزوجية فقط (2، 4، 6، 8، 10) — خمس مراحل بدل عشر.',
  ],
};
