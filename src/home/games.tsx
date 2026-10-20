/**
 * The home screen's building blocks for games: starting one, the compact card, a sideways shelf, the
 * grid of a full list, and the «كم عددكم؟» filter. Used by the home screen and by /games.
 */
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';

import { GameArt } from '@/art/game-art';
import { Icon, type IconName } from '@/art/icons';
import { GAMES, GAME_GROUPS, GAME_ORDER, type GameMeta } from '@/games/meta';
import { client } from '@/lib/client';
import { haptic } from '@/lib/sfx';
import { BOT_GAMES, type GameId } from '@/shared/protocol';
import { C, F, alpha, shade } from '@/theme';
import { Row } from '@/ui/bits';
import { useContentWidth } from '@/ui/screen';
import { Txt, num } from '@/ui/txt';

export const GAP = 10;

/** Open a room for this game (I'm its host) and go to its lobby. */
export function startGame(id: GameId) {
  haptic.medium();
  client.createRoom(id);
  router.push('/room');
}

// «3 فأكثر» rather than «3+», which flips to «+3» in right-to-left text
export const playersLabel = (g: GameMeta) => (g.maxPlayers && g.maxPlayers !== g.minPlayers ? num(`${g.minPlayers}–${g.maxPlayers}`) : g.maxPlayers ? num(`${g.minPlayers}`) : `${num(`${g.minPlayers}`)} فأكثر`);

/** «كم عددكم؟»: does a game work for this many people (bots fill the missing seats)? */
export function fits(g: GameMeta, n: number | null) {
  if (n === null) return true;
  const max = g.maxPlayers ?? 99;
  if (n > max) return false;
  return n >= g.minPlayers || BOT_GAMES.includes(g.id);
}

/** The day's number (changes at midnight UTC): picks «لعبة اليوم» and the day's suggestions. */
export const dayNumber = (now: Date) => Math.floor(now.getTime() / 86_400_000);

export const gameOfTheDay = (day: number): GameId => GAME_ORDER[(day * 7) % GAME_ORDER.length];

/**
 * «مقترحة لكم»: the game of the day, then one game from each category, taken (in turn, day by day)
 * among that category's best-loved games (GAME_ORDER is roughly most-played first).
 */
export function suggestions(day: number): GameId[] {
  const out: GameId[] = [gameOfTheDay(day)];
  GAME_GROUPS.forEach((group, i) => {
    const top = [...group.games].sort((a, b) => GAME_ORDER.indexOf(a) - GAME_ORDER.indexOf(b)).slice(0, 5);
    for (let k = 0; k < top.length; k++) {
      const id = top[(day + i + k) % top.length];
      if (!out.includes(id)) {
        out.push(id);
        break;
      }
    }
  });
  return out;
}

/* ------------------------------------------------------------------ */

/** A compact game card: the emblem, the name and the player count. A tap opens the game's sheet. */
export function GameCard({ game, width, fav, badge, onPress }: { game: GameMeta; width: number; fav?: boolean; badge?: string; onPress: () => void }) {
  const art = Math.round(width * 0.58);
  return (
    <Pressable
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={`${badge ? `${badge}: ` : ''}${game.title}، عدد اللاعبين ${playersLabel(game)}`}
      style={({ pressed }) => [
        styles.card,
        { width, backgroundColor: shade(game.color, -0.62), borderColor: badge ? alpha(C.yellow, 0.7) : alpha(game.color, 0.35) },
        pressed && styles.pressed,
      ]}>
      <View style={[styles.stage, { width: art + 10, height: art + 10, borderRadius: (art + 10) / 2, backgroundColor: alpha(game.color, 0.22) }]}>
        <GameArt id={game.id} size={art} />
      </View>
      <Txt center numberOfLines={2} style={styles.name}>
        {game.title}
      </Txt>
      <View style={{ flex: 1 }} />
      <Row gap={3} center>
        <Icon name="users" size={11} color={C.muted} />
        <Txt v="tiny" color={C.muted} style={{ fontSize: 11.5 }}>
          {playersLabel(game)}
        </Txt>
      </Row>
      {fav ? (
        <View style={styles.fav} accessibilityLabel="في المفضلة">
          <Icon name="starFull" size={14} color={C.yellow} />
        </View>
      ) : null}
      {badge ? (
        <View style={styles.badge}>
          <Icon name="sparkle" size={10} color={C.ink} />
          <Txt v="tiny" color={C.ink} style={{ fontSize: 10.5, lineHeight: 15 }}>
            {badge}
          </Txt>
        </View>
      ) : null}
    </Pressable>
  );
}

/** Card width in a shelf: about 3⅓ cards on screen (2⅔ on the narrowest phones), so the next one peeks in. */
export function useShelfCardWidth() {
  const cw = useContentWidth();
  const show = cw < 300 ? 2.7 : cw < 360 ? 3.3 : 3.5;
  return Math.max(88, Math.min(116, Math.round((cw + 16 - 2.4 * GAP) / show)));
}

/** Card width in a full list: three to a row (four on a tablet). */
export function useGridCardWidth() {
  const cw = useContentWidth();
  const cols = cw >= 500 ? 4 : 3;
  return Math.floor((cw - GAP * (cols - 1)) / cols);
}

export interface ShelfProps {
  title: string;
  icon: IconName;
  iconColor?: string;
  ids: GameId[];
  favorites: GameId[];
  /** this card carries the «لعبة اليوم» badge */
  featured?: GameId;
  onOpen: (id: GameId) => void;
  onSeeAll?: () => void;
}

/**
 * One category as a row that scrolls sideways. It bleeds to the screen edges so the cards slide out
 * of view naturally; in right-to-left the first card sits at the right edge.
 */
export function Shelf({ title, icon, iconColor = C.muted, ids, favorites, featured, onOpen, onSeeAll }: ShelfProps) {
  const { width } = useWindowDimensions();
  const cw = useContentWidth();
  const cardW = useShelfCardWidth();
  const bleed = Math.max(0, (width - cw) / 2);
  return (
    <View style={{ gap: 8 }}>
      <Row gap={6}>
        <Icon name={icon} size={18} color={iconColor} />
        <Txt v="h3" numberOfLines={1} style={{ flex: 1 }}>
          {title}
        </Txt>
        {onSeeAll ? (
          <Pressable onPress={onSeeAll} accessibilityRole="button" accessibilityLabel={`عرض كل ${title}`} hitSlop={8} style={({ pressed }) => [styles.seeAll, pressed && { opacity: 0.6 }]}>
            <Txt v="small" color={C.yellow} style={{ fontFamily: F.bold }}>
              عرض الكل
            </Txt>
            <Icon name="forward" size={14} color={C.yellow} />
          </Pressable>
        ) : null}
      </Row>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        directionalLockEnabled
        decelerationRate="fast"
        style={{ marginHorizontal: -bleed }}
        contentContainerStyle={{ gap: GAP, paddingHorizontal: bleed, paddingVertical: 1 }}>
        {ids.map((id) => (
          <GameCard key={id} game={GAMES[id]} width={cardW} fav={favorites.includes(id)} badge={id === featured ? 'لعبة اليوم' : undefined} onPress={() => onOpen(id)} />
        ))}
      </ScrollView>
    </View>
  );
}

export function GameGrid({ ids, favorites, onOpen }: { ids: GameId[]; favorites: GameId[]; onOpen: (id: GameId) => void }) {
  const w = useGridCardWidth();
  return (
    <View style={styles.grid}>
      {ids.map((id) => (
        <GameCard key={id} game={GAMES[id]} width={w} fav={favorites.includes(id)} onPress={() => onOpen(id)} />
      ))}
    </View>
  );
}

/* ------------------------------------------------------------------ */

export function Chip({ label, icon, active, onPress }: { label: string; icon?: IconName; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[styles.chip, active && styles.chipOn]}>
      {icon ? <Icon name={icon} size={14} color={active ? C.ink : C.muted} /> : null}
      <Txt v="bold" color={active ? C.ink : C.text} style={{ fontSize: 13.5 }}>
        {label}
      </Txt>
    </Pressable>
  );
}

const COUNTS: (number | null)[] = [null, 2, 3, 4, 5, 6, 8];

/** «كم عددكم؟»: one row of chips, the games that don't suit that many people are hidden. */
export function CountFilter({ count, onChange }: { count: number | null; onChange: (n: number | null) => void }) {
  return (
    <Row gap={8}>
      <Txt v="tiny" color={C.muted} numberOfLines={1} style={{ flexShrink: 0 }}>
        كم عددكم؟
      </Txt>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} directionalLockEnabled contentContainerStyle={styles.chips}>
        {COUNTS.map((n) => (
          <Chip key={String(n)} label={n === null ? 'أي عدد' : n === 8 ? `${num('8')}+` : num(String(n))} active={count === n} onPress={() => onChange(count === n ? null : n)} />
        ))}
      </ScrollView>
    </Row>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', paddingTop: 10, paddingBottom: 8, paddingHorizontal: 6, borderRadius: 18, borderWidth: 1 },
  stage: { alignItems: 'center', justifyContent: 'center' },
  name: { fontFamily: F.black, fontSize: 13.5, lineHeight: 19, marginTop: 4 },
  fav: { position: 'absolute', top: 6, start: 6 },
  badge: { position: 'absolute', top: 6, end: 6, flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 5, borderRadius: 8, backgroundColor: C.yellow },
  pressed: { opacity: 0.8 },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 32 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  chips: { gap: 6, alignItems: 'center', paddingVertical: 1 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 34, paddingHorizontal: 12, borderRadius: 17, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  chipOn: { backgroundColor: C.yellow, borderColor: C.yellow },
});
