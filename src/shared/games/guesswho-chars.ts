/**
 * «خمّن من؟» — the 24 family characters and what each one looks like. This table is the single source of
 * truth: the server answers every question from it, and the art pipeline (tools/art/guesswho.mjs) draws
 * each portrait from the very same attributes, so a picture can never disagree with an answer.
 *
 * Kept free of imports and of non-erasable TypeScript (no enums), so the art pipeline (plain Node) can
 * import it directly.
 */

export type GwAge = 'child' | 'adult' | 'elder';
/** The hair colour you can SEE: 'hidden' under a hijab or a turban. */
export type GwHair = 'black' | 'brown' | 'blond' | 'white' | 'hidden';
/** How the visible hair is drawn: long = falls below the ears to the shoulders. */
export type GwHairStyle = 'short' | 'curly' | 'long' | 'braids' | 'bald' | 'none';
export type GwHat = 'none' | 'cap' | 'fez' | 'turban';
export type GwEyes = 'brown' | 'blue';
export type GwOutfit = 'jellaba' | 'shirt' | 'tshirt' | 'dress' | 'kaftan' | 'vest' | 'cardigan';
export type GwColor = 'red' | 'blue' | 'green' | 'yellow' | 'white' | 'brown' | 'purple';

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
  beard: boolean;
  moustache: boolean;
  /** a wide open smile (the others have a calm, closed mouth) */
  smile: boolean;
  earrings: boolean;
  eyes: GwEyes;
  outfit: GwOutfit;
  /** the colour of the clothes (a hijab or a cap is the same colour family; a fez is always red) */
  color: GwColor;
  /** skin tone, light (0) to dark (3) */
  skin: 0 | 1 | 2 | 3;
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
  glasses: 0 | 1,
  beard: 0 | 1,
  moustache: 0 | 1,
  smile: 0 | 1,
  earrings: 0 | 1,
  eyes: GwEyes,
  outfit: GwOutfit,
  color: GwColor,
  skin: 0 | 1 | 2 | 3,
];

// prettier-ignore
const ROWS: Row[] = [
  //  id          name        F  age       hair      style     hj hat       gl bd ms sm er eyes     outfit      color     skin
  ['youssef',  'يوسف',      0, 'child', 'black',  'short',  0, 'cap',    0, 0, 0, 1, 0, 'brown', 'tshirt',   'red',    1],
  ['adam',     'آدم',       0, 'child', 'brown',  'short',  0, 'none',   1, 0, 0, 0, 0, 'blue',  'shirt',    'green',  0],
  ['ilyas',    'إلياس',     0, 'child', 'brown',  'curly',  0, 'none',   0, 0, 0, 1, 0, 'blue',  'jellaba',  'white',  1],
  ['amine',    'أمين',      0, 'child', 'black',  'curly',  0, 'cap',    0, 0, 0, 1, 0, 'brown', 'tshirt',   'yellow', 3],
  ['karim',    'كريم',      0, 'adult', 'black',  'short',  0, 'none',   0, 1, 1, 0, 0, 'brown', 'jellaba',  'brown',  2],
  ['said',     'سعيد',      0, 'adult', 'brown',  'short',  0, 'none',   1, 0, 1, 1, 0, 'brown', 'shirt',    'blue',   1],
  ['hamza',    'حمزة',      0, 'adult', 'hidden', 'none',   0, 'turban', 0, 1, 0, 0, 0, 'brown', 'jellaba',  'green',  2],
  ['mourad',   'مراد',      0, 'adult', 'brown',  'short',  0, 'fez',    0, 1, 1, 0, 0, 'blue',  'jellaba',  'blue',   0],
  ['omar',     'عمر',       0, 'adult', 'black',  'long',   0, 'none',   0, 1, 0, 1, 0, 'brown', 'shirt',    'red',    3],
  ['ali',      'علي',       0, 'elder', 'hidden', 'none',   0, 'turban', 1, 1, 1, 0, 0, 'brown', 'jellaba',  'white',  2],
  ['abdallah', 'عبد الله',  0, 'elder', 'white',  'short',  0, 'fez',    0, 1, 1, 1, 0, 'brown', 'jellaba',  'brown',  1],
  ['driss',    'إدريس',     0, 'elder', 'white',  'bald',   0, 'none',   1, 0, 1, 0, 0, 'brown', 'vest',     'blue',   1],
  ['salma',    'سلمى',      1, 'child', 'black',  'braids', 0, 'none',   0, 0, 0, 1, 1, 'brown', 'dress',    'red',    2],
  ['maryam',   'مريم',      1, 'child', 'brown',  'long',   0, 'none',   1, 0, 0, 0, 1, 'blue',  'dress',    'yellow', 0],
  ['nour',     'نور',       1, 'child', 'blond',  'long',   0, 'none',   0, 0, 0, 1, 1, 'blue',  'dress',    'blue',   0],
  ['khadija',  'خديجة',     1, 'adult', 'hidden', 'none',   1, 'none',   1, 0, 0, 1, 0, 'brown', 'jellaba',  'blue',   1],
  ['fatima',   'فاطمة',     1, 'adult', 'hidden', 'none',   1, 'none',   0, 0, 0, 0, 0, 'brown', 'jellaba',  'green',  2],
  ['layla',    'ليلى',      1, 'adult', 'black',  'long',   0, 'none',   0, 0, 0, 1, 1, 'brown', 'kaftan',   'red',    1],
  ['sara',     'سارة',      1, 'adult', 'brown',  'long',   0, 'none',   1, 0, 0, 0, 1, 'blue',  'shirt',    'purple', 0],
  ['hind',     'هند',       1, 'adult', 'hidden', 'none',   1, 'none',   0, 0, 0, 1, 0, 'brown', 'shirt',    'red',    1],
  ['yasmin',   'ياسمين',    1, 'adult', 'hidden', 'none',   1, 'none',   0, 0, 0, 0, 0, 'brown', 'shirt',    'yellow', 3],
  ['zineb',    'زينب',      1, 'elder', 'hidden', 'none',   1, 'none',   0, 0, 0, 1, 0, 'brown', 'jellaba',  'purple', 1],
  ['rkia',     'رقية',      1, 'elder', 'white',  'curly',  0, 'none',   1, 0, 0, 0, 1, 'brown', 'cardigan', 'blue',   1],
  ['aicha',    'عائشة',     1, 'elder', 'hidden', 'none',   1, 'none',   0, 0, 0, 0, 0, 'brown', 'jellaba',  'red',    2],
];

export const GW_CHARS: GwChar[] = ROWS.map(([id, name, female, age, hair, style, hijab, hat, glasses, beard, moustache, smile, earrings, eyes, outfit, color, skin]) => ({
  id,
  name,
  female: !!female,
  age,
  hair,
  style,
  hijab: !!hijab,
  hat,
  glasses: !!glasses,
  beard: !!beard,
  moustache: !!moustache,
  smile: !!smile,
  earrings: !!earrings,
  eyes,
  outfit,
  color,
  skin,
}));
