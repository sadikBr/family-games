/**
 * The desktop home and catalogue (web, a computer-sized window): the greeting and a search box («/» jumps to
 * it), the stage (today's game and the newest ones, one at a time: its name huge, its emblem floating in its
 * own light, «العب الآن»), «كم عددكم؟», then every category as a grid of game cards (hover: the emblem
 * lifts, «العب» appears; a click opens the game's sheet; the star keeps it in the favourites).
 *
 *   mode 'home'     the stage and every category (the sidebar's categories scroll to theirs)
 *   mode 'catalog'  /games: every game, a row of category chips, the search box first
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';

import { GameArt } from '@/art/game-art';
import { Icon } from '@/art/icons';
import { GAMES, GAME_GROUPS, GAME_ORDER, type GameMeta } from '@/games/meta';
import { GameSheet } from '@/home/game-sheet';
import { fits, playersLabel, startGame } from '@/home/games';
import { toggleFavorite, useGamePrefs } from '@/lib/prefs';
import { useProfile } from '@/lib/profile';
import { norm } from '@/shared/arabic';
import { BOT_GAMES, type GameId } from '@/shared/protocol';
import { C } from '@/theme';
import { num } from '@/ui/txt';

import { sectionId, setActiveSection } from './store';

export interface DesktopHomeProps {
  mode: 'home' | 'catalog';
  /** catalog: open on one category («fav» or an index of GAME_GROUPS) */
  group?: string;
  /** catalog: the search box focused */
  search?: boolean;
}

const cvar = (color: string) => ({ ['--c' as string]: color }) as CSSProperties;

/** The newest games (the end of GAME_ORDER): marked «جديد». */
const NEWEST: GameId[] = GAME_ORDER.slice(-6);

function greeting(hour: number) {
  if (hour >= 5 && hour < 12) return 'صباح الخير';
  if (hour >= 12 && hour < 18) return 'مساء الخير';
  return 'سهرة سعيدة';
}

/** Today's game (changes at midnight), then the four newest. */
function featured(): { id: GameId; kicker: string; isNew: boolean }[] {
  const day = Math.floor(Date.now() / 86_400_000);
  const today = GAME_ORDER[(day * 7) % GAME_ORDER.length];
  const fresh = [...GAME_ORDER.slice(-5)].reverse().filter((id) => id !== today).slice(0, 4);
  return [{ id: today, kicker: 'لعبة اليوم', isNew: false }, ...fresh.map((id) => ({ id, kicker: 'جديد', isNew: true }))];
}

const COUNTS: (number | null)[] = [null, 2, 3, 4, 5, 6, 8];

/** The stage's title size: huge for a short name, smaller so a long one stays on one line. */
const titleSize = (title: string) => {
  const n = [...title].length;
  return n <= 6 ? 100 : n <= 9 ? 84 : n <= 13 ? 68 : 56;
};
const HERO_MS = 7000;

export function DesktopHome({ mode, group, search }: DesktopHomeProps) {
  const { profile } = useProfile();
  const { favorites } = useGamePrefs();
  const [query, setQuery] = useState('');
  const [count, setCount] = useState<number | null>(null);
  const [cat, setCat] = useState<string | null>(group ?? null);
  // another category asked for (the sidebar while on /games): follow it
  const [seenGroup, setSeenGroup] = useState(group);
  if (group !== seenGroup) {
    setSeenGroup(group);
    setCat(group ?? null);
  }
  const [sheet, setSheet] = useState<GameId | null>(null);
  const [hour] = useState(() => new Date().getHours());
  const searchRef = useRef<HTMLInputElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);

  // «/» jumps to the search box (not while typing somewhere)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== '/' || (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable))) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    if (search) searchRef.current?.focus();
  }, [search]);

  const favIds = GAME_ORDER.filter((id) => favorites.includes(id));
  const q = norm(query.trim());
  const match = (id: GameId) => {
    const g = GAMES[id];
    if (!fits(g, count)) return false;
    if (q && !norm(`${g.title} ${g.tagline} ${GAME_GROUPS.filter((c) => c.games.includes(id)).map((c) => c.title).join(' ')}`).includes(q)) return false;
    return true;
  };
  const all = [
    ...(favIds.length ? [{ key: 'fav', title: 'المفضلة', ids: favIds }] : []),
    ...GAME_GROUPS.map((g, i) => ({ key: String(i), title: g.title, ids: g.games })),
  ];
  const sections = q
    ? [{ key: 'results', title: 'نتائج البحث', ids: GAME_ORDER.filter(match) }]
    : all.filter((s) => mode === 'home' || cat === null || s.key === cat).map((s) => ({ ...s, ids: s.ids.filter(match) }));
  const shown = sections.filter((s) => s.ids.length);

  // the category in view lights up in the sidebar
  const keys = shown.map((s) => s.key).join('|');
  useEffect(() => {
    if (mode !== 'home' || typeof IntersectionObserver === 'undefined') return;
    const root = pageRef.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (!top) return;
        const key = (top.target as HTMLElement).dataset.key ?? '';
        setActiveSection(key === 'fav' ? -2 : /^\d+$/.test(key) ? Number(key) : -1);
      },
      { root, rootMargin: '-10% 0px -60% 0px' },
    );
    root.querySelectorAll('[data-key]').forEach((el) => io.observe(el));
    return () => {
      io.disconnect();
      setActiveSection(-1);
    };
  }, [mode, keys]);

  const name = profile.name ? ` يا ${profile.name}` : '';
  return (
    <div className="dk-page" ref={pageRef}>
      <div className="dk-page-inner">
        <header className="dk-top">
          <h1 className="dk-hello">
            {mode === 'home' ? `${greeting(hour)}${name}` : 'كل الألعاب'}
            <span>{mode === 'home' ? 'ماذا نلعب الليلة؟ اختاروا لعبة، وكل واحد يدخل من هاتفه أو حاسوبه.' : `${num(GAME_ORDER.length)} لعبة للعائلة، ومعظمها يُلعب مع البوتات أيضاً.`}</span>
          </h1>
          <label className="dk-search">
            <Icon name="search" size={19} color={C.dim} />
            <input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث عن لعبة…" aria-label="ابحث عن لعبة" />
            {query ? (
              <button onClick={() => setQuery('')} aria-label="امسح البحث">
                <Icon name="close" size={16} color={C.muted} />
              </button>
            ) : (
              <span className="dk-kbd">/</span>
            )}
          </label>
        </header>

        {mode === 'home' && !q ? <Stage onOpen={setSheet} /> : null}

        <div className="dk-chips" role="group" aria-label="كم عددكم؟">
          <span className="dk-chips-label">كم عددكم؟</span>
          {COUNTS.map((n) => (
            <button key={String(n)} className="dk-chip" data-on={count === n ? '1' : '0'} onClick={() => setCount(count === n ? null : n)}>
              {n === null ? 'أي عدد' : n === 8 ? `${num(8)}+` : num(n)}
            </button>
          ))}
        </div>

        {mode === 'catalog' && !q ? (
          <div className="dk-chips" role="tablist" aria-label="الفئات">
            <button className="dk-chip" role="tab" aria-selected={cat === null} data-on={cat === null ? '1' : '0'} onClick={() => setCat(null)}>
              كل الفئات
            </button>
            {all.map((s) => (
              <button key={s.key} className="dk-chip" role="tab" aria-selected={cat === s.key} data-on={cat === s.key ? '1' : '0'} onClick={() => setCat(s.key)}>
                {s.key === 'fav' ? <Icon name="starFull" size={14} color={cat === s.key ? C.ink : C.yellow} /> : null}
                {s.key === 'fav' ? s.title : GAME_GROUPS[Number(s.key)].short}
              </button>
            ))}
          </div>
        ) : null}

        {shown.length ? (
          shown.map((s) => (
            <section key={s.key} className="dk-sec" id={sectionId(s.key)} data-key={s.key}>
              <div className="dk-sec-head">
                <h2 className="dk-sec-title">{s.title}</h2>
                <span className="dk-sec-count">{num(s.ids.length)} لعبة</span>
                <span className="dk-sec-line" />
              </div>
              <div className="dk-grid">
                {s.ids.map((id) => (
                  <GameTile key={id} game={GAMES[id]} fav={favorites.includes(id)} isNew={NEWEST.includes(id)} onOpen={() => setSheet(id)} />
                ))}
              </div>
            </section>
          ))
        ) : (
          <div className="dk-empty">لا لعبة بهذا الاسم{count ? ` لـ ${num(count)} لاعبين` : ''}. جرّبوا كلمة أخرى.</div>
        )}
      </div>
      <GameSheet id={sheet} onClose={() => setSheet(null)} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The stage                                                           */
/* ------------------------------------------------------------------ */

function Stage({ onOpen }: { onOpen: (id: GameId) => void }) {
  const [list] = useState(featured);
  const [at, setAt] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const t = setTimeout(() => setAt((i) => (i + 1) % list.length), HERO_MS);
    return () => clearTimeout(t);
  }, [at, paused, list.length]);
  const cur = list[at];
  const g = GAMES[cur.id];
  const bots = BOT_GAMES.includes(g.id);
  return (
    <section
      className="dk-hero"
      style={cvar(g.color)}
      data-paused={paused ? '1' : '0'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-roledescription="عرض متتابع"
      aria-label={`${cur.kicker}: ${g.title}`}>
      <div className="dk-hero-ghost" aria-hidden key={`ghost-${g.id}`}>
        {g.title}
      </div>
      <div className="dk-hero-copy dk-fade" key={`copy-${g.id}`}>
        <span className="dk-kicker" data-new={cur.isNew ? '1' : '0'}>
          <Icon name="sparkle" size={14} color={C.ink} />
          {cur.kicker}
        </span>
        <h2 className="dk-hero-title" style={{ ['--title' as string]: `${titleSize(g.title)}px` } as CSSProperties}>
          {g.title}
        </h2>
        <p className="dk-hero-tag">{g.tagline}</p>
        <div className="dk-hero-meta">
          <span className="dk-pill">
            <Icon name="users" size={15} color={C.text} />
            عدد اللاعبين: {playersLabel(g)}
          </span>
          {bots ? (
            <span className="dk-pill">
              <Icon name="bot" size={15} color={C.text} />
              يُلعب مع البوتات
            </span>
          ) : null}
        </div>
        <div className="dk-hero-actions">
          <button className="dk-cta" onClick={() => startGame(g.id)}>
            <Icon name="play" size={20} color={C.ink} />
            العب الآن
          </button>
          <button className="dk-ghost" onClick={() => onOpen(g.id)}>
            <Icon name="book" size={18} color={C.text} />
            كيف نلعب؟
          </button>
        </div>
      </div>
      <div className="dk-hero-art" aria-hidden key={`art-${g.id}`}>
        <div className="dk-float dk-fade">
          <GameArt id={g.id} size={270} />
        </div>
      </div>
      <div className="dk-thumbs" role="tablist" aria-label="ألعاب العرض">
        {list.map((f, i) => (
          <button
            key={f.id}
            className="dk-thumb"
            role="tab"
            aria-selected={i === at}
            aria-label={GAMES[f.id].title}
            title={GAMES[f.id].title}
            data-on={i === at ? '1' : '0'}
            style={{ ...cvar(GAMES[f.id].color), ['--dur' as string]: `${HERO_MS}ms` } as CSSProperties}
            onClick={() => setAt(i)}>
            <GameArt id={f.id} size={44} />
          </button>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* A game card                                                         */
/* ------------------------------------------------------------------ */

function GameTile({ game, fav, isNew, onOpen }: { game: GameMeta; fav: boolean; isNew: boolean; onOpen: () => void }) {
  const bots = BOT_GAMES.includes(game.id);
  return (
    <div
      className="dk-card"
      role="button"
      tabIndex={0}
      style={cvar(game.color)}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      aria-label={`${game.title}: ${game.tagline}`}>
      <div className="dk-card-stage">
        <div className="dk-card-art">
          <GameArt id={game.id} size={112} />
        </div>
      </div>
      {isNew ? <span className="dk-new">جديد</span> : null}
      <button
        className="dk-fav"
        data-on={fav ? '1' : '0'}
        onClick={(e) => {
          e.stopPropagation();
          toggleFavorite(game.id);
        }}
        aria-label={fav ? `أزل ${game.title} من المفضلة` : `أضف ${game.title} إلى المفضلة`}
        title={fav ? 'في المفضلة' : 'أضف إلى المفضلة'}>
        <Icon name={fav ? 'starFull' : 'star'} size={18} color={fav ? C.yellow : C.text} />
      </button>
      <div className="dk-card-body">
        <div className="dk-card-title">{game.title}</div>
        <div className="dk-card-tag">{game.tagline}</div>
      </div>
      <div className="dk-card-foot">
        <span className="dk-mini" title="عدد اللاعبين">
          <Icon name="users" size={13} color={C.muted} />
          {playersLabel(game)}
        </span>
        {bots ? (
          <span className="dk-mini" title="يُلعب مع البوتات">
            <Icon name="bot" size={13} color={C.muted} />
          </span>
        ) : null}
        <button
          className="dk-play"
          onClick={(e) => {
            e.stopPropagation();
            startGame(game.id);
          }}
          aria-label={`العب ${game.title}`}>
          <Icon name="play" size={13} color={C.ink} />
          العب
        </button>
      </div>
    </div>
  );
}
