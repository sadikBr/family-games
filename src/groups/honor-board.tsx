/**
 * «لوحة الشرف» on the group screen: titles per person (crowns), the last champions with the date
 * and the format, and the points over all the tournaments played in the group's rooms.
 */
import { StyleSheet, View } from 'react-native';

import { Icon } from '@/art/icons';
import type { GroupInfo, PlayerInfo } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { Avatar, Card, Row } from '@/ui/bits';
import { Txt, num } from '@/ui/txt';

const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

/** «18 أكتوبر» (and the year when it isn't the current one). */
export function shortDate(at: number, nowYear: number) {
  const d = new Date(at);
  return `${num(d.getDate())} ${MONTHS[d.getMonth()]}${d.getFullYear() !== nowYear ? ` ${num(d.getFullYear())}` : ''}`;
}

function Crowns({ count }: { count: number }) {
  if (count > 3) {
    return (
      <Row gap={3}>
        <Icon name="crown" size={16} color={C.yellow} />
        <Txt v="bold" color={C.yellow}>
          {`×${num(count)}`}
        </Txt>
      </Row>
    );
  }
  return (
    <Row gap={2}>
      {Array.from({ length: count }, (_, i) => (
        <Icon key={i} name="crown" size={16} color={C.yellow} />
      ))}
    </Row>
  );
}

export function HonorBoard({ group, me, year }: { group: GroupInfo; me: string; year: number }) {
  const h = group.honor;
  const who = (id: string): PlayerInfo =>
    group.members.find((m) => m.id === id) ?? h?.people.find((p) => p.id === id) ?? { id, name: '؟', avatar: 'owl', color: '#7D7AA6' };
  return (
    <Card>
      <Row gap={8}>
        <Icon name="trophy" size={20} color={C.yellow} />
        <Txt v="h3" style={{ flex: 1 }}>
          لوحة الشرف
        </Txt>
        {h?.tournaments ? (
          <Txt v="small" color={C.muted}>
            {`${num(h.tournaments)} ${h.tournaments === 1 ? 'بطولة' : h.tournaments === 2 ? 'بطولتان' : h.tournaments <= 10 ? 'بطولات' : 'بطولة'}`}
          </Txt>
        ) : null}
      </Row>
      {!h || !h.tournaments ? (
        <View style={{ alignItems: 'center', gap: 4, paddingVertical: 8 }}>
          <Txt v="bold" center color={C.muted}>
            لم تُلعب أي بطولة بعد
          </Txt>
          <Txt v="small" center color={C.dim}>
            في غرفة الانتظار اختاروا «بطولة»: عدة ألعاب متتالية وبطل في النهاية
          </Txt>
        </View>
      ) : (
        <>
          {/* titles */}
          <View style={{ gap: 6 }}>
            {h.titles.map(({ id, count }) => {
              const p = who(id);
              return (
                <Row key={id} gap={10} style={[styles.row, id === me && styles.mine]}>
                  <Avatar player={p} size={34} />
                  <Txt v="bold" numberOfLines={1} style={{ flex: 1 }}>
                    {id === me ? `${p.name} (أنت)` : p.name}
                  </Txt>
                  <Crowns count={count} />
                </Row>
              );
            })}
          </View>

          {/* last champions */}
          <Txt v="bold" color={C.muted}>
            آخر الأبطال
          </Txt>
          <View style={{ gap: 4 }}>
            {h.champions.map((c, i) => (
              <Row key={`${c.at}-${i}`} gap={8} style={styles.line}>
                <Txt v="tiny" color={C.dim} style={{ width: 84 }} numberOfLines={1}>
                  {shortDate(c.at, year)}
                </Txt>
                <View style={styles.format}>
                  <Txt v="tiny" color={C.muted} style={{ fontSize: 11 }}>
                    {c.format === 'league' ? 'دوري' : 'خروج المغلوب'}
                  </Txt>
                </View>
                <Row gap={4} style={{ flex: 1, minWidth: 0, justifyContent: 'flex-end' }}>
                  {c.champions.slice(0, 3).map((id) => (
                    <Avatar key={id} player={who(id)} size={22} />
                  ))}
                  <Txt v="tiny" numberOfLines={1} style={{ flexShrink: 1, fontSize: 13 }}>
                    {c.champions.map((id) => who(id).name).join('، ') || '—'}
                  </Txt>
                </Row>
              </Row>
            ))}
          </View>

          {/* all-time points */}
          <Txt v="bold" color={C.muted}>
            النقاط في كل البطولات
          </Txt>
          <Row wrap gap={6}>
            {h.points.map(({ id, total }, i) => {
              const p = who(id);
              return (
                <View key={id} style={[styles.pts, id === me && styles.mine]}>
                  <Txt v="tiny" color={C.dim}>
                    {num(i + 1)}
                  </Txt>
                  <Avatar player={p} size={24} />
                  <Txt v="tiny" numberOfLines={1} style={{ maxWidth: 80, fontSize: 13 }}>
                    {p.name}
                  </Txt>
                  <Txt style={styles.total}>{num(total)}</Txt>
                </View>
              );
            })}
          </Row>
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { backgroundColor: C.bg2, borderRadius: 14, paddingVertical: 6, paddingHorizontal: 8, borderWidth: 1.5, borderColor: 'transparent' },
  mine: { borderColor: alpha(C.yellow, 0.6) },
  line: { paddingVertical: 4, paddingHorizontal: 6, borderRadius: 10, backgroundColor: alpha('#FFFFFF', 0.03) },
  format: { paddingHorizontal: 6, borderRadius: 8, backgroundColor: C.surfaceStrong },
  pts: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 12, backgroundColor: C.bg2, borderWidth: 1.5, borderColor: 'transparent' },
  total: { fontFamily: F.black, fontSize: 15, lineHeight: 22, color: C.yellow },
});
