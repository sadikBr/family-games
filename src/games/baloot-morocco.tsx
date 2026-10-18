/**
 * «البلوط» (Moroccan mode) — the pieces of the screen that differ from the Saudi game: the purchase
 * panel («أشتري» / «أمرّر», then the suit picker), the contract line «الأتو: الكوباص — الشاري: بابا»
 * and the end-of-hand breakdown (tricks, ديكس دي دير, announcements, بلوط-ريبلوط, دخل / كابو / ليتيج).
 */
import { Pressable, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { haptic } from '@/lib/sfx';
import { MA_CAPOT, MA_LAST, maSuitName } from '@/shared/baloot-morocco';
import type { BalootView, BSide, BSuit } from '@/shared/games/baloot';
import { C, F, alpha } from '@/theme';
import { Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { Txt, num } from '@/ui/txt';

import { SuitIcon } from './baloot-suit';
import type { Helpers } from './helpers';

function Pill({ text, color = C.surfaceStrong }: { text: string; color?: string }) {
  return (
    <View style={{ backgroundColor: color, borderRadius: 999, paddingHorizontal: 10 }}>
      <Txt v="tiny" color="#FFFFFF" style={{ lineHeight: 22 }}>
        {text}
      </Txt>
    </View>
  );
}

/** «⟨icon⟩ الكوباص» */
export function SuitName({ suit, size = 16, color = C.text, bold }: { suit: BSuit; size?: number; color?: string; bold?: boolean }) {
  return (
    <Row gap={4} style={{ alignItems: 'center' }}>
      <SuitIcon suit={suit} size={size} />
      <Txt v={bold ? 'bold' : 'small'} color={color}>
        {maSuitName(suit)}
      </Txt>
    </Row>
  );
}

/** «الأتو: ⟨icon⟩ الكوباص — الشاري: بابا», the ليتيج waiting and «البيل». */
export function MaContractBar({ v, h }: { v: BalootView; h: Helpers }) {
  const c = v.contract;
  const extra = (
    <>
      {v.pot ? <Pill text={`ليتيج معلّق: ${num(v.pot)}`} color={C.purple} /> : null}
      {v.bel ? <Pill text="البيل: يد فاصلة" color={C.orange} /> : null}
    </>
  );
  if (!c?.trump) {
    return (
      <Row center gap={6} wrap>
        <Pill text={v.bidRound === 2 ? 'الشرا — الجولة الثانية' : 'الشرا — الجولة الأولى'} />
        <Txt v="tiny" color={C.muted}>
          اليد {num(v.hand)} · التوزيع: {h.player(v.dealer).name}
        </Txt>
        {extra}
      </Row>
    );
  }
  return (
    <Row center gap={6} wrap>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          backgroundColor: alpha(C.yellow, 0.14),
          borderColor: C.yellow,
          borderWidth: 1.5,
          borderRadius: 999,
          paddingHorizontal: 10,
        }}>
        <Txt v="bold" color={C.yellow}>
          الأتو:
        </Txt>
        <SuitName suit={c.trump} bold color="#FFFFFF" />
      </View>
      <Txt v="small" color={C.muted} numberOfLines={1}>
        الشاري: {h.player(c.buyer).name}
      </Txt>
      {extra}
    </Row>
  );
}

/** A suit to name as the trump in the 2nd round. */
function SuitBtn({ suit, width, onPress }: { suit: BSuit; width: number; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`الأتو ${maSuitName(suit)}`}
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      style={({ pressed }) => ({
        width,
        alignItems: 'center',
        gap: 2,
        paddingVertical: 6,
        borderRadius: 14,
        backgroundColor: '#FBF6EA',
        borderBottomWidth: 3,
        borderBottomColor: alpha(C.ink, 0.25),
        opacity: pressed ? 0.75 : 1,
      })}>
      <SuitIcon suit={suit} size={26} />
      <Txt numberOfLines={1} style={{ fontFamily: F.bold, fontSize: 13, lineHeight: 20, color: C.ink }}>
        {maSuitName(suit)}
      </Txt>
    </Pressable>
  );
}

/** The purchase on my turn: «أشتري» / «أمرّر» (round 1), another suit or «أمرّر» (round 2). */
export function MaBidPanel({ v, width, onCall }: { v: BalootView; width: number; onCall: (call: string, suit?: BSuit) => void }) {
  const opts = v.myOptions;
  if (!opts.length || !v.faceUp) return null;
  const up = v.faceUp.suit;
  const take = opts.some((o) => o.call === 'hokm');
  const pass = opts.some((o) => o.call === 'pass');
  const h2 = opts.find((o) => o.call === 'hokm2');
  const forced = take && !pass;
  return (
    <Animated.View entering={FadeIn.duration(200)} style={{ gap: 8 }}>
      {h2 ? (
        <Txt v="bold" center color={C.yellow}>
          الجولة الثانية: اختر شكلاً آخر للأتو، أو مرّر
        </Txt>
      ) : (
        <Row center gap={4} wrap>
          <Txt v="bold" color={C.yellow}>
            {forced ? 'الفورص: المكشوفة ولد، والشراء عليك — الأتو:' : 'اشترِ المكشوفة فيصير الأتو:'}
          </Txt>
          <SuitName suit={up} bold color={C.yellow} />
        </Row>
      )}
      {h2 ? (
        <Row gap={6} center>
          {h2.suits!.map((s) => (
            <SuitBtn key={s} suit={s} width={(width - 12) / 3} onPress={() => onCall('hokm2', s)} />
          ))}
        </Row>
      ) : null}
      <Row gap={8} center>
        {take ? <Btn size="md" label="أشتري" color={C.yellow} style={{ width: forced ? width : (width - 8) / 2 }} onPress={() => onCall('hokm')} /> : null}
        {pass ? <Btn size="md" label="أمرّر" ghost style={{ width: h2 ? width : (width - 8) / 2 }} onPress={() => onCall('pass')} /> : null}
      </Row>
    </Animated.View>
  );
}

const sideWord = (side: BSide, mine: BSide | null, v: BalootView, h: Helpers) =>
  mine ? (side === mine ? 'لنا' : 'لهم') : v.sides.find((x) => x.key === side)!.members.map((m) => h.player(m).name).join(' و');

/** The end-of-hand breakdown. */
export function MaHandBreakdown({ v, h }: { v: BalootView; h: Helpers }) {
  const r = v.result;
  if (!r) return null;
  const mine = (v.sides.find((x) => x.members.includes(h.me))?.key ?? null) as BSide | null;
  const cols: BSide[] = mine ? [mine, mine === 'A' ? 'B' : 'A'] : ['A', 'B'];
  const line = (label: string, val: (s: BSide) => string, bold?: boolean) => (
    <Row gap={8} key={label}>
      <Txt v={bold ? 'bold' : 'small'} color={bold ? C.text : C.muted} style={{ flex: 1.3 }} numberOfLines={1}>
        {label}
      </Txt>
      {cols.map((s) => (
        <Txt key={s} v={bold ? 'h3' : 'bold'} color={bold ? (r.points[s] ? C.yellow : C.dim) : C.text} style={{ flex: 1, textAlign: 'center' }}>
          {val(s)}
        </Txt>
      ))}
    </Row>
  );
  const plus = (n: number) => (n ? num(`+${n}`) : '—');
  let tag: { text: string; tone: string } | null = null;
  if (r.kaboot) tag = { text: `كابو — ${num(MA_CAPOT)} ${sideWord(r.kaboot, mine, v, h)}`, tone: r.failed ? C.red : C.green };
  else if (r.failed) tag = { text: 'دخل — 162 وكل الإعلانات للخصمين', tone: C.red };
  else if (r.litige) tag = { text: 'ليتيج — نقاط الشاري معلّقة لليد التالية', tone: C.purple };
  return (
    <View style={{ backgroundColor: C.surface, borderRadius: 18, padding: 12, gap: 4 }}>
      <Row center gap={6} wrap>
        <Txt v="bold">الأتو:</Txt>
        {r.contract.trump ? <SuitName suit={r.contract.trump} bold /> : null}
        <Txt v="small" color={C.muted}>
          · الشاري: {h.player(r.contract.buyer).name}
        </Txt>
      </Row>
      {tag ? (
        <Txt v="bold" center color={tag.tone}>
          {tag.text}
        </Txt>
      ) : null}
      <Row gap={8}>
        <View style={{ flex: 1.3 }} />
        {cols.map((s) => (
          <Txt key={s} v="tiny" color={s === r.buyerSide ? C.yellow : C.muted} style={{ flex: 1, textAlign: 'center' }} numberOfLines={1}>
            {sideWord(s, mine, v, h)}
            {s === r.buyerSide ? ' (الشاري)' : ''}
          </Txt>
        ))}
      </Row>
      {line('نقاط الأكلات', (s) => num(r.abnat[s]))}
      {line('منها ديكس دي دير', (s) => (r.ground === s ? num(MA_LAST) : '—'))}
      {line('الأكلات', (s) => num(r.tricks[s]))}
      {line('الإعلانات', (s) => plus(r.projects[s]))}
      {r.baloot.A + r.baloot.B ? line('بلوط-ريبلوط', (s) => plus(r.baloot[s])) : null}
      {r.potWon ? line('من ليتيج سابق', (s) => (s === r.winner ? num(`+${r.potWon}`) : '—')) : null}
      <View style={{ height: 1, backgroundColor: C.borderStrong, marginVertical: 2 }} />
      {line('نقاط اليد', (s) => num(`+${r.points[s]}`), true)}
      {v.pot ? (
        <Txt v="tiny" center color={C.muted}>
          ليتيج معلّق: {num(v.pot)} نقطة تذهب إلى من يربح اليد التالية
        </Txt>
      ) : null}
    </View>
  );
}
