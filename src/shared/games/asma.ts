/**
 * «أسماء الله الحسنى» — the types shared by the server and the app: settings, the view each phone gets, the
 * default settings, and the game's card on the home screen (title, how-to).
 *
 * Two modes: «طابِق» (a timed race: a Name and four meanings, or a meaning and four Names) and «الذاكرة»
 * (memory pairs: a Name card goes with its meaning card, players take turns).
 */
import type { McqResult } from '../protocol';

export type AsmaMode = 'match' | 'memory';
/** match: what is shown — the Name (pick its meaning), the meaning (pick the Name), or both in turn */
export type AsmaDir = 'name' | 'meaning' | 'mix';

export const ASMA_PAIRS = [6, 8, 10] as const;

export interface AsmaSettings {
  mode: AsmaMode;
  /** match: questions */
  rounds: number;
  /** match: seconds per question */
  seconds: number;
  dir: AsmaDir;
  /** memory: pairs on the table */
  pairs: number;
}

export interface AsmaMatchView {
  game: 'asma';
  mode: 'match';
  phase: 'ask' | 'reveal' | 'final';
  round: number;
  rounds: number;
  /** what the prompt is: a Name (options are meanings) or a meaning (options are Names) */
  shows: 'name' | 'meaning';
  prompt: string;
  options: string[];
  endsAt: number | null;
  answered: string[];
  myAnswer: number | null;
  /** revealed */
  correct: number | null;
  /** revealed: the Name and its meaning */
  answer: { name: string; meaning: string } | null;
  results: McqResult[] | null;
  scores: Record<string, number>;
  seconds: number;
}

export interface AsmaCard {
  kind: 'name' | 'meaning';
  text: string;
}

export interface AsmaMemoryView {
  game: 'asma';
  mode: 'memory';
  phase: 'play' | 'final';
  order: string[];
  turn: string;
  size: number;
  /** face-up cards (matched or just turned), null = face down */
  cards: (AsmaCard | null)[];
  owners: (string | null)[];
  flipped: number[];
  /** two unmatched cards are showing, about to turn back */
  peek: boolean;
  pairs: Record<string, number>;
  /** the last pair found, shown with its full meaning */
  last: { name: string; meaning: string; by: string } | null;
  winner: string[] | null;
}

export type AsmaView = AsmaMatchView | AsmaMemoryView;

export const ASMA_DEFAULTS: AsmaSettings = { mode: 'match', rounds: 10, seconds: 15, dir: 'name', pairs: 8 };

export const ASMA_INFO = {
  title: 'أسماء الله الحسنى',
  tagline: 'طابِق الاسم بمعناه، وتعلّم الأسماء الحسنى.',
  color: '#B5892B',
  maxPlayers: 6,
  howTo: [
    'قال النبي ﷺ: «إنّ لله تسعةً وتسعين اسماً، مئةً إلا واحداً، من أحصاها دخل الجنة» (متفق عليه). والأسماء هنا هي السرد المشهور الذي رواه الترمذي، مع معنى مختصر لكل اسم.',
    'طابِق: يظهر اسم من الأسماء الحسنى وأربعة معانٍ (أو معنى وأربعة أسماء)، وكل لاعب يختار من هاتفه. الإجابة الصحيحة بخمسمئة نقطة، ومعها حتى خمسمئة أخرى حسب السرعة.',
    'الذاكرة: بطاقات مقلوبة، نصفها أسماء ونصفها معانٍ. في دورك اقلب بطاقتين: إذا كان الاسم ومعناه فهما لك وتلعب مرة أخرى، وإلا ينتقل الدور.',
    'يفوز صاحب أكثر النقاط (أو أكثر الأزواج في الذاكرة).',
  ],
};
