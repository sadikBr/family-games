/** «كلمة واحدة» — pieces of the screen: the deck, the secret word, the clue cards, the answer box. */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Icon } from '@/art/icons';
import { haptic } from '@/lib/sfx';
import type { OnewordClue, OnewordView } from '@/shared/games/oneword';
import { C, F, alpha } from '@/theme';
import { useAccent } from '@/ui/accent';
import { Avatar, Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { Field } from '@/ui/field';
import { useContentWidth } from '@/ui/screen';
import { Txt, num } from '@/ui/txt';

import type { Helpers } from './helpers';

/** The deck as a row of small cards: won (green), lost (red), the one in play, the ones left. */
export function DeckBar({ view, bare }: { view: OnewordView; bare?: boolean }) {
  const accent = useAccent();
  const width = useContentWidth();
  const inPlay = view.phase !== 'final' && view.phase !== 'reveal' ? 1 : 0;
  const cells = [
    ...Array<'won'>(view.won).fill('won'),
    ...Array<'lost'>(view.lost).fill('lost'),
    ...Array<'now'>(inPlay).fill('now'),
    ...Array<'left'>(Math.max(0, view.total - view.won - view.lost - inPlay)).fill('left'),
  ].slice(0, view.total);
  const gap = 4;
  const w = Math.min(22, (width - 24 - gap * (view.total - 1)) / view.total);
  return (
    <View style={bare ? { gap: 6 } : [styles.deck, { borderColor: alpha(accent, 0.3) }]}>
      <Row gap={gap} center>
        {cells.map((k, i) => (
          <View
            key={i}
            style={{
              width: w,
              height: w * 1.35,
              borderRadius: 4,
              backgroundColor: k === 'won' ? C.green : k === 'lost' ? alpha(C.red, 0.85) : k === 'now' ? alpha(accent, 0.35) : C.surfaceStrong,
              borderWidth: k === 'now' ? 2 : 0,
              borderColor: accent,
            }}
          />
        ))}
      </Row>
      <Row gap={10} center wrap>
        <Txt v="tiny" color={C.green}>{`الرابحة ${num(view.won)}`}</Txt>
        <Txt v="tiny" color={C.red}>{`الضائعة ${num(view.lost)}`}</Txt>
        <Txt v="tiny" color={C.muted}>{`في الرزمة ${num(view.left)}`}</Txt>
      </Row>
    </View>
  );
}

/** The mystery word, for the clue-givers. */
export function WordCard({ word, compact }: { word: string; compact?: boolean }) {
  const accent = useAccent();
  const width = useContentWidth();
  // long words get a smaller font so they always fit on one line
  const size = Math.max(22, Math.min(compact ? 30 : 40, (width - 40) / Math.max(4, [...word].length * 0.62)));
  return (
    <View style={[styles.word, { borderColor: accent, backgroundColor: alpha(accent, 0.12), paddingVertical: compact ? 8 : 14 }]}>
      <Txt v="tiny" center color={C.muted}>
        الكلمة السرية — لا تُظهرها للمخمِّن
      </Txt>
      <Txt center numberOfLines={1} style={{ fontFamily: F.display, fontSize: size, lineHeight: Math.round(size * 1.45), color: C.text }}>
        {word}
      </Txt>
    </View>
  );
}

const STATUS_LABEL: Record<OnewordClue['status'], string> = { ok: '', dup: 'متطابق — محذوف', struck: 'مشطوب', none: 'بلا تلميح' };

/** One clue card. Cancelled ones are struck through (the line arrives a moment later: the elimination). */
function ClueTile({ clue, h, width, big, onToggle }: { clue: OnewordClue; h: Helpers; width: number; big?: boolean; onToggle?: () => void }) {
  const accent = useAccent();
  const p = h.player(clue.by);
  const out = clue.status !== 'ok';
  const label = clue.status === 'struck' && clue.struckBy ? `مشطوب (${h.player(clue.struckBy).name})` : STATUS_LABEL[clue.status];
  const size = big ? 24 : 20;
  const body = (
    <View
      style={[
        styles.tile,
        {
          width,
          borderColor: out ? alpha(C.red, 0.45) : alpha(accent, 0.55),
          backgroundColor: out ? alpha(C.red, 0.1) : C.raised,
        },
      ]}>
      <View style={{ alignSelf: 'center' }}>
        <Txt
          center
          numberOfLines={1}
          style={{ fontFamily: F.black, fontSize: size, lineHeight: Math.round(size * 1.5), color: out ? C.dim : C.text }}>
          {clue.text ?? '—'}
        </Txt>
        {out && clue.text ? <Animated.View entering={FadeIn.delay(clue.status === 'dup' ? 500 : 0).duration(260)} style={styles.strike} /> : null}
      </View>
      <Row gap={5} center>
        <Avatar player={p} size={18} />
        <Txt v="tiny" numberOfLines={1} color={C.muted} style={{ flexShrink: 1 }}>
          {p.id === h.me ? 'أنت' : p.name}
        </Txt>
      </Row>
      {label ? (
        <Animated.View entering={FadeIn.delay(clue.status === 'dup' ? 500 : 0).duration(260)}>
          <Txt v="tiny" center color={clue.status === 'none' ? C.dim : C.red} numberOfLines={1}>
            {label}
          </Txt>
        </Animated.View>
      ) : null}
      {onToggle ? (
        <View style={styles.toggleIcon}>
          <Icon name={clue.status === 'struck' ? 'refresh' : 'close'} size={14} color={clue.status === 'struck' ? C.muted : C.red} />
        </View>
      ) : null}
    </View>
  );
  if (!onToggle) return body;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={clue.status === 'struck' ? `إعادة التلميح ${clue.text}` : `شطب التلميح ${clue.text}`}
      onPress={() => {
        haptic.tap();
        onToggle();
      }}
      style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}>
      {body}
    </Pressable>
  );
}

/** The clues as a grid of cards (two per line, three on wide screens). */
export function ClueGrid({ clues, h, big, onToggle }: { clues: OnewordClue[]; h: Helpers; big?: boolean; onToggle?: (i: number) => void }) {
  const width = useContentWidth();
  const per = width >= 420 ? 3 : 2;
  const gap = 8;
  const w = (width - gap * (per - 1)) / per;
  return (
    <Row wrap gap={gap} center>
      {clues.map((c, i) => (
        <ClueTile
          key={c.by}
          clue={c}
          h={h}
          width={w}
          big={big}
          onToggle={onToggle && (c.status === 'ok' || c.status === 'struck') ? () => onToggle(i) : undefined}
        />
      ))}
    </Row>
  );
}

/** One word in a box, emptied for every new prompt (`step`); spaces are flagged before sending. */
export function WordInput({
  step,
  placeholder,
  sendLabel,
  onSend,
  oneWord,
}: {
  step: number;
  placeholder: string;
  sendLabel: string;
  onSend: (text: string) => void;
  oneWord?: boolean;
}) {
  const accent = useAccent();
  const [typed, setTyped] = useState({ step: -1, text: '' });
  const text = typed.step === step ? typed.text : '';
  const spaced = !!oneWord && /\S\s+\S/.test(text.trim());
  const ok = !!text.trim() && !spaced;
  const send = () => {
    if (!ok) return;
    haptic.medium();
    onSend(text.trim());
    setTyped({ step, text: '' });
  };
  return (
    <View style={{ gap: 6 }}>
      <Row gap={8}>
        <Field
          value={text}
          onChangeText={(t) => setTyped({ step, text: t })}
          onSubmitEditing={send}
          placeholder={placeholder}
          placeholderTextColor={C.dim}
          autoCorrect={false}
          autoCapitalize="none"
          maxLength={24}
          returnKeyType="send"
          style={[styles.input, { borderColor: spaced ? C.red : accent }]}
        />
        <Btn size="md" icon="check" label={sendLabel} disabled={!ok} onPress={send} />
      </Row>
      {spaced ? (
        <Txt v="tiny" color={C.red}>
          كلمة واحدة فقط، بلا مسافات
        </Txt>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  deck: { backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, paddingVertical: 8, paddingHorizontal: 12, gap: 6 },
  word: { borderRadius: 20, borderWidth: 2, paddingHorizontal: 12, gap: 0 },
  tile: { borderRadius: 16, borderWidth: 1.5, paddingVertical: 8, paddingHorizontal: 8, gap: 2, minHeight: 84, justifyContent: 'center' },
  strike: { position: 'absolute', left: -4, right: -4, top: '52%', height: 2.5, borderRadius: 2, backgroundColor: C.red },
  toggleIcon: { position: 'absolute', top: 6, left: 6, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface },
  input: { flex: 1, backgroundColor: C.bg2, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, minHeight: 46, color: C.text, fontFamily: F.bold, fontSize: 17, textAlign: 'right', borderWidth: 2 },
});
