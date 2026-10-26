/**
 * «من الفاعل؟» — the cards' pictures (tools/art/clue.mjs → assets/art/clue) and the small pieces that
 * show them: a card face, a picker tile, and the house plan with everyone's place.
 */
import { Image } from 'expo-image';
import { Pressable, View } from 'react-native';

import { CLUE_BY_ID, CLUE_KIND_COLOR, CLUE_MAP } from '@/shared/games/clue';
import type { PlayerPublic } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { Avatar } from '@/ui/bits';
import { Txt } from '@/ui/txt';
import { haptic } from '@/lib/sfx';

export const CLUE_IMG: Record<string, number> = {
  zahra: require('../../assets/art/clue/zahra.webp'),
  hammou: require('../../assets/art/clue/hammou.webp'),
  ruqaya: require('../../assets/art/clue/ruqaya.webp'),
  anas: require('../../assets/art/clue/anas.webp'),
  bouchaib: require('../../assets/art/clue/bouchaib.webp'),
  salma: require('../../assets/art/clue/salma.webp'),
  spoon: require('../../assets/art/clue/spoon.webp'),
  tray: require('../../assets/art/clue/tray.webp'),
  stool: require('../../assets/art/clue/stool.webp'),
  basket: require('../../assets/art/clue/basket.webp'),
  umbrella: require('../../assets/art/clue/umbrella.webp'),
  broom: require('../../assets/art/clue/broom.webp'),
  salon: require('../../assets/art/clue/salon.webp'),
  kitchen: require('../../assets/art/clue/kitchen.webp'),
  roof: require('../../assets/art/clue/roof.webp'),
  riad: require('../../assets/art/clue/riad.webp'),
  bedroom: require('../../assets/art/clue/bedroom.webp'),
  library: require('../../assets/art/clue/library.webp'),
  guests: require('../../assets/art/clue/guests.webp'),
  pantry: require('../../assets/art/clue/pantry.webp'),
  entrance: require('../../assets/art/clue/entrance.webp'),
};

/** The picture of a card; characters sit in a disc of their own colour (like the players' avatars). */
export function ClueArt({ id, size }: { id: string; size: number }) {
  const card = CLUE_BY_ID[id];
  if (card?.kind === 'who') {
    return (
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: card.color, overflow: 'hidden', borderWidth: Math.max(1.5, size / 26), borderColor: '#151726' }}>
        <Image source={CLUE_IMG[id]} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={0} />
      </View>
    );
  }
  return <Image source={CLUE_IMG[id]} style={{ width: size, height: size }} contentFit="contain" transition={0} />;
}

/** A playing card: the picture on its category's colour and the name under it. */
export function ClueCardFace({ id, width, selected, dim, note }: { id: string; width: number; selected?: boolean; dim?: boolean; note?: string }) {
  const card = CLUE_BY_ID[id];
  const color = card ? (card.kind === 'who' ? card.color : CLUE_KIND_COLOR[card.kind]) : C.dim;
  const art = Math.round(width * 0.72);
  return (
    <View
      accessibilityLabel={card?.name}
      style={{
        width,
        borderRadius: Math.max(10, width * 0.14),
        borderWidth: selected ? 3 : 1.5,
        borderColor: selected ? C.yellow : alpha(color, 0.75),
        backgroundColor: alpha(color, 0.18),
        alignItems: 'center',
        paddingTop: width * 0.08,
        paddingBottom: width * 0.06,
        paddingHorizontal: 3,
        gap: 2,
        opacity: dim ? 0.4 : 1,
      }}>
      <ClueArt id={id} size={art} />
      <Txt v="tiny" center numberOfLines={2} style={{ fontSize: width < 70 ? 11 : 12.5, lineHeight: width < 70 ? 15 : 17 }}>
        {card?.short ?? '؟'}
      </Txt>
      {note ? (
        <Txt v="tiny" center color={C.yellow} numberOfLines={1} style={{ fontSize: 10.5, lineHeight: 14 }}>
          {note}
        </Txt>
      ) : null}
    </View>
  );
}

/** A tile to pick a card (character, item, room): its picture, its name and my notebook's verdict. */
export function ClueTile({
  id,
  width,
  selected,
  disabled,
  state,
  onPress,
}: {
  id: string;
  width: number;
  selected: boolean;
  disabled?: boolean;
  /** from my notebook: 'mine' (in my hand), 'out' (someone holds it), 'in' (it is in the file) */
  state?: 'mine' | 'out' | 'in' | null;
  onPress: () => void;
}) {
  const card = CLUE_BY_ID[id];
  const color = card?.kind === 'who' ? card.color : CLUE_KIND_COLOR[card?.kind ?? 'what'];
  const art = Math.min(48, Math.round(width * 0.5));
  return (
    <Pressable
      disabled={disabled}
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={card?.name}
      style={({ pressed }) => ({
        width,
        borderRadius: 14,
        borderWidth: selected ? 2.5 : 1.5,
        borderColor: selected ? C.yellow : alpha(color, 0.45),
        backgroundColor: selected ? alpha(C.yellow, 0.16) : pressed ? alpha(color, 0.22) : C.surface,
        alignItems: 'center',
        paddingVertical: 6,
        paddingHorizontal: 2,
        gap: 2,
        opacity: disabled ? 0.35 : 1,
      })}>
      <View style={{ opacity: state === 'out' || state === 'mine' ? 0.55 : 1 }}>
        <ClueArt id={id} size={art} />
      </View>
      <Txt v="tiny" center numberOfLines={1} style={{ fontSize: 12, lineHeight: 17, textDecorationLine: state === 'out' ? 'line-through' : 'none' }} color={state === 'out' ? C.dim : C.text}>
        {card?.short}
      </Txt>
      {state ? <StateBadge state={state} /> : null}
    </Pressable>
  );
}

function StateBadge({ state }: { state: 'mine' | 'out' | 'in' }) {
  const look = state === 'mine' ? { t: 'معك', c: C.cyan } : state === 'out' ? { t: '✗', c: C.red } : { t: '★', c: C.yellow };
  return (
    <View style={{ position: 'absolute', top: 3, left: 3, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, backgroundColor: look.c, alignItems: 'center', justifyContent: 'center' }}>
      <Txt style={{ fontFamily: F.black, fontSize: 10.5, lineHeight: 15, color: C.ink }}>{look.t}</Txt>
    </View>
  );
}

/**
 * The house plan: 3 × 3 rooms with the players standing in them. With `onPick`, a room can be chosen
 * (`from` — the room I am in — cannot).
 */
export function HousePlan({
  width,
  players,
  rooms,
  me,
  from,
  picked,
  onPick,
  states,
}: {
  width: number;
  players: PlayerPublic[];
  rooms: Record<string, string | null>;
  me: string;
  from?: string | null;
  picked?: string | null;
  onPick?: (room: string) => void;
  states?: Record<string, 'mine' | 'out' | 'in' | null>;
}) {
  const gap = 5;
  const cell = Math.floor((width - gap * 2 - 12) / 3);
  const art = Math.min(46, Math.round(cell * 0.46));
  return (
    <View style={{ backgroundColor: '#3A2A1E', borderRadius: 18, padding: 6, gap, borderWidth: 2, borderColor: '#7A5634' }}>
      {CLUE_MAP.map((row, r) => (
        <View key={r} style={{ flexDirection: 'row', gap }}>
          {row.map((id) => {
            const here = players.filter((p) => rooms[p.id] === id);
            const isFrom = !!from && from === id;
            const isPicked = picked === id;
            const st = states?.[id] ?? null;
            const card = CLUE_BY_ID[id];
            const content = (
              <>
                <View style={{ opacity: st === 'out' || st === 'mine' ? 0.55 : 1 }}>
                  <ClueArt id={id} size={art} />
                </View>
                <Txt v="tiny" center numberOfLines={1} style={{ fontSize: 12, lineHeight: 16, textDecorationLine: st === 'out' ? 'line-through' : 'none' }} color={st === 'out' ? C.dim : C.text}>
                  {card.short}
                </Txt>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', minHeight: 18, gap: 1 }}>
                  {here.slice(0, 6).map((p) => (
                    <Avatar key={p.id} player={p} size={17} ring={p.id === me ? C.yellow : undefined} />
                  ))}
                </View>
                {st ? <StateBadge state={st} /> : null}
              </>
            );
            const style = {
              width: cell,
              borderRadius: 12,
              alignItems: 'center' as const,
              paddingTop: 5,
              paddingBottom: 3,
              gap: 1,
              backgroundColor: isPicked ? alpha(C.yellow, 0.22) : id === 'riad' ? '#2C4A3E' : alpha('#F4E3C3', 0.13),
              borderWidth: isPicked ? 2.5 : 1.5,
              borderColor: isPicked ? C.yellow : isFrom ? alpha(C.text, 0.5) : alpha('#F4E3C3', 0.18),
              borderStyle: isFrom ? ('dashed' as const) : ('solid' as const),
            };
            return onPick ? (
              <Pressable
                key={id}
                disabled={isFrom}
                onPress={() => {
                  haptic.tap();
                  onPick(id);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: isPicked, disabled: isFrom }}
                accessibilityLabel={isFrom ? `${card.name} — أنت هنا` : card.name}
                style={[style, isFrom && { opacity: 0.45 }]}>
                {content}
              </Pressable>
            ) : (
              <View key={id} style={style} accessibilityLabel={card.name}>
                {content}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}
