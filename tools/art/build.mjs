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
// pad: room around the 100×100 drawing so the burst behind the shield and the sticker border aren't cut off
const badge = { style: 'mascot', px: 512, line: 2.2, border: 1.4, ring: 3, outer: 1.6, pad: 11, padShift: 2.5 };
const flat = { style: 'mascot', line: 2.2, sticker: false };

const AVATARS = ['boy', 'girl', 'grandma', 'grandpa', 'lion', 'cat', 'fox', 'bear', 'panda', 'rabbit', 'owl', 'frog', 'penguin', 'monkey', 'tiger', 'koala', 'robot'];
const GAMES = ['werewolf', 'imposter', 'potato', 'names', 'headsup', 'taboo', 'ronda', 'kanza', 'tris', 'konkan', 'unoflip', 'ludo', 'dama', 'codenames', 'draw', 'estate'];
const ISLAMIC = ['huroof', 'quiz', 'whois', 'surah', 'hajj', 'ladders'];
const GAMES2 = ['connect4', 'chess', 'kdab', 'wave', 'wordle'];
const GAMES3 = ['kharbga', 'battleship', 'xo', 'sudoku', 'trivia', 'memory'];
const GAMES4 = ['phase10', 'scrabble', 'charades', 'spy', 'survey', 'dots', 'mancala', 'catan', 'carca', 'blocks', 'codebreak', 'boggle', 'qquote', 'tajweed', 'qword', 'asma', 'steps', 'mapquiz', 'prophets', 'mosque'];
const ROLES = ['wolf', 'villager', 'seer', 'doctor', 'hunter', 'witch', 'guard', 'tanner', 'whitewolf', 'bigwolf'];
const SUITS = ['coins', 'cups', 'swords', 'clubs'];
const RANKS = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];

const groups = {
  avatars: [384, AVATARS.map((n) => ({ name: n, module: 'avatars.mjs', fn: n, ...avatar }))],
  games: [384, [...GAMES.map((n) => ({ name: n, module: 'badges.mjs', fn: n, ...badge })), ...ISLAMIC.map((n) => ({ name: n, module: 'islamic.mjs', fn: n, ...badge })), ...GAMES2.map((n) => ({ name: n, module: 'games2.mjs', fn: n, ...badge })), ...GAMES3.map((n) => ({ name: n, module: 'games3.mjs', fn: n, ...badge })), ...GAMES4.map((n) => ({ name: n, module: 'games4.mjs', fn: n, ...badge }))]],
  roles: [512, ROLES.map((n) => ({ name: n, module: 'roles.mjs', fn: n, ...badge }))],
  cards: [330, [...SUITS.flatMap((s) => RANKS.map((r) => ({ name: `${s}-${r}`, module: 'cards.mjs', fn: 'card', args: [s, r], ...flat, px: 330, off: 3.2 }))), { name: 'back', module: 'cards.mjs', fn: 'back', ...flat, px: 330 }]],
  uno: [300, allFaces().map((f) => ({ name: `${f[0]}-${f[1] ?? 'wild'}-${f[2]}${f[3] ?? ''}`, module: 'uno.mjs', fn: 'face', args: f, ...flat, px: 300, off: 3 }))],
  boards: [0, [
    { name: 'ludo-board', module: 'boards.mjs', fn: 'ludoBoard', px: 1080, style: 'mascot', line: 0.6, sticker: false },
    { name: 'dama-board', module: 'boards.mjs', fn: 'damaBoard', px: 1000, style: 'mascot', line: 1, sticker: false },
    { name: 'ladders-board', module: 'islamic.mjs', fn: 'laddersBoard', px: 1080, style: 'mascot', line: 0.6, sticker: false },
    ...['w', 'b'].flatMap((c) => [...'kqrbnp'].map((t) => ({ name: `chess-${c}${t}`, module: 'chess.mjs', fn: 'piece', args: [c, t], style: 'mascot', px: 192, line: 2.6, border: 1.0, ring: 1.8, outer: 1.0, shadow: 0.3 }))),
    { name: 'hajj-board', module: 'islamic.mjs', fn: 'hajjBoard', px: 1260, style: 'mascot', line: 0.6, sticker: false },
    ...['red', 'green', 'yellow', 'blue'].map((c) => ({ name: `pawn-${c}`, module: 'boards.mjs', fn: 'pawn', args: [c], px: 192, style: 'mascot', line: 2.6, border: 1.2, ring: 2.4, outer: 1.4, shadow: 0.4, pad: 4.5, padShift: 4.5 })),
    ...[1, 2, 3, 4, 5, 6].map((n) => ({ name: `dice-${n}`, module: 'boards.mjs', fn: 'dice', args: [n], px: 200, style: 'mascot', line: 2.4, border: 1, ring: 2, outer: 1.2 })),
    ...['white', 'black'].flatMap((c) => [false, true].map((k) => ({ name: `dama-${c}${k ? '-king' : ''}`, module: 'boards.mjs', fn: 'damaPiece', args: [c, k], px: 160, style: 'mascot', line: 2.4, sticker: false }))),
  ]],
  '.': [720, [{ name: 'hero', module: 'hero.mjs', fn: 'hero', style: 'mascot', px: 720, line: 2.2, border: 1.2, ring: 2.6, outer: 1.4, padX: 7 }]],
};

// `node build.mjs games roles` rebuilds only those groups; ONLY=pawn-red,pawn-blue limits the jobs
const pickGroups = process.argv.slice(2);
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
for (const [dir, [size, allJobs]] of Object.entries(groups)) {
  if (pickGroups.length && !pickGroups.includes(dir)) continue;
  const jobs = only ? allJobs.filter((j) => only.includes(j.name)) : allJobs;
  if (!jobs.length) continue;
  const out = path.join(tmp, dir);
  fs.rmSync(out, { recursive: true, force: true });
  const jf = path.join(tmp, `${dir === '.' ? 'hero' : dir}.json`);
  fs.mkdirSync(tmp, { recursive: true });
  fs.writeFileSync(jf, JSON.stringify(jobs));
  execFileSync('node', [path.join(here, 'render.mjs'), jf, out], { stdio: 'inherit' });
  execFileSync('python3', [path.join(here, 'towebp.py'), out, path.join(ART, dir), String(size)], { stdio: 'inherit' });
}
if (pickGroups.length) {
  execFileSync('python3', [path.join(here, 'gen_assets.py')], { stdio: 'inherit' });
  console.log('done → assets/art (' + pickGroups.join(', ') + ')');
  process.exit(0);
}
// app icon + splash (assets/images)
{
  const jobs = [
    { name: 'icon-bg', module: 'brand.mjs', fn: 'iconBackground', style: 'mascot', px: 1024, line: 0, sticker: false },
    { name: 'icon-fg', module: 'brand.mjs', fn: 'iconForeground', args: [0.47], style: 'mascot', px: 1024, line: 2.1, off: 4.1, border: 0.7, ring: 1.4, outer: 0.8 },
    { name: 'icon-fg-big', module: 'brand.mjs', fn: 'iconForeground', args: [0.62], style: 'mascot', px: 1024, line: 2.9, off: 5.6, border: 0.7, ring: 1.4, outer: 0.8 },
    { name: 'splash', module: 'brand.mjs', fn: 'splashLogo', style: 'mascot', px: 1024, line: 1.3, off: 2.4, border: 0.8, ring: 1.7, outer: 0.95 },
  ];
  const out = path.join(tmp, 'brand');
  fs.writeFileSync(path.join(tmp, 'brand.json'), JSON.stringify(jobs));
  execFileSync('node', [path.join(here, 'render.mjs'), path.join(tmp, 'brand.json'), out], { stdio: 'inherit' });
  execFileSync('python3', [path.join(here, 'brand.py'), out, path.join(here, '../../assets/images')], { stdio: 'inherit' });
}
// 3D dice (three.js): tumble sprite sheet + resting faces
execFileSync('node', [path.join(here, 'dice3d.mjs'), path.join(tmp, 'dice3d'), '512'], { stdio: 'inherit' });
execFileSync('python3', [path.join(here, 'dice_sheet.py'), path.join(tmp, 'dice3d'), path.join(ART, 'boards'), '256'], { stdio: 'inherit' });
execFileSync('python3', [path.join(here, 'gen_assets.py')], { stdio: 'inherit' });
console.log('done → assets/art');
