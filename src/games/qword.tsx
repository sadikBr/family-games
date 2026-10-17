/**
 * «كلمة قرآنية» — race to find a hidden 5-letter word of the Quran. Same grid and Arabic on-screen keyboard as
 * «كلمة السر» (KEY_ROWS from shared/wordle), plus the kind of word as a hint, and after each round a verse
 * where the word appears (Amiri Quran font) with its reference.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Icon } from '@/art/icons';
import { client, useClient } from '@/lib/client';
import { haptic } from '@/lib/sfx';
import type { QwordSettings as Settings, QwordView } from '@/shared/games/qword';
import type { RoomView, WordleMark } from '@/shared/protocol';
import { KEY_ROWS } from '@/shared/wordle';
import { C, F, alpha } from '@/theme';
import { Avatar, Row } from '@/ui/bits';
import { Stepper, Toggle } from '@/ui/controls';
import { Shake, TimerBar } from '@/ui/fun';
import { useContentWidth } from '@/ui/screen';
import { Txt, num } from '@/ui/txt';

import { Spectator } from './common';
import { helpers } from './helpers';
import { McqFinal, RoundHeader } from './islamic-ui';

const MARK_BG: Record<WordleMark, string> = { g: '#2FB67C', y: '#F2B33D', x: '#5B6080' };
const RANK: Record<WordleMark, number> = { g: 3, y: 2, x: 1 };

function Tile({ ch, mark, size, active }: { ch: string; mark?: WordleMark; size: number; active?: boolean }) {
  return (
    <View style={[styles.tile, { width: size, height: size }, mark ? { backgroundColor: MARK_BG[mark], borderColor: MARK_BG[mark] } : ch ? styles.tileFilled : null, active && !ch && styles.tileActive]}>
      <Txt style={{ fontFamily: F.display, fontSize: size * 0.5, lineHeight: size * 0.75, color: mark ? '#FFFFFF' : C.text }}>{ch}</Txt>
    </View>
  );
}

export function QwordGame({ room, view }: { room: RoomView; view: QwordView }) {
  const h = helpers(room);
  const contentWidth = useContentWidth();
  const { height } = useWindowDimensions();
  const [typed, setTyped] = useState<{ key: string; text: string }>({ key: '', text: '' });
  const { error } = useClient();
  if (view.phase === 'final') return <McqFinal room={room} scores={view.scores} game="qword" h={h} />;
  if (!(h.me in view.scores)) return <Spectator room={room} />;

  const rowKey = `${view.round}:${view.myRows.length}`;
  const text = typed.key === rowKey ? typed.text : '';
  const letters = [...text];
  const solved = view.myRows.some((r) => r.marks.every((m) => m === 'g'));
  const out = solved || view.myRows.length >= view.maxTries;
  const playing = view.phase === 'play' && !out;
  // the grid shrinks a little once the round is over, to leave room for the verse
  // and on short screens, so the keyboard stays in view under the six rows
  const tile = Math.max(34, Math.min(view.phase === 'reveal' ? 40 : 54, (contentWidth - 30) / view.length, (height - 390) / 6.5));
  // the keyboard has 6px padding and 4px gaps: 11 keys on the top rows, 8 keys + enter + delete on the last
  const keysW = contentWidth - 12;
  const keyW = Math.floor(Math.min(36, (keysW - 10 * 4) / 11));
  const wideW = Math.floor(Math.min(64, (keysW - 9 * 4 - 8 * keyW) / 2));

  // best colour seen for each letter, for the keyboard
  const best: Record<string, WordleMark> = {};
  for (const r of view.myRows)
    [...r.guess].forEach((ch, i) => {
      const m = r.marks[i];
      if (!best[ch] || RANK[m] > RANK[best[ch]]) best[ch] = m;
    });

  const press = (k: string) => {
    if (!playing) return;
    haptic.tap();
    if (k === 'del') setTyped({ key: rowKey, text: letters.slice(0, -1).join('') });
    else if (k === 'enter') {
      // the typed word stays until the server accepts it (a new row clears it)
      if (letters.length === view.length) h.act('guess', { word: text });
    } else if (letters.length < view.length) setTyped({ key: rowKey, text: text + k });
  };

  return (
    <>
      <RoundHeader
        label={view.hint ?? 'كلمة من القرآن'}
        round={view.round}
        rounds={view.rounds}
        right={
          view.race ? (
            <Txt v="tiny" color={C.orange}>
              سباق
            </Txt>
          ) : undefined
        }
      />
      {view.phase === 'play' ? <TimerBar endsAt={view.endsAt} total={view.timerTotal} /> : null}
      {view.hurried ? (
        <Txt v="small" center color={C.yellow}>
          نصف اللاعبين أنهوا — بقيت دقيقة على الأكثر
        </Txt>
      ) : null}

      <View style={{ gap: 6, alignItems: 'center' }}>
        {Array.from({ length: view.maxTries }, (_, r) => {
          const row = view.myRows[r];
          const current = r === view.myRows.length && playing;
          if (view.phase === 'reveal' && !row) return null;
          const tiles = (
            <Row gap={6}>
              {Array.from({ length: view.length }, (_, i) => (
                <Tile key={i} size={tile} ch={row ? [...row.guess][i] : current ? (letters[i] ?? '') : ''} mark={row?.marks[i]} active={current && i === letters.length} />
              ))}
            </Row>
          );
          return current ? (
            <Shake key={r} trigger={error?.id}>
              {tiles}
            </Shake>
          ) : (
            <View key={r}>{tiles}</View>
          );
        })}
      </View>

      {out && view.phase === 'play' ? (
        <Animated.View entering={FadeIn.duration(200)}>
          <Txt v="bold" center color={solved ? C.green : C.orange}>
            {solved ? `أحسنت! وجدتها في ${num(view.myRows.length)} محاولات — في انتظار الآخرين` : `انتهت محاولاتك — الكلمة: «${view.answer ?? ''}»`}
          </Txt>
        </Animated.View>
      ) : null}

      {view.phase === 'reveal' ? (
        <Animated.View entering={FadeIn.duration(220)} style={{ gap: 8 }}>
          <Txt v="title" center color={C.yellow}>
            الكلمة: «{view.answer}»
          </Txt>
          {view.verse ? (
            <View style={styles.verseCard}>
              <Txt style={styles.verse}>﴿{view.verse.text}﴾</Txt>
              <Txt v="small" center color={C.yellow}>
                {view.verse.ref}
              </Txt>
            </View>
          ) : null}
          {view.results
            ? [...view.results]
                .sort((x, y) => y.points - x.points)
                .map((r) => (
                  <Row key={r.id} gap={8} style={styles.result}>
                    <Avatar player={h.player(r.id)} size={26} />
                    <Txt v="bold" style={{ flex: 1 }} numberOfLines={1}>
                      {h.player(r.id).name}
                    </Txt>
                    <Txt v="tiny" color={C.muted}>
                      {r.tries === null ? 'لم يجدها' : `${num(r.tries)} محاولات`}
                    </Txt>
                    <Txt style={{ fontFamily: F.black, fontSize: 15, lineHeight: 22, color: r.points ? C.green : C.dim, minWidth: 48, textAlign: 'center' }}>
                      {r.points ? `+${num(r.points)}` : '0'}
                    </Txt>
                  </Row>
                ))
            : null}
        </Animated.View>
      ) : null}

      {playing ? (
        <View style={styles.keyboard}>
          {KEY_ROWS.map((row, ri) => (
            <Row key={ri} gap={4} center>
              {ri === 2 ? (
                <Pressable onPress={() => press('enter')} style={[styles.key, { width: wideW }, letters.length === view.length && { backgroundColor: C.green }]} accessibilityLabel="إدخال">
                  {wideW >= 50 ? (
                    <Txt v="bold" size={13}>
                      إدخال
                    </Txt>
                  ) : (
                    <Icon name="check" size={18} color={C.text} />
                  )}
                </Pressable>
              ) : null}
              {row.map((k) => (
                <Pressable key={k} onPress={() => press(k)} style={[styles.key, { width: keyW }, best[k] && { backgroundColor: MARK_BG[best[k]] }]} accessibilityLabel={k}>
                  <Txt style={{ fontFamily: F.display, fontSize: 18, lineHeight: 28, color: '#FFFFFF' }}>{k}</Txt>
                </Pressable>
              ))}
              {ri === 2 ? (
                <Pressable onPress={() => press('del')} style={[styles.key, { width: wideW }]} accessibilityLabel="مسح">
                  <Icon name="back" size={18} color={C.text} />
                </Pressable>
              ) : null}
            </Row>
          ))}
        </View>
      ) : null}

      {view.others.length && view.phase === 'play' ? (
        <Row gap={10} wrap center>
          {view.others.map((o) => (
            <View key={o.id} style={styles.other}>
              <Avatar player={h.player(o.id)} size={22} badge={o.solved ? 'check' : undefined} />
              <View style={{ gap: 2 }}>
                {Array.from({ length: Math.max(1, o.rows.length) }, (_, r) => (
                  <Row key={r} gap={2}>
                    {Array.from({ length: view.length }, (_, i) => (
                      <View key={i} style={[styles.mini, o.rows[r] ? { backgroundColor: MARK_BG[o.rows[r][i]] } : null]} />
                    ))}
                  </Row>
                ))}
              </View>
            </View>
          ))}
        </Row>
      ) : null}
    </>
  );
}

/** Lobby settings: number of words, race mode, the hint. */
export function QwordSettings({ room, editable }: { room: RoomView; editable: boolean }) {
  const s = room.settings.qword;
  const change = (patch: Partial<Settings>) => client.roomAction({ type: 'settings', game: 'qword', patch });
  return (
    <View style={{ gap: 10 }}>
      <Stepper label="عدد الكلمات" value={s.rounds} min={1} max={10} editable={editable} onChange={(rounds) => change({ rounds })} />
      <Toggle label="سباق: تنتهي الجولة حين يجد أحدهم الكلمة" value={s.race} editable={editable} onChange={(race) => change({ race })} />
      <Toggle label="تلميح: نوع الكلمة (نبي، سورة، مكان…)" value={s.hint} editable={editable} onChange={(hint) => change({ hint })} />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 2, borderColor: C.borderStrong, backgroundColor: C.surface },
  tileFilled: { borderColor: alpha('#FFFFFF', 0.55) },
  tileActive: { borderColor: C.yellow },
  keyboard: { gap: 5, backgroundColor: C.bg3, borderRadius: 16, padding: 6 },
  key: { height: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surfaceStrong },
  other: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: C.surface, borderRadius: 12, padding: 6 },
  result: { backgroundColor: C.surface, borderRadius: 14, paddingVertical: 6, paddingHorizontal: 10 },
  mini: { width: 9, height: 9, borderRadius: 2, backgroundColor: C.surfaceStrong },
  verseCard: { backgroundColor: '#0F4D3A', borderRadius: 18, padding: 12, gap: 4, borderWidth: 2, borderColor: alpha('#F4C02E', 0.5) },
  verse: { fontFamily: F.quran, fontSize: 20, lineHeight: 42, color: '#FFF8E6', textAlign: 'center', writingDirection: 'rtl' },
});
