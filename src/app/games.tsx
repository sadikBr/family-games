/**
 * The full list of games, three to a row, with «كم عددكم؟».
 *   /games              «اختر لعبة» (the home's «العب»): a search box and every game by category
 *   /games?search=1     «ابحث عن لعبة» (the home's magnifier): the same, with the box focused
 *   /games?group=0…4    one category (the home's «عرض الكل»); also fav, recent
 * A tap on a game opens its short sheet with «ابدأ».
 */
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Icon } from '@/art/icons';
import { GAMES, GAME_GROUPS, GAME_ORDER } from '@/games/meta';
import { GameSheet } from '@/home/game-sheet';
import { CountFilter, GameGrid, fits } from '@/home/games';
import { goBack } from '@/lib/nav';
import { useGamePrefs } from '@/lib/prefs';
import { norm } from '@/shared/arabic';
import type { GameId } from '@/shared/protocol';
import { C, F } from '@/theme';
import { Btn } from '@/ui/btn';
import { Header } from '@/ui/controls';
import { Screen } from '@/ui/screen';
import { Txt, num } from '@/ui/txt';

export default function GamesScreen() {
  const params = useLocalSearchParams<{ group?: string; search?: string }>();
  const { favorites, recent } = useGamePrefs();
  const searchMode = params.search === '1';
  const [group, setGroup] = useState<string | null>(typeof params.group === 'string' ? params.group : null);
  const [query, setQuery] = useState('');
  const [count, setCount] = useState<number | null>(null);
  const [sheet, setSheet] = useState<GameId | null>(null);

  const favIds = GAME_ORDER.filter((id) => favorites.includes(id));
  const category = group !== null && /^\d+$/.test(group) ? GAME_GROUPS[Number(group)] : undefined;
  const list: { title: string; ids: GameId[] } | null =
    group === 'fav' ? { title: 'المفضلة', ids: favIds } : group === 'recent' ? { title: 'لعبتموها مؤخراً', ids: recent.filter((id) => GAMES[id]) } : category ? { title: category.title, ids: category.games } : null;

  const q = norm(query.trim());
  const match = (id: GameId) => {
    const g = GAMES[id];
    if (!fits(g, count)) return false;
    // a category's name finds its games too («ورق» → the card games)
    if (q && !norm(`${g.title} ${g.tagline} ${GAME_GROUPS.filter((c) => c.games.includes(id)).map((c) => c.title).join(' ')}`).includes(q)) return false;
    return true;
  };
  // the whole list: by category, or one flat list of results while searching
  const sections: { title: string; ids: GameId[] }[] = list
    ? [{ title: '', ids: list.ids.filter(match) }]
    : q
      ? [{ title: '', ids: GAME_ORDER.filter(match) }]
      : [...(favIds.length ? [{ title: 'المفضلة', ids: favIds }] : []), ...GAME_GROUPS.map((g) => ({ title: g.title, ids: g.games }))].map((s) => ({ ...s, ids: s.ids.filter(match) }));
  const shown = sections.filter((s) => s.ids.length);
  const total = new Set(shown.flatMap((s) => s.ids)).size;

  const title = list ? list.title : searchMode ? 'ابحث عن لعبة' : 'اختر لعبة';

  return (
    <Screen header={<Header title={title} onBack={goBack} />}>
      {list ? null : (
        <View style={styles.search}>
          <Icon name="search" size={18} color={C.dim} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="ابحث عن لعبة…"
            placeholderTextColor={C.dim}
            style={styles.searchInput}
            returnKeyType="search"
            autoCorrect={false}
            autoFocus={searchMode}
            accessibilityLabel="ابحث عن لعبة"
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="امسح البحث">
              <Icon name="close" size={18} color={C.muted} />
            </Pressable>
          ) : null}
        </View>
      )}

      <CountFilter count={count} onChange={setCount} />

      {shown.length ? (
        <>
          {q || count !== null ? (
            <Txt v="tiny" color={C.dim}>
              {total === 1 ? 'لعبة واحدة' : total === 2 ? 'لعبتان' : `${num(total)} ${total <= 10 ? 'ألعاب' : 'لعبة'}`}
            </Txt>
          ) : null}
          {shown.map((s) => (
            <View key={s.title || 'all'} style={{ gap: 8 }}>
              {s.title ? <Txt v="h3">{s.title}</Txt> : null}
              <GameGrid ids={s.ids} favorites={favorites} onOpen={setSheet} />
            </View>
          ))}
        </>
      ) : (
        <View style={styles.empty}>
          <Icon name="search" size={30} color={C.dim} />
          <Txt v="bold" center>
            لا توجد لعبة بهذا الاختيار
          </Txt>
          <Btn
            size="md"
            ghost
            label="اعرض كل الألعاب"
            onPress={() => {
              setQuery('');
              setCount(null);
              setGroup(null);
            }}
          />
        </View>
      )}

      <GameSheet id={sheet} onClose={() => setSheet(null)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 46,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  searchInput: { flex: 1, color: C.text, fontFamily: F.bold, fontSize: 16, paddingVertical: 0, textAlign: 'right', minWidth: 0, outlineWidth: 0 },
  empty: { alignItems: 'center', gap: 10, paddingVertical: 24 },
});
