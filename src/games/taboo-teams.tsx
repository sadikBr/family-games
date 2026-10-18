/**
 * Team pieces shared by the party team games («ممنوع أن تقول», «تمثيل صامت», «ماذا قال الناس؟»,
 * «الكلمات السرية»), drawn in the same language as PlayerStrip: one chip per team (colour dot, name,
 * an optional line, the score), the team playing now framed and tinted in its colour.
 */
import type { ReactNode } from 'react';
import { View, useWindowDimensions } from 'react-native';

import type { PlayerPublic } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { Card, PlayerTag, Row } from '@/ui/bits';
import { Txt, num } from '@/ui/txt';

export interface TeamChip {
  name: string;
  color: string;
  score: number | string;
  /** one small line under the name («فريقك»، «كلمات متبقية»…) */
  sub?: string;
  active?: boolean;
}

/** Both teams side by side, like the players' strip. */
export function TeamStrip({ teams }: { teams: TeamChip[] }) {
  const { width } = useWindowDimensions();
  const narrow = width < 360;
  return (
    <Row gap={6}>
      {teams.map((t) => (
        <View
          key={t.name}
          accessibilityLabel={`${t.name}: ${t.score}`}
          style={{
            flex: 1,
            minWidth: 0,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingVertical: 6,
            paddingHorizontal: 10,
            borderRadius: 14,
            borderWidth: 1.5,
            borderColor: t.active ? t.color : C.border,
            backgroundColor: t.active ? alpha(t.color, 0.2) : C.surface,
          }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: t.color }} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt v="tiny" numberOfLines={1} style={{ fontSize: 13 }}>
              {narrow ? t.name.replace('الفريق ', '') : t.name}
            </Txt>
            {t.sub ? (
              <Txt v="tiny" color={C.muted} numberOfLines={1} style={{ fontSize: 11 }}>
                {t.sub}
              </Txt>
            ) : null}
          </View>
          <Txt style={{ fontFamily: F.display, fontSize: 22, lineHeight: 32, color: t.active ? C.text : C.yellow }}>
            {typeof t.score === 'number' ? num(t.score) : t.score}
          </Txt>
        </View>
      ))}
    </Row>
  );
}

/** One team while the teams are set up: its name and its players (the host taps a player to move them).
 * Children are the players' tags; mark me with `sub="(أنت)"` as everywhere else. */
export function TeamCard({ name, color, count, children }: { name: string; color: string; count: number; children: ReactNode }) {
  return (
    <Card outline={alpha(color, 0.55)} style={{ gap: 10 }}>
      <Row gap={8}>
        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: color }} />
        <Txt v="h3" style={{ flex: 1 }}>
          {name}
        </Txt>
        <Txt v="tiny" color={C.muted}>
          {num(count)}
        </Txt>
      </Row>
      <Row wrap gap={6} center>
        {children}
      </Row>
    </Card>
  );
}

/** The final breakdown: each team with its score and players, the winners crowned and framed. */
export function TeamResult({ teams, winner, me }: { teams: { name: string; color: string; score: number; players: PlayerPublic[] }[]; winner: number; me: string }) {
  return (
    <View style={{ gap: 10 }}>
      {teams.map((t, i) => (
        <Card key={t.name} outline={winner === i ? t.color : undefined} style={[{ gap: 10 }, winner === i ? { backgroundColor: alpha(t.color, 0.12) } : null]}>
          <Row gap={8}>
            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: t.color }} />
            <Txt v="h3" style={{ flex: 1 }} numberOfLines={1}>
              {t.name}
            </Txt>
            <Txt style={{ fontFamily: F.display, fontSize: 24, lineHeight: 34 }}>{num(t.score)}</Txt>
          </Row>
          <Row wrap gap={6} center>
            {t.players.map((p) => (
              <PlayerTag key={p.id} player={p} size={40} crown={winner === i} sub={p.id === me ? '(أنت)' : undefined} />
            ))}
          </Row>
        </Card>
      ))}
    </View>
  );
}
