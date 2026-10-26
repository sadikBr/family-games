/** «الممالك الخمس» — the end of a round / of the game (scores table, podium) and the lobby settings. */
import { ScrollView, StyleSheet, View } from 'react-native';

import { client } from '@/lib/client';
import { li } from '@/shared/li';
import { REALMS_ROUND_END_MS, realmsDeals, type RealmsRoundRow, type RealmsView } from '@/shared/games/realms';
import { isWild, rankLabel } from '@/shared/realms-rules';
import type { RoomView } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { Avatar, Card as Panel, Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { ChipPicker } from '@/ui/controls';
import { Confetti, Podium, TimerBar } from '@/ui/fun';
import { useContentWidth } from '@/ui/screen';
import { Txt, num } from '@/ui/txt';

import { HandRows, cardsWord } from './cards/card-ui';
import { HostNote, PlayAgain, ResultBanner } from './common';
import type { Helpers } from './helpers';
import { GroupsRow, RealmCardView, RealmFace } from './realms-card';

function rowDetail(r: RealmsRoundRow): string {
  if (r.out) return 'خروج';
  if (!r.points) return 'كلها في مجموعات';
  return cardsWord(r.left.length);
}

/** One player's cards at the end of the round: the groups, then the cards that counted (ringed in red). */
function RowCards({ row, wild, w }: { row: RealmsRoundRow; wild: number; w: number }) {
  if (!row.groups.length && !row.left.length) return null;
  return (
    <View style={{ gap: 4, paddingStart: 34 }}>
      {row.groups.length ? <GroupsRow groups={row.groups} w={w} wild={wild} motion={false} /> : null}
      {row.left.length ? (
        <Row wrap gap={3} style={[styles.left, { direction: 'ltr' }]}>
          {row.left.map((c) => (
            <RealmCardView key={c.id} card={c} width={w} wild={isWild(c, wild)} />
          ))}
        </Row>
      ) : null}
    </View>
  );
}

/** The points of every round (a line per round, a column per player) and the totals. */
function ScoreTable({ view, h }: { view: RealmsView; h: Helpers }) {
  const width = useContentWidth();
  const ids = view.participants.filter((id) => view.active.includes(id));
  const deals = view.rounds === 6 ? realmsDeals({ rounds: 'short', timer: 0 }) : realmsDeals({ rounds: 'full', timer: 0 });
  const col = Math.max(32, Math.min(56, Math.floor((width - 36 - 58) / Math.max(1, ids.length))));
  const best = Math.min(...ids.map((id) => view.scores[id] ?? 0));
  return (
    <Panel style={{ gap: 6 }}>
      <Txt v="small" color={C.muted}>
        النقاط في كل جولة — المجموع الأقل يفوز
      </Txt>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
        <View>
          <Row gap={0}>
            <View style={styles.headCell} />
            {ids.map((id) => (
              <View key={id} style={[styles.cell, { width: col }]} accessibilityLabel={h.player(id).name}>
                <Avatar player={h.player(id)} size={26} />
              </View>
            ))}
          </Row>
          {view.history.map((row, i) => (
            <Row key={i} gap={0} style={i % 2 ? undefined : styles.zebra}>
              <View style={styles.headCell}>
                <Txt v="tiny" color={C.dim} numberOfLines={1}>
                  {num(i + 1)} · ★ {rankLabel(deals[i] ?? i + 3)}
                </Txt>
              </View>
              {ids.map((id) => {
                const v = row[id];
                return (
                  <View key={id} style={[styles.cell, { width: col }]}>
                    <Txt style={[styles.num, { color: v === 0 ? C.green : C.text }]}>{v === undefined ? '—' : num(v)}</Txt>
                  </View>
                );
              })}
            </Row>
          ))}
          <Row gap={0} style={styles.total}>
            <View style={styles.headCell}>
              <Txt v="tiny" color={C.muted} numberOfLines={1}>
                المجموع
              </Txt>
            </View>
            {ids.map((id) => (
              <View key={id} style={[styles.cell, { width: col }]}>
                <Txt style={[styles.num, styles.totalNum, { color: (view.scores[id] ?? 0) === best ? C.yellow : C.text }]}>{num(view.scores[id] ?? 0)}</Txt>
              </View>
            ))}
          </Row>
        </View>
      </ScrollView>
    </Panel>
  );
}

export function RoundEnd({ room, view, h }: { room: RoomView; view: RealmsView; h: Helpers }) {
  const width = useContentWidth();
  const final = view.phase === 'final';
  const won = final && view.winner === h.me;
  const out = view.outBy;
  const mine = view.summary?.find((r) => r.id === h.me);
  const title = final ? (view.winner ? `الفوز ${li(h.player(view.winner).name)}` : 'انتهت اللعبة') : out ? `خروج ${li(h.player(out).name)}` : 'انتهت الكومة';
  const played = view.history.length;
  const sub = final
    ? `بعد ${num(played)} ${played > 10 || played < 3 ? 'جولة' : 'جولات'} — المجموع الأقل يفوز`
    : mine
      ? mine.out
        ? 'أول من وضع كل أوراقه: صفر'
        : mine.points
          ? `عليك ${num(mine.points)} نقطة في هذه الجولة`
          : 'كل أوراقك في مجموعات: صفر'
      : undefined;
  const w = Math.max(20, Math.min(26, Math.floor((width - 80) / 11)));
  const happy = won || (!final && !!mine && mine.points === 0);
  return (
    <>
      {happy ? <Confetti /> : null}
      <ResultBanner
        tone={happy ? 'good' : 'neutral'}
        art={
          <Row gap={-12} style={{ direction: 'ltr', paddingBottom: 4 }}>
            <View style={{ transform: [{ rotate: '-12deg' }, { translateY: 4 }] }}>
              <RealmFace card={{ id: 'a', suit: 'fire', rank: 7 }} width={44} />
            </View>
            <RealmFace card={{ id: 'j', suit: null, rank: 0 }} width={44} />
            <View style={{ transform: [{ rotate: '12deg' }, { translateY: 4 }] }}>
              <RealmFace card={{ id: 'b', suit: 'water', rank: 13 }} width={44} />
            </View>
          </Row>
        }
        title={title}
        sub={sub}
      />
      {final ? <Podium players={view.participants.filter((id) => view.active.includes(id)).map((id) => h.player(id))} scores={view.scores} lowIsBetter /> : null}
      <ScoreTable view={view} h={h} />
      {view.summary ? (
        <HandRows
          title={`الجولة ${num(view.round)} (الجوكر: ${rankLabel(view.wild)}) — الأرقام بقيمتها، الولد 11، الملكة 12، الملك 13، جوكر الجولة 20، الجوكر 50`}
          rows={view.summary.map((r) => ({
            key: r.id,
            players: [h.player(r.id)],
            name: h.player(r.id).name,
            detail: rowDetail(r),
            points: num(`+${r.points}`),
            tone: r.out ? 'good' : r.points ? 'bad' : 'good',
            extra: <RowCards row={r} wild={view.wild} w={w} />,
          }))}
        />
      ) : null}
      {final ? (
        <PlayAgain room={room} />
      ) : (
        <View style={{ gap: 10 }}>
          <TimerBar endsAt={view.nextAt} total={REALMS_ROUND_END_MS} />
          {h.isHost ? (
            <Btn size="xl" icon="cards" label={`الجولة ${num(view.round + 1)}: ${cardsWord(view.round + 3)}`} onPress={() => h.act('next')} />
          ) : (
            <HostNote>الجولة التالية تبدأ تلقائياً، أو عندما يوزّع المضيف</HostNote>
          )}
        </View>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Lobby settings                                                      */
/* ------------------------------------------------------------------ */

export function RealmsSettings({ room, editable }: { room: RoomView; editable: boolean }) {
  const s = room.settings.realms;
  const change = (patch: Record<string, unknown>) => client.roomAction({ type: 'settings', game: 'realms', patch });
  return (
    <View style={{ gap: 10 }}>
      <Txt v="bold">الجولات</Txt>
      <ChipPicker
        editable={editable}
        value={s.rounds}
        onChange={(x) => change({ rounds: x })}
        options={[
          { key: 'full', label: 'كاملة (11)' },
          { key: 'short', label: 'قصيرة (6)' },
        ]}
      />
      <Txt v="tiny" color={C.muted}>
        {s.rounds === 'short' ? 'ست جولات: من 3 إلى 8 أوراق، والجوكر من الثلاثات إلى الثمانيات.' : 'إحدى عشرة جولة: من 3 إلى 13 ورقة، والجوكر من الثلاثات إلى K.'}
      </Txt>
      <Txt v="bold">الوقت لكل دور</Txt>
      <ChipPicker
        editable={editable}
        value={String(s.timer) as '0' | '60' | '90' | '120'}
        onChange={(x) => change({ timer: Number(x) })}
        options={[
          { key: '0', label: 'بدون وقت' },
          { key: '60', label: '60 ث' },
          { key: '90', label: '90 ث' },
          { key: '120', label: '120 ث' },
        ]}
      />
      <Txt v="tiny" color={C.muted}>
        من 2 إلى 7 لاعبين؛ أكملوا المقاعد بالبوتات إن شئتم. عندما ينتهي الوقت يسحب الحاسوب ورقة ويرمي ورقة بدلاً منك.
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  left: { padding: 3, borderRadius: 8, borderWidth: 1.5, borderColor: alpha(C.red, 0.7), alignSelf: 'flex-start' },
  headCell: { width: 58, minHeight: 28, justifyContent: 'center', paddingHorizontal: 2 },
  cell: { minHeight: 28, alignItems: 'center', justifyContent: 'center' },
  zebra: { backgroundColor: alpha('#FFFFFF', 0.04), borderRadius: 6 },
  num: { fontFamily: F.bold, fontSize: 13, lineHeight: 20 },
  total: { borderTopWidth: 1, borderTopColor: C.borderStrong, marginTop: 2, paddingTop: 2 },
  totalNum: { fontFamily: F.black, fontSize: 15, lineHeight: 22 },
});
