/**
 * The «قراءة الأحداث بصوت» switch (room menu and profile screen), with a hint when the phone has no
 * Arabic voice. On the profile screen (`voices`) it also lists the phone's Arabic voices to pick from,
 * with «جرّب» to hear a sample.
 */
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { arabicVoices, chooseVoice, chosenVoice, hasArabicVoice, onSpeakCallsChange, sampleVoice, setSpeakCalls, speakCallsOn } from '@/lib/speech';
import { C } from '@/theme';
import { Btn } from '@/ui/btn';
import { ChipPicker, Toggle } from '@/ui/controls';
import { Txt } from '@/ui/txt';

export function SpeakToggle({ voices = false }: { voices?: boolean }) {
  const [on, setOn] = useState(speakCallsOn());
  const [voice, setVoice] = useState<boolean | null>(null);
  const [list, setList] = useState<{ id: string; label: string; male: boolean }[]>([]);
  const [picked, setPicked] = useState(chosenVoice());
  useEffect(() => onSpeakCallsChange(setOn), []);
  useEffect(() => {
    if (!on) return;
    let alive = true;
    void hasArabicVoice().then((v) => {
      if (alive) setVoice(v);
    });
    if (voices)
      void arabicVoices().then((l) => {
        if (alive) setList(l);
      });
    return () => {
      alive = false;
    };
  }, [on, voices]);
  // at most 6 voices, numbered: their own names are codes («ar-xa-x-ard-local») that mean nothing to people
  const shown = list.slice(0, 6);
  return (
    <View style={{ gap: 6 }}>
      <Toggle label="قراءة الأحداث بصوت" value={on} onChange={setSpeakCalls} />
      <Txt v="tiny" color={C.muted}>
        {on && voice === false
          ? 'لا يوجد صوت عربي على هذا الهاتف: أضف اللغة العربية من إعدادات الهاتف ← تحويل النص إلى كلام.'
          : 'يقرأ الهاتف النداءات المهمة: روندا، دقة، شاري، باص…'}
      </Txt>
      {voices && on && shown.length > 1 ? (
        <View style={{ gap: 6 }}>
          <Txt v="small" color={C.muted}>
            الصوت
          </Txt>
          <ChipPicker
            options={[{ key: '', label: 'تلقائي' }, ...shown.map((v, i) => ({ key: v.id, label: `صوت ${i + 1}${v.male ? ' (رجل)' : ''}` }))]}
            value={picked}
            onChange={(id) => {
              setPicked(id);
              chooseVoice(id);
            }}
          />
        </View>
      ) : null}
      {voices && on ? <Btn size="sm" ghost icon="sound" label="جرّب الصوت" onPress={sampleVoice} /> : null}
    </View>
  );
}
