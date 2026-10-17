/**
 * «قصص الأنبياء» — a modest illustrated scene per chapter, drawn from simple shapes: places, objects
 * and scenery only (a well, a ship, the sea, a palace…). Never people, prophets or angels.
 */
import type { ReactNode } from 'react';
import Svg, { Circle, Defs, Ellipse, G, Line, LinearGradient, Path, Polygon, Rect, Stop } from 'react-native-svg';

import type { ProphetsScene } from '@/shared/games/prophets';
import { hashRand } from '@/theme';

const W = 320;
const H = 160;

type SkyKind = 'night' | 'day' | 'dusk' | 'storm' | 'deep' | 'dawn';
const SKY: Record<SkyKind, [string, string]> = {
  night: ['#141A44', '#33357A'],
  day: ['#7FC1E8', '#D9EEF7'],
  dusk: ['#5B4A8C', '#F2A35E'],
  storm: ['#2E3247', '#5C6378'],
  deep: ['#0E3B5C', '#06192B'],
  dawn: ['#2B3270', '#E8A873'],
};

const SAND = '#E2B970';
const SAND_DARK = '#C69652';
const STONE = '#A39482';
const STONE_DARK = '#7E705F';
const WOOD = '#8A5A2B';
const WOOD_DARK = '#5E3B1A';
const WATER = '#2F7FB6';
const WATER_DARK = '#1E5E8E';
const LEAF = '#4E9A5B';
const LEAF_DARK = '#357545';
const GOLD = '#F2C14E';

function Sky({ kind, id }: { kind: SkyKind; id: string }) {
  const [a, b] = SKY[kind];
  return (
    <>
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={a} />
          <Stop offset="1" stopColor={b} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={W} height={H} fill={`url(#${id})`} />
    </>
  );
}

function Stars({ n = 26, seed = 1, maxY = 90 }: { n?: number; seed?: number; maxY?: number }) {
  return (
    <G>
      {Array.from({ length: n }, (_, i) => (
        <Circle key={i} cx={hashRand(i, seed) * W} cy={6 + hashRand(i, seed + 7) * maxY} r={0.7 + hashRand(i, seed + 3) * 1.2} fill="#FFF6D8" opacity={0.55 + hashRand(i, seed + 5) * 0.45} />
      ))}
    </G>
  );
}

function Crescent({ x, y, r = 12 }: { x: number; y: number; r?: number }) {
  return <Path d={`M${x} ${y - r} A ${r} ${r} 0 1 0 ${x} ${y + r} A ${r * 0.72} ${r} 0 1 1 ${x} ${y - r} Z`} fill="#FFF3C4" />;
}

function Sun({ x, y, r = 16, color = '#FFD66B' }: { x: number; y: number; r?: number; color?: string }) {
  return (
    <G>
      <Circle cx={x} cy={y} r={r * 1.7} fill={color} opacity={0.2} />
      <Circle cx={x} cy={y} r={r} fill={color} />
    </G>
  );
}

function Cloud({ x, y, s = 1, color = '#FFFFFF', o = 0.9 }: { x: number; y: number; s?: number; color?: string; o?: number }) {
  return (
    <G opacity={o}>
      <Ellipse cx={x} cy={y} rx={22 * s} ry={9 * s} fill={color} />
      <Circle cx={x - 8 * s} cy={y - 6 * s} r={9 * s} fill={color} />
      <Circle cx={x + 7 * s} cy={y - 8 * s} r={11 * s} fill={color} />
    </G>
  );
}

function Dunes({ color = SAND, dark = SAND_DARK, y = 112 }: { color?: string; dark?: string; y?: number }) {
  return (
    <G>
      <Path d={`M0 ${y} Q 60 ${y - 22} 130 ${y - 4} T 260 ${y - 8} T 320 ${y - 14} L320 ${H} L0 ${H} Z`} fill={dark} />
      <Path d={`M0 ${y + 14} Q 80 ${y - 4} 170 ${y + 12} T 320 ${y + 6} L320 ${H} L0 ${H} Z`} fill={color} />
    </G>
  );
}

function Hills({ color = '#6B5B95', y = 104, o = 1 }: { color?: string; y?: number; o?: number }) {
  return <Path d={`M0 ${y} L40 ${y - 30} L80 ${y - 8} L130 ${y - 44} L185 ${y - 6} L230 ${y - 34} L280 ${y - 4} L320 ${y - 24} L320 ${H} L0 ${H} Z`} fill={color} opacity={o} />;
}

function Ground({ color, y = 120 }: { color: string; y?: number }) {
  return <Rect x={0} y={y} width={W} height={H - y} fill={color} />;
}

function Waves({ y, color = WATER, dark = WATER_DARK, amp = 5 }: { y: number; color?: string; dark?: string; amp?: number }) {
  let d = `M0 ${y}`;
  for (let x = 0; x < W; x += 40) d += ` Q ${x + 10} ${y - amp} ${x + 20} ${y} T ${x + 40} ${y}`;
  return (
    <G>
      <Path d={`${d} L${W} ${H} L0 ${H} Z`} fill={color} />
      {[0, 1, 2].map((k) => (
        <Path key={k} d={`M${20 + k * 100} ${y + 14 + k * 8} q 10 -4 20 0 t 20 0`} stroke={dark} strokeWidth={2} fill="none" opacity={0.7} />
      ))}
    </G>
  );
}

function Palm({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  const t = (dx: number, dy: number) => `${x + dx * s} ${y + dy * s}`;
  return (
    <G>
      <Path d={`M${t(-2, 0)} Q ${t(-6, -22)} ${t(0, -44)} L ${t(4, -44)} Q ${t(-1, -22)} ${t(3, 0)} Z`} fill={WOOD} />
      {[-1, 1].map((d) => (
        <G key={d}>
          <Path d={`M${t(2, -44)} Q ${t(16 * d, -56)} ${t(30 * d, -40)} Q ${t(14 * d, -48)} ${t(2, -42)} Z`} fill={LEAF} />
          <Path d={`M${t(2, -44)} Q ${t(12 * d, -64)} ${t(22 * d, -60)} Q ${t(10 * d, -56)} ${t(2, -45)} Z`} fill={LEAF_DARK} />
        </G>
      ))}
    </G>
  );
}

function Tree({ x, y, s = 1, color = LEAF }: { x: number; y: number; s?: number; color?: string }) {
  return (
    <G>
      <Rect x={x - 2.5 * s} y={y - 18 * s} width={5 * s} height={18 * s} fill={WOOD} />
      <Circle cx={x} cy={y - 26 * s} r={13 * s} fill={color} />
      <Circle cx={x - 9 * s} cy={y - 19 * s} r={8 * s} fill={color} />
      <Circle cx={x + 9 * s} cy={y - 19 * s} r={8 * s} fill={color} />
    </G>
  );
}

function Ship({ x, y, s = 1, sail = true }: { x: number; y: number; s?: number; sail?: boolean }) {
  const p = (dx: number, dy: number) => `${x + dx * s},${y + dy * s}`;
  return (
    <G>
      {sail ? (
        <>
          <Line x1={x} y1={y - 4 * s} x2={x} y2={y - 52 * s} stroke={WOOD_DARK} strokeWidth={2.5 * s} />
          <Polygon points={`${p(2, -50)} ${p(30, -14)} ${p(2, -12)}`} fill="#F4EBD6" />
          <Polygon points={`${p(-2, -44)} ${p(-22, -14)} ${p(-2, -12)}`} fill="#E6D8B8" />
        </>
      ) : null}
      <Polygon points={`${p(-44, -8)} ${p(44, -8)} ${p(32, 8)} ${p(-32, 8)}`} fill={WOOD} />
      <Rect x={x - 40 * s} y={y - 10 * s} width={80 * s} height={4 * s} fill={WOOD_DARK} />
    </G>
  );
}

/** A big wooden ark (Nuh's ship): a long hull with a cabin. */
function Ark({ x, y, s = 1, ribs = false }: { x: number; y: number; s?: number; ribs?: boolean }) {
  const p = (dx: number, dy: number) => `${x + dx * s},${y + dy * s}`;
  return (
    <G>
      {ribs ? (
        <G>
          <Polygon points={`${p(-62, -12)} ${p(62, -12)} ${p(48, 10)} ${p(-48, 10)}`} fill={WOOD} opacity={0.95} />
          {Array.from({ length: 9 }, (_, i) => (
            <Line key={i} x1={x + (-50 + i * 12.5) * s} y1={y - 12 * s} x2={x + (-50 + i * 12.5) * s} y2={y - 34 * s} stroke={WOOD_DARK} strokeWidth={3 * s} />
          ))}
          <Line x1={x - 56 * s} y1={y - 34 * s} x2={x + 56 * s} y2={y - 34 * s} stroke={WOOD_DARK} strokeWidth={3 * s} />
        </G>
      ) : (
        <G>
          <Rect x={x - 26 * s} y={y - 30 * s} width={52 * s} height={20 * s} fill="#A87442" />
          <Polygon points={`${p(-30, -30)} ${p(30, -30)} ${p(22, -40)} ${p(-22, -40)}`} fill={WOOD_DARK} />
          {[-14, 0, 14].map((d) => (
            <Rect key={d} x={x + (d - 3) * s} y={y - 24 * s} width={6 * s} height={6 * s} fill="#3B2410" />
          ))}
          <Polygon points={`${p(-62, -12)} ${p(62, -12)} ${p(48, 10)} ${p(-48, 10)}`} fill={WOOD} />
          <Rect x={x - 60 * s} y={y - 14 * s} width={120 * s} height={4 * s} fill={WOOD_DARK} />
        </G>
      )}
    </G>
  );
}

function Rain({ n = 40, color = '#BFD7EA' }: { n?: number; color?: string }) {
  return (
    <G opacity={0.75}>
      {Array.from({ length: n }, (_, i) => {
        const x = hashRand(i, 11) * W;
        const y = 20 + hashRand(i, 13) * 110;
        return <Line key={i} x1={x} y1={y} x2={x - 4} y2={y + 12} stroke={color} strokeWidth={1.4} />;
      })}
    </G>
  );
}

function Houses({ y = 122, color = '#D9B98C', dark = '#B8956A', win = '#5A4630' }: { y?: number; color?: string; dark?: string; win?: string }) {
  const blocks = [
    [8, 34, 40],
    [44, 28, 52],
    [74, 40, 34],
    [116, 30, 46],
    [148, 38, 30],
    [188, 26, 56],
    [216, 42, 38],
    [260, 30, 48],
    [292, 28, 36],
  ];
  return (
    <G>
      {blocks.map(([x, w, h], i) => (
        <G key={i}>
          <Rect x={x} y={y - h} width={w} height={h} fill={i % 2 ? dark : color} />
          <Rect x={x + w / 2 - 4} y={y - h + 10} width={8} height={9} rx={4} fill={win} />
          {h > 40 ? <Rect x={x + w / 2 - 4} y={y - h + 26} width={8} height={9} rx={4} fill={win} /> : null}
        </G>
      ))}
    </G>
  );
}

function Columns({ x, y, n, gap, h, color = '#E9DCC0' }: { x: number; y: number; n: number; gap: number; h: number; color?: string }) {
  return (
    <G>
      {Array.from({ length: n }, (_, i) => (
        <G key={i}>
          <Rect x={x + i * gap} y={y - h} width={10} height={h} fill={color} />
          <Rect x={x + i * gap - 2} y={y - h - 4} width={14} height={5} fill="#CDBB96" />
        </G>
      ))}
    </G>
  );
}

function Flames({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  const f = (dx: number, h: number, w: number, c: string) => (
    <Path d={`M${x + (dx - w) * s} ${y} Q ${x + (dx - w * 0.6) * s} ${y - h * 0.6 * s} ${x + dx * s} ${y - h * s} Q ${x + (dx + w * 0.6) * s} ${y - h * 0.6 * s} ${x + (dx + w) * s} ${y} Z`} fill={c} />
  );
  return (
    <G>
      <Ellipse cx={x} cy={y - 18 * s} rx={60 * s} ry={40 * s} fill="#F28C3A" opacity={0.18} />
      {f(-26, 40, 14, '#E8552F')}
      {f(24, 46, 15, '#E8552F')}
      {f(0, 62, 20, '#F28C3A')}
      {f(-12, 40, 11, '#F7B84B')}
      {f(12, 44, 11, '#F7B84B')}
      {f(0, 30, 9, '#FFE38A')}
    </G>
  );
}

const scenes: Record<ProphetsScene, (id: string) => ReactNode> = {
  stars: (id) => (
    <>
      <Sky kind="dawn" id={id} />
      <Stars n={11} seed={4} maxY={60} />
      <Stars n={14} seed={9} maxY={40} />
      <Crescent x={250} y={34} r={13} />
      <Sun x={70} y={128} r={18} color="#F7B65A" />
      <Dunes color="#3E3768" dark="#2E2A55" y={118} />
    </>
  ),
  well: (id) => (
    <>
      <Sky kind="day" id={id} />
      <Sun x={262} y={30} r={14} />
      <Dunes />
      <Palm x={60} y={122} s={1} />
      <G>
        <Rect x={152} y={86} width={4} height={30} fill={WOOD_DARK} />
        <Rect x={204} y={86} width={4} height={30} fill={WOOD_DARK} />
        <Rect x={148} y={82} width={64} height={6} rx={3} fill={WOOD} />
        <Line x1={180} y1={88} x2={180} y2={102} stroke="#D8C49A" strokeWidth={1.5} />
        <Rect x={175} y={101} width={10} height={8} rx={2} fill={WOOD} />
        <Rect x={146} y={112} width={68} height={26} rx={4} fill={STONE} />
        <Ellipse cx={180} cy={112} rx={34} ry={6} fill="#3A3128" />
        {[0, 1, 2, 3].map((k) => (
          <Line key={k} x1={150 + k * 18} y1={120} x2={150 + k * 18} y2={138} stroke={STONE_DARK} strokeWidth={1.2} />
        ))}
      </G>
    </>
  ),
  desert: (id) => (
    <>
      <Sky kind="dusk" id={id} />
      <Sun x={230} y={92} r={18} color="#F7C26B" />
      <Dunes />
      <Palm x={40} y={128} s={0.9} />
      <Palm x={286} y={124} s={0.8} />
      <G>
        <Path d="M108 126 Q 128 112 146 98 Q 164 112 184 126 Z" fill="#B2804B" />
        <Line x1={146} y1={98} x2={146} y2={92} stroke={WOOD_DARK} strokeWidth={2} />
        <Path d="M140 126 L146 110 L152 126 Z" fill="#5E3B1A" />
        <Ellipse cx={200} cy={126} rx={9} ry={4} fill="#9C6B3B" />
        <Path d="M193 126 Q 192 112 200 110 Q 208 112 207 126 Z" fill="#B97F45" />
        <Path d="M90 140 q 10 -3 20 0 M118 146 q 10 -3 20 0 M150 150 q 10 -3 20 0" stroke={SAND_DARK} strokeWidth={2} fill="none" />
      </G>
    </>
  ),
  palace: (id) => (
    <>
      <Sky kind="day" id={id} />
      <Sun x={40} y={30} r={13} />
      <Ground color={SAND} y={130} />
      <G>
        <Rect x={70} y={64} width={180} height={66} fill="#EADCBC" />
        <Rect x={64} y={56} width={192} height={10} fill="#CDB98F" />
        <Columns x={84} y={130} n={8} gap={22} h={58} />
        <Rect x={146} y={92} width={28} height={38} fill="#5A4630" />
        <Path d="M146 92 Q 160 76 174 92 Z" fill="#5A4630" />
        <Rect x={56} y={130} width={208} height={6} fill="#CDB98F" />
        <Rect x={48} y={136} width={224} height={6} fill="#BFA97C" />
        <Rect x={156} y={36} width={8} height={20} fill="#CDB98F" />
        <Polygon points="164,36 184,42 164,48" fill="#2FA57A" />
      </G>
    </>
  ),
  prison: (id) => (
    <>
      <Rect x={0} y={0} width={W} height={H} fill="#4A4038" />
      {Array.from({ length: 6 }, (_, r) =>
        Array.from({ length: 9 }, (_, c) => (
          <Rect key={`${r}-${c}`} x={c * 38 - (r % 2) * 19} y={r * 28} width={36} height={26} rx={2} fill={(r + c) % 3 ? '#5C5046' : '#544940'} />
        )),
      )}
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#1C2459" />
          <Stop offset="1" stopColor="#3B3F86" />
        </LinearGradient>
      </Defs>
      <Rect x={124} y={34} width={72} height={58} rx={6} fill={`url(#${id})`} />
      <Crescent x={172} y={52} r={8} />
      <Circle cx={140} cy={46} r={1.2} fill="#FFF6D8" />
      <Circle cx={150} cy={74} r={1} fill="#FFF6D8" />
      {[0, 1, 2, 3, 4].map((k) => (
        <Rect key={k} x={130 + k * 14} y={34} width={4} height={58} fill="#2A2420" />
      ))}
      <Rect x={124} y={30} width={72} height={6} fill="#2A2420" />
      <Rect x={124} y={90} width={72} height={6} fill="#2A2420" />
      <Polygon points="124,96 196,96 250,160 70,160" fill="#8C84B8" opacity={0.18} />
      <Rect x={0} y={140} width={W} height={20} fill="#3A322B" />
    </>
  ),
  wheat: (id) => (
    <>
      <Sky kind="day" id={id} />
      <Sun x={268} y={32} r={14} />
      <Ground color="#D6B35A" y={108} />
      {Array.from({ length: 20 }, (_, i) => {
        const x = 10 + i * 16;
        const y = 150 - (i % 2) * 6;
        return (
          <G key={i}>
            <Line x1={x} y1={y} x2={x + 2} y2={y - 34} stroke="#B8902E" strokeWidth={1.6} />
            <Ellipse cx={x + 2} cy={y - 38} rx={2.6} ry={7} fill={i % 3 === 0 ? '#9DBF5A' : '#E9C25A'} />
          </G>
        );
      })}
      <G>
        <Rect x={40} y={70} width={40} height={40} fill="#E2CFA4" />
        <Path d="M40 70 Q 60 46 80 70 Z" fill="#CDB98F" />
        <Rect x={90} y={78} width={34} height={32} fill="#E2CFA4" />
        <Path d="M90 78 Q 107 58 124 78 Z" fill="#CDB98F" />
      </G>
    </>
  ),
  river: (id) => (
    <>
      <Sky kind="dawn" id={id} />
      <Sun x={260} y={70} r={14} color="#F7B65A" />
      <Ground color="#5E8F4E" y={88} />
      <Path d="M0 104 Q 160 88 320 106 L320 160 L0 160 Z" fill={WATER} />
      <Path d="M30 126 q 12 -4 24 0 M200 120 q 12 -4 24 0 M120 146 q 12 -4 24 0" stroke={WATER_DARK} strokeWidth={2} fill="none" />
      {[14, 22, 30, 290, 298, 306].map((x, i) => (
        <G key={i}>
          <Line x1={x} y1={110} x2={x + (i % 2 ? 3 : -3)} y2={74} stroke="#3F7A3A" strokeWidth={2} />
          <Ellipse cx={x + (i % 2 ? 3 : -3)} cy={72} rx={2.4} ry={6} fill="#7A5A2E" />
        </G>
      ))}
      <G>
        <Rect x={146} y={118} width={36} height={16} rx={3} fill={WOOD} />
        <Rect x={143} y={114} width={42} height={6} rx={3} fill={WOOD_DARK} />
        <Ellipse cx={164} cy={136} rx={26} ry={3} fill={WATER_DARK} opacity={0.6} />
      </G>
    </>
  ),
  mountain: (id) => (
    <>
      <Sky kind="night" id={id} />
      <Stars n={22} seed={3} maxY={60} />
      <Path d="M0 160 L0 128 L70 100 L160 40 L240 96 L320 118 L320 160 Z" fill="#3B3566" />
      <Path d="M160 40 L182 56 L170 60 L160 52 L148 62 L140 56 Z" fill="#5A5590" />
      <Flames x={214} y={86} s={0.32} />
      <Ground color="#2A2650" y={140} />
    </>
  ),
  staff: (id) => (
    <>
      <Sky kind="night" id={id} />
      <Stars n={20} seed={8} maxY={70} />
      <Crescent x={60} y={36} r={10} />
      <Hills color="#3B3566" y={118} />
      <Ground color="#4A4378" y={128} />
      <G>
        <Ellipse cx={170} cy={140} rx={42} ry={5} fill="#2A2650" />
        <Path d="M150 138 L 196 66" stroke={WOOD} strokeWidth={6} strokeLinecap="round" />
        <Path d="M196 66 q 8 -6 4 -14" stroke={WOOD} strokeWidth={6} strokeLinecap="round" fill="none" />
      </G>
      {[70, 250, 285].map((x) => (
        <G key={x}>
          <Circle cx={x} cy={134} r={6} fill={LEAF_DARK} />
          <Circle cx={x + 7} cy={136} r={5} fill={LEAF} />
        </G>
      ))}
    </>
  ),
  sea: (id) => (
    <>
      <Sky kind="dawn" id={id} />
      <Sun x={160} y={52} r={14} color="#F7C26B" />
      <Path d="M0 64 Q 60 56 120 70 L136 160 L0 160 Z" fill={WATER} />
      <Path d="M320 64 Q 260 56 200 70 L184 160 L320 160 Z" fill={WATER} />
      <Path d="M120 70 L136 160 L124 160 L110 74 Z" fill={WATER_DARK} />
      <Path d="M200 70 L184 160 L196 160 L210 74 Z" fill={WATER_DARK} />
      <Polygon points="120,70 200,70 184,160 136,160" fill={SAND} />
      <Path d="M150 160 L156 100 M170 160 L164 100" stroke={SAND_DARK} strokeWidth={1.5} strokeDasharray="3 5" />
      <Path d="M20 96 q 12 -4 24 0 M60 120 q 12 -4 24 0 M240 100 q 12 -4 24 0 M270 132 q 12 -4 24 0" stroke="#9FCBEA" strokeWidth={2} fill="none" />
    </>
  ),
  calm: (id) => (
    <>
      <Sky kind="day" id={id} />
      <Sun x={160} y={52} r={15} />
      <Cloud x={60} y={36} s={0.9} />
      <Cloud x={262} y={30} s={0.8} />
      <Waves y={96} amp={3} />
      <Path d="M0 160 L0 140 Q 90 128 180 140 T 320 136 L320 160 Z" fill={SAND} />
    </>
  ),
  ship: (id) => (
    <>
      <Sky kind="storm" id={id} />
      <Cloud x={70} y={34} s={1.4} color="#7D8399" />
      <Cloud x={230} y={28} s={1.6} color="#6E7489" />
      <Waves y={112} amp={8} />
      <Ship x={160} y={110} s={1.1} />
    </>
  ),
  ark: (id) => (
    <>
      <Sky kind="day" id={id} />
      <Cloud x={70} y={34} s={1} />
      <Hills color="#7FA36B" y={110} />
      <Ground color="#8DB36E" y={120} />
      <Ark x={160} y={128} s={1} ribs />
      <Tree x={36} y={132} s={1} />
      <Tree x={290} y={130} s={0.9} />
      <Rect x={244} y={138} width={30} height={4} fill={WOOD} />
      <Rect x={248} y={133} width={26} height={4} fill={WOOD_DARK} />
    </>
  ),
  judi: (id) => (
    <>
      <Sky kind="day" id={id} />
      <Sun x={262} y={30} r={14} />
      <Waves y={124} amp={3} />
      <Path d="M70 128 L150 70 L176 64 L250 128 Z" fill="#7C6B58" />
      <Path d="M150 70 L176 64 L190 76 L140 78 Z" fill="#94826D" />
      <Ark x={164} y={64} s={0.55} />
    </>
  ),
  flood: (id) => (
    <>
      <Sky kind="storm" id={id} />
      <Cloud x={50} y={26} s={1.6} color="#5A6075" />
      <Cloud x={170} y={20} s={1.8} color="#4E5468" />
      <Cloud x={280} y={28} s={1.5} color="#5A6075" />
      <Rain n={46} />
      <Path d="M0 120 Q 40 84 80 112 Q 120 80 170 110 Q 220 78 260 108 Q 290 88 320 104 L320 160 L0 160 Z" fill={WATER} />
      <Ark x={160} y={104} s={0.8} />
      <Path d="M0 140 Q 50 118 100 136 Q 160 116 210 138 Q 260 118 320 134 L320 160 L0 160 Z" fill={WATER_DARK} />
    </>
  ),
  fire: (id) => (
    <>
      <Sky kind="night" id={id} />
      <Stars n={16} seed={6} maxY={50} />
      <Ground color="#2A2650" y={126} />
      <Flames x={160} y={132} s={1} />
      {[96, 120, 200, 224].map((x) => (
        <Rect key={x} x={x - 12} y={128} width={24} height={8} rx={4} fill={WOOD_DARK} />
      ))}
      <Circle cx={160} cy={110} r={12} fill="#BFE6C8" opacity={0.35} />
    </>
  ),
  kaaba: (id) => (
    <>
      <Sky kind="day" id={id} />
      <Sun x={56} y={32} r={13} />
      <Hills color="#A0866A" y={112} />
      <Ground color="#E6D3AE" y={122} />
      <Ellipse cx={160} cy={136} rx={110} ry={14} fill="#F2E6CC" />
      <G>
        <Polygon points="128,66 182,66 196,74 196,132 142,132 128,124" fill="#1C1C22" />
        <Polygon points="182,66 196,74 196,132 182,124" fill="#111116" />
        <Rect x={128} y={76} width={54} height={6} fill={GOLD} />
        <Polygon points="182,76 196,84 196,90 182,82" fill="#C99B30" />
        <Rect x={146} y={98} width={14} height={22} fill={GOLD} opacity={0.85} />
        <Rect x={128} y={124} width={54} height={8} fill="#2C2C34" />
      </G>
    </>
  ),
  valley: (id) => (
    <>
      <Sky kind="day" id={id} />
      <Sun x={160} y={30} r={14} />
      <Path d="M0 160 L0 70 L40 52 L80 80 L110 120 L210 120 L240 82 L280 56 L320 72 L320 160 Z" fill="#9C8064" />
      <Path d="M0 160 L0 100 L50 86 L100 126 L220 126 L270 90 L320 100 L320 160 Z" fill="#B59878" />
      <Path d="M100 126 L220 126 L240 160 L80 160 Z" fill="#E1C89C" />
      {[130, 150, 176, 196].map((x, i) => (
        <Circle key={x} cx={x} cy={136 + (i % 2) * 8} r={2.5} fill="#A88C68" />
      ))}
    </>
  ),
  fish: (id) => (
    <>
      <Sky kind="deep" id={id} />
      <Polygon points="40,0 80,0 140,160 90,160" fill="#FFFFFF" opacity={0.05} />
      <Polygon points="200,0 230,0 260,160 220,160" fill="#FFFFFF" opacity={0.04} />
      <G>
        <Path d="M60 96 Q 120 50 210 74 Q 250 84 262 96 Q 250 110 210 116 Q 120 140 60 96 Z" fill="#20384F" />
        <Path d="M258 96 L296 72 L288 96 L296 120 Z" fill="#20384F" />
        <Path d="M90 110 Q 140 124 200 112" stroke="#2D4D6B" strokeWidth={3} fill="none" />
        <Circle cx={98} cy={88} r={3} fill="#9CC3DE" />
      </G>
      {[0, 1, 2, 3, 4, 5].map((k) => (
        <Circle key={k} cx={70 + hashRand(k, 21) * 40} cy={70 - k * 10} r={1.5 + hashRand(k, 23) * 2} fill="none" stroke="#9CC3DE" strokeWidth={1} opacity={0.7} />
      ))}
      <Path d="M0 150 Q 80 140 160 152 T 320 146 L320 160 L0 160 Z" fill="#102A3E" />
    </>
  ),
  tree: (id) => (
    <>
      <Sky kind="day" id={id} />
      <Sun x={60} y={30} r={13} />
      <Path d="M0 96 L320 96 L320 160 L0 160 Z" fill={WATER} />
      <Path d="M0 160 L0 130 Q 120 104 320 112 L320 160 Z" fill={SAND} />
      <G>
        <Line x1={196} y1={132} x2={196} y2={84} stroke={WOOD_DARK} strokeWidth={3} />
        <Line x1={258} y1={128} x2={258} y2={84} stroke={WOOD_DARK} strokeWidth={3} />
        <Path d="M188 86 Q 226 70 266 86" stroke={LEAF_DARK} strokeWidth={4} fill="none" />
        {[0, 1, 2, 3, 4, 5, 6].map((k) => (
          <Ellipse key={k} cx={190 + k * 12} cy={80 + (k % 2) * 6} rx={9} ry={7} fill={k % 2 ? LEAF : LEAF_DARK} />
        ))}
        <Ellipse cx={214} cy={98} rx={6} ry={8} fill="#B9C76A" />
        <Ellipse cx={242} cy={100} rx={5} ry={7} fill="#B9C76A" />
        <Ellipse cx={226} cy={134} rx={40} ry={4} fill={SAND_DARK} opacity={0.6} />
      </G>
    </>
  ),
  city: (id) => (
    <>
      <Sky kind="dusk" id={id} />
      <Sun x={250} y={96} r={16} color="#F7C26B" />
      <Houses y={130} />
      <Ground color="#B8956A" y={130} />
      <Rect x={0} y={140} width={W} height={20} fill="#A6845C" />
    </>
  ),
  ants: (id) => (
    <>
      <Sky kind="day" id={id} />
      <Hills color="#A68A6A" y={86} o={0.8} />
      <Ground color="#C9A779" y={92} />
      {[
        [70, 128],
        [240, 118],
      ].map(([x, y]) => (
        <G key={x}>
          <Ellipse cx={x} cy={y} rx={26} ry={10} fill="#B08E62" />
          <Ellipse cx={x} cy={y - 2} rx={5} ry={3} fill="#3E2E1C" />
        </G>
      ))}
      {Array.from({ length: 24 }, (_, i) => {
        const t = i / 23;
        const x = 70 + (240 - 70) * t;
        const y = 126 - 8 * t + Math.sin(t * Math.PI * 2) * 10;
        return (
          <G key={i}>
            <Circle cx={x} cy={y} r={1.6} fill="#2A1E12" />
            <Circle cx={x + 2.6} cy={y} r={1.2} fill="#2A1E12" />
          </G>
        );
      })}
      {[110, 150, 200].map((x) => (
        <Path key={x} d={`M${x} 150 q -4 -12 0 -20 q 4 8 0 20`} fill={LEAF} />
      ))}
    </>
  ),
  bird: (id) => (
    <>
      <Sky kind="day" id={id} />
      <Cloud x={60} y={40} s={1} />
      <Cloud x={250} y={56} s={0.8} />
      <Dunes y={124} />
      <Palm x={276} y={136} s={0.9} />
      <G>
        <Path d="M150 74 Q 130 56 108 62 Q 128 66 142 80 Z" fill="#B57A3E" />
        <Path d="M170 74 Q 190 54 214 60 Q 192 66 178 80 Z" fill="#B57A3E" />
        {[0, 1, 2].map((k) => (
          <Line key={k} x1={118 + k * 8} y1={62 + k * 2} x2={122 + k * 8} y2={68 + k * 2} stroke="#2A1E12" strokeWidth={2} />
        ))}
        {[0, 1, 2].map((k) => (
          <Line key={k} x1={202 - k * 8} y1={60 + k * 2} x2={198 - k * 8} y2={66 + k * 2} stroke="#2A1E12" strokeWidth={2} />
        ))}
        <Ellipse cx={160} cy={80} rx={16} ry={8} fill="#C98B4B" />
        <Circle cx={176} cy={74} r={6} fill="#C98B4B" />
        <Path d="M172 69 L168 56 L174 66 L176 54 L178 66 L184 58 L180 70 Z" fill="#E09A4A" />
        <Path d="M182 74 L194 76 L182 77 Z" fill="#3A2A1A" />
        <Path d="M144 80 L132 76 L134 84 Z" fill="#8A5A2B" />
      </G>
    </>
  ),
  glass: (id) => (
    <>
      <Rect x={0} y={0} width={W} height={H} fill="#E9DFC8" />
      <Columns x={22} y={92} n={7} gap={46} h={80} color="#F3EBDA" />
      <Rect x={0} y={0} width={W} height={10} fill="#CDB98F" />
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#7CC3E6" />
          <Stop offset="1" stopColor="#2F7FB6" />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={92} width={W} height={68} fill={`url(#${id})`} />
      {Array.from({ length: 9 }, (_, i) => (
        <Line key={i} x1={i * 40} y1={92} x2={i * 40 - 30} y2={160} stroke="#FFFFFF" strokeWidth={1} opacity={0.35} />
      ))}
      <Line x1={0} y1={124} x2={W} y2={124} stroke="#FFFFFF" strokeWidth={1} opacity={0.35} />
      {[40, 130, 220].map((x) => (
        <Path key={x} d={`M${x} 140 q 8 -4 16 0 t 16 0`} stroke="#DDF2FB" strokeWidth={1.6} fill="none" />
      ))}
      <Ellipse cx={160} cy={112} rx={30} ry={4} fill="#FFFFFF" opacity={0.3} />
    </>
  ),
  rain: (id) => (
    <>
      <Sky kind="storm" id={id} />
      <Cloud x={60} y={30} s={1.5} color="#6E7489" />
      <Cloud x={190} y={24} s={1.8} color="#646A80" />
      <Cloud x={290} y={34} s={1.3} color="#6E7489" />
      <Rain n={50} />
      <Hills color="#4C7A4A" y={118} />
      <Ground color="#5E8F4E" y={128} />
      <Ark x={228} y={138} s={0.5} />
    </>
  ),
  wind: (id) => (
    <>
      <Sky kind="day" id={id} />
      <Hills color="#8FAE7A" y={124} />
      <Ground color="#9FBF86" y={134} />
      {[
        [30, 46, 120],
        [90, 76, 160],
        [40, 104, 110],
        [170, 56, 120],
      ].map(([x, y, w], i) => (
        <Path key={i} d={`M${x} ${y} q ${w * 0.4} -16 ${w * 0.7} 0 q 14 8 6 18 q -8 6 -14 -2`} stroke="#FFFFFF" strokeWidth={3} strokeLinecap="round" fill="none" opacity={0.85} />
      ))}
      <Cloud x={270} y={40} s={0.9} />
      <Tree x={250} y={140} s={0.9} color={LEAF_DARK} />
    </>
  ),
  garden: (id) => (
    <>
      <Sky kind="day" id={id} />
      <Sun x={270} y={30} r={13} />
      <Ground color="#78B064" y={100} />
      <Path d="M0 130 Q 100 112 180 128 T 320 120 L320 140 Q 230 132 180 146 T 0 150 Z" fill={WATER} />
      <Tree x={40} y={110} s={1.1} />
      <Tree x={110} y={104} s={0.9} color={LEAF_DARK} />
      <Tree x={220} y={106} s={1} />
      <Palm x={290} y={110} s={0.9} />
      {[30, 70, 150, 190, 250, 300].map((x, i) => (
        <Circle key={x} cx={x} cy={156 - (i % 2) * 4} r={3} fill={['#F28CB1', '#F7D25B', '#FFFFFF'][i % 3]} />
      ))}
      <Path d="M130 50 q 6 -6 12 0 q 6 -6 12 0" stroke="#3A3A4A" strokeWidth={2} fill="none" />
      <Path d="M180 40 q 5 -5 10 0 q 5 -5 10 0" stroke="#3A3A4A" strokeWidth={2} fill="none" />
    </>
  ),
  letter: (id) => (
    <>
      <Sky kind="day" id={id} />
      <Cloud x={50} y={36} s={1} />
      <Cloud x={270} y={30} s={0.9} />
      <Dunes y={128} />
      <G>
        <Rect x={104} y={58} width={112} height={60} rx={4} fill="#F4EAD2" />
        <Rect x={96} y={52} width={16} height={72} rx={8} fill="#E3D3AE" />
        <Rect x={208} y={52} width={16} height={72} rx={8} fill="#E3D3AE" />
        {[0, 1, 2, 3].map((k) => (
          <Line key={k} x1={124} y1={72 + k * 11} x2={196 - (k === 3 ? 30 : 0)} y2={72 + k * 11} stroke="#B9A57E" strokeWidth={2} />
        ))}
        <Circle cx={196} cy={110} r={9} fill="#B23A3A" />
        <Circle cx={196} cy={110} r={5} fill="#8E2A2A" />
      </G>
    </>
  ),
};

/** The chapter's scene, `width` wide (half as tall). */
export function ProphetsSceneArt({ scene, width, id }: { scene: ProphetsScene; width: number; id: string }) {
  const height = Math.round(width / 2);
  const draw = scenes[scene] ?? scenes.desert;
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice">
      {draw(`sky-${id}`)}
    </Svg>
  );
}

/** One Moroccan lantern: lit (warm glow) or dimmed. */
export function Lantern({ lit, size = 26 }: { lit: boolean; size?: number }) {
  const body = lit ? '#F7C65A' : '#4A4870';
  const frame = lit ? '#B9832A' : '#6E6C94';
  return (
    <Svg width={size} height={size * 1.35} viewBox="0 0 40 54">
      {lit ? <Circle cx={20} cy={32} r={19} fill="#F7C65A" opacity={0.22} /> : null}
      <Line x1={20} y1={0} x2={20} y2={7} stroke={frame} strokeWidth={2} />
      <Circle cx={20} cy={8} r={3} fill="none" stroke={frame} strokeWidth={2} />
      <Polygon points="12,16 28,16 24,10 16,10" fill={frame} />
      <Path d="M12 16 L28 16 L32 30 L26 44 L14 44 L8 30 Z" fill={body} stroke={frame} strokeWidth={2} />
      <Line x1={20} y1={16} x2={20} y2={44} stroke={frame} strokeWidth={1.5} />
      <Line x1={8} y1={30} x2={32} y2={30} stroke={frame} strokeWidth={1.5} />
      {lit ? <Ellipse cx={20} cy={32} rx={4} ry={6} fill="#FFF3C4" /> : null}
      <Polygon points="14,44 26,44 23,50 17,50" fill={frame} />
    </Svg>
  );
}
