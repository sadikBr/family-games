/**
 * The strip under the room header during a game, the same in every game:
 * - whose turn it is: «دورك!» in the primary colour when the game waits for me, otherwise the
 *   player's avatar and name (it slides in again at every change of turn);
 * - under it, the last move the game announced («روبو لعب ٧ أوروص وأخذ ورقتين», see GameCtx.say), so a
 *   quick move by someone else is never missed.
 */
import { useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import type { PlayerPublic, RoomView } from '@/shared/protocol';
import { C, alpha } from '@/theme';
import { Avatar, Row } from '@/ui/bits';
import { Txt } from '@/ui/txt';

function turnText(room: RoomView, players: PlayerPublic[]) {
  const mine = room.turn.includes(room.me);
  const others = players.filter((p) => p.id !== room.me);
  const one = players.length === 1 ? players[0] : null;
  if (mine && players.length === 1) return 'دورك!';
  if (mine) return `دورك — ومعك ${others.map((p) => p.name).join('، ')}`;
  if (one) return one.bot || one.auto ? `دور ${one.name}… يفكّر` : `دور ${one.name}`;
  return `بانتظار: ${others.map((p) => p.name).join('، ')}`;
}

export function TurnBar({ room }: { room: RoomView }) {
  // a game that points at players keeps the pill's room during a short pause with nobody to point at
  // (a finished trick on show, a hand being counted), so the header doesn't shrink and grow
  const [pointed, setPointed] = useState(false);
  const turn = room.turn ?? [];
  const players = turn.map((id) => room.players.find((p) => p.id === id)).filter((p) => !!p);
  // everyone plays at the same moment (answers, votes): nobody to point at
  const everyone = turn.length > 1 && turn.length >= room.players.filter((p) => p.connected || p.bot).length;
  const showTurn = room.status === 'playing' && players.length > 0 && !everyone;
  if (showTurn !== pointed && (showTurn || everyone || room.status !== 'playing')) setPointed(showTurn);
  if (room.status !== 'playing') return null;
  const said = room.said;
  const by = said?.by ? room.players.find((p) => p.id === said.by) : undefined;
  const holdSpace = !showTurn && pointed;
  if (!showTurn && !said && !holdSpace) return null;

  const mine = turn.includes(room.me);
  const one = players.length === 1 ? players[0] : null;
  const text = showTurn ? turnText(room, players) : '';

  return (
    <View style={{ paddingHorizontal: 16, paddingBottom: 6, gap: 4 }}>
      {showTurn ? (
        <Animated.View
          key={turn.join('|')}
          entering={FadeInDown.duration(260)}
          accessibilityLiveRegion="polite"
          accessibilityLabel={text}
          style={{
            borderRadius: 14,
            paddingVertical: 5,
            paddingHorizontal: 10,
            backgroundColor: mine ? C.yellow : alpha(one?.color ?? C.surfaceStrong, 0.22),
            borderWidth: 1.5,
            borderColor: mine ? C.yellow : alpha(one?.color ?? C.muted, 0.6),
          }}>
          <Row gap={8} style={{ justifyContent: 'center' }}>
            {players.slice(0, 4).map((p) => (
              <Avatar key={p.id} player={p} size={24} />
            ))}
            <Txt v="bold" numberOfLines={1} color={mine ? C.ink : C.text} style={{ flexShrink: 1 }}>
              {text}
            </Txt>
          </Row>
        </Animated.View>
      ) : holdSpace ? (
        <View style={{ height: 24 + 10 + 3 }} />
      ) : null}
      {said ? (
        <Animated.View key={said.id} entering={FadeIn.duration(220)} accessibilityLiveRegion="polite">
          <Row gap={6} style={{ justifyContent: 'center' }}>
            {by ? <Avatar player={by} size={18} /> : null}
            <Txt v="small" color={C.muted} numberOfLines={2} center style={{ flexShrink: 1 }}>
              {said.text}
            </Txt>
          </Row>
        </Animated.View>
      ) : null}
    </View>
  );
}
