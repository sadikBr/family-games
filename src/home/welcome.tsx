/** The first-time welcome on the home screen: how a family plays, in three steps. Gone after «فهمت». */
import { StyleSheet, View } from 'react-native';

import { dismissWelcome } from '@/lib/prefs';
import { C, alpha } from '@/theme';
import { Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { Txt, num } from '@/ui/txt';

const STEPS = [
  'شخص واحد يضغط «العب» ويختار لعبة، فتُفتح غرفة لها رمز.',
  'الآخرون يضغطون «ادخل برمز» ويكتبون رمز الغرفة.',
  'كلٌّ يلعب من هاتفه، والتطبيق يدير اللعبة.',
];

export function Welcome() {
  return (
    <View style={styles.card}>
      <Txt v="h3">أهلاً بكم! هكذا تلعب العائلة:</Txt>
      <View style={{ gap: 8 }}>
        {STEPS.map((text, i) => (
          <Row key={i} gap={10}>
            <View style={styles.no}>
              <Txt v="bold" color={C.ink} style={{ fontSize: 14, lineHeight: 20 }}>
                {num(i + 1)}
              </Txt>
            </View>
            <Txt v="small" style={{ flex: 1 }}>
              {text}
            </Txt>
          </Row>
        ))}
      </View>
      <Btn size="sm" ghost icon="check" label="فهمت" onPress={dismissWelcome} style={{ alignSelf: 'flex-start' }} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10, padding: 14, borderRadius: 20, backgroundColor: alpha(C.yellow, 0.07), borderWidth: 1, borderColor: alpha(C.yellow, 0.35) },
  no: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: C.yellow },
});
