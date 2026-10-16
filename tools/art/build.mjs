// Builds every illustration into assets/art as WebP.
//   cd tools/art && npm install && node build.mjs
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { allFaces } from './uno.mjs';

const here = path.dirname(new URL(import.meta.url).pathname);
const tmp = path.join(here, '.out');
const ART = path.join(here, '../../assets/art');
const avatar = { style: 'mascot', px: 512, line: 2.0, ringColor: '#151726', border: 0.9, ring: 0.6, outer: 0.01, shadow: 0 };
const badge = { style: 'mascot', px: 512, line: 2.2, border: 1.4, ring: 3, outer: 1.6 };
const flat = { style: 'mascot', line: 2.2, sticker: false };

const AVATARS = ['boy', 'girl', 'grandma', 'grandpa', 'lion', 'cat', 'fox', 'bear', 'panda', 'rabbit', 'owl', 'frog', 'penguin', 'monkey', 'tiger', 'koala', 'robot'];
const GAMES = ['werewolf', 'imposter', 'potato', 'names', 'headsup', 'taboo', 'ronda', 'kanza', 'tris', 'konkan', 'unoflip', 'ludo', 'dama', 'codenames', 'draw', 'estate'];
const ISLAMIC = ['huroof', 'quiz', 'whois', 'surah', 'hajj', 'ladders'];
const ROLES = ['wolf', 'villager', 'seer', 'doctor', 'hunter'];
const SUITS = ['coins', 'cups', 'swords', 'clubs'];
const RANKS = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];

const groups = {
  avatars: [384, AVATARS.map((n) => ({ name: n, module: 'avatars.mjs', fn: n, ...avatar }))],
  games: [384, [...GAMES.map((n) => ({ name: n, module: 'badges.mjs', fn: n, ...badge })), ...ISLAMIC.map((n) => ({ name: n, module: 'islamic.mjs', fn: n, ...badge }))]],
  roles: [512, ROLES.map((n) => ({ name: n, module: 'roles.mjs', fn: n, ...badge }))],
  cards: [330, [...SUITS.flatMap((s) => RANKS.map((r) => ({ name: `${s}-${r}`, module: 'cards.mjs', fn: 'card', args: [s, r], ...flat, px: 330, off: 3.2 }))), { name: 'back', module: 'cards.mjs', fn: 'back', ...flat, px: 330 }]],
  uno: [300, allFaces().map((f) => ({ name: `${f[0]}-${f[1] ?? 'wild'}-${f[2]}${f[3] ?? ''}`, module: 'uno.mjs', fn: 'face', args: f, ...flat, px: 300, off: 3 }))],
  boards: [0, [
    { name: 'ludo-board', module: 'boards.mjs', fn: 'ludoBoard', px: 1080, style: 'mascot', line: 0.6, sticker: false },
    { name: 'dama-board', module: 'boards.mjs', fn: 'damaBoard', px: 1000, style: 'mascot', line: 1, sticker: false },
    { name: 'ladders-board', module: 'islamic.mjs', fn: 'laddersBoard', px: 1080, style: 'mascot', line: 0.6, sticker: false },
    { name: 'hajj-board', module: 'islamic.mjs', fn: 'hajjBoard', px: 1260, style: 'mascot', line: 0.6, sticker: false },
    ...['red', 'green', 'yellow', 'blue'].map((c) => ({ name: `pawn-${c}`, module: 'boards.mjs', fn: 'pawn', args: [c], px: 192, style: 'mascot', line: 2.6, border: 1.2, ring: 2.4, outer: 1.4, shadow: 0.4 })),
    ...[1, 2, 3, 4, 5, 6].map((n) => ({ name: `dice-${n}`, module: 'boards.mjs', fn: 'dice', args: [n], px: 200, style: 'mascot', line: 2.4, border: 1, ring: 2, outer: 1.2 })),
    ...['white', 'black'].flatMap((c) => [false, true].map((k) => ({ name: `dama-${c}${k ? '-king' : ''}`, module: 'boards.mjs', fn: 'damaPiece', args: [c, k], px: 160, style: 'mascot', line: 2.4, sticker: false }))),
  ]],
  '.': [720, [{ name: 'hero', module: 'hero.mjs', fn: 'hero', style: 'mascot', px: 720, line: 2.2, border: 1.2, ring: 2.6, outer: 1.4 }]],
};

for (const [dir, [size, jobs]] of Object.entries(groups)) {
  const out = path.join(tmp, dir);
  fs.rmSync(out, { recursive: true, force: true });
  const jf = path.join(tmp, `${dir === '.' ? 'hero' : dir}.json`);
  fs.mkdirSync(tmp, { recursive: true });
  fs.writeFileSync(jf, JSON.stringify(jobs));
  execFileSync('node', [path.join(here, 'render.mjs'), jf, out], { stdio: 'inherit' });
  execFileSync('python3', [path.join(here, 'towebp.py'), out, path.join(ART, dir), String(size)], { stdio: 'inherit' });
}
// 3D dice (three.js): tumble sprite sheet + resting faces
execFileSync('node', [path.join(here, 'dice3d.mjs'), path.join(tmp, 'dice3d'), '512'], { stdio: 'inherit' });
execFileSync('python3', [path.join(here, 'dice_sheet.py'), path.join(tmp, 'dice3d'), path.join(ART, 'boards'), '256'], { stdio: 'inherit' });
execFileSync('python3', [path.join(here, 'gen_assets.py')], { stdio: 'inherit' });
console.log('done → assets/art');
