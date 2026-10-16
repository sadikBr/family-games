/**
 * Player avatars: HD mascot portraits (rendered by the art pipeline, see assets.ts).
 * Each portrait is a head-and-shoulders bust meant to sit inside a coloured disc.
 */
import { Image } from 'expo-image';

import { AVATAR_IMG } from './assets';

export const AVATAR_IDS = [
  'boy', 'girl', 'grandma', 'grandpa', 'lion', 'cat', 'fox', 'bear',
  'panda', 'rabbit', 'owl', 'frog', 'penguin', 'monkey', 'tiger', 'koala',
] as const;
export type AvatarId = (typeof AVATAR_IDS)[number] | 'robot';

export const isArtAvatar = (id: string): id is AvatarId => id in AVATAR_IMG;

export function AvatarArt({ id, size }: { id: string; size: number }) {
  return <Image source={AVATAR_IMG[isArtAvatar(id) ? id : 'cat']} style={{ width: size, height: size }} contentFit="contain" transition={0} />;
}
