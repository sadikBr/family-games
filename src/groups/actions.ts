import { router } from 'expo-router';
import { Share } from 'react-native';

import { client } from '@/lib/client';
import { haptic, play } from '@/lib/sfx';
import { groupLink } from '@/shared/groups';
import type { GroupInfo } from '@/shared/protocol';
import { num } from '@/ui/txt';

/** «لنلعب»: open the group's room (or join it when the group is already playing). */
export function playGroup(id: string) {
  play('pop');
  haptic.medium();
  client.groupPlay(id);
  router.push('/room');
}

export function openGroup(id: string) {
  router.push({ pathname: '/group', params: { id } });
}

export function shareGroup(g: Pick<GroupInfo, 'name' | 'code'>) {
  Share.share({
    message: `انضمّ إلى مجموعتنا «${g.name}» في «ألعاب العائلة» 🎲\nرمز المجموعة: ${g.code}\nافتح الرابط: ${groupLink(g.code)}`,
  }).catch(() => {});
}

/** «N متصلون الآن», counting the others (I'm always there when I look). */
export function onlineLabel(g: GroupInfo, me: string) {
  const n = g.members.filter((m) => m.online && m.id !== me).length;
  if (g.members.length <= 1) return 'ادعُ العائلة إلى المجموعة';
  if (n === 0) return 'لا أحد غيرك متصل الآن';
  if (n === 1) return 'واحد متصل الآن';
  if (n === 2) return 'اثنان متصلان الآن';
  return `${num(n)} ${n <= 10 ? 'متصلون' : 'متصلاً'} الآن`;
}
