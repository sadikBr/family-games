import { useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { GameArt } from '@/art/game-art';
import { Icon } from '@/art/icons';
import { haptic } from '@/lib/sfx';
import type { CodeColor, CodenamesView, RoomView } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { useAccent } from '@/ui/accent';
import { Avatar, Card, PlayerTag, Row } from '@/ui/bits';
import { Btn, IconBtn } from '@/ui/btn';
import { Field } from '@/ui/field';
import { Confetti, TimerBar } from '@/ui/fun';
import { Txt, num } from '@/ui/txt';
import { li } from '@/shared/li';

import { HostNote, PhaseTitle, PlayAgain, ResultBanner } from './common';
import { helpers, type Helpers } from './helpers';
import { TeamCard, TeamStrip } from './taboo-teams';

const TEAM = {
  red: { name: 'الفريق الأحمر', color: '#E2475F', soft: '#F7B3BF' },
  blue: { name: 'الفريق الأزرق', color: '#3D7BE0', soft: '#B5CCF5' },
} as const;
const CARD_BG: Record<CodeColor, string> = { red: '#E2475F', blue: '#3D7BE0', neutral: '#D9CDB0', assassin: '#1E1E2A' };

/** Words left to find for each team; the team playing now is framed. */
function TeamScores({ view }: { view: CodenamesView }) {
  return (
    <TeamStrip
      teams={(['red', 'blue'] as const).map((t) => ({
        name: TEAM[t].name,
        color: TEAM[t].color,
        score: view.left[t],
        sub: view.myTeam === t ? 'فريقك · متبقية' : 'كلمات متبقية',
        active: view.turn === t && view.phase !== 'final',
      }))}
    />
  );
}

/** The card revealed last (it keeps a ring until the next one is revealed). */
function lastRevealed(view: CodenamesView): number | null {
  for (let k = view.log.length - 1; k >= 0; k--) {
    const picks = view.log[k].picks;
    if (picks.length) {
      const i = view.words.indexOf(picks[picks.length - 1].word);
      return i >= 0 ? i : null;
    }
  }
  return null;
}

function Grid({ view, h, onCard, picking }: { view: CodenamesView; h: Helpers; onCard?: (i: number) => void; picking: number | null }) {
  const accent = useAccent();
  const narrow = useWindowDimensions().width < 360;
  const last = view.phase === 'final' ? null : lastRevealed(view);
  return (
    <View style={[styles.frame, { borderColor: alpha(accent, 0.35) }]}>
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
              last === i && { borderColor: C.yellow, borderWidth: 3, opacity: 1 },
            ]}>
            {spyView && color !== 'assassin' ? <View style={[styles.tint, { backgroundColor: alpha(CARD_BG[color], color === 'neutral' ? 0.0 : 0.35) }]} /> : null}
            <Txt
              numberOfLines={1}
              adjustsFontSizeToFit
              style={{ fontFamily: F.black, fontSize: narrow ? 12.5 : 14, lineHeight: 20, textAlign: 'center' }}
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
    </View>
  );
}

/** Compact list of the clues given so far, newest first. */
function ClueLog({ view }: { view: CodenamesView }) {
  if (!view.log.length) return null;
  return (
    <Card>
      <Txt v="h3">التلميحات</Txt>
      <View style={{ gap: 4 }}>
        {[...view.log].reverse().map((l, i) => (
          <Row key={view.log.length - i} gap={6} wrap>
            <View style={[styles.dot, { backgroundColor: TEAM[l.team].color }]} />
            <Txt v="bold">
              «{l.clue}» {l.n === 0 ? '∞' : num(l.n)}
            </Txt>
            {l.picks.map((p, j) => (
              <View key={j} style={[styles.pick, { backgroundColor: CARD_BG[p.color] }]}>
                <Txt v="tiny" color={p.color === 'neutral' ? C.ink : '#FFFFFF'}>
                  {p.word}
                </Txt>
              </View>
            ))}
          </Row>
        ))}
      </View>
    </Card>
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
        {view.notice ? (
          <Card color={alpha(C.red, 0.18)}>
            <Txt v="bold" center>
              {view.notice}
            </Txt>
          </Card>
        ) : null}
        {(['red', 'blue'] as const).map((t) => (
          <TeamCard key={t} name={TEAM[t].name} color={TEAM[t].color} count={view.teams[t].length}>
            {view.teams[t].map((id) => (
              <View key={id} style={{ alignItems: 'center' }}>
                <PlayerTag
                  player={h.player(id)}
                  size={50}
                  crown={view.spymasters[t] === id}
                  sub={view.spymasters[t] === id ? (id === h.me ? 'القائد (أنت)' : 'القائد') : id === h.me ? '(أنت)' : undefined}
                  onPress={h.isHost ? () => h.act('swap', { id }) : undefined}
                />
                {h.isHost && view.spymasters[t] !== id ? <IconBtn icon="crown" size={28} label="اجعله قائداً" onPress={() => h.act('spymaster', { id })} /> : null}
              </View>
            ))}
          </TeamCard>
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
          title={view.winner ? `الفوز ${li(TEAM[view.winner].name)}` : 'انتهت اللعبة'}
          sub={view.reason === 'assassin' ? 'كشف الخصم الكلمة السوداء' : 'كشف كل كلماته'}
        />
        <TeamScores view={view} />
        <Grid view={view} h={h} picking={null} />
        {h.isHost ? <Btn size="lg" icon="refresh" label="جولة جديدة (القيادة تنتقل)" onPress={() => h.act('again')} /> : null}
        <PlayAgain room={room} />
      </>
    );
  }

  const myTurnTeam = view.myTeam === view.turn;
  const iGiveClue = view.phase === 'clue' && view.amSpymaster && myTurnTeam;
  const iGuess = view.phase === 'guess' && myTurnTeam && !view.amSpymaster;
  const canPass = !!view.log[view.log.length - 1]?.picks.length;
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
      {view.turnNote ? (
        <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(300)} style={[styles.note, { backgroundColor: TEAM[view.turnNote.team].color }]}>
          <Txt v="bold" center color="#FFFFFF">
            {TEAM[view.turnNote.team].name}: {view.turnNote.text}
          </Txt>
        </Animated.View>
      ) : null}
      {view.endsAt && view.seconds ? <TimerBar endsAt={view.endsAt} total={view.seconds * 1000} onTick={iGiveClue || iGuess} /> : null}
      <View style={[styles.banner, { backgroundColor: alpha(TEAM[view.turn].color, 0.22), borderColor: TEAM[view.turn].color }]}>
        {view.clue ? (
          <>
            <Txt v="small" color={C.muted}>
              تلميح {TEAM[view.turn].name}
            </Txt>
            <Txt v="title">
              «{view.clue.word}» {view.clue.n === 0 ? '∞' : num(view.clue.n)}
            </Txt>
          </>
        ) : (
          <Txt v="bold">
            {iGiveClue ? 'أنت القائد: أعط تلميحاً لفريقك' : `في انتظار تلميح ${h.player(view.spymasters[view.turn]).name} ل${TEAM[view.turn].name.slice(1)}`}
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
            <Txt style={{ fontFamily: F.display, fontSize: 26, lineHeight: 38, minWidth: 30, textAlign: 'center' }}>{n === 0 ? '∞' : num(n)}</Txt>
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
              اختر كلمة وتناقشوا، ثم اكشفها · محاولات متبقية: {view.guessesLeft >= 25 ? '∞' : num(view.guessesLeft)}
            </Txt>
          )}
          <Btn size="sm" ghost icon="skip" label={canPass ? 'أنهِ الدور' : 'اكشفوا كلمة قبل إنهاء الدور'} disabled={!canPass} onPress={() => h.act('pass')} />
        </View>
      ) : view.phase === 'guess' && !myTurnTeam ? (
        <Txt v="small" center color={C.muted}>
          {TEAM[view.turn].name} يخمّن الآن
        </Txt>
      ) : null}

      <ClueLog view={view} />
    </>
  );
}

const styles = StyleSheet.create({
  frame: { backgroundColor: C.bg3, borderRadius: 16, borderWidth: 1.5, padding: 4 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  banner: { borderRadius: 18, borderWidth: 2, padding: 12, alignItems: 'center', gap: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center', direction: 'rtl' },
  word: { flexBasis: '17%', flexGrow: 1, minWidth: 0, height: 58, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2, overflow: 'hidden' },
  note: { borderRadius: 14, paddingVertical: 6, paddingHorizontal: 12 },
  pick: { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 },
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
