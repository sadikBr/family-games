/**
 * «الانقلاب» — the court cards, drawn with react-native-svg (our own design): each role has a colour, a portrait
 * under a Moroccan arch and a small symbol, so the five are told apart at a glance (and without colour):
 *  - «الوزير» (purple): a big white turban with a gem, a beard, a stack of gold coins;
 *  - «الواشي» (slate): a hooded courtier whispering behind his hand;
 *  - «القرصان» (blue): a red bandana, an eye patch, a gold anchor;
 *  - «السفير» (green): a red fez with its tassel, a gold sash, a sealed letter;
 *  - «الحارسة» (crimson): a headscarf with a gold band and a round shield with a star.
 * The back is a navy card with a gold eight-pointed star. Names are drawn as text over the card (the app's font).
 */
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Ellipse, G, Line, Path, Rect } from 'react-native-svg';

import { ROLE_INFO, type CoupRole } from '@/shared/games/coup';
import { F, alpha, shade } from '@/theme';
import { dk } from '@/ui/layout';
import { Txt } from '@/ui/txt';

export const CARD_RATIO = 1.4;
export const GOLD = '#E8B44A';
export const CREAM = '#FFF4DA';
export const NAVY = '#22204F';
const SKIN = '#E9B98F';
const INK = '#2A1E2E';

/** An eight-pointed star (two squares) centred at cx, cy. */
function star8(cx: number, cy: number, r: number) {
  const pts: string[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (Math.PI / 8) * i - Math.PI / 2;
    const rr = i % 2 ? r * 0.72 : r;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(1)} ${(cy + rr * Math.sin(a)).toFixed(1)}`);
  }
  return `M${pts.join(' L')} Z`;
}

/** The face every portrait shares (head at 50, 60). */
function Face({ look = 0, lashes = false, smile = 'soft' }: { look?: number; lashes?: boolean; smile?: 'soft' | 'grin' | 'sly' | 'none' }) {
  return (
    <G>
      <Rect x={45} y={68} width={10} height={14} fill={shade(SKIN, -0.12)} />
      <Circle cx={50} cy={60} r={12.5} fill={SKIN} />
      <Circle cx={45.5 + look} cy={59.5} r={1.7} fill={INK} />
      <Circle cx={54.5 + look} cy={59.5} r={1.7} fill={INK} />
      {lashes ? <Path d="M42.5 57 L44 57.8 M57.5 57 L56 57.8" stroke={INK} strokeWidth={1} strokeLinecap="round" /> : null}
      <Circle cx={42.5} cy={64.5} r={2.2} fill="#F28C8C" opacity={0.45} />
      <Circle cx={57.5} cy={64.5} r={2.2} fill="#F28C8C" opacity={0.45} />
      {smile === 'soft' ? <Path d="M46.5 65.5 Q50 68.5 53.5 65.5" stroke={INK} strokeWidth={1.3} fill="none" strokeLinecap="round" /> : null}
      {smile === 'grin' ? <Path d="M45 65 Q50 70.5 55 65 Z" fill={INK} /> : null}
      {smile === 'sly' ? <Path d="M47 66.5 Q51 67.5 54.5 64.8" stroke={INK} strokeWidth={1.3} fill="none" strokeLinecap="round" /> : null}
    </G>
  );
}

/** Shoulders in the role's robe. */
const Bust = ({ color }: { color: string }) => <Path d="M22 108 C22 88 35 79 50 79 C65 79 78 88 78 108 Z" fill={color} />;

function Portrait({ role }: { role: CoupRole }) {
  const c = ROLE_INFO[role].color;
  switch (role) {
    case 'wazir':
      return (
        <G>
          <Bust color={c} />
          <Path d="M42 81 L50 96 L58 81" stroke={GOLD} strokeWidth={2.4} fill="none" strokeLinejoin="round" />
          <Face />
          {/* beard */}
          <Path d="M38.5 62 C39 75 45 80 50 80 C55 80 61 75 61.5 62 C58 69 54 70 50 70 C46 70 42 69 38.5 62 Z" fill="#5A3B2A" />
          <Path d="M45 66.5 Q50 64.5 55 66.5" stroke="#3F2A1E" strokeWidth={2} fill="none" strokeLinecap="round" />
          {/* turban */}
          <Ellipse cx={50} cy={47} rx={18} ry={11} fill="#FFFFFF" />
          <Path d="M34 47 Q50 40 66 47 M35 51 Q50 44 65 51" stroke="#D9D1C2" strokeWidth={1.4} fill="none" />
          <Circle cx={50} cy={42.5} r={3.4} fill="#D7263D" stroke={GOLD} strokeWidth={1.2} />
          <Path d="M50 39 C47 33 49 29 53 27" stroke={GOLD} strokeWidth={1.6} fill="none" strokeLinecap="round" />
          {/* gold coins */}
          <G>
            {[100, 95.5, 91].map((y) => (
              <G key={y}>
                <Ellipse cx={72} cy={y + 1.4} rx={7.5} ry={2.8} fill={shade(GOLD, -0.3)} />
                <Ellipse cx={72} cy={y} rx={7.5} ry={2.8} fill={GOLD} />
              </G>
            ))}
          </G>
        </G>
      );
    case 'washi':
      return (
        <G>
          {/* the hood falls on the shoulders */}
          <Path d="M28 108 C28 78 30 42 50 36 C70 42 72 78 72 108 Z" fill={shade(c, -0.25)} />
          <Bust color={c} />
          <Face look={1.4} smile="sly" />
          <Path d="M36.5 60 C37 46 43 42 50 42 C57 42 63 46 63.5 60 C60 52 55 49.5 50 49.5 C45 49.5 40 52 36.5 60 Z" fill={shade(c, -0.35)} />
          {/* the hand that hides the whisper */}
          <Path d="M58 72 C58 66 61 63 64 64 C67 65 67 70 65 74 C63 77 59 77 58 72 Z" fill={SKIN} stroke={shade(SKIN, -0.25)} strokeWidth={0.8} />
          <Path d="M70 62 Q73 66 70 70 M74 59 Q78.5 66 74 73 M78 56 Q84 66 78 76" stroke={GOLD} strokeWidth={1.6} fill="none" strokeLinecap="round" />
          <Path d="M44 84 L50 92 L56 84" stroke={alpha(CREAM, 0.6)} strokeWidth={1.4} fill="none" />
        </G>
      );
    case 'qursan':
      return (
        <G>
          <Bust color={c} />
          <Path d="M50 80 L50 108" stroke={shade(c, -0.3)} strokeWidth={1.5} />
          <Circle cx={50} cy={88} r={1.8} fill={GOLD} />
          <Circle cx={50} cy={96} r={1.8} fill={GOLD} />
          <Circle cx={50} cy={104} r={1.8} fill={GOLD} />
          <Face smile="grin" />
          {/* eye patch */}
          <Line x1={38} y1={54} x2={62.5} y2={57} stroke={INK} strokeWidth={1.2} />
          <Circle cx={54.5} cy={59.5} r={3.4} fill={INK} />
          {/* bandana */}
          <Path d="M37 56 C37 44 43 39.5 50 39.5 C57 39.5 63 44 63 56 C57 52 43 52 37 56 Z" fill="#D7263D" />
          <Circle cx={45} cy={46} r={1.3} fill="#FFFFFF" />
          <Circle cx={52} cy={44} r={1.3} fill="#FFFFFF" />
          <Circle cx={58} cy={48} r={1.3} fill="#FFFFFF" />
          <Path d="M37.5 54 L30 52 L33 58 Z M37.5 55 L31 60 L36.5 61 Z" fill="#B81D32" />
          <Circle cx={37.6} cy={65} r={2} stroke={GOLD} strokeWidth={1.2} fill="none" />
          {/* a gold anchor */}
          <G stroke={GOLD} strokeWidth={2.2} fill="none" strokeLinecap="round">
            <Circle cx={73} cy={86} r={2.4} />
            <Line x1={73} y1={88.5} x2={73} y2={103} />
            <Line x1={68.5} y1={92} x2={77.5} y2={92} />
            <Path d="M66 98 Q67 104 73 104 Q79 104 80 98" />
          </G>
        </G>
      );
    case 'safir':
      return (
        <G>
          <Bust color={c} />
          <Path d="M28 96 L68 81 L72 87 L32 102 Z" fill={GOLD} />
          <Face />
          <Path d="M45 64.6 Q47.5 62.8 50 64.2 Q52.5 62.8 55 64.6" stroke="#3F2A1E" strokeWidth={1.8} fill="none" strokeLinecap="round" />
          {/* fez and tassel */}
          <Path d="M39.5 51 L42 36.5 L58 36.5 L60.5 51 Z" fill="#C0392B" />
          <Rect x={41.5} y={35} width={17} height={3} rx={1.5} fill={shade('#C0392B', -0.25)} />
          <Path d="M50 36 Q58 38 59.5 47" stroke={INK} strokeWidth={1.2} fill="none" />
          <Circle cx={59.5} cy={48} r={1.8} fill={INK} />
          {/* the sealed letter */}
          <G>
            <Rect x={16} y={88} width={22} height={15} rx={1.5} fill="#FFFFFF" stroke="#CFC6B5" strokeWidth={1} />
            <Path d="M16.5 88.5 L27 97 L37.5 88.5" stroke="#CFC6B5" strokeWidth={1} fill="none" />
            <Circle cx={27} cy={97} r={3.2} fill="#C0392B" />
          </G>
        </G>
      );
    case 'harisa':
      return (
        <G>
          {/* headscarf behind the face */}
          <Path d="M33 68 C32 48 39 39.5 50 39.5 C61 39.5 68 48 67 68 C67 80 60 86 50 86 C40 86 33 80 33 68 Z" fill="#2B2766" />
          <Bust color={c} />
          <Path d="M38 82 C42 88 58 88 62 82 L64 86 C58 93 42 93 36 86 Z" fill="#2B2766" />
          <Face lashes />
          <Path d="M37.5 55 C39 46.5 44 44 50 44 C56 44 61 46.5 62.5 55 C58 50 42 50 37.5 55 Z" fill="#2B2766" />
          <Path d="M39 52 C44 47.5 56 47.5 61 52" stroke={GOLD} strokeWidth={2} fill="none" strokeLinecap="round" />
          <Circle cx={50} cy={48.6} r={1.7} fill={GOLD} />
          {/* the round shield */}
          <Circle cx={27} cy={95} r={12} fill={GOLD} stroke={shade(GOLD, -0.3)} strokeWidth={1.5} />
          <Path d={star8(27, 95, 7.5)} fill={c} />
          <Circle cx={27} cy={95} r={2.2} fill={GOLD} />
        </G>
      );
  }
}

/** A small symbol of the role in a 24 × 24 box. */
export function RoleIcon({ role, size = 20, color }: { role: CoupRole; size?: number; color?: string }) {
  const c = color ?? ROLE_INFO[role].color;
  let body;
  switch (role) {
    case 'wazir':
      body = (
        <G fill={c}>
          <Ellipse cx={12} cy={18.5} rx={8} ry={3} />
          <Ellipse cx={12} cy={13} rx={8} ry={3} />
          <Ellipse cx={12} cy={7.5} rx={8} ry={3} />
        </G>
      );
      break;
    case 'washi':
      body = (
        <G>
          <Path d="M2 12 C6 5.5 18 5.5 22 12 C18 18.5 6 18.5 2 12 Z" fill={c} />
          <Circle cx={13.5} cy={12} r={3.4} fill={color ? NAVY : CREAM} />
          <Circle cx={14.2} cy={12} r={1.6} fill={c} />
        </G>
      );
      break;
    case 'qursan':
      body = (
        <G stroke={c} strokeWidth={2.4} fill="none" strokeLinecap="round">
          <Circle cx={12} cy={4.5} r={2.3} />
          <Line x1={12} y1={7} x2={12} y2={21} />
          <Line x1={7} y1={10.5} x2={17} y2={10.5} />
          <Path d="M4 15 Q5 21 12 21 Q19 21 20 15" />
        </G>
      );
      break;
    case 'safir':
      body = (
        <G>
          <Rect x={2} y={5} width={20} height={14} rx={2} fill={c} />
          <Path d="M2.8 6 L12 13 L21.2 6" stroke={color ? NAVY : CREAM} strokeWidth={1.6} fill="none" />
          <Circle cx={12} cy={13} r={2.6} fill={color ? NAVY : '#E2475F'} />
        </G>
      );
      break;
    case 'harisa':
      body = (
        <G>
          <Path d="M12 2 L21 5.5 C21 13 18 18.5 12 22 C6 18.5 3 13 3 5.5 Z" fill={c} />
          <Path d={star8(12, 11.5, 4.6)} fill={color ? NAVY : CREAM} />
        </G>
      );
      break;
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {body}
    </Svg>
  );
}

/** A card face: the portrait under the arch, the symbol in the corner and the name on a ribbon. */
export const RoleCard = memo(function RoleCard({ role, w, dim, label }: { role: CoupRole; w: number; dim?: boolean; label?: string }) {
  const h = Math.round(w * CARD_RATIO);
  const c = ROLE_INFO[role].color;
  const small = w < 70;
  return (
    <View style={{ width: w, height: h, opacity: dim ? 0.5 : 1 }}>
      <Svg width={w} height={h} viewBox="0 0 100 140">
        <Rect x={0} y={0} width={100} height={140} rx={9} fill={c} />
        <Rect x={4} y={4} width={92} height={132} rx={6.5} fill={CREAM} />
        <Path d="M13 110 V46 C13 23 30 11 50 11 C70 11 87 23 87 46 V110 Z" fill={shade(c, 0.62)} stroke={GOLD} strokeWidth={2} />
        <Portrait role={role} />
        <Path d="M13 110 V46 C13 23 30 11 50 11 C70 11 87 23 87 46 V110 Z" fill="none" stroke={GOLD} strokeWidth={2.4} />
        <Rect x={4} y={110} width={92} height={26} fill={c} />
        <Rect x={4} y={110} width={92} height={2} fill={GOLD} />
        <Circle cx={16} cy={16} r={10} fill={CREAM} stroke={GOLD} strokeWidth={1.5} />
      </Svg>
      <View style={[styles.corner, { left: (w * 8) / 100, top: (w * 8) / 100 }]} pointerEvents="none">
        <RoleIcon role={role} size={Math.round((w * 16) / 100)} />
      </View>
      <View style={[styles.ribbon, { height: (h * 26) / 140 }]} pointerEvents="none">
        <Txt numberOfLines={1} style={{ fontFamily: small ? F.bold : F.display, color: CREAM, fontSize: Math.max(10, Math.round(w * (small ? 0.15 : 0.16))), lineHeight: Math.round((h * 26) / 140) + 2, textAlign: 'center' }}>
          {ROLE_INFO[role].name}
        </Txt>
      </View>
      {label ? (
        <View style={styles.tag} pointerEvents="none">
          <Txt style={{ fontFamily: F.bold, fontSize: 11, lineHeight: 16, color: CREAM }}>{label}</Txt>
        </View>
      ) : null}
    </View>
  );
});

/** The back of a court card. */
export const CardBack = memo(function CardBack({ w }: { w: number }) {
  const h = Math.round(w * CARD_RATIO);
  return (
    <Svg width={w} height={h} viewBox="0 0 100 140">
      <Rect x={0} y={0} width={100} height={140} rx={9} fill={NAVY} />
      <Rect x={6} y={6} width={88} height={128} rx={6} fill="none" stroke={GOLD} strokeWidth={2} />
      <Rect x={11} y={11} width={78} height={118} rx={4} fill="none" stroke={alpha(GOLD, 0.45)} strokeWidth={1} />
      <Path d={star8(50, 70, 26)} fill="none" stroke={GOLD} strokeWidth={2.4} />
      <Path d={star8(50, 70, 15)} fill={alpha(GOLD, 0.85)} />
      <Circle cx={50} cy={70} r={5} fill={NAVY} />
      {[
        [22, 24],
        [78, 24],
        [22, 116],
        [78, 116],
      ].map(([x, y]) => (
        <Path key={`${x}${y}`} d={star8(x, y, 6)} fill={alpha(GOLD, 0.6)} />
      ))}
    </Svg>
  );
});

/** A card at seat size: a back, or a face-up role (a symbol on the role's colour). */
export function MiniCard({ role, w: size }: { role: CoupRole | null; w?: number }) {
  const w = size ?? dk(18);
  const h = Math.round(w * CARD_RATIO);
  if (!role) {
    return (
      <View style={[styles.mini, { width: w, height: h, backgroundColor: NAVY, borderColor: GOLD }]}>
        <Svg width={w * 0.6} height={w * 0.6} viewBox="0 0 24 24">
          <Path d={star8(12, 12, 10)} fill={GOLD} />
        </Svg>
      </View>
    );
  }
  return (
    <View style={[styles.mini, { width: w, height: h, backgroundColor: CREAM, borderColor: ROLE_INFO[role].color }]} accessibilityLabel={`${ROLE_INFO[role].name} مكشوف`}>
      <RoleIcon role={role} size={Math.round(w * 0.78)} />
    </View>
  );
}

/** A card the player can tap (choose the card to reveal, the cards to keep). */
export function TapCard({ role, w, on, onPress, disabled, label }: { role: CoupRole; w: number; on: boolean; onPress: () => void; disabled?: boolean; label?: string }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${ROLE_INFO[role].name}${on ? ' — مختارة' : ''}`}
      style={{ borderRadius: 12, borderWidth: 3, borderColor: on ? GOLD : 'transparent', padding: 2, transform: [{ translateY: on ? -6 : 0 }] }}>
      <RoleCard role={role} w={w} label={label} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  corner: { position: 'absolute' },
  ribbon: { position: 'absolute', left: 0, right: 0, bottom: '2.9%', justifyContent: 'center' },
  tag: { position: 'absolute', top: '42%', alignSelf: 'center', backgroundColor: 'rgba(20,22,51,0.85)', borderRadius: 999, paddingHorizontal: 8 },
  mini: { borderRadius: 3, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
