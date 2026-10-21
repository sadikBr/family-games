/**
 * Reactions in a room («التفاعلات»), the same in every game and in the waiting room:
 * - ReactionButton: the smiley in the room's header (and in the pool table's full-screen bar) opens a
 *   compact picker of the fixed set (src/shared/reactions.ts); a tap sends one to everyone in the room.
 * - ReactionLayer: over the whole room screen, shows each reaction that arrives big in the middle
 *   (src/ui/reaction-fx.tsx), one after another (two may overlap a little; at most 4 wait, the rest are
 *   dropped). With «التفاعلات» off in the room menu, only my own reactions show.
 */
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/art/icons';
import { client } from '@/lib/client';
import { reactionsOn } from '@/lib/reactions';
import { haptic, play } from '@/lib/sfx';
import { speak } from '@/lib/speech';
import type { RoomView } from '@/shared/protocol';
import { REACTIONS, REACTION_KEYS, type ReactionKey } from '@/shared/reactions';
import { C, F, alpha } from '@/theme';
import { FX_MS, ReactionFx } from '@/ui/reaction-fx';
import { Txt } from '@/ui/txt';

const SHEET_MAX = 380;
const EMOJIS = REACTION_KEYS.filter((k) => REACTIONS[k].kind === 'emoji');
const PHRASES = REACTION_KEYS.filter((k) => REACTIONS[k].kind === 'phrase');

/** Is the rest after my last reactions still on? (re-renders when it is over) */
function useResting() {
  const [, force] = useState(0);
  const wait = client.reactWait();
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => force((n) => n + 1), wait + 30);
    return () => clearTimeout(t);
  });
  return wait > 0;
}

export function ReactionButton({ size = 38 }: { size?: number }) {
  const [open, setOpen] = useState(false);
  const [tick, setTick] = useState(0);
  const resting = useResting();
  const insets = useSafeAreaInsets();
  const send = (key: ReactionKey) => {
    if (client.react(key)) {
      haptic.light();
      setOpen(false);
    } else {
      haptic.error();
      setTick((n) => n + 1); // shows «تمهّل قليلاً…» at once
    }
  };
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="أرسل تفاعلاً للجميع"
        hitSlop={6}
        onPress={() => {
          haptic.tap();
          setOpen(true);
        }}
        style={({ pressed }) => [
          styles.btn,
          { width: size, height: size, borderRadius: size / 2, opacity: pressed ? 0.7 : resting ? 0.5 : 1 },
        ]}>
        <Icon name="smile" size={size * 0.56} color={C.yellow} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={[styles.backdrop, { paddingTop: insets.top + 56 }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} accessibilityLabel="إغلاق" />
          <Animated.View entering={ZoomIn.duration(160)} style={styles.sheet}>
            <Picker key={tick} onPick={send} onClose={() => setOpen(false)} />
          </Animated.View>
        </View>
      </Modal>
    </>
  );
}

function Picker({ onPick, onClose }: { onPick: (k: ReactionKey) => void; onClose: () => void }) {
  const resting = useResting();
  // five emojis a row, even on a 320 px phone
  const { width } = useWindowDimensions();
  const cell = Math.min(54, Math.floor((Math.min(width - 24, SHEET_MAX) - 26 - 4 * 6) / 5));
  return (
    <View style={{ gap: 10 }}>
      <View style={styles.head}>
        <Txt v="bold" color={resting ? C.orange : C.muted} style={{ flex: 1 }} numberOfLines={1}>
          {resting ? 'تمهّل قليلاً… ثم أرسل التالي' : 'تفاعل يراه الجميع'}
        </Txt>
        <Pressable onPress={onClose} accessibilityLabel="إغلاق" hitSlop={10}>
          <Icon name="close" size={20} color={C.muted} />
        </Pressable>
      </View>
      <View style={[styles.grid, resting && styles.dim]}>
        {EMOJIS.map((k) => (
          <Pressable
            key={k}
            accessibilityRole="button"
            accessibilityLabel={`أرسل ${REACTIONS[k].label}`}
            onPress={() => onPick(k)}
            style={({ pressed }) => [styles.emojiBtn, { width: cell, height: cell }, pressed && styles.pressed]}>
            <Text style={[styles.emoji, { fontSize: cell * 0.56, lineHeight: cell * 0.74 }]}>{REACTIONS[k].text}</Text>
          </Pressable>
        ))}
      </View>
      <View style={[styles.phrases, resting && styles.dim]}>
        {PHRASES.map((k) => (
          <Pressable
            key={k}
            accessibilityRole="button"
            accessibilityLabel={`أرسل ${REACTIONS[k].label}`}
            onPress={() => onPick(k)}
            style={({ pressed }) => [styles.chip, pressed && styles.pressed]}>
            <Text style={styles.chipText}>{REACTIONS[k].text}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* The overlay                                                         */
/* ------------------------------------------------------------------ */

interface Shown {
  id: number;
  key: ReactionKey;
  by: string;
}

/** the next reaction starts when the one on screen is fading (they overlap a little) */
const NEXT_AFTER_MS = FX_MS - 650;
const MAX_WAITING = 4;

/**
 * The reactions waiting their turn and the ones on screen (at most two: the end of one and the start
 * of the next). Plain JS outside React: the overlay only re-renders when one starts or ends.
 */
class ReactionQueue {
  shown: Shown[] = [];
  private waiting: Shown[] = [];
  private lastStart = 0;
  private lastPop = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private onChange: (shown: Shown[]) => void) {}

  add(item: Shown, mine: boolean) {
    if (this.waiting.length >= MAX_WAITING) {
      if (!mine) return; // too many at once: the rest are dropped (mine always shows)
      this.waiting[this.waiting.length - 1] = item;
    } else this.waiting.push(item);
    this.pump();
  }

  done(id: number) {
    this.shown = this.shown.filter((s) => s.id !== id);
    this.onChange(this.shown);
    this.pump();
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.waiting = [];
  }

  private pump() {
    if (this.timer || !this.waiting.length) return;
    const now = Date.now();
    const busy = this.shown.length;
    if (busy >= 2) return; // the next waits for one to end (done)
    if (busy === 1 && now - this.lastStart < NEXT_AFTER_MS) {
      this.timer = setTimeout(() => {
        this.timer = null;
        this.pump();
      }, this.lastStart + NEXT_AFTER_MS - now);
      return;
    }
    const next = this.waiting.shift()!;
    this.lastStart = now;
    this.shown = [...this.shown, next];
    this.onChange(this.shown);
    // a soft pop now and then (not for every one of a burst), and a phrase read aloud if asked
    if (now - this.lastPop > 1200) {
      this.lastPop = now;
      play('pop');
    }
    haptic.light();
    const voice = REACTIONS[next.key].voice;
    if (voice) speak(voice);
    this.pump();
  }
}

export function ReactionLayer({ room }: { room: RoomView }) {
  const [shown, setShown] = useState<Shown[]>([]);
  const [queue] = useState(() => new ReactionQueue(setShown));
  const me = room.me;

  useEffect(
    () =>
      client.onReaction((msg) => {
        const mine = msg.by === me;
        // «التفاعلات» off: only my own (it tells me mine was sent)
        if (!mine && !reactionsOn()) return;
        queue.add({ id: msg.id, key: msg.key, by: msg.by }, mine);
      }),
    [me, queue],
  );
  useEffect(() => () => queue.stop(), [queue]);

  if (!shown.length) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {shown.map((s) => {
        const p = room.players.find((x) => x.id === s.by) ?? null;
        return <ReactionFx key={s.id} seed={s.id} reaction={s.key} player={p} onDone={() => queue.done(s.id)} />;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  btn: { alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface },
  backdrop: { flex: 1, backgroundColor: 'rgba(8,9,24,0.55)', alignItems: 'center', paddingHorizontal: 12 },
  sheet: { width: '100%', maxWidth: SHEET_MAX, backgroundColor: C.bg2, borderRadius: 22, padding: 12, borderWidth: 1, borderColor: C.borderStrong },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6 },
  emojiBtn: { borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface },
  emoji: { textAlign: 'center' },
  phrases: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6 },
  chip: { paddingHorizontal: 12, minHeight: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(C.yellow, 0.14), borderWidth: 1, borderColor: alpha(C.yellow, 0.35) },
  chipText: { fontFamily: F.display, fontSize: 17, lineHeight: 26, color: C.yellow, writingDirection: 'rtl' },
  pressed: { opacity: 0.6, transform: [{ scale: 0.94 }] },
  dim: { opacity: 0.45 },
});
