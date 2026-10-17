/** Pieces shared by the Islamic quiz games: round header, answer buttons, results, final scores. */
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { GameArt } from '@/art/game-art';
import { Icon } from '@/art/icons';
import { haptic } from '@/lib/sfx';
import type { GameId, McqResult, RoomView } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { Avatar, Row } from '@/ui/bits';
import { Confetti, Podium, Scoreboard } from '@/ui/fun';
import { Txt, num } from '@/ui/txt';

import { PlayAgain, ResultBanner } from './common';
import type { Helpers } from './helpers';

export const OPTION_COLORS = [C.red, C.blue, C.yellow, C.green, C.purple, C.cyan];

export function RoundHeader({ label, round, rounds, right }: { label: string; round: number; rounds: number; right?: ReactNode }) {
  return (
    <Row gap={8} style={{ justifyContent: 'space-between' }}>
      <View style={styles.chip}>
        <Txt v="tiny" color={C.yellow}>
          {label}
        </Txt>
      </View>
      {right}
      <Txt v="tiny" color={C.muted}>
        {round > 0 ? `${num(round)} من ${num(rounds)}` : ''}
      </Txt>
    </Row>
  );
}

/**
 * Answer buttons. `mine` = what I picked, `correct` = revealed answer (null while asking).
 */
export function OptionGrid({
  options,
  mine,
  correct,
  disabled,
  onPick,
  columns = 2,
}: {
  options: string[];
  mine: number | null;
  correct: number | null;
  disabled?: boolean;
  onPick: (i: number) => void;
  columns?: 1 | 2;
}) {
  const locked = disabled || mine !== null || correct !== null;
  return (
    <View style={[styles.grid, columns === 1 && { flexDirection: 'column' }]}>
      {options.map((o, i) => {
        const isMine = mine === i;
        const isRight = correct === i;
        const wrongMine = correct !== null && isMine && !isRight;
        const dim = locked && !isMine && !isRight;
        const color = OPTION_COLORS[i % OPTION_COLORS.length];
        return (
          <Pressable
            key={i}
            disabled={locked}
            onPress={() => {
              haptic.medium();
              onPick(i);
            }}
            accessibilityRole="button"
            accessibilityLabel={o}
            style={({ pressed }) => [
              styles.option,
              columns === 2 ? styles.half : styles.full,
              { borderColor: isRight ? C.green : wrongMine ? C.red : isMine ? C.yellow : alpha(color, 0.55) },
              isRight && { backgroundColor: alpha(C.green, 0.25) },
              wrongMine && { backgroundColor: alpha(C.red, 0.22) },
              isMine && correct === null && { backgroundColor: alpha(C.yellow, 0.18) },
              dim && { opacity: 0.45 },
              pressed && { transform: [{ scale: 0.98 }] },
            ]}>
            <View style={[styles.optBar, { backgroundColor: color }]} />
            <Txt style={{ fontFamily: F.bold, fontSize: 16, lineHeight: 24, flex: 1, textAlign: 'center' }}>{o}</Txt>
            {isRight ? <Icon name="check" size={18} color={C.green} /> : wrongMine ? <Icon name="close" size={18} color={C.red} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Who answered so far (avatars). */
export function AnsweredRow({ ids, total, h }: { ids: string[]; total: number; h: Helpers }) {
  return (
    <Row gap={6} center wrap>
      <Txt v="tiny" color={C.muted}>
        أجاب {num(ids.length)} من {num(total)}
      </Txt>
      {ids.map((id) => (
        <Avatar key={id} player={h.player(id)} size={22} />
      ))}
    </Row>
  );
}

export function ResultsList({ results, h, options }: { results: McqResult[]; h: Helpers; options: string[] }) {
  const sorted = [...results].sort((a, b) => b.points - a.points);
  return (
    <Animated.View entering={FadeIn.duration(200)} style={{ gap: 6 }}>
      {sorted.map((r) => (
        <Row key={r.id} gap={8} style={styles.result}>
          <Avatar player={h.player(r.id)} size={26} />
          <Txt v="bold" style={{ flex: 1 }} numberOfLines={1}>
            {h.player(r.id).name}
          </Txt>
          <Txt v="tiny" color={C.muted} numberOfLines={1} style={{ maxWidth: 120 }}>
            {r.choice === null ? 'لم يُجب' : options[r.choice]}
          </Txt>
          <Txt style={{ fontFamily: F.black, fontSize: 15, lineHeight: 22, color: r.correct ? C.green : C.dim, minWidth: 48, textAlign: 'center' }}>
            {r.correct ? `+${num(r.points)}` : '0'}
          </Txt>
        </Row>
      ))}
    </Animated.View>
  );
}

export function McqFinal({ room, scores, game, h }: { room: RoomView; scores: Record<string, number>; game: GameId; h: Helpers }) {
  const best = Math.max(...Object.values(scores));
  const winners = Object.keys(scores).filter((id) => scores[id] === best);
  const won = winners.includes(h.me);
  return (
    <>
      {won ? <Confetti /> : null}
      <ResultBanner
        tone={won ? 'good' : 'neutral'}
        art={<GameArt id={game} size={84} />}
        title={winners.length === 1 ? `فاز ${h.player(winners[0]).name}` : 'تعادل!'}
        sub="بارك الله فيكم جميعاً"
      />
      <Podium players={room.players} scores={scores} />
      <Scoreboard players={room.players} scores={scores} highlight={h.me} />
      <PlayAgain room={room} />
    </>
  );
}

const styles = StyleSheet.create({
  chip: { backgroundColor: alpha(C.yellow, 0.14), borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  half: { flexBasis: '40%', flexGrow: 1, minWidth: 0 },
  full: { width: '100%' },
  option: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.surface,
    borderRadius: 16,
    borderWidth: 2.5,
    paddingVertical: 8,
    paddingHorizontal: 10,
    overflow: 'hidden',
  },
  optBar: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 6 },
  result: { backgroundColor: C.surface, borderRadius: 14, paddingVertical: 6, paddingHorizontal: 10 },
});
