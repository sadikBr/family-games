/**
 * «البلوط» — pieces of the screen: the green table with the four seats and the trick, my fanned hand,
 * the bidding and doubling panels, the contract line, the «لنا / لهم» score sheet and the end-of-hand
 * breakdown. Play goes anticlockwise: the next player sits on my right, my partner in front of me.
 */
import { Pressable, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { haptic } from '@/lib/sfx';
import { PROJECT_NAME, SUIT_SYM, suitLabel } from '@/shared/baloot-rules';
import type { BalootContract, BalootOption, BalootRaise, BalootView, BCard, BProjectView, BSide, BSuit } from '@/shared/games/baloot';
import { C, F, alpha } from '@/theme';
import { Avatar, Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { Txt, num } from '@/ui/txt';

import type { Helpers } from './helpers';
import { BalootCard, CARD_H, suitColor } from './baloot-card';

export const RAISE_LABEL: Record<BalootRaise, string> = { double: 'دبل', triple: 'ثري', four: 'فور', gahwa: 'قهوة' };
const MULT_LABEL: Record<number, string> = { 2: 'دبل ×2', 3: 'ثري ×3', 4: 'فور ×4' };

export function contractText(c: BalootContract) {
  return c.mode === 'sun' ? 'صن' : `حكم ${suitLabel(c.trump!)}`;
}

function callText(v: BalootView, call: { call: string; suit?: BSuit }) {
  if (call.call === 'pass') return 'بس';
  if (call.call === 'sun') return 'صن';
  if (call.call === 'ashkal') return 'أشكل';
  if (call.call === 'confirm') return 'تثبيت';
  return `حكم ${SUIT_SYM[call.suit ?? v.faceUp?.suit ?? 'S']}`;
}

/** A small label on a seat (a call, a role, a project). */
function Chip({ text, tone = 'light' }: { text: string; tone?: 'light' | 'gold' | 'dark' }) {
  const bg = tone === 'gold' ? C.yellow : tone === 'dark' ? 'rgba(0,0,0,0.35)' : '#FFFDF7';
  const fg = tone === 'dark' ? '#FFFFFF' : C.ink;
  return (
    <Animated.View entering={FadeIn.duration(200)} style={{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 0 }}>
      <Txt numberOfLines={1} style={{ fontFamily: F.bold, fontSize: 11, lineHeight: 18, color: fg }}>
        {text}
      </Txt>
    </Animated.View>
  );
}

function SeatTag({ v, id, h, width, me, row }: { v: BalootView; id: string; h: Helpers; width: number; me?: boolean; row?: boolean }) {
  const p = h.player(id);
  const active = v.turn === id;
  const chips: { text: string; tone?: 'light' | 'gold' | 'dark' }[] = [];
  const call = v.phase === 'bid' ? v.calls[id] : undefined;
  if (call) chips.push({ text: callText(v, call) });
  const raise = v.phase === 'double' ? v.raises[id] : undefined;
  if (raise) chips.push({ text: raise === 'pass' ? 'بس' : RAISE_LABEL[raise], tone: raise === 'pass' ? 'light' : 'gold' });
  if (v.contract?.buyer === id) chips.push({ text: 'المشتري', tone: 'gold' });
  for (const d of v.declared.filter((x) => x.by === id)) chips.push({ text: PROJECT_NAME[d.kind] });
  if (v.baloot.includes(id)) chips.push({ text: 'بلوت', tone: 'gold' });
  if (v.dealer === id && (v.phase === 'bid' || v.phase === 'double')) chips.push({ text: 'الموزّع', tone: 'dark' });
  const maxChips = v.phase === 'bid' || v.phase === 'double' ? 3 : 2;
  return (
    <View style={{ width, alignItems: 'center', gap: 1 }}>
      <Row gap={4} center>
        <Avatar player={p} size={me ? 26 : 32} ring={active ? C.yellow : undefined} />
        {me ? (
          <Txt v="tiny" color="#FFFFFF">
            أنت
          </Txt>
        ) : null}
      </Row>
      {me ? null : (
        <Txt v="tiny" numberOfLines={1} color={active ? C.yellow : '#FFFFFF'} style={{ maxWidth: width, textAlign: 'center' }}>
          {p.name} · {num(v.counts[id] ?? 0)}
        </Txt>
      )}
      <View style={{ flexDirection: row ? 'row' : 'column', justifyContent: 'center', alignItems: 'center', gap: 2 }}>
        {chips.slice(0, maxChips).map((c, i) => (
          <Chip key={`${c.text}${i}`} text={c.text} tone={c.tone} />
        ))}
      </View>
    </View>
  );
}

/** Size of the cards in the middle of the table for a table this wide. */
export const trickCardWidth = (w: number) => Math.max(40, Math.min(56, Math.floor((w - 150) / 3)));

/** The green table: partner on top, the next player on my right, the previous one on my left, me at the bottom. */
export function Table({ v, h, width }: { v: BalootView; h: Helpers; width: number }) {
  const me = v.seats.includes(h.me) ? h.me : v.seats[0];
  const i = v.seats.indexOf(me);
  const right = v.seats[(i + 1) % 4];
  const top = v.seats[(i + 2) % 4];
  const left = v.seats[(i + 3) % 4];
  const tw = trickCardWidth(width);
  const th = tw * CARD_H;
  const TOP = 68;
  const compact = v.phase === 'bid' || v.phase === 'double';
  // while bidding only the face-up card (with its label) sits in the middle, my tag right under it:
  // a shorter table leaves room for the hand
  const block = 18 + th * 1.1;
  const height = compact ? TOP + 2 + block + 52 : TOP + th * 2.25 + 30;
  const cx = width / 2;
  const cy = compact ? TOP + 2 + block / 2 : TOP + th * 1.12;
  const dy = th * 0.6;
  const dx = tw * 1.0;
  const pos: Record<string, { x: number; y: number }> = {
    [me]: { x: cx, y: cy + dy },
    [top]: { x: cx, y: cy - dy },
    [left]: { x: cx - dx, y: cy },
    [right]: { x: cx + dx, y: cy },
  };
  const sideW = Math.max(62, Math.min(84, (width - tw * 3.1) / 2 - 4));
  const holder = v.trickWinner;
  return (
    <View
      style={{
        width,
        height,
        alignSelf: 'center',
        backgroundColor: C.felt,
        borderRadius: 22,
        borderWidth: 2,
        borderColor: v.turn === h.me ? alpha(C.yellow, 0.75) : C.feltDark,
        direction: 'ltr',
        overflow: 'hidden',
      }}>
      <View style={{ position: 'absolute', top: 4, left: 0, right: 0, alignItems: 'center' }}>
        <SeatTag v={v} id={top} h={h} width={Math.min(170, width - 2 * sideW)} row />
      </View>
      <View style={{ position: 'absolute', top: cy - 40, left: 2 }}>
        <SeatTag v={v} id={left} h={h} width={sideW} />
      </View>
      <View style={{ position: 'absolute', top: cy - 40, right: 2 }}>
        <SeatTag v={v} id={right} h={h} width={sideW} />
      </View>
      {compact ? (
        <View style={{ position: 'absolute', bottom: 4, left: 0, right: 0, alignItems: 'center' }}>
          <SeatTag v={v} id={me} h={h} width={width - 20} me row />
        </View>
      ) : (
        // during play my card lands at the bottom centre: my tag moves to the corner
        <View style={{ position: 'absolute', bottom: 4, left: 6, width: width / 2 - tw / 2 - 10, alignItems: 'flex-start' }}>
          <SeatTag v={v} id={me} h={h} width={width / 2 - tw / 2 - 10} me row />
        </View>
      )}

      {v.phase === 'bid' || v.phase === 'double' ? (
        <View style={{ position: 'absolute', left: 0, right: 0, top: cy - block / 2, alignItems: 'center', gap: 0 }}>
          {v.faceUp ? (
            <>
              <Txt v="tiny" color="rgba(255,255,255,0.8)">
                {v.redeal ? 'لا شراء — توزيع جديد' : v.bidRound === 2 ? 'الجولة الثانية' : 'الورقة المكشوفة'}
              </Txt>
              <Animated.View key={v.faceUp.id} entering={FadeIn.duration(200)}>
                <BalootCard card={v.faceUp} width={tw * 1.1} dim={v.redeal} />
              </Animated.View>
            </>
          ) : v.contract ? (
            <Animated.View entering={FadeIn.duration(200)} style={{ alignItems: 'center', gap: 4, paddingTop: th * 0.3 }}>
              <Txt v="h2" color="#FFFFFF">
                {contractText(v.contract)}
              </Txt>
              <Txt v="tiny" color="rgba(255,255,255,0.8)">
                {v.raiseStep === 'double' ? 'هل يضاعف الخصمان؟' : 'المضاعفة'}
              </Txt>
            </Animated.View>
          ) : null}
        </View>
      ) : null}

      {!compact && v.lastTrick && v.trick.length < 4 ? (
        // the trick that was just collected, small, in the bottom-right corner (its winning card ringed)
        <Animated.View entering={FadeIn.duration(300)} style={{ position: 'absolute', right: 6, bottom: 6, flexDirection: 'row', gap: 2, opacity: 0.9 }}>
          {v.lastTrick.cards.map((x) => (
            <BalootCard key={x.card.id} card={x.card} width={Math.min(26, (width / 2 - tw / 2 - 20) / 4)} ring={x.by === v.lastTrick!.winner ? C.yellow : undefined} />
          ))}
        </Animated.View>
      ) : null}

      {v.trick.map((t) => {
        const p = pos[t.by];
        if (!p) return null;
        return (
          <Animated.View
            key={t.card.id}
            entering={FadeIn.duration(220)}
            style={{ position: 'absolute', left: p.x - tw / 2, top: p.y - th / 2, zIndex: t.by === holder ? 5 : 1 }}>
            <BalootCard card={t.card} width={tw} ring={holder === t.by ? C.yellow : undefined} />
          </Animated.View>
        );
      })}
    </View>
  );
}

/** My cards, overlapping in a gentle fan; illegal cards dimmed while it is my turn. */
export function HandFan({
  cards,
  width,
  playable,
  myTurn,
  selected,
  onPress,
}: {
  cards: BCard[];
  width: number;
  playable: string[];
  myTurn: boolean;
  selected: string | null;
  onPress?: (c: BCard) => void;
}) {
  const n = cards.length;
  if (!n) return null;
  const w = Math.max(46, Math.min(66, Math.floor(width / 4.6)));
  const step = n > 1 ? Math.min(w + 4, (width - w) / (n - 1)) : 0;
  const total = w + step * (n - 1);
  const start = (width - total) / 2;
  const mid = (n - 1) / 2;
  return (
    <View style={{ width, height: w * CARD_H + 20, direction: 'ltr', alignSelf: 'center' }}>
      {cards.map((c, k) => {
        const off = k - mid;
        return (
          <Animated.View
            key={c.id}
            entering={FadeIn.duration(260)}
            style={{
              position: 'absolute',
              left: start + k * step,
              top: 12 + Math.abs(off) * Math.abs(off) * 0.7,
              transform: [{ rotate: `${off * 2.2}deg` }],
            }}>
            <BalootCard
              card={c}
              width={w}
              selected={selected === c.id}
              dim={myTurn && !playable.includes(c.id)}
              onPress={onPress ? () => onPress(c) : undefined}
            />
          </Animated.View>
        );
      })}
    </View>
  );
}

/** «حكم ♥ هاص — المشتري: بابا — دبل ×2» */
export function ContractBar({ v, h }: { v: BalootView; h: Helpers }) {
  const c = v.contract;
  if (!c) {
    return (
      <Row center gap={6} wrap>
        <Pill text={v.bidRound === 2 ? 'الشراء — الجولة الثانية' : 'الشراء — الجولة الأولى'} />
        <Txt v="tiny" color={C.muted}>
          اليد {num(v.hand)} · التوزيع: {h.player(v.dealer).name}
        </Txt>
      </Row>
    );
  }
  const color = c.mode === 'sun' ? C.yellow : suitColor(c.trump!) === '#C9283E' ? '#E2475F' : '#8FA2FF';
  return (
    <Row center gap={6} wrap>
      <View style={{ backgroundColor: alpha(color, 0.18), borderColor: color, borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 10 }}>
        <Txt v="bold" color={c.mode === 'sun' ? C.yellow : '#FFFFFF'}>
          {contractText(c)}
        </Txt>
      </View>
      <Txt v="small" color={C.muted} numberOfLines={1}>
        {c.call === 'ashkal' ? `أشكل من ${h.player(c.caller).name} — ` : ''}الشراء: {h.player(c.buyer).name}
      </Txt>
      {c.mult > 1 ? <Pill text={MULT_LABEL[c.mult]} color={C.red} /> : null}
      {c.gahwa ? <Pill text="قهوة" color={C.orange} /> : null}
    </Row>
  );
}

function Pill({ text, color = C.surfaceStrong }: { text: string; color?: string }) {
  return (
    <View style={{ backgroundColor: color, borderRadius: 999, paddingHorizontal: 10 }}>
      <Txt v="tiny" color="#FFFFFF" style={{ lineHeight: 22 }}>
        {text}
      </Txt>
    </View>
  );
}

/** The bidding buttons for my turn. */
export function BidPanel({ v, width, onCall }: { v: BalootView; width: number; onCall: (call: string, suit?: BSuit) => void }) {
  const opts = v.myOptions;
  if (!opts.length) return null;
  const main = opts.filter((o) => o.call !== 'hokm2');
  const bw = (width - 8 * (main.length - 1)) / main.length;
  const up = v.faceUp?.suit ?? 'S';
  const btn = (o: BalootOption) => {
    switch (o.call) {
      case 'sun':
        return <Btn key="sun" size="md" label="صن" color={C.yellow} style={{ width: bw }} onPress={() => onCall('sun')} />;
      case 'hokm':
        return <Btn key="hokm" size="md" label={`حكم ${SUIT_SYM[up]}`} color={suitBtn(up)} style={{ width: bw }} onPress={() => onCall('hokm')} />;
      case 'confirm':
        return <Btn key="confirm" size="md" label={`حكم ${SUIT_SYM[up]}`} color={suitBtn(up)} style={{ width: bw }} onPress={() => onCall('confirm')} />;
      case 'ashkal':
        return <Btn key="ashkal" size="md" label="أشكل" color={C.purple} style={{ width: bw }} onPress={() => onCall('ashkal')} />;
      case 'pass':
        return <Btn key="pass" size="md" label="بس" ghost style={{ width: bw }} onPress={() => onCall('pass')} />;
      default:
        return null;
    }
  };
  const h2 = opts.find((o) => o.call === 'hokm2');
  const ashkal = opts.some((o) => o.call === 'ashkal');
  let hint: string;
  if (v.bidStage === 'confirm') hint = opts.some((o) => o.call === 'confirm') ? 'ثبّت حكمك أو حوّله إلى صن' : 'يمكنك الآن طلب صن بدل الحكم، أو بس';
  else if (v.bidRound === 2) hint = h2 ? 'الجولة الثانية: حكم بشكل آخر غير المكشوفة، أو صن' : 'الحكم مشترى — صن أو بس';
  else if (opts.some((o) => o.call === 'hokm')) hint = ashkal ? 'صن، حكم، أشكل (صن للشريك)، أو بس' : 'صن أو حكم بشكل المكشوفة، أو بس';
  else hint = ashkal ? 'الحكم مشترى — صن، أشكل، أو بس' : 'الحكم مشترى — صن أو بس';
  return (
    <Animated.View entering={FadeIn.duration(200)} style={{ gap: 8 }}>
      <Txt v="bold" center color={C.yellow}>
        {hint}
      </Txt>
      {h2 ? (
        <Row gap={6} center>
          {h2.suits!.map((s) => (
            <Btn key={s} size="md" label={`حكم ${SUIT_SYM[s]}`} color={suitBtn(s)} style={{ width: (width - 12) / 3 }} onPress={() => onCall('hokm2', s)} />
          ))}
        </Row>
      ) : null}
      <Row gap={8} center>
        {main.map(btn)}
      </Row>
    </Animated.View>
  );
}

const suitBtn = (s: BSuit) => (s === 'H' || s === 'D' ? '#C9283E' : '#3B4A86');

const RAISE_HINT: Record<BalootRaise, string> = {
  double: 'دبل: تتضاعف نقاط اليد، ويأخذ الفائز كل شيء',
  triple: 'ثري: ثلاثة أضعاف',
  four: 'فور: أربعة أضعاف',
  gahwa: 'قهوة: من يربح هذه اليد يربح اللعبة كلها',
};

/** دبل / ثري / فور / قهوة — or «بس». */
export function RaisePanel({ v, width, onRaise }: { v: BalootView; width: number; onRaise: (r: string) => void }) {
  if (!v.raiseStep) return null;
  const step = v.raiseStep;
  const bw = (width - 10) / 2;
  return (
    <Animated.View entering={FadeIn.duration(200)} style={{ gap: 8 }}>
      <Txt v="bold" center color={C.yellow}>
        {RAISE_HINT[step]}
      </Txt>
      <Row gap={10} center>
        <Btn size="md" label={RAISE_LABEL[step]} color={step === 'gahwa' ? C.orange : C.red} style={{ width: bw }} onPress={() => onRaise(step)} />
        <Btn size="md" label="بس" ghost style={{ width: bw }} onPress={() => onRaise('pass')} />
      </Row>
    </Animated.View>
  );
}

/** A project with its cards (shown on the 2nd trick, or offered on my first card). */
export function ProjectLine({ p, h, on, onPress }: { p: BProjectView; h: Helpers; on?: boolean; onPress?: () => void }) {
  const body = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        padding: 4,
        paddingHorizontal: 8,
        borderRadius: 12,
        backgroundColor: on === false ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.25)',
        borderWidth: 1.5,
        borderColor: on ? C.yellow : 'transparent',
        opacity: on === false ? 0.6 : 1,
      }}>
      <Avatar player={h.player(p.by)} size={20} />
      <Txt v="tiny" color="#FFFFFF">
        {PROJECT_NAME[p.kind]} {num(`+${p.points}`)}
      </Txt>
      <Row gap={2} style={{ direction: 'ltr' }}>
        {(p.cards ?? []).map((c) => (
          <BalootCard key={c.id} card={c} width={24} />
        ))}
      </Row>
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        haptic.tap();
        onPress();
      }}>
      {body}
    </Pressable>
  );
}

const sideWord = (side: BSide, mine: BSide | null, v: BalootView, h: Helpers) =>
  mine ? (side === mine ? 'لنا' : 'لهم') : v.sides.find((x) => x.key === side)!.members.map((m) => h.player(m).name).join(' و');

/** «لنا / لهم»: one row per hand and the totals, like a real score sheet. */
export function ScoreSheet({ v, h, compact }: { v: BalootView; h: Helpers; compact?: boolean }) {
  const mine = (v.sides.find((x) => x.members.includes(h.me))?.key ?? null) as BSide | null;
  const cols: BSide[] = mine ? [mine, mine === 'A' ? 'B' : 'A'] : ['A', 'B'];
  const rows = compact ? v.history.slice(-4) : v.history;
  return (
    <View style={{ backgroundColor: '#FBF6EA', borderRadius: 14, padding: 10, gap: 2 }}>
      <Row gap={8}>
        {cols.map((s) => (
          <Txt key={s} numberOfLines={1} style={{ flex: 1, textAlign: 'center', fontFamily: F.display, fontSize: 20, lineHeight: 30, color: C.ink }}>
            {sideWord(s, mine, v, h)}
          </Txt>
        ))}
      </Row>
      <View style={{ height: 2, backgroundColor: C.ink, opacity: 0.7 }} />
      {rows.map((r, k) => (
        <Row key={k} gap={8}>
          {cols.map((s) => (
            <View key={s} style={{ flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 4 }}>
              <Txt style={{ fontFamily: F.black, fontSize: 16, lineHeight: 24, color: r[s] ? C.ink : alpha(C.ink, 0.35) }}>{num(r[s])}</Txt>
              {r.tag && r[s] ? (
                <Txt style={{ fontFamily: F.bold, fontSize: 10, lineHeight: 16, color: C.red }}>{r.tag}</Txt>
              ) : null}
            </View>
          ))}
        </Row>
      ))}
      {v.history.length ? <View style={{ height: 1.5, backgroundColor: C.ink, opacity: 0.5 }} /> : null}
      <Row gap={8}>
        {cols.map((s) => (
          <Txt key={s} style={{ flex: 1, textAlign: 'center', fontFamily: F.display, fontSize: 24, lineHeight: 34, color: v.winner === s ? C.green : C.ink }}>
            {num(v.scores[s])}
          </Txt>
        ))}
      </Row>
      <Txt v="tiny" center color={alpha(C.ink, 0.6)}>
        الهدف {num(v.target)}
      </Txt>
    </View>
  );
}

/** The end-of-hand breakdown. */
export function HandBreakdown({ v, h }: { v: BalootView; h: Helpers }) {
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
  const tags: string[] = [];
  if (r.kaboot) tags.push(`كبوت — ${sideWord(r.kaboot, mine, v, h)}`);
  else if (r.failed) tags.push('خسرانة — النقاط كلها للخصمين');
  if (r.contract.gahwa) tags.push('قهوة');
  return (
    <View style={{ backgroundColor: C.surface, borderRadius: 18, padding: 12, gap: 4 }}>
      <Row center gap={6} wrap>
        <Txt v="bold">{contractText(r.contract)}</Txt>
        <Txt v="small" color={C.muted}>
          · الشراء: {h.player(r.contract.buyer).name}
        </Txt>
        {r.contract.mult > 1 ? <Pill text={MULT_LABEL[r.contract.mult]} color={C.red} /> : null}
      </Row>
      {tags.map((t) => (
        <Txt key={t} v="bold" center color={r.failed ? C.red : C.green}>
          {t}
        </Txt>
      ))}
      <Row gap={8}>
        <View style={{ flex: 1.3 }} />
        {cols.map((s) => (
          <Txt key={s} v="tiny" color={s === r.buyerSide ? C.yellow : C.muted} style={{ flex: 1, textAlign: 'center' }} numberOfLines={1}>
            {sideWord(s, mine, v, h)}
            {s === r.buyerSide ? ' (المشترون)' : ''}
          </Txt>
        ))}
      </Row>
      {line('الأبناط', (s) => num(r.abnat[s]))}
      {line('منها الأرض', (s) => (r.ground === s ? num(10) : '—'))}
      {line('الأكلات', (s) => num(r.tricks[s]))}
      {line('المشاريع', (s) => (r.projects[s] ? num(`+${r.projects[s]}`) : '—'))}
      {r.baloot.A + r.baloot.B ? line('بلوت', (s) => (r.baloot[s] ? num(`+${r.baloot[s]}`) : '—')) : null}
      <View style={{ height: 1, backgroundColor: C.borderStrong, marginVertical: 2 }} />
      {line('نقاط اليد', (s) => num(`+${r.points[s]}`), true)}
    </View>
  );
}

/** One line under the table: trick number and card points so far. */
export function InfoRow({ v, mine }: { v: BalootView; mine: BSide }) {
  if (v.phase !== 'play') return null;
  const theirs: BSide = mine === 'A' ? 'B' : 'A';
  return (
    <Txt v="tiny" center color={C.dim} numberOfLines={1}>
      الأكلة {num(Math.min(v.trickNo, 8))} من {num(8)} · أبناطنا {num(v.abnat[mine])} · أبناطهم {num(v.abnat[theirs])}
    </Txt>
  );
}
