/**
 * «حالتي»: choosing my status — four chips on the profile screen (with what the chosen one means),
 * and a compact sheet from the home screen's header (tap my face / name), which also leads to «ملفي».
 * The choice is kept on the phone and sent to the server at once (src/lib/status.ts).
 */
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/art/icons';
import { Sheet } from '@/groups/group-forms';
import { haptic } from '@/lib/sfx';
import { setMyStatus, useMyStatus } from '@/lib/status';
import { MY_STATUSES, STATUS_HINT, STATUS_LABEL, type MyStatus } from '@/shared/status';
import { C, F, alpha } from '@/theme';
import { Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { STATUS_COLOR, StatusDot } from '@/ui/status';
import { Txt } from '@/ui/txt';

const AUTO_NOTE = 'تتحوّل الحالة من «متاح» إلى «بعيد» تلقائياً عند الخروج من التطبيق أو بعد ١٠ دقائق دون لمس، وتعود عند الرجوع';

function choose(s: MyStatus) {
  haptic.tap();
  setMyStatus(s);
}

/** «متاح» chosen, but the automatic «بعيد» is on right now. */
function AutoAway() {
  const { chosen, effective } = useMyStatus();
  if (chosen !== 'available' || effective !== 'away') return null;
  return (
    <Row gap={6}>
      <StatusDot status="away" size={12} ring={C.bg2} />
      <Txt v="tiny" color={C.yellow} style={{ flex: 1 }}>
        الآن: بعيد تلقائياً
      </Txt>
    </Row>
  );
}

/** The profile screen: four chips (two by two) and one line on the chosen status. */
export function StatusChips() {
  const { chosen } = useMyStatus();
  return (
    <View style={{ gap: 10 }}>
      <View style={styles.grid}>
        {MY_STATUSES.map((s) => {
          const on = s === chosen;
          return (
            <Pressable
              key={s}
              onPress={() => choose(s)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`الحالة: ${STATUS_LABEL[s]}`}
              style={({ pressed }) => [styles.chip, on && { borderColor: STATUS_COLOR[s], backgroundColor: alpha(STATUS_COLOR[s], 0.14) }, pressed && styles.pressed]}>
              <StatusDot status={s} size={17} ring={C.bg3} />
              <Txt v="bold" numberOfLines={1} style={styles.chipLabel}>
                {STATUS_LABEL[s]}
              </Txt>
            </Pressable>
          );
        })}
      </View>
      <Txt v="small" color={C.muted}>
        {STATUS_HINT[chosen]}
      </Txt>
      <AutoAway />
      <Txt v="tiny" color={C.dim}>
        {AUTO_NOTE}
      </Txt>
    </View>
  );
}

/** The home screen: my status at a glance, one tap to change it, and the way to «ملفي». */
export function StatusSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { chosen } = useMyStatus();
  return (
    <Sheet visible={visible} onClose={onClose} icon="user" title="حالتي">
      <View style={{ gap: 6 }}>
        {MY_STATUSES.map((s) => {
          const on = s === chosen;
          return (
            <Pressable
              key={s}
              onPress={() => {
                choose(s);
                onClose();
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`الحالة: ${STATUS_LABEL[s]} — ${STATUS_HINT[s]}`}
              style={({ pressed }) => [styles.option, on && { borderColor: STATUS_COLOR[s], backgroundColor: alpha(STATUS_COLOR[s], 0.12) }, pressed && styles.pressed]}>
              <StatusDot status={s} size={18} ring={C.bg3} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt v="bold" style={{ fontSize: 16 }}>
                  {STATUS_LABEL[s]}
                </Txt>
                <Txt v="tiny" color={C.muted} numberOfLines={2}>
                  {STATUS_HINT[s]}
                </Txt>
              </View>
              {on ? <Icon name="check" size={18} color={STATUS_COLOR[s] === C.dim ? C.text : STATUS_COLOR[s]} /> : null}
            </Pressable>
          );
        })}
      </View>
      <AutoAway />
      <Btn
        size="md"
        ghost
        icon="edit"
        label="ملفي: الاسم والشخصية"
        onPress={() => {
          onClose();
          router.push('/profile');
        }}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexGrow: 1,
    flexBasis: '45%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 46,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: C.bg3,
    borderWidth: 1.5,
    borderColor: C.border,
  },
  chipLabel: { flexShrink: 1, fontFamily: F.bold, fontSize: 15 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 54, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, backgroundColor: C.bg3, borderWidth: 1.5, borderColor: 'transparent' },
  pressed: { opacity: 0.85 },
});
