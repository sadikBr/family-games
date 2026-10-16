// Renders the illustrations to PNG with Chromium.
//   node render.mjs <jobs.json> <outdir>
// jobs: [{ name, module, fn, args?, px, ...mascot options }]
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const here = path.dirname(new URL(import.meta.url).pathname);
const [jobsFile, outDir] = process.argv.slice(2);
const jobs = JSON.parse(fs.readFileSync(jobsFile, 'utf8'));
fs.mkdirSync(outDir, { recursive: true });

const b64 = (p) => fs.readFileSync(p).toString('base64');
const fontsource = (p) => path.join(here, 'node_modules/@fontsource', p);
const css = `
@font-face { font-family: Lalezar; src: url(data:font/ttf;base64,${b64(path.join(here, '../../node_modules/@expo-google-fonts/lalezar/400Regular/Lalezar_400Regular.ttf'))}) format('truetype'); }
@font-face { font-family: Lilita; src: url(data:font/woff2;base64,${b64(fontsource('lilita-one/files/lilita-one-latin-400-normal.woff2'))}) format('woff2'); }
html,body{margin:0;background:transparent} #stage{display:inline-block;line-height:0}`;

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const page = await browser.newPage({ deviceScaleFactor: 1 });
await page.setContent(`<html><head><style>${css}</style></head><body><div id="stage"></div><span style="font-family:Lalezar">ا</span><span style="font-family:Lilita">1</span></body></html>`);
await page.addScriptTag({ path: path.join(here, 'hand.js') });
await page.evaluate(() => document.fonts.ready);

for (const j of jobs) {
  const mod = await import(path.join(here, j.module));
  const svg = mod[j.fn](...(j.args ?? []));
  await page.evaluate((a) => window.mascot(a.svg, a), { ...j, svg });
  const el = await page.$('#stage svg');
  await el.screenshot({ path: path.join(outDir, `${j.name}.png`), omitBackground: true });
}
await browser.close();
console.log('rendered', jobs.length);
