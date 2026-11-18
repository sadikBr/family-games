/**
 * «رتّب الأحداث» — building my order: numbered slots (oldest at the top) and the cards still to place.
 *
 * Tap: a card goes into the highlighted slot (the first empty one, or the slot last tapped); a card in a
 * slot goes back to the cards when tapped, and its slot is the next to fill.
 * Drag: hold a card a moment (with a mouse: just drag it) and drop it on a slot: on an empty slot it is
 * placed, on a full one the two swap (a card from the pile sends the other back). Dropped anywhere else, a
 * placed card goes back to the pile.
 * Every change is saved on the server («arrange»), so the placed cards still count if time runs out.
 */
import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { Icon } from '@/art/icons';
import { haptic } from '@/lib/sfx';
import { TARTIB_CAT_LABEL, type TartibCard, type TartibView } from '@/shared/games/tartib';
import { C, F, alpha } from '@/theme';
import { useAccent } from '@/ui/accent';
import { Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { useScrollLock } from '@/ui/screen';
import { Txt, num } from '@/ui/txt';

import type { Helpers } from './helpers';
import { OPTION_LETTERS } from './islamic-ui';

/** The letter that names a card everywhere (play, the timeline, the others' orders). */
export const cardLetter = (i: number) => OPTION_LETTERS[i] ?? num(i + 1);

interface Draft {
  round: number;
  /** slot → card (null: empty) */
  slots: (number | null)[];
  /** the slot the next tapped card goes to (null: the first empty one) */
  target: number | null;
}

/** Where a drag started: a slot, or the pile. */
type From = { slot: number } | { pile: true };

const HOLD_MS = 220;
const MOVE_SLOP = 8;
/** a computer browser with a mouse: dragging starts at once (no page to scroll by touch) */
const MOUSE = Platform.OS === 'web' && typeof window !== 'undefined' && !('ontouchstart' in window);

export function Builder({ view, h, mix }: { view: TartibView; h: Helpers; mix: boolean }) {
  const accent = useAccent();
  const n = view.cards.length;
  const fresh = (): Draft => {
    const d = view.draft;
    return { round: view.round, slots: d && d.length === n ? d.slice() : Array(n).fill(null), target: null };
  };
  const [state, setState] = useState<Draft>(fresh);
  const draft = state.round === view.round && state.slots.length === n ? state : fresh();
  const placed = new Set(draft.slots.filter((x): x is number => x !== null));
  const firstEmpty = draft.slots.indexOf(null);
  const target = draft.target !== null && draft.slots[draft.target] === null ? draft.target : firstEmpty >= 0 ? firstEmpty : null;
  const full = firstEmpty < 0;

  const save = (slots: (number | null)[], nextTarget: number | null) => {
    setState({ round: view.round, slots, target: nextTarget });
    h.act('arrange', { slots, round: view.round });
  };
  const putCard = (card: number) => {
    if (target === null) return;
    haptic.tap();
    const slots = draft.slots.slice();
    slots[target] = card;
    save(slots, null);
  };
  const tapSlot = (k: number) => {
    haptic.tap();
    if (draft.slots[k] === null) {
      setState({ ...draft, target: k });
      return;
    }
    const slots = draft.slots.slice();
    slots[k] = null; // the card goes back to the pile; its slot is the next to fill
    save(slots, k);
  };
  const drop = (card: number, from: From, slot: number | null) => {
    const slots = draft.slots.slice();
    if (slot === null) {
      if ('slot' in from) {
        slots[from.slot] = null;
        save(slots, from.slot);
      }
      return;
    }
    if ('slot' in from) {
      if (from.slot === slot) return;
      [slots[from.slot], slots[slot]] = [slots[slot], slots[from.slot]];
    } else slots[slot] = card; // a card already there goes back to the pile
    haptic.medium();
    save(slots, null);
  };
  const reset = () => save(Array(n).fill(null), null);
  const send = () => {
    if (!full) return;
    haptic.medium();
    h.act('submit', { order: draft.slots, round: view.round });
  };

  // drop targets: the slots' places in the window, measured when a drag starts
  const slotsRef = useRef<View>(null);
  const slotLayout = useRef<{ y: number; h: number }[]>([]);
  const slotsTop = useRef(0);
  const [hover, setHover] = useState<number | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const measure = () => slotsRef.current?.measureInWindow((_x, y) => (slotsTop.current = y));
  const slotAt = (pageY: number): number | null => {
    const y = pageY - slotsTop.current;
    const i = slotLayout.current.findIndex((l) => l && y >= l.y - 4 && y <= l.y + l.h + 4);
    return i >= 0 ? i : null;
  };
  const drag = {
    start: (card: number) => {
      measure();
      setDragging(card);
    },
    move: (pageY: number) => {
      const s = slotAt(pageY);
      setHover((old) => (old === s ? old : s));
    },
    end: (card: number, from: From, pageY: number | null) => {
      setDragging(null);
      setHover(null);
      if (pageY !== null) drop(card, from, slotAt(pageY));
    },
  };

  return (
    <View style={{ gap: 10 }}>
      <Row gap={6} style={{ justifyContent: 'space-between' }}>
        <Txt v="tiny" color={C.muted}>
          الأقدم في الأعلى
        </Txt>
        <Txt v="tiny" color={C.dim}>
          المس أو اسحب البطاقة
        </Txt>
      </Row>
      <View ref={slotsRef} style={[{ gap: 6 }, dragging !== null && 'slot' in fromOf(draft, dragging) && { zIndex: 5 }]} onLayout={measure}>
        {draft.slots.map((card, k) => {
          const isTarget = k === target && dragging === null;
          const lit = hover === k;
          return (
            <View
              key={k}
              onLayout={(e: LayoutChangeEvent) => {
                slotLayout.current[k] = { y: e.nativeEvent.layout.y, h: e.nativeEvent.layout.height };
              }}
              style={{ zIndex: dragging !== null && card === dragging ? 5 : 0 }}>
              {card === null ? (
                <EmptySlot k={k} target={isTarget} lit={lit} onPress={() => tapSlot(k)} />
              ) : (
                <CardRow
                  key={`c${card}`}
                  card={view.cards[card]}
                  index={card}
                  slot={k}
                  lit={lit}
                  accent={accent}
                  mix={mix}
                  onTap={() => tapSlot(k)}
                  drag={drag}
                  from={{ slot: k }}
                />
              )}
            </View>
          );
        })}
      </View>

      {!full ? (
        <View style={{ gap: 6 }}>
          <Txt v="tiny" color={C.muted}>
            {target === null ? 'البطاقات' : `البطاقات — المس التي تأتي في الخانة ${num(target + 1)}`}
          </Txt>
          {view.cards.map((c, i) =>
            placed.has(i) ? null : (
              <View key={i} style={{ zIndex: dragging === i ? 5 : 0 }}>
                <CardRow card={c} index={i} slot={null} lit={false} accent={accent} mix={mix} onTap={() => putCard(i)} drag={drag} from={{ pile: true }} />
              </View>
            ),
          )}
        </View>
      ) : null}

      <Row gap={8}>
        <Btn size="md" ghost icon="refresh" label="من جديد" disabled={!placed.size} onPress={reset} />
        <Btn size="md" flex icon="check" label={full ? 'تأكيد' : `بقي ${num(n - placed.size)}`} disabled={!full} onPress={send} />
      </Row>
    </View>
  );
}

const fromOf = (d: Draft, card: number): From => {
  const k = d.slots.indexOf(card);
  return k >= 0 ? { slot: k } : { pile: true };
};

function EmptySlot({ k, target, lit, onPress }: { k: number; target: boolean; lit: boolean; onPress: () => void }) {
  return (
    <View
      onStartShouldSetResponder={() => true}
      onResponderRelease={onPress}
      accessibilityRole="button"
      accessibilityLabel={`الخانة ${k + 1} فارغة`}
      style={[styles.slot, target && styles.slotTarget, lit && styles.slotLit]}>
      <View style={styles.badge}>
        <Txt style={styles.badgeText}>{num(k + 1)}</Txt>
      </View>
      <Txt v="small" color={target ? C.yellow : C.dim} style={{ flex: 1 }}>
        {lit ? 'أفلت البطاقة هنا' : target ? 'الخانة التالية' : '…'}
      </Txt>
    </View>
  );
}

interface DragApi {
  start: (card: number) => void;
  move: (pageY: number) => void;
  end: (card: number, from: From, pageY: number | null) => void;
}

/**
 * One card, in a slot (numbered, tinted) or in the pile (its letter, a «+»). A tap places it or takes it
 * back; a hold (or a mouse drag) lifts it and it follows the finger.
 */
function CardRow({ card, index, slot, lit, accent, mix, onTap, drag, from }: { card: TartibCard; index: number; slot: number | null; lit: boolean; accent: string; mix: boolean; onTap: () => void; drag: DragApi; from: From }) {
  const reduced = useReducedMotion();
  const hold = useScrollLock();
  const dx = useSharedValue(0);
  const dy = useSharedValue(0);
  const lift = useSharedValue(0);
  const [pressed, setPressed] = useState(false);
  const g = useRef({ x0: 0, y0: 0, active: false, moved: false, timer: null as ReturnType<typeof setTimeout> | null, locked: false });

  useEffect(
    () => () => {
      const s = g.current;
      if (s.timer) clearTimeout(s.timer);
      if (s.locked) hold(false);
    },
    [hold],
  );

  const activate = () => {
    const s = g.current;
    if (s.active) return;
    s.active = true;
    s.locked = true;
    hold(true);
    haptic.tap();
    lift.set(withTiming(1, { duration: reduced ? 0 : 120 }));
    drag.start(index);
  };
  const finish = (pageY: number | null, tap: boolean) => {
    const s = g.current;
    if (s.timer) clearTimeout(s.timer);
    s.timer = null;
    setPressed(false);
    if (s.locked) {
      s.locked = false;
      hold(false);
    }
    const wasActive = s.active;
    s.active = false;
    dx.set(withTiming(0, { duration: reduced ? 0 : 160 }));
    dy.set(withTiming(0, { duration: reduced ? 0 : 160 }));
    lift.set(withTiming(0, { duration: reduced ? 0 : 160 }));
    if (wasActive) drag.end(index, from, pageY);
    else if (tap) onTap();
  };

  const grant = (e: GestureResponderEvent) => {
    const s = g.current;
    s.x0 = e.nativeEvent.pageX;
    s.y0 = e.nativeEvent.pageY;
    s.moved = false;
    s.active = false;
    setPressed(true);
    if (!MOUSE) s.timer = setTimeout(activate, HOLD_MS);
  };
  const move = (e: GestureResponderEvent) => {
    const s = g.current;
    const mx = e.nativeEvent.pageX - s.x0;
    const my = e.nativeEvent.pageY - s.y0;
    if (!s.active) {
      if (Math.abs(mx) + Math.abs(my) < MOVE_SLOP) return;
      s.moved = true;
      if (MOUSE) activate();
      else {
        // moving before the hold: a scroll of the page, not a drag
        if (s.timer) clearTimeout(s.timer);
        s.timer = null;
        setPressed(false);
        return;
      }
    }
    dx.set(mx);
    dy.set(my);
    drag.move(e.nativeEvent.pageY);
  };

  const anim = useAnimatedStyle(() => ({
    transform: [{ translateX: dx.get() }, { translateY: dy.get() }, { scale: 1 + lift.get() * 0.03 }],
    opacity: 1 - lift.get() * 0.08,
  }));

  const inSlot = slot !== null;
  return (
    <Animated.View
      entering={reduced ? undefined : FadeIn.duration(180)}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => g.current.active}
      onResponderTerminationRequest={() => !g.current.active}
      onResponderGrant={grant}
      onResponderMove={move}
      onResponderRelease={(e) => finish(e.nativeEvent.pageY, !g.current.moved)}
      onResponderTerminate={() => finish(null, false)}
      accessibilityRole="button"
      accessibilityLabel={inSlot ? `${slot + 1}: ${card.text}` : card.text}
      accessibilityHint={inSlot ? 'المس لإعادتها' : 'المس لوضعها في الخانة التالية'}
      style={[
        styles.card,
        inSlot ? { borderColor: alpha(accent, 0.75), backgroundColor: alpha(accent, 0.2) } : { borderColor: alpha(accent, 0.45) },
        lit && { borderColor: C.yellow },
        pressed && { backgroundColor: alpha(accent, 0.32) },
        anim,
      ]}>
      {inSlot ? (
        <View style={[styles.badge, { backgroundColor: accent }]}>
          <Txt style={styles.badgeText}>{num(slot + 1)}</Txt>
        </View>
      ) : null}
      <View style={[styles.letter, { borderColor: alpha(accent, 0.8) }]}>
        <Txt style={styles.letterText}>{cardLetter(index)}</Txt>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt v="bold" style={styles.cardText}>
          {card.text}
        </Txt>
        {mix ? (
          <Txt v="tiny" color={C.dim} style={{ fontSize: 11, lineHeight: 15 }}>
            {TARTIB_CAT_LABEL[card.cat]}
          </Txt>
        ) : null}
      </View>
      <Icon name={inSlot ? 'close' : 'grab'} size={16} color={inSlot ? C.dim : alpha(C.text, 0.55)} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  slot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 42,
    borderRadius: 14,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: C.borderStrong,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  slotTarget: { borderColor: C.yellow, borderStyle: 'solid', backgroundColor: alpha(C.yellow, 0.08) },
  slotLit: { borderColor: C.yellow, borderStyle: 'solid', backgroundColor: alpha(C.yellow, 0.2) },
  badge: { width: 26, height: 26, borderRadius: 13, backgroundColor: C.surfaceStrong, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontFamily: F.black, fontSize: 13, lineHeight: 19, color: '#FFFFFF' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 54,
    borderRadius: 14,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: C.raised,
    borderWidth: 1.5,
  },
  letter: { width: 24, height: 24, borderRadius: 7, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  letterText: { fontFamily: F.black, fontSize: 12, lineHeight: 18, color: C.text },
  cardText: { fontSize: 15, lineHeight: 22 },
});
