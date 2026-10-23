import { useEffect, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeInUp, FadeOut, FadeOutUp, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/art/icons';
import { client, useClient } from '@/lib/client';
import { haptic, play } from '@/lib/sfx';
import { C, F, alpha } from '@/theme';

import { Row } from './bits';
import { Btn, IconBtn } from './btn';
import { Txt } from './txt';

export function Header({ title, onBack, right }: { title?: ReactNode; onBack?: () => void; right?: ReactNode }) {
  return (
    <View style={styles.header}>
      <View style={styles.headerSide}>{onBack ? <IconBtn icon="back" onPress={onBack} label="رجوع" /> : null}</View>
      <View style={styles.headerTitle}>
        {typeof title === 'string' ? (
          <Txt v="h2" center numberOfLines={1}>
            {title}
          </Txt>
        ) : (
          title
        )}
      </View>
      <View style={[styles.headerSide, styles.headerEnd]}>{right}</View>
    </View>
  );
}

export function Stepper({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  editable = true,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  editable?: boolean;
  format?: (v: number) => string;
}) {
  return (
    <Row style={styles.settingRow}>
      <Txt v="bold" style={{ flex: 1 }}>
        {label}
      </Txt>
      {editable ? <IconBtn icon="minus" size={34} onPress={() => onChange(Math.max(min, value - step))} label="أقل" /> : null}
      <Txt style={{ fontFamily: F.black, fontSize: 17, lineHeight: 26, minWidth: 58, textAlign: 'center' }}>{format ? format(value) : value}</Txt>
      {editable ? <IconBtn icon="plus" size={34} onPress={() => onChange(Math.min(max, value + step))} label="أكثر" /> : null}
    </Row>
  );
}

export function Toggle({ label, value, onChange, editable = true }: { label: string; value: boolean; onChange: (v: boolean) => void; editable?: boolean }) {
  const x = useSharedValue(value ? 1 : 0);
  useEffect(() => {
    x.set(withTiming(value ? 1 : 0, { duration: 160 }));
  }, [value, x]);
  // knob moves toward the "end" side when on (left in RTL)
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: -20 * x.get() }] }));
  return (
    <Pressable
      disabled={!editable}
      onPress={() => {
        haptic.tap();
        onChange(!value);
      }}>
      <Row style={styles.settingRow}>
        <Txt v="bold" style={{ flex: 1 }}>
          {label}
        </Txt>
        <View style={[styles.switch, { backgroundColor: value ? C.green : 'rgba(255,255,255,0.16)', direction: 'rtl' }]}>
          <Animated.View style={[styles.knob, knob]} />
        </View>
      </Row>
    </Pressable>
  );
}

export function ChipPicker<T extends string>({
  options,
  value,
  onChange,
  editable = true,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  editable?: boolean;
}) {
  return (
    <Row wrap gap={8}>
      {options.map((o) => {
        const active = o.key === value;
        if (!editable && !active) return null;
        return (
          <Pressable
            key={o.key}
            disabled={!editable}
            onPress={() => {
              haptic.tap();
              onChange(o.key);
            }}
            style={[styles.chip, active && styles.chipActive]}>
            <Txt v="bold" color={active ? C.ink : C.text} style={{ fontSize: 14 }}>
              {o.label}
            </Txt>
          </Pressable>
        );
      })}
    </Row>
  );
}

/**
 * Several choices at once (e.g. question categories). `allLabel` adds a first chip that selects every
 * option (pressed again, it goes back to the first option alone). At least one option always stays
 * selected: the last one can't be switched off. Read-only, only the chosen chips are shown.
 */
export function MultiChipPicker<T extends string>({
  options,
  value,
  onChange,
  editable = true,
  allLabel,
}: {
  options: { key: T; label: string }[];
  value: readonly T[];
  onChange: (v: T[]) => void;
  editable?: boolean;
  allLabel?: string;
}) {
  const keys = options.map((o) => o.key);
  const all = keys.every((k) => value.includes(k));
  const set = (next: T[]) => {
    haptic.tap();
    onChange(keys.filter((k) => next.includes(k)));
  };
  const chip = (key: string, label: string, active: boolean, onPress: () => void) => {
    if (!editable && !active) return null;
    return (
      <Pressable
        key={key}
        disabled={!editable}
        onPress={onPress}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: active }}
        style={[styles.chip, active && styles.chipActive]}>
        <Txt v="bold" color={active ? C.ink : C.text} style={{ fontSize: 14 }}>
          {label}
        </Txt>
      </Pressable>
    );
  };
  return (
    <Row wrap gap={8}>
      {allLabel ? chip('__all', allLabel, all, () => set(all ? keys.slice(0, 1) : keys)) : null}
      {editable || !all || !allLabel
        ? options.map((o) => {
            const active = value.includes(o.key);
            return chip(o.key, o.label, active, () => {
              if (active && value.length <= 1) return; // one stays chosen
              set(active ? value.filter((k) => k !== o.key) : [...value, o.key]);
            });
          })
        : null}
    </Row>
  );
}

/** Global error toast, driven by the game client. */
export function Toast() {
  const { error } = useClient();
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (!error) return;
    play('buzz');
    haptic.error();
    const t = setTimeout(() => client.clearError(), 3200);
    return () => clearTimeout(t);
  }, [error]);
  if (!error) return null;
  return (
    <Animated.View key={error.id} entering={FadeInUp.duration(180)} exiting={FadeOutUp.duration(150)} style={[styles.toast, { top: insets.top + 8 }]}>
      <Pressable onPress={() => client.clearError()} style={styles.toastInner}>
        <Icon name="info" size={20} color={C.ink} />
        <Txt v="bold" color={C.ink} style={{ flex: 1 }}>
          {error.message}
        </Txt>
      </Pressable>
    </Animated.View>
  );
}

export function ConfirmModal({
  visible,
  title,
  message,
  icon = 'info',
  confirmLabel = 'نعم',
  cancelLabel = 'إلغاء',
  danger,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  message?: string;
  icon?: IconName;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  // narrow phones: the buttons stack so their labels are never cut off
  const narrow = useWindowDimensions().width < 360;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
        <Animated.View entering={FadeIn.duration(150)} style={styles.modal}>
          <View style={[styles.modalIcon, { backgroundColor: alpha(danger ? C.red : C.yellow, 0.14) }]}>
            <Icon name={icon} size={28} color={danger ? C.red : C.yellow} />
          </View>
          <Txt v="title" center>
            {title}
          </Txt>
          {message ? (
            <Txt center color={C.muted}>
              {message}
            </Txt>
          ) : null}
          {narrow ? (
            <View style={{ marginTop: 10, gap: 8, alignSelf: 'stretch' }}>
              <Btn size="md" label={confirmLabel} color={danger ? C.red : C.yellow} onPress={onConfirm} />
              <Btn size="md" label={cancelLabel} ghost onPress={onCancel} />
            </View>
          ) : (
            <Row gap={10} style={{ marginTop: 10 }}>
              <Btn flex size="md" label={cancelLabel} ghost onPress={onCancel} />
              <Btn flex size="md" label={confirmLabel} color={danger ? C.red : C.yellow} onPress={onConfirm} />
            </Row>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

/** Small banner when the connection drops. */
export function ConnectionBanner() {
  const { status } = useClient();
  if (status === 'online' || status === 'idle') return null;
  return (
    <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.conn}>
      <Icon name="wifiOff" size={16} color={C.ink} />
      <Txt v="tiny" color={C.ink}>
        جارٍ الاتصال بالخادم…
      </Txt>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 6, gap: 8 },
  headerSide: { minWidth: 42, flexDirection: 'row', gap: 6, alignItems: 'center' },
  headerEnd: { justifyContent: 'flex-end' },
  headerTitle: { flex: 1, minWidth: 0, alignItems: 'center' },
  settingRow: { paddingVertical: 6, minHeight: 48 },
  switch: { width: 48, height: 28, borderRadius: 14, padding: 3, justifyContent: 'center' },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#FFF', alignSelf: 'flex-start' },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: C.surfaceStrong,
  },
  chipActive: { backgroundColor: C.yellow },
  toast: { position: 'absolute', start: 16, end: 16, zIndex: 1000 },
  toastInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.yellow,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  backdrop: { flex: 1, backgroundColor: 'rgba(8,9,24,0.72)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modal: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: C.bg2,
    borderRadius: 24,
    padding: 22,
    gap: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.borderStrong,
    direction: 'rtl',
  },
  modalIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  conn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: C.orange,
    paddingVertical: 4,
    marginHorizontal: 16,
    borderRadius: 10,
  },
});
