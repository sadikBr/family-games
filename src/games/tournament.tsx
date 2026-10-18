/**
 * Tournaments («البطولات») in the room: the chip under the turn bar, the standings / bracket sheet,
 * the tournament actions on a game's final screen (instead of «العب مجدداً»), the standings and
 * bracket screen between games, and the champion screen. The set-up in the waiting room lives in
 * tournament-setup.tsx; the rules in src/shared/tournament.ts.
 *
 * Tournament identity colour: saffron (C.yellow) — the trophy, the frame of «my» row, the next match.
 */
import { createContext, useContext, useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { GameArt } from '@/art/game-art';
import { Icon } from '@/art/icons';
import { client } from '@/lib/client';
import type { PlayerPublic, RoomView } from '@/shared/protocol';
import { MAX_REPLAYS, roundName, standingRanks, type BracketMatch, type StandingRow, type TournamentView } from '@/shared/tournament';
import { C, F, alpha } from '@/theme';
import { Avatar, Card, Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { ConfirmModal } from '@/ui/controls';
import { Confetti, Podium } from '@/ui/fun';
import { SoftIn } from '@/ui/motion';
import { useContentWidth } from '@/ui/screen';
import { Txt, num } from '@/ui/txt';

import { GAMES } from './meta';

const GOLD = C.yellow;
const MEDAL = [C.yellow, '#C9CED8', '#D08A55'];

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** A ranked player: from the room, or from the tournament (someone who left keeps their name). */
export function tPlayer(room: RoomView, id: string | null | undefined): PlayerPublic {
  const p = room.players.find((x) => x.id === id);
  if (p) return p;
  const q = room.tournament?.people.find((x) => x.id === id);
  if (q) return { ...q, connected: true };
  return { id: id ?? '?', name: '؟', avatar: 'owl', color: '#7D7AA6', connected: true };
}

/** «نقطة / نقطتان / 5 نقاط / 12 نقطة». */
export function pointsWord(n: number) {
  if (n === 1) return 'نقطة';
  if (n === 2) return 'نقطتان';
  return n >= 3 && n <= 10 ? 'نقاط' : 'نقطة';
}

const gameTitle = (id: string | null | undefined) => (id ? (GAMES[id as keyof typeof GAMES]?.title ?? '') : '');

/** «اللعبة 2 من 5» / «نصف النهائي». */
export function stageLabel(t: TournamentView) {
  if (t.format === 'league') return `اللعبة ${num(Math.min(t.index + 1, t.total))} من ${num(t.total)}`;
  const rounds = t.bracket?.rounds.length ?? 1;
  return t.match ? roundName(t.match.round, rounds) : 'خروج المغلوب';
}

/** The game that just ended closes the tournament (the next tap shows the champion). */
function isLastGame(t: TournamentView) {
  if (t.format === 'league') return t.index + 1 >= t.total;
  const rounds = t.bracket?.rounds.length ?? 1;
  return !!t.done && !!t.last?.winner && !!t.match && t.match.round === rounds - 1;
}

/* ------------------------------------------------------------------ */
/* Tournament actions on a game's final screen                         */
/* ------------------------------------------------------------------ */

/**
 * Games put «PlayAgain» on their final screen; during a tournament it shows these actions instead.
 * The room shows a plain bar with the same actions when a game's result is in but nothing on its
 * screen registered (see TournamentFallback).
 */
const SlotContext = createContext<((delta: number) => void) | null>(null);
export const TournamentSlotProvider = SlotContext.Provider;

function useTournamentSlot() {
  const register = useContext(SlotContext);
  useEffect(() => {
    if (!register) return;
    register(1);
    return () => register(-1);
  }, [register]);
}

/** What the last game gave: «+5 نقاط في البطولة» for me, and a small strip for everyone. */
function LastGameLine({ room, t }: { room: RoomView; t: TournamentView }) {
  const last = t.last;
  if (!t.done || !last) {
    return (
      <Txt v="small" center color={C.muted}>
        {t.ranked ? 'لا نتيجة لهذه اللعبة بعد' : 'هذه اللعبة لا تُحتسب في البطولة بعد — بلا نقاط'}
      </Txt>
    );
  }
  if (t.format === 'knockout') {
    const w = last.winner ? tPlayer(room, last.winner) : null;
    const final = isLastGame(t);
    const title = !w
      ? 'تعادل — تُعاد المباراة'
      : last.draw === 'seed'
        ? `تعادل ثالث — التأهل لـ${w.name} (التصنيف الأعلى)`
        : final
          ? `الفوز لـ${w.name} في النهائي`
          : `الفوز لـ${w.name} — التأهل إلى ${t.match && t.match.round === (t.bracket?.rounds.length ?? 0) - 2 ? 'النهائي' : 'الدور التالي'}`;
    const draws = t.match?.draws ?? 0;
    return (
      <View style={{ alignItems: 'center', gap: 6 }}>
        {w ? <Avatar player={w} size={44} crown={final} /> : null}
        <Txt v="h3" center>
          {title}
        </Txt>
        {!w ? (
          <Txt v="small" center color={C.muted}>
            {`الإعادة ${num(draws)} من ${num(MAX_REPLAYS)} — بعد ${num(MAX_REPLAYS)} إعادات يتأهل صاحب التصنيف الأعلى`}
          </Txt>
        ) : null}
      </View>
    );
  }
  const mine = last.awarded[room.me];
  const ids = Object.keys(last.awarded).sort((a, b) => last.awarded[b] - last.awarded[a]);
  return (
    <View style={{ gap: 8 }}>
      {mine !== undefined ? (
        <Txt v="title" center color={GOLD}>
          {`${num(`+${mine}`)} ${pointsWord(mine)} في البطولة`}
        </Txt>
      ) : null}
      {ids.length ? (
        <Row wrap gap={6} center>
          {ids.map((id) => {
            const p = tPlayer(room, id);
            return (
              <View key={id} style={[styles.gain, id === room.me && { borderColor: GOLD }]}>
                <Avatar player={p} size={22} />
                <Txt v="tiny" numberOfLines={1} style={{ maxWidth: 74 }}>
                  {p.name}
                </Txt>
                <Txt v="tiny" color={GOLD}>
                  {num(`+${last.awarded[id]}`)}
                </Txt>
              </View>
            );
          })}
        </Row>
      ) : (
        <Txt v="small" center color={C.muted}>
          لا نقاط في هذه اللعبة
        </Txt>
      )}
    </View>
  );
}

function NextButtons({ room, t }: { room: RoomView; t: TournamentView }) {
  const isHost = room.hostId === room.me;
  const last = isLastGame(t);
  if (!isHost) {
    return (
      <Txt v="small" center color={C.dim}>
        {last ? 'إعلان البطل بعد قليل' : 'المضيف ينتقل إلى اللعبة التالية'}
      </Txt>
    );
  }
  const label = last ? 'إعلان البطل' : t.format === 'league' ? 'ترتيب البطولة' : 'جدول البطولة';
  return <Btn size="lg" icon={last ? 'crown' : 'trophy'} label={label} color={GOLD} onPress={() => client.roomAction({ type: 'tournamentNext' })} />;
}

/** In place of «العب مجدداً / اختر لعبة أخرى» while a tournament is on. */
export function TournamentActions({ room }: { room: RoomView }) {
  useTournamentSlot();
  const t = room.tournament;
  if (!t || t.stage !== 'playing') return null;
  return (
    <Animated.View entering={FadeIn.duration(220)} style={styles.actions}>
      <Row gap={8} style={{ justifyContent: 'center' }}>
        <Icon name="trophy" size={16} color={GOLD} />
        <Txt v="tiny" color={GOLD}>
          {`البطولة — ${stageLabel(t)}`}
        </Txt>
      </Row>
      <LastGameLine room={room} t={t} />
      <NextButtons room={room} t={t} />
    </Animated.View>
  );
}

/** A spectator of a knockout duel (or someone who came in during a game). */
export function TournamentWatching({ room }: { room: RoomView }) {
  useTournamentSlot();
  const t = room.tournament;
  if (!t) return null;
  const m = t.format === 'knockout' ? t.match : null;
  return (
    <Card style={{ alignItems: 'center', paddingVertical: 22 }}>
      <Icon name="eye" size={30} color={GOLD} />
      <Txt v="title" center>
        أنت تتفرّج
      </Txt>
      {m ? (
        <>
          <Txt center color={C.muted}>
            {`${stageLabel(t)}: ${tPlayer(room, m.a).name} ضد ${tPlayer(room, m.b).name}`}
          </Txt>
          <Row gap={14} center>
            <Avatar player={tPlayer(room, m.a)} size={48} />
            <Txt v="h2" color={C.dim}>
              ضد
            </Txt>
            <Avatar player={tPlayer(room, m.b)} size={48} />
          </Row>
        </>
      ) : (
        <Txt center color={C.muted}>
          دخلت أثناء اللعبة. ستشارك في اللعبة التالية من البطولة.
        </Txt>
      )}
      {t.stage === 'playing' && t.done ? (
        <View style={{ alignSelf: 'stretch', gap: 10, marginTop: 6 }}>
          <LastGameLine room={room} t={t} />
          <NextButtons room={room} t={t} />
        </View>
      ) : null}
    </Card>
  );
}

/** Under the game, when its result is in but its screen shows no tournament actions. */
export function TournamentFallback({ room }: { room: RoomView }) {
  const t = room.tournament;
  if (!t) return null;
  return (
    <Animated.View entering={FadeIn.delay(700).duration(240)} style={styles.actions}>
      <LastGameLine room={room} t={t} />
      <NextButtons room={room} t={t} />
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* Standings list                                                      */
/* ------------------------------------------------------------------ */

/** «مركز أول / مركزان أولان / 3 مراكز أولى». */
function winsText(n: number) {
  if (!n) return 'لا مركز أول بعد';
  if (n === 1) return 'مركز أول';
  if (n === 2) return 'مركزان أولان';
  return n <= 10 ? `${num(n)} مراكز أولى` : `${num(n)} مركزاً أول`;
}

function RankBadge({ rank }: { rank: number }) {
  return (
    <View style={[styles.rank, { backgroundColor: MEDAL[rank] ?? C.surfaceStrong }]}>
      <Txt v="tiny" color={rank < 3 ? C.ink : C.text}>
        {num(rank + 1)}
      </Txt>
    </View>
  );
}

export function StandingsList({ room, rows, delta, champion }: { room: RoomView; rows: StandingRow[]; delta?: Record<string, number>; champion?: string[] | null }) {
  const ranks = standingRanks(rows);
  return (
    <View style={{ gap: 6 }}>
      {rows.map((r, i) => {
        const p = tPlayer(room, r.id);
        const me = r.id === room.me;
        const d = delta?.[r.id];
        const crowned = !!champion?.includes(r.id);
        return (
          <View key={r.id} style={[styles.row, me && { borderColor: alpha(GOLD, 0.7), backgroundColor: alpha(GOLD, 0.1) }]}>
            <RankBadge rank={ranks[i]} />
            <Avatar player={p} size={34} crown={crowned} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt v="bold" numberOfLines={1}>
                {me ? `${p.name} (أنت)` : p.name}
              </Txt>
              <Txt v="tiny" color={C.muted} numberOfLines={1}>
                {winsText(r.wins)}
              </Txt>
            </View>
            {d ? (
              <Animated.View entering={FadeIn.delay(250).duration(420)} style={styles.delta}>
                <Txt v="tiny" color={C.green}>
                  {num(`+${d}`)}
                </Txt>
              </Animated.View>
            ) : null}
            <Txt style={styles.points}>{num(r.points)}</Txt>
          </View>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Bracket                                                             */
/* ------------------------------------------------------------------ */

function Slot({ room, id, won, lost, bye }: { room: RoomView; id: string | null; won: boolean; lost: boolean; bye?: boolean }) {
  if (!id) {
    return (
      <View style={styles.slot}>
        <View style={[styles.emptyFace, bye && { borderStyle: 'solid', opacity: 0.4 }]} />
        <Txt v="tiny" color={C.dim} numberOfLines={1} style={{ flex: 1 }}>
          {bye ? 'تأهل مباشر' : '؟'}
        </Txt>
      </View>
    );
  }
  const p = tPlayer(room, id);
  return (
    <View style={[styles.slot, won && { backgroundColor: alpha(p.color, 0.22) }, lost && { opacity: 0.45 }]}>
      <Avatar player={p} size={24} />
      <Txt v="tiny" numberOfLines={1} style={{ flex: 1, fontSize: 13 }} color={won ? C.text : C.muted}>
        {id === room.me ? 'أنت' : p.name}
      </Txt>
      {won ? <Icon name="check" size={14} color={C.green} /> : null}
    </View>
  );
}

function MatchCard({ room, m, live, width }: { room: RoomView; m: BracketMatch; live: 'now' | 'next' | null; width: number }) {
  return (
    <View style={[styles.match, { width }, live && { borderColor: GOLD, backgroundColor: alpha(GOLD, 0.08) }]}>
      <Slot room={room} id={m.a} won={!!m.winner && m.winner === m.a} lost={!!m.winner && m.winner !== m.a} />
      <View style={styles.matchLine} />
      <Slot room={room} id={m.b} won={!!m.winner && m.winner === m.b} lost={!!m.winner && !!m.b && m.winner !== m.b} bye={m.bye} />
      {live || m.draws || m.by ? (
        <Row gap={4} wrap style={{ paddingHorizontal: 4 }}>
          {live ? (
            <Txt v="tiny" color={GOLD} style={{ fontSize: 11 }}>
              {live === 'now' ? 'تُلعب الآن' : 'التالية'}
            </Txt>
          ) : null}
          {m.draws ? (
            <Txt v="tiny" color={C.muted} style={{ fontSize: 11 }}>
              {`تعادل ×${num(m.draws)}`}
            </Txt>
          ) : null}
          {m.by ? (
            <Txt v="tiny" color={C.muted} style={{ fontSize: 11 }}>
              {m.by === 'seed' ? 'بالتصنيف' : 'بالانسحاب'}
            </Txt>
          ) : null}
        </Row>
      ) : null}
    </View>
  );
}

/** The bracket for a phone: rounds stacked top to bottom, two duels per line. */
export function Bracket({ room, t, rounds = t?.bracket?.rounds ?? [] }: { room: RoomView; t: TournamentView | null; rounds?: BracketMatch[][] }) {
  const inner = useContentWidth();
  const avail = inner - 34; // inside a card
  const two = avail >= 260;
  const cardW = two ? (avail - 8) / 2 : avail;
  const live = t?.match ?? null;
  const games = t?.games ?? [];
  const mixed = new Set(games).size > 1;
  return (
    <View style={{ gap: 12 }}>
      {rounds.map((round, r) => (
        <View key={r} style={{ gap: 6 }}>
          <Row gap={6}>
            <Txt v="h3" style={{ flexShrink: 1 }}>
              {roundName(r, rounds.length)}
            </Txt>
            {mixed && games[r] ? (
              <Row gap={4}>
                <GameArt id={games[r]} size={22} />
                <Txt v="tiny" color={C.muted}>
                  {gameTitle(games[r])}
                </Txt>
              </Row>
            ) : null}
          </Row>
          <Row wrap gap={8} style={{ justifyContent: round.length === 1 ? 'center' : 'flex-start' }}>
            {round.map((m, i) => (
              <MatchCard
                key={i}
                room={room}
                m={m}
                width={round.length === 1 ? Math.min(avail, 240) : cardW}
                live={live && live.round === r && live.slot === i ? (t?.stage === 'playing' ? 'now' : 'next') : null}
              />
            ))}
          </Row>
        </View>
      ))}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Chip under the turn bar + the sheet                                 */
/* ------------------------------------------------------------------ */

export function TournamentChip({ room }: { room: RoomView }) {
  const [open, setOpen] = useState(false);
  const t = room.tournament;
  if (!t || t.stage !== 'playing' || room.status !== 'playing') return null;
  const m = t.format === 'knockout' ? t.match : null;
  const mine = t.format === 'league' ? t.standings.find((s) => s.id === room.me) : undefined;
  const text = m ? `${stageLabel(t)} — ${tPlayer(room, m.a).name} ضد ${tPlayer(room, m.b).name}` : `البطولة — ${stageLabel(t)}`;
  return (
    <View style={{ paddingHorizontal: 16, paddingBottom: 6 }}>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${text} — اعرض ${t.format === 'league' ? 'الترتيب' : 'الجدول'}`}
        style={({ pressed }) => [styles.chip, pressed && { opacity: 0.7 }]}>
        <Icon name="trophy" size={16} color={GOLD} />
        <Txt v="tiny" numberOfLines={1} style={{ flex: 1, fontSize: 13 }}>
          {text}
        </Txt>
        {mine ? (
          <Txt v="tiny" color={GOLD}>
            {`${num(mine.points)} ${pointsWord(mine.points)}`}
          </Txt>
        ) : null}
        <Icon name="chevron" size={14} color={C.muted} />
      </Pressable>
      <TournamentSheet room={room} visible={open} onClose={() => setOpen(false)} />
    </View>
  );
}

function LeagueGames({ t }: { t: TournamentView }) {
  return (
    <Row wrap gap={6} center>
      {t.games.map((g, i) => {
        const past = i < t.index;
        const now = i === t.index && t.stage === 'playing';
        return (
          <View key={i} style={[styles.gameDot, now && { borderColor: GOLD }, past && { opacity: 0.5 }]}>
            <GameArt id={g} size={30} />
            {past ? (
              <View style={styles.doneMark}>
                <Icon name="check" size={10} color={C.ink} />
              </View>
            ) : null}
          </View>
        );
      })}
      <Txt v="tiny" color={C.dim} style={{ width: '100%', textAlign: 'center' }}>
        {t.index === 0 ? 'اللعبة الأولى جارية' : `انتهت ${num(Math.min(t.index, t.total))} من ${num(t.total)}`}
      </Txt>
    </Row>
  );
}

export function TournamentSheet({ room, visible, onClose }: { room: RoomView; visible: boolean; onClose: () => void }) {
  const t = room.tournament;
  if (!t) return null;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="إغلاق" />
        <Animated.View entering={FadeIn.duration(150)} style={styles.sheet}>
          <Row gap={8}>
            <Icon name="trophy" size={22} color={GOLD} />
            <Txt v="title" style={{ flex: 1 }}>
              البطولة
            </Txt>
            <Pressable onPress={onClose} accessibilityLabel="إغلاق" hitSlop={10}>
              <Icon name="close" size={22} color={C.muted} />
            </Pressable>
          </Row>
          <Txt v="small" color={C.muted}>
            {t.format === 'league' ? `دوري — ${stageLabel(t)}` : `خروج المغلوب — ${stageLabel(t)}`}
          </Txt>
          <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ gap: 12 }}>
            {t.format === 'league' ? (
              <>
                <LeagueGames t={t} />
                <StandingsList room={room} rows={t.standings} />
              </>
            ) : (
              <Bracket room={room} t={t} />
            )}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Between games: standings / bracket                                  */
/* ------------------------------------------------------------------ */

function NextGameCard({ room, t }: { room: RoomView; t: TournamentView }) {
  const g = t.game;
  if (!g) return null;
  const meta = GAMES[g];
  const m = t.format === 'knockout' ? t.match : null;
  return (
    <View style={[styles.next, { borderColor: alpha(meta.color, 0.55), backgroundColor: alpha(meta.color, 0.14) }]}>
      <Txt v="tiny" color={C.muted}>
        {t.format === 'league' ? `اللعبة التالية — ${num(t.index + 1)} من ${num(t.total)}` : m ? `التالي — ${stageLabel(t)}` : 'التالي'}
      </Txt>
      <Row gap={12}>
        <GameArt id={g} size={64} />
        <View style={{ flex: 1, gap: 2 }}>
          <Txt v="title" numberOfLines={1}>
            {meta.title}
          </Txt>
          <Txt v="small" color={C.text} style={{ opacity: 0.85 }} numberOfLines={2}>
            {meta.tagline}
          </Txt>
        </View>
      </Row>
      {m ? (
        <View style={{ gap: 6 }}>
          <Row gap={10} center>
            <Avatar player={tPlayer(room, m.a)} size={40} />
            <Txt v="h3" color={C.muted}>
              ضد
            </Txt>
            <Avatar player={tPlayer(room, m.b)} size={40} />
          </Row>
          <Txt v="bold" center>
            {`${tPlayer(room, m.a).name} ضد ${tPlayer(room, m.b).name}`}
          </Txt>
          {m.draws ? (
            <Txt v="small" center color={C.muted}>
              {`إعادة المباراة بعد التعادل (${num(m.draws)} من ${num(MAX_REPLAYS)})`}
            </Txt>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function lastNote(room: RoomView, t: TournamentView): string | null {
  const last = t.last;
  if (!last) return null;
  const title = gameTitle(last.gameId);
  if (last.none === 'skipped') return t.format === 'league' ? `تُخطّيت «${title}» — بلا نقاط` : last.winner ? `التأهل لـ${tPlayer(room, last.winner).name} دون مباراة` : null;
  if (last.none === 'aborted') return `انتهت «${title}» دون نتيجة — بلا نقاط`;
  if (last.none === 'unranked') return `«${title}» لا تُحتسب في البطولة بعد — بلا نقاط`;
  return null;
}

function StandingsScreen({ room, t }: { room: RoomView; t: TournamentView }) {
  const note = lastNote(room, t);
  const delta = t.last && t.last.index === t.index - 1 ? t.last.awarded : undefined;
  return (
    <>
      <Animated.View entering={FadeIn.duration(220)} style={{ alignItems: 'center', gap: 2, paddingTop: 4 }}>
        <Icon name="trophy" size={34} color={GOLD} />
        <Txt v="display" center>
          {t.format === 'league' ? (t.index === 0 ? 'ترتيب البطولة' : `الترتيب بعد اللعبة ${num(t.index)} من ${num(t.total)}`) : 'جدول البطولة'}
        </Txt>
        {note ? (
          <Txt v="small" center color={C.muted}>
            {note}
          </Txt>
        ) : null}
      </Animated.View>
      {t.format === 'league' ? (
        <Card>
          <StandingsList room={room} rows={t.standings} delta={delta} />
        </Card>
      ) : null}
      <NextGameCard room={room} t={t} />
      {t.format === 'knockout' ? (
        <Card>
          <Bracket room={room} t={t} />
        </Card>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Champion                                                            */
/* ------------------------------------------------------------------ */

function ChampionScreen({ room, t }: { room: RoomView; t: TournamentView }) {
  const champs = (t.champion ?? []).map((id) => tPlayer(room, id));
  const shared = champs.length > 1;
  const won = !!t.champion?.includes(room.me);
  const finalMatch = t.format === 'knockout' ? t.bracket?.rounds[t.bracket.rounds.length - 1]?.[0] : null;
  const people = t.standings.map((s) => tPlayer(room, s.id));
  const scores = Object.fromEntries(t.standings.map((s) => [s.id, s.points]));
  return (
    <>
      <Confetti count={won ? 18 : 12} />
      <Animated.View entering={SoftIn} style={styles.champ}>
        <Icon name="crown" size={40} color={GOLD} />
        <Txt v="tiny" color={GOLD}>
          {shared ? 'بطولة مشتركة' : 'بطل البطولة'}
        </Txt>
        <Txt v="display" center>
          {champs.length ? champs.map((p) => p.name).join(' و') : '—'}
        </Txt>
        <Txt v="small" center color={C.muted}>
          {t.format === 'league' ? `دوري من ${num(t.total)} ألعاب` : `خروج المغلوب — ${gameTitle(t.games[t.games.length - 1])}`}
        </Txt>
        {room.group ? (
          <Row gap={4}>
            <Icon name="check" size={14} color={C.green} />
            <Txt v="tiny" color={C.muted}>{`حُفظت في لوحة الشرف لـ«${room.group.name}»`}</Txt>
          </Row>
        ) : null}
      </Animated.View>
      {t.format === 'league' ? (
        <>
          {/* a shared title: the names above say it, a podium would put one of them higher */}
          {champs.length === 1 ? <Podium players={people} scores={scores} /> : null}
          <Card>
            <StandingsList room={room} rows={t.standings} champion={t.champion} />
          </Card>
        </>
      ) : (
        <>
          {finalMatch?.a && finalMatch.b ? (
            <Card style={{ alignItems: 'center', gap: 8 }}>
              <Txt v="h3">النهائي</Txt>
              <Row gap={18} center style={{ direction: 'ltr' }}>
                {[finalMatch.a, finalMatch.b].map((id) => {
                  const p = tPlayer(room, id);
                  const w = id === finalMatch.winner;
                  return (
                    <View key={id} style={{ alignItems: 'center', gap: 4, width: 104, opacity: w ? 1 : 0.6 }}>
                      <Avatar player={p} size={w ? 64 : 50} crown={w} />
                      <Txt v="bold" numberOfLines={1} center>
                        {p.name}
                      </Txt>
                    </View>
                  );
                })}
              </Row>
            </Card>
          ) : null}
          {/* two players: the final above is the whole bracket */}
          {(t.bracket?.rounds.length ?? 0) > 1 ? (
            <Card>
              <Bracket room={room} t={t} />
            </Card>
          ) : null}
        </>
      )}
    </>
  );
}

/** The waiting room's place while a tournament is between games or just finished. */
export function TournamentScreen({ room }: { room: RoomView }) {
  const t = room.tournament;
  if (!t) return null;
  if (t.stage === 'final') return <ChampionScreen room={room} t={t} />;
  return <StandingsScreen room={room} t={t} />;
}

export function TournamentFooter({ room }: { room: RoomView }) {
  const t = room.tournament;
  const [confirmEnd, setConfirmEnd] = useState(false);
  if (!t) return null;
  const isHost = room.hostId === room.me;
  if (!isHost) {
    return (
      <View style={styles.waiting}>
        <Icon name="clock" size={18} color={C.muted} />
        <Txt v="bold" color={C.muted}>
          {t.stage === 'final' ? 'المضيف يختار: بطولة جديدة أو العودة' : 'في انتظار المضيف ليبدأ اللعبة التالية'}
        </Txt>
      </View>
    );
  }
  if (t.stage === 'final') {
    return (
      <View style={{ gap: 8 }}>
        <Btn size="xl" icon="trophy" label="بطولة جديدة" color={GOLD} onPress={() => client.roomAction({ type: 'tournamentAgain' })} />
        <Btn size="md" icon="home" label="العودة إلى الانتظار" ghost onPress={() => client.roomAction({ type: 'tournamentCancel' })} />
      </View>
    );
  }
  return (
    <View style={{ gap: 8 }}>
      <Btn size="xl" icon="play" label={t.format === 'league' ? 'ابدأ اللعبة التالية' : 'ابدأ المباراة'} color={C.green} onPress={() => client.roomAction({ type: 'tournamentPlay' })} />
      <Row gap={8}>
        <Btn flex size="sm" icon="skip" label={t.format === 'league' ? 'تخطَّ اللعبة' : 'تأهيل بالتصنيف'} ghost onPress={() => client.roomAction({ type: 'tournamentSkip' })} />
        <Btn flex size="sm" icon="stop" label="إنهاء البطولة" ghost textColor={C.red} onPress={() => setConfirmEnd(true)} />
      </Row>
      <EndTournamentModal visible={confirmEnd} onClose={() => setConfirmEnd(false)} />
    </View>
  );
}

export function EndTournamentModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <ConfirmModal
      visible={visible}
      danger
      icon="stop"
      title="إنهاء البطولة؟"
      message="تنتهي البطولة دون بطل ودون حفظ، ويعود الجميع إلى غرفة الانتظار."
      confirmLabel="أنهِ البطولة"
      cancelLabel="تابعوا"
      onCancel={onClose}
      onConfirm={() => {
        onClose();
        client.roomAction({ type: 'tournamentCancel' });
      }}
    />
  );
}

const styles = StyleSheet.create({
  actions: { gap: 10, padding: 14, borderRadius: 20, borderWidth: 1.5, borderColor: alpha(GOLD, 0.45), backgroundColor: alpha(GOLD, 0.07) },
  gain: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  rank: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingHorizontal: 8, borderRadius: 14, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.surface },
  delta: { paddingHorizontal: 6, borderRadius: 8, backgroundColor: alpha(C.green, 0.16) },
  points: { fontFamily: F.black, fontSize: 20, lineHeight: 28, color: GOLD, minWidth: 28, textAlign: 'center' },
  slot: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, paddingHorizontal: 6, borderRadius: 10, minHeight: 34 },
  emptyFace: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.dim },
  match: { borderRadius: 14, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.bg2, padding: 4, gap: 2 },
  matchLine: { height: 1, backgroundColor: C.border, marginHorizontal: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 14, borderWidth: 1, borderColor: alpha(GOLD, 0.45), backgroundColor: alpha(GOLD, 0.1) },
  backdrop: { flex: 1, backgroundColor: 'rgba(8,9,24,0.72)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  sheet: { width: '100%', maxWidth: 440, backgroundColor: C.bg2, borderRadius: 24, padding: 16, gap: 10, borderWidth: 1, borderColor: C.border },
  gameDot: { width: 42, height: 42, borderRadius: 12, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  doneMark: { position: 'absolute', bottom: -3, end: -3, width: 16, height: 16, borderRadius: 8, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' },
  next: { borderRadius: 22, borderWidth: 1.5, padding: 14, gap: 10 },
  champ: { alignItems: 'center', gap: 2, paddingVertical: 16, paddingHorizontal: 12, borderRadius: 24, borderWidth: 1.5, borderColor: alpha(GOLD, 0.55), backgroundColor: alpha(GOLD, 0.1) },
  waiting: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12 },
});
