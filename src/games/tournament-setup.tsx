/**
 * Setting up a tournament in the waiting room: «لعبة واحدة | بطولة», then «دوري | خروج المغلوب».
 * League: the ordered list of games (reorder, remove, «أضف لعبة», «اختيار عشوائي») and the points line.
 * Knockout: a game two people play, optionally a different one per round, and a preview of the bracket.
 * The host edits; everyone else sees the same panel read-only. The server keeps the set-up
 * (RoomAction 'tournament'), so every phone shows it.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { GameArt } from '@/art/game-art';
import { Icon, type IconName } from '@/art/icons';
import { client } from '@/lib/client';
import { haptic } from '@/lib/sfx';
import { MAX_PLAYERS, MIN_PLAYERS, type GameId, type RoomView } from '@/shared/protocol';
import {
  DEFAULT_POINTS,
  KNOCKOUT_GAMES,
  LEAGUE_MAX_GAMES,
  LEAGUE_MIN_GAMES,
  gameProblem,
  knockoutRounds,
  makeBracket,
  pointsLine,
  problemText,
  randomGames,
  roundName,
  tournamentProblem,
  type KnockoutConfig,
  type LeagueConfig,
  type TournamentConfig,
} from '@/shared/tournament';
import { C, alpha } from '@/theme';
import { Btn } from '@/ui/btn';
import { Toggle } from '@/ui/controls';
import { Row } from '@/ui/bits';
import { Txt, num } from '@/ui/txt';

import { helpers } from './helpers';
import { GAMES, GAME_ORDER } from './meta';
import { Bracket } from './tournament';

const GOLD = C.yellow;

/** People and bots in the room now (bots count only in games that take them). */
export function roomCounts(room: RoomView) {
  const people = room.players.filter((p) => p.connected && !p.bot).length;
  const bots = room.players.filter((p) => p.bot).length;
  return { people, bots };
}

/** The reason the tournament can't start now, in Arabic with game names, or null. */
export function setupProblem(room: RoomView): string | null {
  const t = room.tournament;
  if (!t || t.stage !== 'setup') return null;
  const { people, bots } = roomCounts(room);
  const p = tournamentProblem(t.config, people, bots);
  return p ? problemText(p, (g) => `«${GAMES[g].title}»`) : null;
}

const send = (config: TournamentConfig) => client.roomAction({ type: 'tournament', config });

function Segmented<T extends string>({ options, value, onChange, editable }: { options: { key: T; label: string; icon?: IconName }[]; value: T; onChange: (v: T) => void; editable: boolean }) {
  return (
    <View style={styles.seg} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            disabled={!editable || on}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.label}
            onPress={() => {
              haptic.tap();
              onChange(o.key);
            }}
            style={[styles.segItem, on && styles.segOn, !editable && !on && { opacity: 0.5 }]}>
            {o.icon ? <Icon name={o.icon} size={16} color={on ? C.ink : C.muted} /> : null}
            <Txt v="bold" color={on ? C.ink : C.muted} numberOfLines={1} style={{ fontSize: 15 }}>
              {o.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A starting league: the current game (if it fits) and short games playable now. */
function freshLeague(room: RoomView): LeagueConfig {
  const { people, bots } = roomCounts(room);
  const first = gameProblem(room.game, 0, people, bots) ? [] : [room.game];
  const more = randomGames(LEAGUE_MIN_GAMES + 1, people, bots).filter((g) => !first.includes(g));
  return { format: 'league', games: [...first, ...more].slice(0, LEAGUE_MIN_GAMES), points: [...DEFAULT_POINTS] };
}

function freshKnockout(room: RoomView): KnockoutConfig {
  return { format: 'knockout', game: KNOCKOUT_GAMES.includes(room.game) ? room.game : 'xo' };
}

/** «لعبة واحدة | بطولة» at the top of the waiting room. */
export function ModeSwitch({ room }: { room: RoomView }) {
  const { isHost } = helpers(room);
  const on = room.tournament?.stage === 'setup';
  if (!isHost && !on) return null;
  return (
    <Segmented
      editable={isHost}
      value={on ? 'tournament' : 'single'}
      options={[
        { key: 'single', label: 'لعبة واحدة', icon: 'play' },
        { key: 'tournament', label: 'بطولة', icon: 'trophy' },
      ]}
      onChange={(v) => (v === 'single' ? client.roomAction({ type: 'tournamentCancel' }) : send(freshLeague(room)))}
    />
  );
}

/** The grid of games to pick from (dimmed: can't be played with the people here now). */
function GamePicker({ room, games, onPick, current }: { room: RoomView; games: GameId[]; onPick: (g: GameId) => void; current?: GameId }) {
  const { people, bots } = roomCounts(room);
  return (
    <Animated.View entering={FadeIn.duration(160)} style={styles.grid}>
      {games.map((id) => {
        const bad = !!gameProblem(id, 0, people, bots);
        return (
          <Pressable
            key={id}
            accessibilityRole="button"
            accessibilityLabel={GAMES[id].title}
            onPress={() => {
              haptic.tap();
              onPick(id);
            }}
            style={[styles.cell, current === id && { borderColor: GOLD }, bad && { opacity: 0.4 }]}>
            <GameArt id={id} size={48} />
            <Txt v="tiny" center numberOfLines={1}>
              {GAMES[id].title}
            </Txt>
          </Pressable>
        );
      })}
    </Animated.View>
  );
}

function SmallBtn({ icon, label, onPress, disabled }: { icon: IconName; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      disabled={disabled}
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      style={({ pressed }) => [styles.small, (disabled || pressed) && { opacity: disabled ? 0.25 : 0.6 }]}>
      <Icon name={icon} size={16} color={C.text} />
    </Pressable>
  );
}

function seatsNote(g: GameId, people: number, bots: number) {
  const p = gameProblem(g, 0, people, bots);
  if (!p) return null;
  return p.kind === 'min' ? `تحتاج ${num(MIN_PLAYERS[g])} لاعبين` : `لـ ${num(MAX_PLAYERS[g] ?? 0)} لاعبين على الأكثر`;
}

function LeagueSetup({ room, c, editable }: { room: RoomView; c: LeagueConfig; editable: boolean }) {
  const [adding, setAdding] = useState(false);
  const { people, bots } = roomCounts(room);
  const set = (games: GameId[]) => send({ ...c, games });
  const move = (i: number, d: -1 | 1) => {
    const g = [...c.games];
    [g[i], g[i + d]] = [g[i + d], g[i]];
    set(g);
  };
  const full = c.games.length >= LEAGUE_MAX_GAMES;
  return (
    <View style={{ gap: 10 }}>
      <Row>
        <Txt v="h3" style={{ flex: 1 }}>
          الألعاب بالترتيب
        </Txt>
        <Txt v="small" color={c.games.length < LEAGUE_MIN_GAMES ? C.orange : C.muted}>
          {`${num(c.games.length)} من ${num(LEAGUE_MAX_GAMES)}`}
        </Txt>
      </Row>
      <View style={{ gap: 6 }}>
        {c.games.map((g, i) => {
          const note = seatsNote(g, people, bots);
          const selected = editable && g === room.game;
          return (
            <View key={`${g}-${i}`} style={[styles.item, selected && { borderColor: alpha(GAMES[g].color, 0.8) }]}>
              <Txt v="tiny" color={C.dim} style={{ width: 16, textAlign: 'center' }}>
                {num(i + 1)}
              </Txt>
              <Pressable
                disabled={!editable}
                onPress={() => client.roomAction({ type: 'game', game: g })}
                accessibilityRole="button"
                accessibilityLabel={`${GAMES[g].title} — إعداداتها`}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <GameArt id={g} size={36} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt v="bold" numberOfLines={1}>
                    {GAMES[g].title}
                  </Txt>
                  {note ? (
                    <Txt v="tiny" color={C.orange} numberOfLines={1}>
                      {note}
                    </Txt>
                  ) : null}
                </View>
              </Pressable>
              {editable ? (
                <Row gap={3}>
                  <View style={{ transform: [{ rotate: '180deg' }] }}>
                    <SmallBtn icon="chevron" label="إلى الأعلى" disabled={i === 0} onPress={() => move(i, -1)} />
                  </View>
                  <SmallBtn icon="chevron" label="إلى الأسفل" disabled={i === c.games.length - 1} onPress={() => move(i, 1)} />
                  <SmallBtn icon="close" label={`احذف ${GAMES[g].title}`} onPress={() => set(c.games.filter((_, k) => k !== i))} />
                </Row>
              ) : null}
            </View>
          );
        })}
        {c.games.length === 0 ? (
          <Txt v="small" center color={C.muted}>
            لا ألعاب بعد — أضف لعبة أو اختر عشوائياً
          </Txt>
        ) : null}
      </View>
      {editable ? (
        <Row gap={8}>
          <Btn flex size="sm" ghost icon={adding ? 'close' : 'plus'} label={adding ? 'إغلاق' : 'أضف لعبة'} disabled={full && !adding} onPress={() => setAdding((a) => !a)} />
          <Btn
            flex
            size="sm"
            ghost
            icon="shuffle"
            label="اختيار عشوائي"
            onPress={() => set(randomGames(Math.max(LEAGUE_MIN_GAMES, c.games.length), people, bots))}
          />
        </Row>
      ) : null}
      {editable && adding ? (
        <GamePicker
          room={room}
          games={GAME_ORDER}
          onPick={(g) => {
            set([...c.games, g].slice(0, LEAGUE_MAX_GAMES));
            if (c.games.length + 1 >= LEAGUE_MAX_GAMES) setAdding(false);
          }}
        />
      ) : null}
      <View style={styles.note}>
        <Icon name="star" size={16} color={GOLD} />
        <View style={{ flex: 1 }}>
          <Txt v="small">{`النقاط: ${pointsLine(c.points)}`}</Txt>
          <Txt v="tiny" color={C.muted}>
            الألعاب الجماعية: 3 للجميع عند الفوز، 1 عند الخسارة. البوتات تملأ المقاعد ولا تدخل الترتيب.
          </Txt>
        </View>
      </View>
      {editable && c.games.length ? (
        <Txt v="tiny" center color={C.dim}>
          اضغط على لعبة لتعديل إعداداتها في الأسفل
        </Txt>
      ) : null}
    </View>
  );
}

function KnockoutSetup({ room, c, editable }: { room: RoomView; c: KnockoutConfig; editable: boolean }) {
  // which pick is open: 'main', or the index of a round
  const [picking, setPicking] = useState<'main' | number | null>(null);
  const humans = room.players.filter((p) => p.connected && !p.bot);
  const rounds = knockoutRounds(Math.max(2, humans.length));
  const perRound = !!c.perRound?.length;
  const pick = (g: GameId) => {
    if (picking === 'main') {
      // (the server also makes it the room's game, so its settings show below)
      send({ ...c, game: g, ...(perRound ? { perRound: c.perRound } : null) });
    } else if (typeof picking === 'number') {
      const per = Array.from({ length: rounds }, (_, r) => c.perRound?.[r] ?? c.game);
      per[picking] = g;
      send({ ...c, perRound: per });
    }
    setPicking(null);
  };
  const preview = makeBracket(humans.map((p) => p.id));
  return (
    <View style={{ gap: 10 }}>
      <Txt v="h3">اللعبة</Txt>
      <Pressable
        disabled={!editable}
        onPress={() => setPicking((p) => (p === 'main' ? null : 'main'))}
        accessibilityRole="button"
        accessibilityLabel={`اللعبة: ${GAMES[c.game].title}${editable ? ' — غيّرها' : ''}`}
        style={[styles.item, { borderColor: alpha(GAMES[c.game].color, 0.7) }]}>
        <GameArt id={c.game} size={44} />
        <View style={{ flex: 1 }}>
          <Txt v="bold">{GAMES[c.game].title}</Txt>
          <Txt v="tiny" color={C.muted} numberOfLines={1}>
            {perRound ? 'للأدوار التي لم تُحدَّد لها لعبة' : 'في كل المباريات'}
          </Txt>
        </View>
        {editable ? (
          <Txt v="small" color={GOLD}>
            {picking === 'main' ? 'إغلاق' : 'غيّر'}
          </Txt>
        ) : null}
      </Pressable>
      {editable && picking === 'main' ? <GamePicker room={room} games={KNOCKOUT_GAMES} current={c.game} onPick={pick} /> : null}
      {editable || perRound ? (
        <Toggle
          label="لعبة مختلفة لكل دور"
          value={perRound}
          editable={editable}
          onChange={(v) => send(v ? { ...c, perRound: Array.from({ length: rounds }, () => c.game) } : { format: 'knockout', game: c.game })}
        />
      ) : null}
      {perRound
        ? Array.from({ length: rounds }, (_, r) => {
            const g = c.perRound?.[r] ?? c.game;
            return (
              <View key={r} style={{ gap: 6 }}>
                <Pressable
                  disabled={!editable}
                  onPress={() => setPicking((p) => (p === r ? null : r))}
                  accessibilityRole="button"
                  accessibilityLabel={`${roundName(r, rounds)}: ${GAMES[g].title}`}
                  style={styles.item}>
                  <Txt v="small" color={C.muted} style={{ width: 92 }} numberOfLines={1}>
                    {roundName(r, rounds)}
                  </Txt>
                  <GameArt id={g} size={30} />
                  <Txt v="bold" numberOfLines={1} style={{ flex: 1 }}>
                    {GAMES[g].title}
                  </Txt>
                  {editable ? <Icon name={picking === r ? 'close' : 'edit'} size={16} color={GOLD} /> : null}
                </Pressable>
                {editable && picking === r ? <GamePicker room={room} games={KNOCKOUT_GAMES} current={g} onPick={pick} /> : null}
              </View>
            );
          })
        : null}
      <Row>
        <Txt v="h3" style={{ flex: 1 }}>
          الجدول
        </Txt>
        <Txt v="tiny" color={C.muted}>
          القرعة عند البدء
        </Txt>
      </Row>
      {humans.length >= 2 ? (
        <Bracket room={room} t={null} rounds={preview} />
      ) : (
        <Txt v="small" center color={C.muted}>
          يظهر الجدول عندما يحضر شخصان على الأقل
        </Txt>
      )}
      <View style={styles.note}>
        <Icon name="info" size={16} color={GOLD} />
        <Txt v="tiny" color={C.muted} style={{ flex: 1 }}>
          الفائز يتأهل والخاسر يخرج. عند التعادل تُعاد المباراة مرتين على الأكثر، ثم يتأهل صاحب التصنيف الأعلى. البوتات خارج الجدول.
        </Txt>
      </View>
    </View>
  );
}

const FORMAT_HELP = {
  league: 'كل لعبة تمنح نقاطاً حسب الترتيب، وصاحب أكثر النقاط في النهاية هو البطل.',
  knockout: 'مباريات ثنائية: الفائز يتأهل والخاسر يخرج، حتى المباراة النهائية.',
};

/** The tournament panel that takes the cover's place in the waiting room. */
export function TournamentSetup({ room }: { room: RoomView }) {
  const { isHost } = helpers(room);
  const t = room.tournament;
  if (!t || t.stage !== 'setup') return null;
  const c = t.config;
  return (
    <View style={styles.panel}>
      <Row gap={12}>
        <View style={styles.trophy}>
          <Icon name="trophy" size={30} color={GOLD} />
        </View>
        <View style={{ flex: 1 }}>
          <Txt v="title">بطولة العائلة</Txt>
          <Txt v="small" color={C.muted}>
            عدة ألعاب متتالية، ترتيب للعائلة، وبطل في النهاية
          </Txt>
        </View>
      </Row>
      <Segmented
        editable={isHost}
        value={c.format}
        options={[
          { key: 'league', label: 'دوري' },
          { key: 'knockout', label: 'خروج المغلوب' },
        ]}
        onChange={(f) => send(f === 'league' ? freshLeague(room) : freshKnockout(room))}
      />
      <Txt v="small" center color={C.text} style={{ opacity: 0.85 }}>
        {FORMAT_HELP[c.format]}
      </Txt>
      {c.format === 'league' ? <LeagueSetup room={room} c={c} editable={isHost} /> : <KnockoutSetup room={room} c={c} editable={isHost} />}
    </View>
  );
}

/** The waiting room's footer during the set-up: «ابدأ البطولة» (host) with what's still missing. */
export function TournamentSetupFooter({ room }: { room: RoomView }) {
  const { isHost } = helpers(room);
  const problem = setupProblem(room);
  const groupWait = !!room.group?.waiting;
  if (!isHost) {
    return (
      <View style={styles.waiting}>
        <Icon name="clock" size={18} color={C.muted} />
        <Txt v="bold" color={C.muted}>
          {groupWait ? 'بانتظار بقية المجموعة' : 'في انتظار المضيف ليبدأ البطولة'}
        </Txt>
      </View>
    );
  }
  return (
    <View style={{ gap: 6 }}>
      {groupWait || problem ? (
        <Txt v="small" center color={C.muted}>
          {groupWait ? 'بانتظار بقية المجموعة — أو اضغط «ابدأ بالموجودين»' : problem}
        </Txt>
      ) : null}
      <Btn size="xl" icon="trophy" label="ابدأ البطولة" color={C.green} disabled={!!problem || groupWait} onPress={() => client.roomAction({ type: 'tournamentStart' })} />
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { borderRadius: 24, borderWidth: 1.5, borderColor: alpha(GOLD, 0.45), backgroundColor: alpha(GOLD, 0.07), padding: 16, gap: 12 },
  trophy: { width: 56, height: 56, borderRadius: 28, backgroundColor: alpha(GOLD, 0.16), alignItems: 'center', justifyContent: 'center' },
  seg: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 16, backgroundColor: C.bg3, borderWidth: 1, borderColor: C.border },
  segItem: { flex: 1, minHeight: 42, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 8 },
  segOn: { backgroundColor: GOLD },
  item: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingHorizontal: 8, borderRadius: 14, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.surface, minHeight: 48 },
  small: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  cell: { width: 74, alignItems: 'center', gap: 4, paddingVertical: 8, borderRadius: 14, borderWidth: 2, borderColor: 'transparent', backgroundColor: C.bg2 },
  note: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', padding: 10, borderRadius: 14, backgroundColor: C.bg2 },
  waiting: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12 },
});
