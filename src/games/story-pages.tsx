/**
 * «قصة جماعية» — the storybook pieces: the paper card a sentence sits on, a whole story as a page of a
 * book (votes and the end), and the big reveal everyone watches together, sentence by sentence, read
 * aloud by the phone («اقرأ القصة بصوت», on by default on this screen).
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, FadeIn, Keyframe } from 'react-native-reanimated';

import { Icon } from '@/art/icons';
import { haptic } from '@/lib/sfx';
import { speak, stopSpeaking } from '@/lib/speech';
import type { StoryLine, StoryView } from '@/shared/games/story';
import type { PlayerPublic, RoomView } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { useAccent } from '@/ui/accent';
import { Avatar, Card, Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { TimerBar } from '@/ui/fun';
import { Txt, num } from '@/ui/txt';

import { HostNote } from './common';
import { helpers } from './helpers';
import { useSettled } from './touch-motion';

/** The paper of the storybook (warm, on the dark night of the app). */
export const PAPER = {
  bg: '#F4E8CF',
  edge: '#D8C291',
  line: 'rgba(122,92,52,0.18)',
  ink: '#3A2A1C',
  soft: '#7A6248',
  faint: '#A48F70',
} as const;

/** A sentence arriving: a short fade while sliding up a few px (web: a plain fade, see ui/motion). */
const LineIn =
  Platform.OS === 'web'
    ? FadeIn.duration(320)
    : new Keyframe({
        0: { opacity: 0, transform: [{ translateY: 10 }] },
        100: { opacity: 1, transform: [{ translateY: 0 }], easing: Easing.out(Easing.cubic) },
      }).duration(340);

/** A player, also one who left (their name is kept by the game). */
export function useWho(room: RoomView, view: StoryView) {
  const h = helpers(room);
  return (id: string): PlayerPublic => {
    const p = h.player(id);
    return room.players.some((x) => x.id === id) ? p : { ...p, name: view.names[id] ?? '؟', connected: true };
  };
}

/** A piece of paper: the sentence to continue, a story page. */
export function Paper({ children, accent, style }: { children: ReactNode; accent?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.paper, accent ? { borderColor: accent } : null, style]}>
      {/* a thin margin rule on the right, like a school notebook */}
      <View style={styles.margin} pointerEvents="none" />
      {children}
    </View>
  );
}

/** «بداية القصة» / «جملة بابا» with the author's face. */
function Byline({ line, who, small }: { line: StoryLine; who: (id: string) => PlayerPublic; small?: boolean }) {
  if (!line.by) {
    return (
      <Row gap={5}>
        <Icon name="book" size={small ? 14 : 16} color={PAPER.soft} />
        <Txt v="tiny" color={PAPER.soft}>
          بداية القصة
        </Txt>
      </Row>
    );
  }
  const p = who(line.by);
  return (
    <Row gap={6}>
      <Avatar player={p} size={small ? 20 : 26} />
      <Txt v="tiny" color={PAPER.soft} numberOfLines={1} style={{ flexShrink: 1 }}>
        {small ? p.name : `جملة ${p.name}`}
        {line.left ? ' (غادر)' : ''}
      </Txt>
    </Row>
  );
}

/** One sentence on paper: text, then its author. */
function LineText({ line, size }: { line: StoryLine; size: number }) {
  return (
    <Txt style={{ fontFamily: line.filler ? F.body : F.bold, fontSize: size, lineHeight: Math.round(size * 1.65), color: line.filler ? PAPER.faint : PAPER.ink }}>
      {line.text}
    </Txt>
  );
}

/** A whole story, line under line with the authors (votes, the end). */
export function StoryPage({
  room,
  view,
  index,
  highlight,
  badge,
  footer,
}: {
  room: RoomView;
  view: StoryView;
  index: number;
  highlight?: boolean;
  badge?: ReactNode;
  footer?: ReactNode;
}) {
  const who = useWho(room, view);
  const book = view.books![index];
  const owner = who(book.owner);
  return (
    <Paper accent={highlight ? C.yellow : undefined} style={highlight ? { borderWidth: 3 } : null}>
      <Row gap={8} style={{ justifyContent: 'space-between' }}>
        <Row gap={8} style={{ flexShrink: 1 }}>
          <Avatar player={owner} size={32} />
          <Txt v="h2" color={PAPER.ink} numberOfLines={1} style={{ flexShrink: 1 }}>
            قصة {owner.name}
          </Txt>
        </Row>
        {badge}
      </Row>
      <View style={styles.rule} />
      {book.lines.map((l, i) => (
        <View key={i} style={{ gap: 2 }}>
          <LineText line={l} size={16} />
          <Byline line={l} who={who} small />
        </View>
      ))}
      {footer}
    </Paper>
  );
}

/* ------------------------------------------------------------------ */
/* Reading aloud                                                       */
/* ------------------------------------------------------------------ */

// on by default for this game; a phone that turns it off keeps it off for the rest of the session
let readAloud = true;

/** The reveal's own «اقرأ القصة بصوت» switch (independent of «قراءة الأحداث»). */
export function useReadAloud(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(readAloud);
  const set = (v: boolean) => {
    readAloud = v;
    setOn(v);
    if (!v) stopSpeaking();
  };
  return [on, set];
}

/** The reveal's «اقرأ القصة بصوت» switch: a small labelled chip in the story's header (green while reading). */
function ReadSwitch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      accessibilityLabel="اقرأ القصة بصوت"
      hitSlop={6}
      onPress={() => {
        haptic.tap();
        onChange(!on);
      }}
      style={({ pressed }) => [styles.read, { backgroundColor: on ? C.green : C.surfaceStrong, opacity: pressed ? 0.75 : 1 }]}>
      <Icon name={on ? 'sound' : 'mute'} size={18} color={on ? C.ink : C.muted} />
      <Txt v="tiny" color={on ? C.ink : C.muted}>
        {on ? 'بصوت' : 'صامت'}
      </Txt>
    </Pressable>
  );
}

/** The text of a whole story for the voice: «قصة بابا. …». */
export const storyVoice = (owner: string, lines: StoryLine[]) => [`قصة ${owner}.`, ...lines.filter((l) => !l.filler).map((l) => l.text)].join(' ');

/* ------------------------------------------------------------------ */
/* The reveal                                                          */
/* ------------------------------------------------------------------ */

/** Earlier sentences shown above the current one (the rest of the story waits for the end). */
const EARLIER = 4;

export function Reveal({ room, view }: { room: RoomView; view: StoryView }) {
  const h = helpers(room);
  const who = useWho(room, view);
  const accent = useAccent();
  const settled = useSettled();
  const { width } = useWindowDimensions();
  const [read, setRead] = useReadAloud();
  const r = view.reveal!;
  const owner = who(r.owner);
  const at = r.lines.length - 1;
  const line = r.lines[at];
  const keep = width < 360 ? EARLIER - 1 : EARLIER;
  const earlier = r.lines.slice(Math.max(0, at - keep), at);
  const hidden = Math.max(0, at - keep);
  const lastLine = at === r.length - 1;
  const lastStory = r.story === r.stories - 1;
  const canTurn = h.isHost || r.canTurn;
  const nextLabel = !lastLine ? 'الجملة التالية' : !lastStory ? 'القصة التالية' : 'إلى النهاية';
  const turn = () => h.act(h.isHost ? 'next' : 'turn', { at: `${r.story}:${at}` });
  const key = `${r.story}:${at}`;
  const big = width < 360 ? 20 : 23;

  // read each sentence as it appears (the story's name before its first one); stop when leaving the screen
  const text = line.filler ? '' : at === 0 ? `قصة ${owner.name}. ${line.text}` : line.text;
  useEffect(() => {
    if (read && text) speak(text, true);
  }, [key, read, text]);
  useEffect(() => () => stopSpeaking(), []);

  return (
    <>
      <Card style={{ gap: 6, paddingVertical: 10 }}>
        <Row gap={10}>
          <Avatar player={owner} size={40} ring={owner.color} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt v="h2" numberOfLines={1}>
              قصة {owner.name}
            </Txt>
            <Txt v="tiny" color={C.muted}>
              القصة {num(r.story + 1)} من {num(r.stories)} — الجملة {num(at + 1)} من {num(r.length)}
            </Txt>
          </View>
          <ReadSwitch on={read} onChange={setRead} />
        </Row>
        <Row gap={5} center style={{ direction: 'ltr' }}>
          {Array.from({ length: r.length }, (_, i) => (
            <View key={i} style={{ width: i === at ? 16 : 7, height: 7, borderRadius: 4, backgroundColor: i <= at ? accent : C.surfaceStrong }} />
          ))}
        </Row>
      </Card>

      {/* a new story: the page fades in like a turned page */}
      <Animated.View key={`page-${r.story}`} entering={settled ? FadeIn.duration(360) : undefined}>
        <Paper style={{ minHeight: 220 }}>
          {hidden > 0 ? (
            <Txt v="tiny" color={PAPER.faint} center>
              … {num(hidden)} {hidden === 1 ? 'جملة قبلها' : 'جمل قبلها'}
            </Txt>
          ) : null}
          {earlier.map((l, i) => (
            <View key={`${r.story}:${at - earlier.length + i}`} style={{ gap: 2, opacity: 0.78 }}>
              <LineText line={l} size={15} />
              <Byline line={l} who={who} small />
            </View>
          ))}
          {earlier.length ? <View style={styles.rule} /> : null}
          <Animated.View key={key} entering={settled ? LineIn : undefined} style={{ gap: 8 }}>
            <LineText line={line} size={big} />
            <Byline line={line} who={who} />
          </Animated.View>
        </Paper>
      </Animated.View>

      {r.auto ? <TimerBar endsAt={view.endsAt} total={view.total} /> : null}
      {canTurn ? (
        <Btn size="lg" icon="next" label={nextLabel} onPress={turn} />
      ) : (
        <HostNote>{r.auto ? 'الجمل تتوالى وحدها' : `التالي: لصاحب القصة (${owner.name}) أو للمضيف`}</HostNote>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  paper: {
    backgroundColor: PAPER.bg,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: PAPER.edge,
    paddingVertical: 14,
    paddingStart: 22,
    paddingEnd: 14,
    gap: 10,
    overflow: 'hidden',
  },
  margin: { position: 'absolute', top: 0, bottom: 0, start: 12, width: 1.5, backgroundColor: alpha('#C2564A', 0.35) },
  rule: { height: 1, backgroundColor: PAPER.line },
  read: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 },
});
