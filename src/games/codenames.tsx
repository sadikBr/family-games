import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { GameArt } from '@/art/game-art';
import { Icon } from '@/art/icons';
import { haptic } from '@/lib/sfx';
import type { CodeColor, CodenamesView, RoomView } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { Avatar, Card, PlayerTag, Row } from '@/ui/bits';
import { Btn, IconBtn } from '@/ui/btn';
import { Field } from '@/ui/field';
import { Confetti } from '@/ui/fun';
import { Txt } from '@/ui/txt';

import { HostNote, PhaseTitle, PlayAgain, ResultBanner } from './common';
import { helpers, type Helpers } from './helpers';

const TEAM = {
  red: { name: 'الفريق الأحمر', color: '#E2475F', soft: '#F7B3BF' },
  blue: { name: 'الفريق الأزرق', color: '#3D7BE0', soft: '#B5CCF5' },
} as const;
const CARD_BG: Record<CodeColor, string> = { red: '#E2475F', blue: '#3D7BE0', neutral: '#D9CDB0', assassin: '#1E1E2A' };

function TeamScores({ view }: { view: CodenamesView }) {
  return (
    <Row gap={8}>
      {(['red', 'blue'] as const).map((t) => (
        <View key={t} style={[styles.score, { borderColor: view.turn === t && view.phase !== 'final' ? TEAM[t].color : 'transparent' }]}>
          <View style={[styles.dot, { backgroundColor: TEAM[t].color }]} />
          <Txt v="small" style={{ flex: 1 }} numberOfLines={1}>
            {TEAM[t].name}
          </Txt>
          <Txt style={{ fontFamily: F.display, fontSize: 22, lineHeight: 32 }}>{view.left[t]}</Txt>
        </View>
      ))}
    </Row>
  );
}

function Grid({ view, h, onCard, picking }: { view: CodenamesView; h: Helpers; onCard?: (i: number) => void; picking: number | null }) {
  return (
    <View style={styles.grid}>
      {view.words.map((w, i) => {
        const color = view.colors[i];
        const revealed = view.revealed[i];
        const who = Object.entries(view.proposals).filter(([, v]) => v === i).map(([id]) => id);
        const spyView = !revealed && color && view.amSpymaster;
        const bg = revealed && color ? CARD_BG[color] : spyView && color === 'assassin' ? '#2A2A38' : '#F6EEDC';
        const hintBorder = !revealed && color ? CARD_BG[color] : '#151726';
        return (
          <Pressable
            key={i}
            disabled={!onCard || revealed}
            onPress={() => {
              haptic.tap();
              onCard?.(i);
            }}
            style={[
              styles.word,
              { backgroundColor: bg, borderColor: picking === i ? C.yellow : hintBorder, borderWidth: picking === i ? 3 : !revealed && color ? 3 : 1.5 },
              revealed && { opacity: 0.92 },
            ]}>
            {spyView && color !== 'assassin' ? <View style={[styles.tint, { backgroundColor: alpha(CARD_BG[color], color === 'neutral' ? 0.0 : 0.35) }]} /> : null}
            <Txt
              numberOfLines={1}
              adjustsFontSizeToFit
              style={{ fontFamily: F.black, fontSize: 14, lineHeight: 20, textAlign: 'center' }}
              color={revealed ? (color === 'neutral' ? C.ink : '#FFFFFF') : spyView && color === 'assassin' ? '#FFFFFF' : C.ink}>
              {w}
            </Txt>
            {revealed && color === 'assassin' ? <Icon name="skull" size={14} color="#fff" /> : null}
            {who.length ? (
              <View style={styles.who}>
                {who.slice(0, 3).map((id) => (
                  <Avatar key={id} player={h.player(id)} size={16} />
                ))}
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export function CodenamesGame({ room, view }: { room: RoomView; view: CodenamesView }) {
  const h = helpers(room);
  const [clue, setClue] = useState('');
  const [n, setN] = useState(1);
  const [picking, setPicking] = useState<number | null>(null);

  if (view.phase === 'teams') {
    return (
      <>
        <PhaseTitle icon="users" title="الفرق والقادة" sub={h.isHost ? 'اضغط على لاعب لنقله، وعلى التاج لجعله قائداً' : 'المضيف يجهّز الفرق'} />
        {(['red', 'blue'] as const).map((t) => (
          <Card key={t} outline={alpha(TEAM[t].color, 0.7)}>
            <Row gap={8}>
              <View style={[styles.dot, { backgroundColor: TEAM[t].color }]} />
              <Txt v="h2">{TEAM[t].name}</Txt>
            </Row>
            <Row wrap gap={8} center>
              {view.teams[t].map((id) => (
                <View key={id} style={{ alignItems: 'center' }}>
                  <PlayerTag player={h.player(id)} size={50} crown={view.spymasters[t] === id} sub={view.spymasters[t] === id ? 'القائد' : undefined} onPress={h.isHost ? () => h.act('swap', { id }) : undefined} />
                  {h.isHost && view.spymasters[t] !== id ? <IconBtn icon="crown" size={28} label="اجعله قائداً" onPress={() => h.act('spymaster', { id })} /> : null}
                </View>
              ))}
            </Row>
          </Card>
        ))}
        {h.isHost ? (
          <>
            <Btn size="md" ghost icon="shuffle" label="خلط الفرق" onPress={() => h.act('shuffle')} />
            <Btn size="xl" icon="play" label="ابدأ" color={C.green} onPress={() => h.act('begin')} />
          </>
        ) : (
          <HostNote>في انتظار المضيف</HostNote>
        )}
      </>
    );
  }

  if (view.phase === 'final') {
    const won = view.winner === view.myTeam;
    return (
      <>
        {won ? <Confetti /> : null}
        <ResultBanner
          tone={won ? 'good' : 'bad'}
          art={<GameArt id="codenames" size={84} />}
          title={view.winner ? `فاز ${TEAM[view.winner].name}` : 'انتهت اللعبة'}
          sub={view.reason === 'assassin' ? 'كشف الخصم الكلمة السوداء' : 'كشف كل كلماته'}
        />
        <Grid view={view} h={h} picking={null} />
        {h.isHost ? <Btn size="lg" icon="refresh" label="جولة جديدة (القيادة تنتقل)" onPress={() => h.act('again')} /> : null}
        <PlayAgain room={room} />
      </>
    );
  }

  const myTurnTeam = view.myTeam === view.turn;
  const iGiveClue = view.phase === 'clue' && view.amSpymaster && myTurnTeam;
  const iGuess = view.phase === 'guess' && myTurnTeam && !view.amSpymaster;
  const onCard = iGuess
    ? (i: number) => {
        if (picking === i) return;
        setPicking(i);
        h.act('point', { index: i });
      }
    : undefined;

  return (
    <>
      <TeamScores view={view} />
      <View style={[styles.banner, { backgroundColor: alpha(TEAM[view.turn].color, 0.22), borderColor: TEAM[view.turn].color }]}>
        {view.clue ? (
          <>
            <Txt v="small" color={C.muted}>
              تلميح {TEAM[view.turn].name}
            </Txt>
            <Txt v="title">
              «{view.clue.word}» {view.clue.n === 0 ? '∞' : view.clue.n}
            </Txt>
          </>
        ) : (
          <Txt v="bold">
            {iGiveClue ? 'أنت القائد: أعط تلميحاً لفريقك' : `ينتظر تلميح قائد ${TEAM[view.turn].name}`}
          </Txt>
        )}
      </View>

      {view.amSpymaster ? (
        <Txt v="tiny" center color={C.dim}>
          أنت القائد: ترى ألوان كل الكلمات — لا تُرِها لأحد
        </Txt>
      ) : null}

      <Grid view={view} h={h} onCard={onCard} picking={iGuess ? picking : null} />

      {iGiveClue ? (
        <Card>
          <Field value={clue} onChangeText={setClue} placeholder="كلمة واحدة" placeholderTextColor={C.dim} style={styles.input} maxLength={24} autoCorrect={false} />
          <Row gap={10}>
            <IconBtn icon="minus" size={40} label="أقل" onPress={() => setN(Math.max(0, n - 1))} />
            <Txt style={{ fontFamily: F.display, fontSize: 26, lineHeight: 38, minWidth: 30, textAlign: 'center' }}>{n === 0 ? '∞' : n}</Txt>
            <IconBtn icon="plus" size={40} label="أكثر" onPress={() => setN(Math.min(9, n + 1))} />
            <Btn
              flex
              size="md"
              icon="chat"
              label="أعطِ التلميح"
              disabled={!clue.trim() || /\s/.test(clue.trim())}
              onPress={() => {
                h.act('clue', { word: clue.trim(), n });
                setClue('');
              }}
            />
          </Row>
        </Card>
      ) : null}

      {iGuess ? (
        <View style={{ gap: 8 }}>
          {picking !== null && !view.revealed[picking] ? (
            <Btn
              size="lg"
              icon="eye"
              label={`اكشف «${view.words[picking]}»`}
              color={TEAM[view.turn].color}
              onPress={() => {
                h.act('reveal', { index: picking });
                setPicking(null);
              }}
            />
          ) : (
            <Txt v="small" center color={C.muted}>
              اختر كلمة وتناقشوا، ثم اكشفها · محاولات متبقية: {view.guessesLeft >= 25 ? '∞' : view.guessesLeft}
            </Txt>
          )}
          <Btn size="sm" ghost icon="skip" label="أنهِ الدور" onPress={() => h.act('pass')} />
        </View>
      ) : view.phase === 'guess' && !myTurnTeam ? (
        <Txt v="small" center color={C.muted}>
          {TEAM[view.turn].name} يخمّن الآن
        </Txt>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  score: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.surface, borderRadius: 16, paddingVertical: 3, paddingHorizontal: 12, borderWidth: 2 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  banner: { borderRadius: 18, borderWidth: 2, padding: 12, alignItems: 'center', gap: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center', direction: 'rtl' },
  word: { width: '18.4%', height: 58, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3, overflow: 'hidden' },
  tint: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  who: { position: 'absolute', bottom: 2, flexDirection: 'row', gap: -4 },
  input: {
    fontFamily: F.bold,
    fontSize: 19,
    color: C.text,
    backgroundColor: C.bg3,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 8,
    writingDirection: 'rtl',
    borderWidth: 2,
    borderColor: C.border,
  },
});
