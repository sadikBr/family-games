/**
 * The desktop web app's style sheet (browser windows DESKTOP_MIN wide and more; see src/desktop/frame.web.tsx).
 * Plain CSS, injected once: the desktop screens are drawn with DOM elements and these classes (hover, grid,
 * gradients and transitions that React Native styles don't have), with the app's own pieces (emblems,
 * avatars, buttons) inside. Phones never load it.
 *
 * Direction: «a night at the souk arcade». The Majorelle-night base and saffron of the app; every game
 * brings its own colour (the CSS variable --c on the element). One loud moment — the stage at the top of the
 * home, a game's name set huge in Lalezar with its emblem floating in its own light — and quiet, orderly
 * surfaces around it. Motion only answers the pointer, except the stage's slow float and crossfade.
 */

// the zellige star of the phone screens' background, as a tile
const ZELLIGE = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56"><g fill="none" stroke="#fff" stroke-width="1.4" transform="translate(28 28)"><rect x="-12" y="-12" width="24" height="24"/><rect x="-12" y="-12" width="24" height="24" transform="rotate(45)"/><circle r="4"/></g></svg>`,
);

export const DESKTOP_CSS = `
.dk-app {
  --night: #0B0E24; --bg: #141633; --bg2: #1A1D42; --surface: #1F2350; --raised: #262A5C;
  --line: rgba(255,255,255,0.08); --line2: rgba(255,255,255,0.16);
  --text: #F7F4EC; --muted: #B4B1D4; --dim: #7D7AA6; --ink: #1B1830;
  --saffron: #F2B33D; --mint: #2FB67C; --pom: #E2475F;
  --display: 'Lalezar_400Regular', 'Lalezar', serif;
  --body: 'BalooBhaijaan2_500Medium', system-ui, sans-serif;
  --bold: 'BalooBhaijaan2_700Bold', system-ui, sans-serif;
  --black: 'BalooBhaijaan2_800ExtraBold', system-ui, sans-serif;
  display: flex; flex-direction: row; flex: 1; min-height: 0; width: 100%; height: 100%;
  direction: rtl; background: var(--bg); color: var(--text); font-family: var(--body);
}
.dk-app *, .dk-app *::before, .dk-app *::after { box-sizing: border-box; }
/* a light reset that every class below overrides (:where keeps it at the lowest specificity) */
:where(.dk-app) button { font: inherit; color: inherit; border: 0; background: none; cursor: pointer; padding: 0; margin: 0; }
.dk-app :focus-visible { outline: 2px solid var(--saffron); outline-offset: 3px; border-radius: 10px; }
.dk-main { flex: 1; min-width: 0; position: relative; display: flex; overflow: hidden; }
.dk-main > * { flex: 1; min-width: 0; }

/* ------------------------------------------------------------------ sidebar */
.dk-side {
  width: 264px; flex: none; height: 100%; overflow-y: auto; scrollbar-width: none;
  display: flex; flex-direction: column; gap: 22px; padding: 22px 16px 18px;
  background: linear-gradient(180deg, #181B42 0%, #10122E 100%);
  border-inline-end: 1px solid var(--line);
}
.dk-side::-webkit-scrollbar { display: none; }
.dk-app[data-side="off"] > .dk-side { display: none; }
.dk-brand { display: flex; align-items: center; gap: 10px; padding: 0 6px; }
.dk-brand-name { font-family: var(--display); font-size: 25px; line-height: 1.25; }
.dk-brand-sub { font-size: 12px; color: var(--dim); }
.dk-nav { display: flex; flex-direction: column; gap: 4px; }
.dk-nav-item {
  display: flex; align-items: center; gap: 12px; height: 44px; padding: 0 12px; border-radius: 14px;
  font-family: var(--bold); font-size: 15.5px; color: var(--muted); position: relative; text-align: start;
  transition: background .18s, color .18s;
}
.dk-nav-item:hover { background: rgba(255,255,255,0.05); color: var(--text); }
.dk-nav-item[data-on="1"] { background: rgba(242,179,61,0.13); color: var(--text); }
.dk-nav-item[data-on="1"]::before {
  content: ''; position: absolute; inset-inline-start: -16px; top: 10px; bottom: 10px; width: 4px;
  border-radius: 0 4px 4px 0; background: var(--saffron);
}
.dk-nav-count { margin-inline-start: auto; font-size: 12px; color: var(--dim); font-family: var(--body); }
.dk-side-label { font-family: var(--bold); font-size: 12.5px; color: var(--dim); padding: 0 12px; margin-bottom: -10px; }
.dk-code-btn {
  display: flex; align-items: center; gap: 10px; height: 52px; padding: 0 14px; border-radius: 16px;
  background: rgba(242,179,61,0.08); border: 1.5px dashed rgba(242,179,61,0.55);
  font-family: var(--bold); font-size: 15.5px; color: var(--saffron); transition: background .18s, transform .18s;
}
.dk-code-btn:hover { background: rgba(242,179,61,0.16); transform: translateY(-1px); }
.dk-code-btn small { font-family: var(--body); font-size: 12px; color: var(--muted); display: block; line-height: 1.2; }
.dk-back-room {
  display: flex; align-items: center; gap: 10px; height: 46px; padding: 0 14px; border-radius: 14px;
  background: rgba(47,182,124,0.13); border: 1px solid rgba(47,182,124,0.5); font-family: var(--bold); font-size: 14.5px;
}
.dk-back-room:hover { background: rgba(47,182,124,0.22); }
.dk-me {
  margin-top: auto; display: flex; align-items: center; gap: 10px; padding: 10px; border-radius: 18px;
  background: rgba(255,255,255,0.04); border: 1px solid var(--line);
}
.dk-me-name { font-family: var(--bold); font-size: 15px; line-height: 1.3; }
.dk-me-status { font-size: 12px; color: var(--muted); }
.dk-me-who { flex: 1; min-width: 0; text-align: start; display: flex; align-items: center; gap: 10px; }
.dk-icon-btn {
  width: 38px; height: 38px; border-radius: 12px; display: grid; place-items: center; flex: none;
  background: rgba(255,255,255,0.05); transition: background .18s;
}
.dk-icon-btn:hover { background: rgba(255,255,255,0.12); }

/* ------------------------------------------------------------------ pages */
.dk-page { height: 100%; overflow-y: auto; scroll-behavior: smooth; position: relative; }
.dk-page::before {
  content: ''; position: fixed; inset: 0; pointer-events: none; opacity: 0.045;
  background-image: url("data:image/svg+xml,${ZELLIGE}");
}
.dk-page-inner { position: relative; max-width: 1340px; margin: 0 auto; padding: 26px 40px 72px; display: flex; flex-direction: column; gap: 30px; }
.dk-top { display: flex; align-items: center; gap: 20px; flex-wrap: wrap; }
.dk-hello { font-family: var(--display); font-size: 32px; line-height: 1.3; margin: 0; flex: 1; min-width: 240px; }
.dk-hello span { color: var(--muted); font-family: var(--body); font-size: 15px; display: block; line-height: 1.4; }
.dk-search {
  display: flex; align-items: center; gap: 10px; width: 380px; max-width: 100%; height: 50px; padding: 0 16px;
  border-radius: 999px; background: var(--bg2); border: 1px solid var(--line2); transition: border-color .18s, box-shadow .18s;
}
.dk-search:focus-within { border-color: var(--saffron); box-shadow: 0 0 0 4px rgba(242,179,61,0.12); }
.dk-search input {
  flex: 1; min-width: 0; height: 100%; background: transparent; border: 0; outline: none; color: var(--text);
  font-family: var(--bold); font-size: 15.5px; direction: rtl;
}
.dk-search input::placeholder { color: var(--dim); }
.dk-search input:focus-visible { outline: none; }
.dk-kbd { font-family: var(--bold); font-size: 11px; color: var(--dim); border: 1px solid var(--line2); border-radius: 6px; padding: 0 6px; direction: ltr; }

/* the stage: the one loud moment */
.dk-hero {
  --c: #F2B33D; position: relative; height: 380px; border-radius: 34px; overflow: hidden; isolation: isolate;
  background:
    radial-gradient(60% 90% at 22% 55%, color-mix(in srgb, var(--c) 55%, transparent) 0%, transparent 62%),
    linear-gradient(120deg, color-mix(in srgb, var(--c) 30%, #1A1D42) 0%, #13153A 55%, #0B0E24 100%);
  border: 1px solid color-mix(in srgb, var(--c) 40%, transparent);
  transition: border-color .6s;
}
.dk-hero::after {
  content: ''; position: absolute; inset: 0; z-index: -1; opacity: 0.07;
  background-image: url("data:image/svg+xml,${ZELLIGE}");
}
.dk-hero-ghost {
  position: absolute; z-index: -1; inset-inline-end: -1%; bottom: -96px; white-space: nowrap; pointer-events: none;
  font-family: var(--display); font-size: 330px; line-height: 1; color: transparent;
  -webkit-text-stroke: 2px color-mix(in srgb, var(--c) 45%, transparent); opacity: 0.55;
}
.dk-hero-copy { position: absolute; inset-inline-start: 0; top: 0; bottom: 0; width: 58%; padding: 36px 52px 34px; display: flex; flex-direction: column; justify-content: center; gap: 12px; }
.dk-kicker {
  align-self: flex-start; display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 12px;
  border-radius: 999px; background: var(--saffron); color: var(--ink); font-family: var(--black); font-size: 13.5px;
}
.dk-kicker[data-new="1"] { background: var(--text); }
.dk-hero-title {
  font-family: var(--display); font-size: var(--title, 96px); line-height: 1.15; margin: 2px 0 0; white-space: nowrap;
  text-shadow: 0 6px 30px color-mix(in srgb, var(--c) 60%, transparent);
}
.dk-hero-tag { font-size: 19px; line-height: 1.6; color: #E9E5F7; max-width: 36ch; margin: 0; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.dk-hero-meta { display: flex; gap: 8px; flex-wrap: wrap; }
.dk-hero-actions { display: flex; gap: 10px; margin-top: 8px; align-items: center; }
.dk-cta {
  white-space: nowrap; display: inline-flex; align-items: center; gap: 10px; height: 54px; padding: 0 26px; border-radius: 18px;
  background: var(--saffron); color: var(--ink); font-family: var(--black); font-size: 18px;
  box-shadow: 0 6px 0 #B9801F, 0 16px 30px -10px rgba(242,179,61,0.6); transition: transform .15s, box-shadow .15s;
}
.dk-cta:hover { transform: translateY(-2px); box-shadow: 0 8px 0 #B9801F, 0 20px 34px -10px rgba(242,179,61,0.7); }
.dk-cta:active { transform: translateY(4px); box-shadow: 0 2px 0 #B9801F; }
.dk-ghost {
  white-space: nowrap; display: inline-flex; align-items: center; gap: 8px; height: 54px; padding: 0 20px; border-radius: 18px;
  background: rgba(255,255,255,0.07); border: 1px solid var(--line2); font-family: var(--bold); font-size: 16px;
  transition: background .18s;
}
.dk-ghost:hover { background: rgba(255,255,255,0.13); }
.dk-hero-art { position: absolute; inset-inline-end: 7%; top: 50%; width: 300px; height: 300px; margin-top: -170px; display: grid; place-items: center; }
.dk-hero-art::before {
  content: ''; position: absolute; inset: 8%; border-radius: 50%;
  background: radial-gradient(circle, color-mix(in srgb, var(--c) 70%, transparent) 0%, transparent 68%);
  filter: blur(6px);
}
.dk-float { position: relative; animation: dk-float 6.5s ease-in-out infinite; filter: drop-shadow(0 24px 30px rgba(0,0,0,0.45)); }
@keyframes dk-float { 0%, 100% { transform: translateY(0) rotate(-2deg); } 50% { transform: translateY(-14px) rotate(2deg); } }
.dk-fade { animation: dk-in .55s cubic-bezier(.2,.8,.2,1) both; }
@keyframes dk-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
.dk-thumbs { position: absolute; inset-inline-end: 34px; bottom: 26px; display: flex; gap: 10px; }
.dk-thumb {
  --c: #fff; width: 58px; height: 58px; border-radius: 18px; display: grid; place-items: center; position: relative; overflow: hidden;
  background: color-mix(in srgb, var(--c) 30%, #141633); border: 2px solid transparent; opacity: 0.6;
  transition: opacity .2s, transform .2s, border-color .2s;
}
.dk-thumb:hover { opacity: 1; transform: translateY(-3px); }
.dk-thumb[data-on="1"] { opacity: 1; border-color: var(--saffron); }
.dk-thumb[data-on="1"]::after {
  content: ''; position: absolute; left: 0; bottom: 0; height: 3px; background: var(--saffron);
  animation: dk-progress var(--dur, 7s) linear forwards;
}
.dk-hero[data-paused="1"] .dk-thumb::after { animation-play-state: paused; }
@keyframes dk-progress { from { width: 0; } to { width: 100%; } }

.dk-pill {
  display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 12px; border-radius: 999px;
  background: rgba(255,255,255,0.08); font-family: var(--bold); font-size: 13.5px; color: var(--text); white-space: nowrap;
}
.dk-chips { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.dk-chips-label { font-family: var(--bold); font-size: 13.5px; color: var(--muted); margin-inline-end: 4px; }
.dk-chip {
  height: 36px; padding: 0 15px; border-radius: 999px; border: 1px solid var(--line2);
  font-family: var(--bold); font-size: 14px; color: var(--muted); transition: all .18s; display: inline-flex; align-items: center; gap: 6px;
}
.dk-chip:hover { color: var(--text); border-color: rgba(255,255,255,0.35); }
.dk-chip[data-on="1"] { background: var(--saffron); border-color: var(--saffron); color: var(--ink); }

/* sections and the game cards */
.dk-sec { display: flex; flex-direction: column; gap: 16px; scroll-margin-top: 20px; }
.dk-sec-head { display: flex; align-items: center; gap: 12px; }
.dk-sec-title { font-family: var(--display); font-size: 30px; line-height: 1.3; margin: 0; }
.dk-sec-count { font-size: 13.5px; color: var(--dim); }
.dk-sec-line { flex: 1; height: 1px; background: linear-gradient(to left, var(--line2), transparent); }
.dk-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 18px; }
.dk-card {
  --c: #7B61D9; position: relative; display: flex; flex-direction: column; border-radius: 26px; overflow: hidden; cursor: pointer;
  background: linear-gradient(180deg, color-mix(in srgb, var(--c) 30%, #1A1D42) 0%, #1A1D42 58%, #171A3C 100%);
  border: 1px solid color-mix(in srgb, var(--c) 28%, transparent);
  transition: transform .28s cubic-bezier(.2,.8,.2,1), box-shadow .28s, border-color .28s;
  text-align: start;
}
.dk-card:hover, .dk-card:focus-visible {
  transform: translateY(-7px); border-color: color-mix(in srgb, var(--c) 80%, transparent);
  box-shadow: 0 26px 44px -20px color-mix(in srgb, var(--c) 85%, transparent);
}
.dk-card-stage {
  height: 158px; position: relative; display: grid; place-items: center;
  background: radial-gradient(55% 62% at 50% 62%, color-mix(in srgb, var(--c) 55%, transparent) 0%, transparent 72%);
}
.dk-card-art { transition: transform .38s cubic-bezier(.2,.8,.2,1); filter: drop-shadow(0 12px 14px rgba(0,0,0,0.38)); }
.dk-card:hover .dk-card-art { transform: translateY(-10px) scale(1.09) rotate(-4deg); }
.dk-card-body { padding: 2px 18px 0; display: flex; flex-direction: column; gap: 2px; flex: 1; }
.dk-card-title { font-family: var(--display); font-size: 23px; line-height: 1.35; }
.dk-card-tag {
  font-size: 13.5px; line-height: 1.6; color: var(--muted); min-height: 43px;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.dk-card-foot { display: flex; align-items: center; gap: 6px; padding: 12px 14px 14px; }
.dk-mini { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; height: 26px; padding: 0 9px; border-radius: 999px; background: rgba(0,0,0,0.22); font-family: var(--bold); font-size: 12.5px; color: var(--muted); }
.dk-play {
  margin-inline-start: auto; display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 14px; border-radius: 999px;
  background: var(--saffron); color: var(--ink); font-family: var(--black); font-size: 14px;
  opacity: 0; transform: translateY(6px); transition: opacity .2s, transform .2s;
}
.dk-card:hover .dk-play, .dk-card:focus-within .dk-play { opacity: 1; transform: none; }
.dk-fav {
  position: absolute; top: 12px; inset-inline-start: 12px; width: 34px; height: 34px; border-radius: 12px;
  display: grid; place-items: center; background: rgba(11,14,36,0.55); opacity: 0; transition: opacity .2s, background .2s;
}
.dk-card:hover .dk-fav, .dk-fav[data-on="1"] { opacity: 1; }
.dk-fav:hover { background: rgba(11,14,36,0.85); }
.dk-new {
  position: absolute; top: 14px; inset-inline-end: 14px; height: 24px; padding: 0 10px; border-radius: 999px;
  background: var(--text); color: var(--ink); font-family: var(--black); font-size: 12px; display: inline-flex; align-items: center;
}
.dk-empty { padding: 60px 20px; text-align: center; color: var(--muted); font-size: 16px; }

/* ------------------------------------------------------------------ room */
.dk-room { display: flex; flex-direction: row; height: 100%; width: 100%; direction: rtl; }
.dk-room-stage { flex: 1; min-width: 0; position: relative; display: flex; overflow: hidden; }
.dk-room-stage > * { flex: 1; min-width: 0; }
.dk-rail {
  width: 300px; flex: none; height: 100%; overflow-y: auto; scrollbar-width: thin; display: flex; flex-direction: column; gap: 16px;
  padding: 18px 16px; background: linear-gradient(180deg, #181B42, #10122E);
}
.dk-rail-start { border-inline-end: 1px solid var(--line); }
.dk-rail-end { border-inline-start: 1px solid var(--line); }
.dk-rail-game { --c: #F2B33D; display: flex; align-items: center; gap: 12px; padding: 12px; border-radius: 22px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--c) 32%, #1A1D42), #181B42); border: 1px solid color-mix(in srgb, var(--c) 40%, transparent); }
.dk-rail-title { font-family: var(--display); font-size: 26px; line-height: 1.3; }
.dk-rail-sub { font-size: 12.5px; color: var(--muted); }
.dk-code-card { padding: 14px 16px; border-radius: 20px; background: rgba(0,0,0,0.22); border: 1px solid var(--line); display: flex; flex-direction: column; gap: 8px; }
.dk-code-label { font-family: var(--bold); font-size: 12.5px; color: var(--muted); }
.dk-code { font-family: var(--display); font-size: 50px; line-height: 1.1; letter-spacing: 10px; color: var(--saffron); direction: ltr; text-align: center; }
.dk-code-actions { display: flex; gap: 8px; }
.dk-small-btn {
  flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 38px; border-radius: 12px;
  background: rgba(255,255,255,0.07); font-family: var(--bold); font-size: 13.5px; transition: background .18s;
}
.dk-small-btn:hover { background: rgba(255,255,255,0.14); }
.dk-small-btn[data-done="1"] { background: rgba(47,182,124,0.22); color: #9FE5C3; }
.dk-rail-head { display: flex; align-items: center; gap: 8px; font-family: var(--bold); font-size: 14px; color: var(--muted); }
.dk-rail-head span { margin-inline-start: auto; font-family: var(--body); font-size: 12.5px; color: var(--dim); }
.dk-players { display: flex; flex-direction: column; gap: 4px; }
.dk-player { display: flex; align-items: center; gap: 10px; padding: 7px 8px; border-radius: 14px; transition: background .18s; }
.dk-player[data-turn="1"] { background: rgba(242,179,61,0.12); box-shadow: inset 0 0 0 1px rgba(242,179,61,0.45); }
.dk-player-name { font-family: var(--bold); font-size: 14.5px; line-height: 1.35; }
.dk-player-sub { font-size: 12px; color: var(--dim); }
.dk-turn-tag { margin-inline-start: auto; font-family: var(--black); font-size: 11.5px; color: var(--ink); background: var(--saffron); border-radius: 999px; padding: 1px 8px; }
.dk-rail-tools { display: flex; align-items: center; gap: 8px; }
.dk-leave {
  display: flex; align-items: center; justify-content: center; gap: 8px; height: 42px; border-radius: 14px; margin-top: auto;
  border: 1px solid rgba(226,71,95,0.45); color: #F3A3B0; font-family: var(--bold); font-size: 14.5px; transition: background .18s;
}
.dk-leave:hover { background: rgba(226,71,95,0.14); }
.dk-steps { display: flex; flex-direction: column; gap: 10px; counter-reset: dk-step; margin: 0; padding: 0; list-style: none; }
.dk-steps li { position: relative; padding-inline-start: 34px; font-size: 14px; line-height: 1.7; color: #DCD8EE; counter-increment: dk-step; }
.dk-steps li::before {
  content: counter(dk-step); position: absolute; inset-inline-start: 0; top: 2px; width: 24px; height: 24px; border-radius: 50%;
  display: grid; place-items: center; background: rgba(242,179,61,0.16); color: var(--saffron); font-family: var(--black); font-size: 12.5px;
}
.dk-feed { display: flex; flex-direction: column; gap: 6px; }
.dk-feed-item { display: flex; gap: 8px; align-items: flex-start; font-size: 13.5px; line-height: 1.6; color: var(--muted); padding: 6px 8px; border-radius: 12px; }
.dk-feed-item:first-child { color: var(--text); background: rgba(255,255,255,0.05); }

@media (max-width: 1180px) {
  .dk-hero-copy { width: 62%; padding: 30px 36px; }
  .dk-hero-art { inset-inline-end: 4%; }
  .dk-thumbs { inset-inline-end: 22px; bottom: 20px; gap: 6px; }
  .dk-thumb { width: 42px; height: 42px; border-radius: 13px; }
  .dk-thumb img { transform: scale(0.75); }
  .dk-cta, .dk-ghost { height: 48px; padding: 0 18px; font-size: 16px; }
}
@media (max-width: 1060px) { .dk-thumbs { display: none; } .dk-page-inner { padding: 22px 26px 60px; } }
@media (max-width: 1279px) { .dk-rail-end { display: none; } .dk-hero-title { font-size: calc(var(--title, 96px) * 0.8); } .dk-hero-art { width: 250px; height: 250px; margin-top: -150px; } }
@media (prefers-reduced-motion: reduce) {
  .dk-app *, .dk-app *::before, .dk-app *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }
}
`;
