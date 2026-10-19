/** «الرامي» — pieces of the screen: a meld on the table, the end of a round / of the game, the lobby settings. */
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { client } from '@/lib/client';
import { haptic } from '@/lib/sfx';
import { li } from '@/shared/li';
import { RAMI_ROUND_END_MS, type RMeld, type RamiRoundRow, type RamiView } from '@/shared/games/rami';
import { isJoker, slotLabel } from '@/shared/rami-rules';
import type { RoomView } from '@/shared/protocol';
import { C, alpha } from '@/theme';
import { Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { ChipPicker, Toggle } from '@/ui/controls';
import { Confetti, Podium, Scoreboard, TimerBar } from '@/ui/fun';
import { Txt, num } from '@/ui/txt';

import { HandRows, cardsWord } from './cards/card-ui';
import { FrenchCard, FrenchFace } from './cards/french-card';
import { CardMotion, type Side } from './cards/motion';
import { HostNote, PlayAgain, ResultBanner } from './common';
import type { Helpers } from './helpers';

export const KIND_AR = { set: 'تيرسي', run: 'سويفي' } as const;

/** A meld on the table: its cards (a joker shows what it stands for), lit when the picked cards fit it. */
export function MeldBox({
  meld,
  w,
  fits,
  fresh,
  from,
  onPress,
}: {
  meld: RMeld;
  w: number;
  /** what a tap does now (null: nothing) */
  fits: 'add' | 'swap' | 'both' | null;
  /** the colour of the player who just laid it / added to it */
  fresh?: string;
  from: Side;
  onPress: () => void;
}) {
  return (
    <Pressable
      disabled={!fits}
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      accessibilityRole={fits ? 'button' : undefined}
      accessibilityLabel={fits ? (fits === 'swap' ? 'استرجع الجوكر من هذه التشكيلة' : 'أضف إلى هذه التشكيلة') : KIND_AR[meld.kind]}
      style={[styles.meld, fresh ? { borderColor: alpha(fresh, 0.95), backgroundColor: alpha(fresh, 0.14) } : null, fits && styles.meldFits]}>
      <Row gap={2} wrap style={{ direction: 'ltr', paddingBottom: meld.slots.some((x) => isJoker(x.card)) ? 6 : 0 }}>
        {/* a card laid down or added glides from my hand (or slides in from the players' side) */}
        {meld.slots.map((x) => (
          <CardMotion key={x.card.id} id={x.card.id} enter="play" from={from} flow>
            <FrenchCard card={x.card} width={w} tag={isJoker(x.card) ? slotLabel(x) : undefined} />
          </CardMotion>
        ))}
      </Row>
      {fits ? (
        <View style={styles.badge} pointerEvents="none">
          <Txt v="tiny" color={C.ink} style={{ lineHeight: 16 }}>
            {fits === 'swap' ? 'بدّل الجوكر' : 'أضف هنا'}
          </Txt>
        </View>
      ) : null}
    </Pressable>
  );
}

/** Add the card to the meld, or take the joker back with it? */
export function SwapChoice({ onAdd, onSwap, onCancel }: { onAdd: () => void; onSwap: () => void; onCancel: () => void }) {
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
        <Animated.View entering={FadeIn.duration(160)} style={styles.picker}>
          <Txt v="title" center>
            الجوكر أم الإضافة؟
          </Txt>
          <Txt v="small" center color={C.muted}>
            ورقتك تأخذ مكان الجوكر فيعود الجوكر إلى يدك، أو تُضاف إلى التشكيلة.
          </Txt>
          <Btn size="md" icon="swap" label="بدّل الجوكر" onPress={onSwap} />
          <Btn size="md" icon="plus" label="أضفها إلى التشكيلة" ghost onPress={onAdd} />
          <Btn size="sm" label="إلغاء" ghost onPress={onCancel} />
        </Animated.View>
      </View>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* End of a round / of the game                                        */
/* ------------------------------------------------------------------ */

function rowDetail(r: RamiRoundRow, sec: boolean): string {
  if (r.status === 'out') return sec ? 'رامي سيك' : 'رامي';
  if (r.status === 'closed') return 'بلا نزول';
  if (r.status === 'forfeit') return 'خسارة الجولة';
  if (r.status === 'void') return '—';
  const jokers = r.cards.filter(isJoker).length;
  return `${cardsWord(r.cards.length)}${jokers ? ` (جوكر: ${num(jokers)})` : ''}${sec ? ' ×2' : ''}`;
}

function CardStrip({ row }: { row: RamiRoundRow }) {
  if (!row.cards.length || row.status === 'void' || row.status === 'out') return null;
  return (
    <Row wrap gap={3} style={{ direction: 'ltr', paddingStart: 34 }}>
      {row.cards.map((c) => (
        <FrenchFace key={c.id} card={c} width={24} />
      ))}
    </Row>
  );
}

export function RoundEnd({ room, view, h }: { room: RoomView; view: RamiView; h: Helpers }) {
  const final = view.phase === 'final';
  const won = final && view.winner === h.me;
  const out = view.roundWinner;
  const mine = view.roundSummary?.find((r) => r.id === h.me);
  const title = final
    ? view.winner
      ? `الفوز ${li(h.player(view.winner).name)}`
      : 'انتهت اللعبة'
    : out
      ? `${view.sec ? 'رامي سيك' : 'رامي'} ${li(h.player(out).name)}`
      : view.forfeit
        ? `خسارة الجولة ${li(h.player(view.forfeit).name)}`
        : 'انتهت الكومة';
  const sub = final
    ? `بعد ${num(view.history.length)} ${view.history.length > 10 || view.history.length < 3 ? 'جولة' : 'جولات'} — المجموع الأقل يفوز`
    : view.forfeit
      ? 'الورقة المأخوذة من المرمية لم تنزل في الدور نفسه'
      : mine
        ? mine.status === 'out'
          ? 'أفرغت يدك أولاً'
          : `عليك ${num(mine.points)} نقطة في هذه الجولة`
        : undefined;
  return (
    <>
      {won || (!final && out === h.me) ? <Confetti /> : null}
      <ResultBanner
        tone={won || (!final && out === h.me) ? 'good' : 'neutral'}
        art={
          <Row gap={-12} style={{ direction: 'ltr', paddingBottom: 4 }}>
            <View style={{ transform: [{ rotate: '-12deg' }, { translateY: 4 }] }}>
              <FrenchFace card={{ id: 'a', suit: 'H', rank: 7 }} width={44} />
            </View>
            <FrenchFace card={{ id: 'j', suit: null, rank: 0 }} width={44} />
            <View style={{ transform: [{ rotate: '12deg' }, { translateY: 4 }] }}>
              <FrenchFace card={{ id: 'b', suit: 'H', rank: 9 }} width={44} />
            </View>
          </Row>
        }
        title={title}
        sub={sub}
      />
      {final ? <Podium players={view.participants.map((id) => h.player(id))} scores={pick(view.scores, view.active)} lowIsBetter /> : null}
      <View style={{ gap: 6 }}>
        <Txt v="small" center color={C.muted}>
          المجموع — من يبلغ {num(view.limit)} تنتهي اللعبة، والأقل يفوز
        </Txt>
        <Scoreboard players={room.players} scores={pick(view.scores, view.active)} lowIsBetter highlight={h.me} />
      </View>
      {view.roundSummary ? (
        <HandRows
          title={
            view.variant === 'sample'
              ? `الجولة ${num(view.round)} — سامبل: 100 على كل من لم يخرج`
              : `الجولة ${num(view.round)} — كل ورقة 10، الجوكر 20، وبلا نزول 100${view.sec ? ' (رامي سيك: 200 والضعف)' : ''}`
          }
          rows={view.roundSummary.map((r) => ({
            key: r.id,
            players: [h.player(r.id)],
            name: h.player(r.id).name,
            detail: rowDetail(r, view.sec),
            points: num(`+${r.points}`),
            tone: r.status === 'out' ? 'good' : r.points ? 'bad' : 'dim',
            extra: <CardStrip row={r} />,
          }))}
        />
      ) : null}
      {final ? (
        <PlayAgain room={room} />
      ) : (
        <View style={{ gap: 10 }}>
          <TimerBar endsAt={view.nextAt} total={RAMI_ROUND_END_MS} />
          {h.isHost ? <Btn size="xl" icon="cards" label="الجولة التالية" onPress={() => h.act('next')} /> : <HostNote>الجولة التالية تبدأ تلقائياً، أو عندما يوزّع المضيف</HostNote>}
        </View>
      )}
    </>
  );
}

const pick = (scores: Record<string, number>, ids: string[]) => Object.fromEntries(ids.map((id) => [id, scores[id] ?? 0]));

/* ------------------------------------------------------------------ */
/* Lobby settings                                                      */
/* ------------------------------------------------------------------ */

export function RamiSettings({ room, editable }: { room: RoomView; editable: boolean }) {
  const s = room.settings.rami;
  const change = (patch: Record<string, unknown>) => client.roomAction({ type: 'settings', game: 'rami', patch });
  const talaj = s.variant !== 'sample';
  return (
    <View style={{ gap: 10 }}>
      <Txt v="bold">طريقة اللعب</Txt>
      <ChipPicker
        editable={editable}
        value={talaj ? 'talaj' : 'sample'}
        onChange={(x) => change({ variant: x })}
        options={[
          { key: 'talaj', label: 'التلّاج' },
          { key: 'sample', label: 'سامبل' },
        ]}
      />
      <Txt v="tiny" color={C.muted}>
        {talaj
          ? `14 ورقة لكل لاعب. أول نزلة تبلغ ${s.open} نقطة من تشكيلات فرانك، وفيها تيرسي فرانك وسويفي فرانك.`
          : '13 ورقة لكل لاعب. لا حدّ للنقاط، لكن لا نزول إلا للخروج: تنزّل يدك كاملة دفعة واحدة.'}
      </Txt>
      {talaj ? (
        <>
          <Txt v="bold">حدّ أول نزلة</Txt>
          <ChipPicker
            editable={editable}
            value={String(s.open) as '71' | '51'}
            onChange={(x) => change({ open: Number(x) })}
            options={[
              { key: '71', label: '71 نقطة' },
              { key: '51', label: '51 نقطة' },
            ]}
          />
          <Toggle label="كل نزلة أولى تتجاوز أعلى نزلة سبقتها" value={s.ceiling} editable={editable} onChange={(x) => change({ ceiling: x })} />
        </>
      ) : null}
      <Txt v="bold">نهاية اللعبة</Txt>
      <ChipPicker
        editable={editable}
        value={String(s.limit) as '1000' | '500'}
        onChange={(x) => change({ limit: Number(x) })}
        options={[
          { key: '1000', label: '1000 نقطة' },
          { key: '500', label: '500 (قصيرة)' },
        ]}
      />
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
        من 2 إلى 6 لاعبين؛ أكملوا المقاعد بالبوتات إن شئتم. عندما ينتهي الوقت يسحب الحاسوب ورقة ويرمي ورقة بدلاً منك.
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  meld: { padding: 4, borderRadius: 10, borderWidth: 2, borderColor: 'rgba(255,255,255,0.14)', maxWidth: '100%' },
  meldFits: { borderColor: C.yellow, backgroundColor: alpha(C.yellow, 0.15) },
  badge: { position: 'absolute', top: -9, alignSelf: 'center', backgroundColor: C.yellow, borderRadius: 999, paddingHorizontal: 6 },
  backdrop: { flex: 1, backgroundColor: 'rgba(8,9,24,0.72)', alignItems: 'center', justifyContent: 'center', padding: 20, direction: 'rtl' },
  picker: { backgroundColor: C.bg2, borderRadius: 24, padding: 18, gap: 10, width: '100%', maxWidth: 380 },
});
