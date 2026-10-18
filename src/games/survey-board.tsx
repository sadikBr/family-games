/** «ماذا قال الناس؟» — the answer board: slots that flip open, the strikes, the round's points. */
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';

import { Icon } from '@/art/icons';
import type { SurveySlot, SurveyView } from '@/shared/games/survey';
import { C, F, alpha } from '@/theme';
import { useAccent } from '@/ui/accent';
import { Row } from '@/ui/bits';
import { Txt, num } from '@/ui/txt';

import { TEAM } from './helpers';
import { TeamStrip } from './taboo-teams';

export const BOARD_BG = '#14183D';
const TILE = '#2B3170';
/** gold for the ranks and the points (the frames take the game's own colour) */
const GOLD = '#F2B33D';

/** One answer slot: a numbered tile that flips (around its horizontal axis) to show the answer. */
function Slot({ slot, rank, height, hot }: { slot: SurveySlot; rank: number; height: number; hot?: boolean }) {
  const open = slot.text !== null;
  const turn = useSharedValue(open ? 1 : 0);
  useEffect(() => {
    turn.set(withTiming(open ? 1 : 0, { duration: open ? 520 : 0, easing: Easing.out(Easing.cubic) }));
  }, [open, turn]);
  // first half: the closed face folds away; second half: the answer unfolds
  const closedStyle = useAnimatedStyle(() => ({
    opacity: turn.get() < 0.5 ? 1 : 0,
    transform: [{ perspective: 600 }, { rotateX: `${Math.min(90, turn.get() * 180)}deg` }],
  }));
  const openStyle = useAnimatedStyle(() => ({
    opacity: turn.get() >= 0.5 ? 1 : 0,
    transform: [{ perspective: 600 }, { rotateX: `${Math.max(0, 180 - turn.get() * 180)}deg` }],
  }));
  const found = slot.found;
  const tint = found === null ? alpha('#FFFFFF', 0.08) : alpha(TEAM[found].color, 0.32);
  const edge = found === null ? C.borderStrong : TEAM[found].color;
  return (
    <View style={{ height }}>
      <Animated.View style={[styles.slot, styles.closed, { height }, closedStyle]}>
        <View style={[styles.rankBig, { width: height - 8, height: height - 8, borderRadius: (height - 8) / 2 }]}>
          <Txt style={{ fontFamily: F.display, fontSize: height * 0.45, lineHeight: height * 0.68, color: C.ink }}>{num(rank)}</Txt>
        </View>
      </Animated.View>
      <Animated.View style={[styles.slot, styles.openFace, { height, backgroundColor: tint, borderColor: hot ? GOLD : edge }, hot && styles.hot, openStyle]}>
        <View style={styles.rankSmall}>
          <Txt v="tiny" color={C.ink}>
            {num(rank)}
          </Txt>
        </View>
        <Txt v="h3" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ flex: 1 }} color={found === null ? C.muted : C.text}>
          {slot.text ?? ''}
        </Txt>
        <View style={[styles.points, { backgroundColor: found === null ? C.surfaceStrong : GOLD }]}>
          <Txt style={{ fontFamily: F.black, fontSize: 16, lineHeight: 24, color: found === null ? C.muted : C.ink }}>{num(slot.points ?? 0)}</Txt>
        </View>
      </Animated.View>
    </View>
  );
}

/** Three strike boxes; the used ones turn red. */
export function Strikes({ count }: { count: number }) {
  return (
    <Row gap={6}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={[styles.strike, i < count && styles.strikeOn]}>
          <Icon name="close" size={16} color={i < count ? '#FFFFFF' : C.dim} />
        </View>
      ))}
    </Row>
  );
}

/** A big ✗ that flashes over the board after a wrong answer (keyed by the event id). */
function BigStrike({ id, count }: { id: number | null; count: number }) {
  const o = useSharedValue(0);
  useEffect(() => {
    if (id === null) return;
    o.set(withSequence(withTiming(1, { duration: 120 }), withDelay(650, withTiming(0, { duration: 260 }))));
  }, [id, o]);
  const st = useAnimatedStyle(() => ({ opacity: o.get(), transform: [{ scale: 0.94 + 0.06 * o.get() }] }));
  return (
    <Animated.View pointerEvents="none" style={[styles.bigStrike, st]}>
      <Row gap={8} style={{ direction: 'ltr' }}>
        {Array.from({ length: Math.max(1, count) }, (_, i) => (
          <View key={i} style={styles.bigX}>
            <Icon name="close" size={54} color="#FFFFFF" />
          </View>
        ))}
      </Row>
    </Animated.View>
  );
}

export function Board({ view, width, compact }: { view: SurveyView; width: number; compact?: boolean }) {
  const accent = useAccent();
  const n = view.slots.length;
  const height = compact ? 34 : width < 340 ? 40 : 44;
  const miss = view.last && (view.last.kind === 'miss' || view.last.kind === 'timeout') ? view.last.id : null;
  // the answer found last keeps a gold frame until the next answer
  const hot = view.last && view.last.kind === 'hit' ? view.last.slot : null;
  // in the face-off a miss is a single ✗; in play it shows how many strikes there are now
  const shownStrikes = view.phase === 'play' || view.phase === 'steal' ? view.strikes || 3 : 1;
  return (
    <View style={[styles.board, { borderColor: alpha(accent, 0.55) }]}>
      <View style={{ gap: compact ? 4 : 6 }}>
        {view.slots.map((slot, i) => (
          <Slot key={`${view.round}-${i}`} slot={slot} rank={i + 1} height={height} hot={hot === i} />
        ))}
      </View>
      <Row gap={8} style={{ justifyContent: 'space-between' }}>
        <Strikes count={view.strikes} />
        <Row gap={6}>
          <Txt v="tiny" color={C.muted}>
            نقاط الجولة
          </Txt>
          <Txt style={{ fontFamily: F.display, fontSize: 22, lineHeight: 32, color: GOLD }}>{num(view.bank)}</Txt>
          {view.multiplier > 1 ? (
            <View style={styles.mult}>
              <Txt v="tiny" color={C.ink}>
                {num(`×${view.multiplier}`)}
              </Txt>
            </View>
          ) : null}
        </Row>
      </Row>
      {n ? <BigStrike id={miss} count={shownStrikes} /> : null}
    </View>
  );
}

/** The question, with the «أشهر الأجوبة» label (the answers are the game's own estimates, not a poll). */
export function QuestionCard({ question, width }: { question: string | null; width: number }) {
  const accent = useAccent();
  return (
    <View style={[styles.question, { borderColor: alpha(accent, 0.45) }]}>
      <Txt v="tiny" center color={accent}>
        أشهر الأجوبة
      </Txt>
      <Txt v="h2" center style={{ fontSize: width < 340 ? 18 : 20, lineHeight: width < 340 ? 28 : 31 }}>
        {question}
      </Txt>
    </View>
  );
}

/** Both team scores (the players' strip language); the team on the board — or stealing — is framed. */
export function TeamScores({ view, myTeam }: { view: SurveyView; myTeam: 0 | 1 | null }) {
  return (
    <TeamStrip
      teams={([0, 1] as const).map((t) => ({
        name: TEAM[t].name,
        color: TEAM[t].color,
        score: view.scores[t],
        sub: myTeam === t ? 'فريقك' : undefined,
        active:
          (view.control === t && (view.phase === 'play' || view.phase === 'steal')) ||
          (view.phase === 'steal' && view.control !== null && view.control !== t),
      }))}
    />
  );
}

const styles = StyleSheet.create({
  board: {
    backgroundColor: BOARD_BG,
    borderRadius: 22,
    borderWidth: 2,
    padding: 12,
    gap: 10,
    overflow: 'hidden',
  },
  slot: {
    position: 'absolute',
    top: 0,
    start: 0,
    end: 0,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    gap: 8,
    backfaceVisibility: 'hidden',
  },
  closed: { backgroundColor: TILE, justifyContent: 'center', borderWidth: 1, borderColor: C.borderStrong },
  openFace: { borderWidth: 1.5 },
  hot: { borderWidth: 2.5 },
  rankBig: { width: 34, height: 34, borderRadius: 17, backgroundColor: GOLD, alignItems: 'center', justifyContent: 'center' },
  rankSmall: { width: 22, height: 22, borderRadius: 11, backgroundColor: alpha(GOLD, 0.85), alignItems: 'center', justifyContent: 'center' },
  points: { minWidth: 40, height: 26, borderRadius: 9, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  strike: { width: 28, height: 28, borderRadius: 8, borderWidth: 1.5, borderColor: C.borderStrong, alignItems: 'center', justifyContent: 'center' },
  strikeOn: { backgroundColor: C.red, borderColor: C.red },
  bigStrike: { position: 'absolute', top: 0, bottom: 0, start: 0, end: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(11,14,36,0.35)' },
  bigX: { width: 74, height: 74, borderRadius: 16, backgroundColor: C.red, borderWidth: 3, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  question: { backgroundColor: BOARD_BG, borderRadius: 18, paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1.5 },
  mult: { backgroundColor: GOLD, borderRadius: 8, paddingHorizontal: 6 },
});
