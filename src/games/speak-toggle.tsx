/** The «قراءة الأحداث بصوت» switch (room menu and profile screen), with a hint when the phone has no Arabic voice. */
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { hasArabicVoice, onSpeakCallsChange, setSpeakCalls, speakCallsOn } from '@/lib/speech';
import { C } from '@/theme';
import { Toggle } from '@/ui/controls';
import { Txt } from '@/ui/txt';

export function SpeakToggle() {
  const [on, setOn] = useState(speakCallsOn());
  const [voice, setVoice] = useState<boolean | null>(null);
  useEffect(() => onSpeakCallsChange(setOn), []);
  useEffect(() => {
    if (!on) return;
    let alive = true;
    void hasArabicVoice().then((v) => {
      if (alive) setVoice(v);
    });
    return () => {
      alive = false;
    };
  }, [on]);
  return (
    <View style={{ gap: 2 }}>
      <Toggle label="قراءة الأحداث بصوت" value={on} onChange={setSpeakCalls} />
      <Txt v="tiny" color={C.muted}>
        {on && voice === false
          ? 'لا يوجد صوت عربي على هذا الهاتف: أضف اللغة العربية من إعدادات الهاتف ← تحويل النص إلى كلام.'
          : 'يقرأ الهاتف النداءات المهمة: روندا، دقة، شاري، باص…'}
      </Txt>
    </View>
  );
}
