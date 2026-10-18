/**
 * «كلمة واحدة» — the types shared by the server and the app: settings, the view each phone gets, the
 * default settings, and the game's card on the home screen (title, how-to).
 */

export type OnewordLevel = 'easy' | 'medium' | 'hard';

export interface OnewordSettings {
  /** cards in the deck: 13 (official) or 7 (a short game) */
  cards: number;
  /** seconds to write the clues (45–90) */
  seconds: number;
  /** how well the bots guess */
  level: OnewordLevel;
}

export type OnewordPhase = 'clues' | 'check' | 'guess' | 'reveal' | 'final';

/** One clue on the table. `text` is null for a clue-giver who wrote nothing in time. */
export interface OnewordClue {
  by: string;
  text: string | null;
  /** ok: goes to the guesser · dup: the same as another clue (both removed) · struck: crossed out by a player · none: no clue */
  status: 'ok' | 'dup' | 'struck' | 'none';
  /** who crossed it out (status 'struck') */
  struckBy: string | null;
}

export type OnewordResult = 'right' | 'wrong' | 'pass' | 'timeout';

export interface OnewordHistory {
  word: string;
  guesser: string;
  result: OnewordResult;
  guess: string | null;
}

export interface OnewordView {
  game: 'oneword';
  phase: OnewordPhase;
  /** guesser · giver (writes a clue) · watcher (joined during the game) */
  role: 'guesser' | 'giver' | 'watcher';
  guesser: string;
  givers: string[];
  /** the mystery word: never on the guesser's phone before the reveal */
  word: string | null;
  /** my own clue this card (clue-givers) */
  myClue: string | null;
  /** clue-givers who have sent a clue (clue phase) */
  submitted: string[];
  /** the clues: clue-givers from the check phase on, the guesser only the surviving ones while guessing */
  clues: OnewordClue[] | null;
  /** clue-givers who approved the clues (check phase) */
  ready: string[];
  /** the card being played (1-based) and the deck */
  card: number;
  total: number;
  won: number;
  lost: number;
  /** cards still in the deck after this one */
  left: number;
  /** the guess, after the reveal */
  guess: { text: string | null; result: OnewordResult; burned: boolean; refunded: boolean } | null;
  endsAt: number | null;
  timerTotal: number;
  /** changes with every new prompt (resets the input boxes) */
  step: number;
  history: OnewordHistory[];
}

export const ONEWORD_CARDS = [13, 7] as const;
export const ONEWORD_SECONDS = [45, 60, 75, 90] as const;

export const ONEWORD_DEFAULTS: OnewordSettings = { cards: 13, seconds: 60, level: 'medium' };

/**
 * The official rating of the final score, out of 13 (a short game is scaled to 13), in a playful فصحى.
 */
export function onewordRating(won: number, total: number): { title: string; line: string } {
  const s = total === 13 ? won : Math.round((won / Math.max(1, total)) * 13);
  if (s >= 13) return { title: 'علامة كاملة!', line: 'لا خطأ واحد! هل تقدرون على تكرارها؟' };
  if (s === 12) return { title: 'مذهل!', line: 'سيُعجب بكم أصدقاؤكم حتماً.' };
  if (s === 11) return { title: 'رائع!', line: 'نتيجة تستحق الاحتفال بكأس شاي.' };
  if (s >= 9) return { title: 'ليس سيئاً أبداً!', line: 'عقول متقاربة وتلميحات ذكية.' };
  if (s >= 7) return { title: 'في المتوسط', line: 'هل تستطيعون أفضل من ذلك؟' };
  if (s >= 4) return { title: 'بداية طيبة', line: 'جرّبوا مرة أخرى، فالتفاهم يأتي بالتمرين.' };
  return { title: 'جرّبوا من جديد', line: 'ومرة أخرى… ومرة أخرى! الفريق القوي يبدأ هكذا.' };
}

export const ONEWORD_INFO = {
  title: 'كلمة واحدة',
  tagline: 'لعبة تعاونية: تلميح من كلمة واحدة، والتلميحات المتشابهة تُحذف!',
  color: '#2E9C8F',
  maxPlayers: 10,
  howTo: [
    'لعبة تعاونية: كل العائلة فريق واحد أمام رزمة من 13 بطاقة (أو 7 في اللعبة القصيرة).',
    'في كل جولة لاعب واحد يخمّن بالدور، ويرى الآخرون الكلمة السرية على هواتفهم.',
    'كل واحد من الآخرين يكتب سرّاً تلميحاً من كلمة واحدة، لا يكون الكلمة نفسها ولا صيغة منها ولا يحتويها.',
    'تُقارن التلميحات: المتطابقة أو المتشابهة جداً تُحذف كلها! ويمكن لأي واحد منهم شطب تلميح غير صالح قبل أن يراه المخمِّن.',
    'يرى المخمِّن التلميحات الباقية ويكتب تخميناً واحداً أو يتجاوز.',
    'الصواب = بطاقة للفريق. التجاوز = تضيع هذه البطاقة. الخطأ = تضيع هذه البطاقة والتي بعدها (وفي البطاقة الأخيرة تضيع بطاقة من الرابحة).',
    'النتيجة النهائية من 13: 13 علامة كاملة، 12 مذهل، 11 رائع…',
  ],
};
