/**
 * «خمّن من؟» — the 24 family characters and what each one looks like. This table is the single source of
 * truth: the server answers every question from it, and the art pipeline (tools/art/guesswho.mjs) draws
 * each portrait from the very same attributes, so a picture can never disagree with an answer.
 *
 * Two parts:
 * - ROWS: everything a question can ask about (age, hair, glasses, beard, mouth…). The pictures draw these
 *   big and plain: glasses with thick frames, a smile with an open mouth or a clear upturned curve, a
 *   hijab or a turban that hides all the hair.
 * - LOOKS: what makes each face itself without changing any answer (face shape, eyes, brows, nose, little
 *   extras, the background colour).
 *
 * Kept free of imports and of non-erasable TypeScript (no enums), so the art pipeline (plain Node) can
 * import it directly.
 */

export type GwAge = 'child' | 'adult' | 'elder';
/** The hair colour you can SEE: 'hidden' under a hijab or a turban. */
export type GwHair = 'black' | 'brown' | 'blond' | 'white' | 'hidden';
/**
 * How the visible hair is drawn. Long (the «شعر طويل» question) = it falls below the ears to the shoulders:
 * 'long', 'wavy', 'braids', 'ponytail'. Short: 'short', 'spiky', 'curly' (short curls), 'bald'.
 */
export type GwHairStyle = 'short' | 'spiky' | 'curly' | 'long' | 'wavy' | 'braids' | 'ponytail' | 'bald' | 'none';
/** 'cap' (a peaked cap) and 'beanie' (a knitted «طاقية») are the clothes' colour; a fez is always red; a turban white. */
export type GwHat = 'none' | 'cap' | 'beanie' | 'fez' | 'turban';
export type GwGlasses = 'none' | 'round' | 'square' | 'cat' | 'half';
export type GwBeard = 'none' | 'full' | 'short' | 'long';
/** Smiling mouths: a grin (teeth), a grin with a missing tooth, a laugh (wide open), a gentle closed smile. */
export type GwMouth = 'grin' | 'gap' | 'laugh' | 'gentle' | 'calm' | 'surprised' | 'serious' | 'hmm';
export type GwEyes = 'brown' | 'blue';
export type GwOutfit = 'jellaba' | 'kaftan' | 'shirt' | 'tshirt' | 'sweater' | 'dress' | 'vest' | 'cardigan';
export type GwColor = 'red' | 'blue' | 'green' | 'yellow' | 'white' | 'brown' | 'purple';

export const GW_SMILING: readonly GwMouth[] = ['grin', 'gap', 'laugh', 'gentle'];

/** The drawing only: none of this changes an answer. */
export interface GwLook {
  face: 'round' | 'oval' | 'long' | 'square' | 'heart';
  eyeShape: 'round' | 'almond' | 'small' | 'kind' | 'wide';
  brows: 'thick' | 'thin' | 'arched' | 'raised' | 'flat' | 'bushy';
  nose: 'button' | 'small' | 'long' | 'wide' | 'round';
  /**
   * freckles, dimples, mole, bandaid, bow (a hair bow), headband, bowtie, receding (hairline), onebraid,
   * dots / trim / pin (the hijab's pattern), cream (a cream under-scarf), wrinkles is implied by 'elder'
   */
  extras: string[];
  /** a soft background colour, to tell the tiles apart */
  bg: string;
  /** an accent colour for the extras (a bow, a headband, a bow tie, a glasses frame) */
  accent?: string;
}

export interface GwChar {
  id: string;
  name: string;
  female: boolean;
  age: GwAge;
  hair: GwHair;
  style: GwHairStyle;
  hijab: boolean;
  hat: GwHat;
  glasses: boolean;
  glassesStyle: GwGlasses;
  beard: boolean;
  beardStyle: GwBeard;
  moustache: boolean;
  mouth: GwMouth;
  /** a smiling mouth (grin, laugh or a gentle closed smile); the others don't smile (calm, surprised…) */
  smile: boolean;
  earrings: boolean;
  eyes: GwEyes;
  outfit: GwOutfit;
  /** the colour of the clothes (a hijab, a cap or a beanie is the same colour family; a fez is always red) */
  color: GwColor;
  /** skin tone, light (0) to dark (3) */
  skin: 0 | 1 | 2 | 3;
  look: GwLook;
}

type Row = [
  id: string,
  name: string,
  female: 0 | 1,
  age: GwAge,
  hair: GwHair,
  style: GwHairStyle,
  hijab: 0 | 1,
  hat: GwHat,
  glasses: GwGlasses,
  beard: GwBeard,
  moustache: 0 | 1,
  mouth: GwMouth,
  earrings: 0 | 1,
  eyes: GwEyes,
  outfit: GwOutfit,
  color: GwColor,
  skin: 0 | 1 | 2 | 3,
];

// prettier-ignore
const ROWS: Row[] = [
  //  id          name        F  age       hair      style       hj hat       glasses   beard    ms mouth        er eyes     outfit      color     skin
  ['youssef',  'يوسف',      0, 'child', 'black',  'short',    0, 'cap',    'none',   'none',  0, 'gap',       0, 'brown', 'tshirt',   'red',    1],
  ['adam',     'آدم',       0, 'child', 'brown',  'short',    0, 'none',   'round',  'none',  0, 'surprised', 0, 'blue',  'sweater',  'green',  0],
  ['ilyas',    'إلياس',     0, 'child', 'brown',  'curly',    0, 'none',   'none',   'none',  0, 'laugh',     0, 'brown', 'jellaba',  'white',  2],
  ['amine',    'أمين',      0, 'adult', 'brown',  'ponytail', 0, 'beanie', 'none',   'none',  0, 'grin',      0, 'brown', 'sweater',  'yellow', 1],
  ['karim',    'كريم',      0, 'adult', 'black',  'short',    0, 'none',   'none',   'full',  1, 'laugh',     0, 'brown', 'shirt',    'blue',   2],
  ['said',     'سعيد',      0, 'adult', 'brown',  'short',    0, 'none',   'square', 'none',  1, 'calm',      0, 'brown', 'vest',     'red',    1],
  ['hamza',    'حمزة',      0, 'adult', 'hidden', 'none',     0, 'turban', 'none',   'short', 0, 'calm',      0, 'brown', 'jellaba',  'green',  3],
  ['mourad',   'مراد',      0, 'adult', 'brown',  'short',    0, 'fez',    'none',   'short', 1, 'serious',   0, 'blue',  'jellaba',  'blue',   0],
  ['omar',     'عمر',       0, 'adult', 'black',  'curly',    0, 'none',   'none',   'short', 1, 'grin',      0, 'brown', 'shirt',    'red',    3],
  ['ali',      'علي',       0, 'elder', 'hidden', 'none',     0, 'turban', 'round',  'long',  1, 'calm',      0, 'brown', 'jellaba',  'brown',  2],
  ['abdallah', 'عبد الله',  0, 'elder', 'white',  'short',    0, 'fez',    'none',   'full',  1, 'laugh',     0, 'brown', 'jellaba',  'yellow', 1],
  ['driss',    'إدريس',     0, 'elder', 'white',  'bald',     0, 'none',   'half',   'none',  1, 'hmm',       0, 'blue',  'cardigan', 'blue',   1],
  ['salma',    'سلمى',      1, 'child', 'black',  'braids',   0, 'none',   'none',   'none',  0, 'grin',      1, 'brown', 'dress',    'red',    2],
  ['maryam',   'مريم',      1, 'child', 'brown',  'long',     0, 'none',   'round',  'none',  0, 'gentle',    1, 'blue',  'dress',    'yellow', 0],
  ['nour',     'نور',       1, 'child', 'blond',  'ponytail', 0, 'none',   'none',   'none',  0, 'surprised', 1, 'blue',  'tshirt',   'blue',   0],
  ['khadija',  'خديجة',     1, 'elder', 'hidden', 'none',     1, 'none',   'round',  'none',  0, 'surprised', 0, 'brown', 'jellaba',  'brown',  1],
  ['fatima',   'فاطمة',     1, 'adult', 'hidden', 'none',     1, 'none',   'none',   'none',  0, 'calm',      0, 'brown', 'jellaba',  'green',  2],
  ['layla',    'ليلى',      1, 'adult', 'black',  'wavy',     0, 'none',   'none',   'none',  0, 'grin',      1, 'brown', 'kaftan',   'red',    1],
  ['sara',     'سارة',      1, 'adult', 'hidden', 'none',     1, 'none',   'cat',    'none',  0, 'calm',      0, 'blue',  'shirt',    'blue',   0],
  ['hind',     'هند',       1, 'adult', 'hidden', 'none',     1, 'none',   'none',   'none',  0, 'laugh',     0, 'brown', 'kaftan',   'purple', 3],
  ['yasmin',   'ياسمين',    1, 'child', 'black',  'curly',    0, 'none',   'none',   'none',  0, 'laugh',     1, 'brown', 'tshirt',   'purple', 3],
  ['zineb',    'زينب',      1, 'elder', 'hidden', 'none',     1, 'none',   'none',   'none',  0, 'laugh',     0, 'brown', 'jellaba',  'yellow', 2],
  ['rkia',     'رقية',      1, 'elder', 'white',  'braids',   0, 'none',   'square', 'none',  0, 'calm',      1, 'blue',  'cardigan', 'blue',   0],
  ['aicha',    'عائشة',     1, 'elder', 'hidden', 'none',     1, 'none',   'none',   'none',  0, 'serious',   0, 'brown', 'jellaba',  'red',    2],
];

// prettier-ignore
const LOOKS: Record<string, GwLook> = {
  youssef:  { face: 'round',  eyeShape: 'round',  brows: 'thick',  nose: 'button', extras: ['bandaid'], bg: '#CDEFD8' },
  adam:     { face: 'oval',   eyeShape: 'round',  brows: 'raised', nose: 'button', extras: ['freckles'], bg: '#FFEDB0' },
  ilyas:    { face: 'round',  eyeShape: 'almond', brows: 'thick',  nose: 'small',  extras: ['dimples'], bg: '#CFE4FA' },
  amine:    { face: 'square', eyeShape: 'almond', brows: 'thick',  nose: 'long',   extras: [], bg: '#E3DAF7' },
  karim:    { face: 'round',  eyeShape: 'kind',   brows: 'thick',  nose: 'wide',   extras: [], bg: '#FFD9C4' },
  said:     { face: 'long',   eyeShape: 'small',  brows: 'flat',   nose: 'long',   extras: ['receding', 'bowtie'], bg: '#D3EEE6', accent: '#2B2F5E' },
  hamza:    { face: 'oval',   eyeShape: 'almond', brows: 'flat',   nose: 'wide',   extras: [], bg: '#F5E2BF' },
  mourad:   { face: 'square', eyeShape: 'almond', brows: 'thick',  nose: 'long',   extras: [], bg: '#FFDCCB' },
  omar:     { face: 'square', eyeShape: 'round',  brows: 'thick',  nose: 'wide',   extras: [], bg: '#CFE6FB' },
  ali:      { face: 'long',   eyeShape: 'kind',   brows: 'bushy',  nose: 'round',  extras: [], bg: '#E4DCF5' },
  abdallah: { face: 'round',  eyeShape: 'kind',   brows: 'bushy',  nose: 'round',  extras: [], bg: '#CDE5F7' },
  driss:    { face: 'oval',   eyeShape: 'round',  brows: 'raised', nose: 'round',  extras: [], bg: '#FFEDB3' },
  salma:    { face: 'round',  eyeShape: 'round',  brows: 'thin',   nose: 'button', extras: ['bow'], bg: '#D2F0DD', accent: '#F2C23D' },
  maryam:   { face: 'heart',  eyeShape: 'round',  brows: 'arched', nose: 'button', extras: ['headband'], bg: '#E6DCF8', accent: '#E8577A' },
  nour:     { face: 'round',  eyeShape: 'wide',   brows: 'raised', nose: 'button', extras: ['freckles'], bg: '#FFDCCF', accent: '#F2C23D' },
  yasmin:   { face: 'round',  eyeShape: 'round',  brows: 'thick',  nose: 'small',  extras: ['bow'], bg: '#FFEDB0', accent: '#F2C23D' },
  fatima:   { face: 'oval',   eyeShape: 'almond', brows: 'arched', nose: 'small',  extras: ['dots'], bg: '#FBDDE3' },
  layla:    { face: 'heart',  eyeShape: 'almond', brows: 'arched', nose: 'small',  extras: ['mole'], bg: '#CDEFE6' },
  sara:     { face: 'long',   eyeShape: 'almond', brows: 'thin',   nose: 'small',  extras: ['pin'], bg: '#FFEDB3', accent: '#2B2F5E' },
  hind:     { face: 'round',  eyeShape: 'round',  brows: 'thick',  nose: 'wide',   extras: ['trim'], bg: '#D2F0DD' },
  khadija:  { face: 'round',  eyeShape: 'kind',   brows: 'raised', nose: 'round',  extras: ['cream'], bg: '#CFE4FA' },
  zineb:    { face: 'round',  eyeShape: 'kind',   brows: 'arched', nose: 'small',  extras: ['dots'], bg: '#E4DCF5' },
  rkia:     { face: 'oval',   eyeShape: 'almond', brows: 'thin',   nose: 'small',  extras: ['onebraid'], bg: '#FFDCCB', accent: '#8E5BCB' },
  aicha:    { face: 'long',   eyeShape: 'small',  brows: 'flat',   nose: 'long',   extras: ['trim'], bg: '#F5E2BF' },
};

export const GW_CHARS: GwChar[] = ROWS.map(([id, name, female, age, hair, style, hijab, hat, glasses, beard, moustache, mouth, earrings, eyes, outfit, color, skin]) => ({
  id,
  name,
  female: !!female,
  age,
  hair,
  style,
  hijab: !!hijab,
  hat,
  glasses: glasses !== 'none',
  glassesStyle: glasses,
  beard: beard !== 'none',
  beardStyle: beard,
  moustache: !!moustache,
  mouth,
  smile: GW_SMILING.includes(mouth),
  earrings: !!earrings,
  eyes,
  outfit,
  color,
  skin,
  look: LOOKS[id],
}));
