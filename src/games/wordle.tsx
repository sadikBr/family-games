/** «كلمة السر» — race to find the hidden 5-letter word. Arabic on-screen keyboard, no system keyboard needed. */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Icon } from '@/art/icons';
import { haptic } from '@/lib/sfx';
import type { RoomView, WordleMark, WordleView } from '@/shared/protocol';
import { KEY_ROWS } from '@/shared/wordle';
import { C, F, alpha } from '@/theme';
import { Avatar, Row } from '@/ui/bits';
import { TimerBar } from '@/ui/fun';
import { useContentWidth } from '@/ui/screen';
import { Txt, num } from '@/ui/txt';

import { Spectator } from './common';
import { helpers } from './helpers';
import { McqFinal, RoundHeader } from './islamic-ui';
import { useRefusedFlash } from './wordle-ui';

const MARK_BG: Record<WordleMark, string> = { g: '#2FB67C', y: '#F2B33D', x: '#5B6080' };
const RANK: Record<WordleMark, number> = { g: 3, y: 2, x: 1 };

function Tile({ ch, mark, size, active, bad }: { ch: string; mark?: WordleMark; size: number; active?: boolean; bad?: boolean }) {
  return (
    <View
      style={[
        styles.tile,
        { width: size, height: size },
        mark ? { backgroundColor: MARK_BG[mark], borderColor: MARK_BG[mark] } : ch ? styles.tileFilled : null,
        active && !ch && styles.tileActive,
        bad && styles.tileBad,
      ]}>
      <Txt style={{ fontFamily: F.display, fontSize: size * 0.5, lineHeight: size * 0.75, color: mark ? '#FFFFFF' : C.text }}>{ch}</Txt>
    </View>
  );
}

export function WordleGame({ room, view }: { room: RoomView; view: WordleView }) {
  const h = helpers(room);
  const contentWidth = useContentWidth();
  const [typed, setTyped] = useState<{ key: string; text: string }>({ key: '', text: '' });
  const refused = useRefusedFlash();
  if (view.phase === 'final') return <McqFinal room={room} scores={view.scores} game="wordle" h={h} />;
  if (!(h.me in view.scores)) return <Spectator room={room} />;

  const rowKey = `${view.round}:${view.myRows.length}`;
  const text = typed.key === rowKey ? typed.text : '';
  const letters = [...text];
  const solved = view.myRows.some((r) => r.marks.every((m) => m === 'g'));
  const out = solved || view.myRows.length >= view.maxTries;
  const playing = view.phase === 'play' && !out;
  const tile = Math.min(56, (contentWidth - 30) / view.length);
  // the keyboard has 6px padding and 4px gaps: 11 keys on the top rows, 8 keys + enter + delete on the last
  const keysW = contentWidth - 12;
  const keyW = Math.floor(Math.min(36, (keysW - 10 * 4) / 11));
  const wideW = Math.floor(Math.min(64, (keysW - 9 * 4 - 8 * keyW) / 2));

  // best colour seen for each letter, for the keyboard
  const best: Record<string, WordleMark> = {};
  for (const r of view.myRows) [...r.guess].forEach((ch, i) => {
    const m = r.marks[i];
    if (!best[ch] || RANK[m] > RANK[best[ch]]) best[ch] = m;
  });

  const press = (k: string) => {
    if (!playing) return;
    haptic.tap();
    if (k === 'del') setTyped({ key: rowKey, text: letters.slice(0, -1).join('') });
    else if (k === 'enter') {
      // the typed word stays until the server accepts it (a new row clears it), so a word
      // that isn't in the dictionary can be fixed instead of retyped
      if (letters.length === view.length) h.act('guess', { word: text });
    } else if (letters.length < view.length) setTyped({ key: rowKey, text: text + k });
  };

  return (
    <>
      <RoundHeader label={`الكلمة ${num(view.round)} من ${num(view.rounds)}`} round={0} rounds={0} />
      {view.phase === 'play' ? <TimerBar endsAt={view.endsAt} total={view.hurried ? 60000 : 240000} /> : null}
      {view.hurried ? (
        <Txt v="small" center color={C.yellow}>
          نصف اللاعبين أنهوا — بقيت دقيقة على الأكثر
        </Txt>
      ) : null}

      <View style={{ gap: 6, alignItems: 'center' }}>
        {Array.from({ length: view.maxTries }, (_, r) => {
          const row = view.myRows[r];
          const current = r === view.myRows.length && playing;
          // once the round is over only the tries are left, to leave room for the results
          if (view.phase === 'reveal' && !row) return null;
          const tiles = (
            <Row gap={6}>
              {Array.from({ length: view.length }, (_, i) => (
                <Tile key={i} size={tile} ch={row ? [...row.guess][i] : current ? (letters[i] ?? '') : ''} mark={row?.marks[i]} active={current && i === letters.length} bad={current && refused} />
              ))}
            </Row>
          );
          return <View key={r}>{tiles}</View>;
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
        <View style={{ gap: 8 }}>
          <Txt v="title" center>
            الكلمة: «{view.answer}»
          </Txt>
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
                      {r.tries === null ? 'لم يُعثر عليها' : `${num(r.tries)} محاولات`}
                    </Txt>
                    <Txt style={{ fontFamily: F.black, fontSize: 15, lineHeight: 22, color: r.points ? C.green : C.dim, minWidth: 48, textAlign: 'center' }}>
                      {r.points ? `+${num(r.points)}` : '0'}
                    </Txt>
                  </Row>
                ))
            : null}
        </View>
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

      {view.others.length ? (
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

const styles = StyleSheet.create({
  tile: { alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 2, borderColor: C.borderStrong, backgroundColor: C.surface },
  tileFilled: { borderColor: alpha('#FFFFFF', 0.55) },
  tileActive: { borderColor: C.yellow },
  tileBad: { borderColor: C.red, backgroundColor: alpha(C.red, 0.18) },
  keyboard: { gap: 5, backgroundColor: C.bg3, borderRadius: 16, padding: 6 },
  key: { height: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surfaceStrong },
  other: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: C.surface, borderRadius: 14, padding: 6, borderWidth: 1.5, borderColor: C.border },
  result: { backgroundColor: C.surface, borderRadius: 14, paddingVertical: 6, paddingHorizontal: 10 },
  mini: { width: 9, height: 9, borderRadius: 2, backgroundColor: C.surfaceStrong },
});
