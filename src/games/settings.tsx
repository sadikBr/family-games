import { Pressable, StyleSheet, View } from 'react-native';

import { client } from '@/lib/client';
import { MEMORY_SIZES } from '@/shared/memory';
import type { GameId, RoomView } from '@/shared/protocol';
import { C } from '@/theme';
import { Avatar, Row } from '@/ui/bits';
import { ChipPicker, Stepper, Toggle } from '@/ui/controls';
import { Txt } from '@/ui/txt';

function settingsFor<G extends GameId>(room: RoomView, game: G) {
  const settings = room.settings[game];
  const change = (patch: Partial<RoomView['settings'][G]>) =>
    client.roomAction({ type: 'settings', game, patch: patch as Record<string, unknown> });
  return { settings, change };
}

const secs = (v: number) => `${v} ث`;

export function GameSettings({ room, editable }: { room: RoomView; editable: boolean }) {
  switch (room.game) {
    case 'imposter': {
      const { settings, change } = settingsFor(room, 'imposter');
      return (
        <View style={{ gap: 10 }}>
          <Txt v="bold">الموضوع</Txt>
          <ChipPicker
            editable={editable}
            value={settings.category}
            onChange={(category) => change({ category })}
            options={[{ key: 'random', label: 'عشوائي' }, ...room.categories.imposter]}
          />
          <Stepper
            label="عدد الدخلاء"
            value={settings.imposters}
            min={0}
            max={3}
            editable={editable}
            onChange={(imposters) => change({ imposters })}
            format={(v) => (v === 0 ? 'تلقائي' : String(v))}
          />
          <Toggle
            label="الدخيل يعرف الموضوع"
            value={settings.hintForImposter}
            editable={editable}
            onChange={(hintForImposter) => change({ hintForImposter })}
          />
        </View>
      );
    }
    case 'names': {
      const { settings, change } = settingsFor(room, 'names');
      return (
        <View style={{ gap: 10 }}>
          <Stepper label="عدد الجولات" value={settings.rounds} min={1} max={15} editable={editable} onChange={(rounds) => change({ rounds })} />
          <Stepper label="الوقت لكل جولة" value={settings.seconds} min={30} max={240} step={15} editable={editable} onChange={(seconds) => change({ seconds })} format={secs} />
        </View>
      );
    }
    case 'headsup': {
      const { settings, change } = settingsFor(room, 'headsup');
      return (
        <View style={{ gap: 10 }}>
          <Txt v="bold">الموضوع</Txt>
          <ChipPicker
            editable={editable}
            value={settings.category}
            onChange={(category) => change({ category })}
            options={[{ key: 'random', label: 'عشوائي كل دور' }, ...room.categories.headsup]}
          />
          <Stepper label="مدة الدور" value={settings.seconds} min={30} max={180} step={15} editable={editable} onChange={(seconds) => change({ seconds })} format={secs} />
          <Stepper label="أدوار لكل لاعب" value={settings.turnsEach} min={1} max={3} editable={editable} onChange={(turnsEach) => change({ turnsEach })} />
        </View>
      );
    }
    case 'taboo': {
      const { settings, change } = settingsFor(room, 'taboo');
      return (
        <View style={{ gap: 10 }}>
          <Stepper label="مدة الدور" value={settings.seconds} min={30} max={180} step={15} editable={editable} onChange={(seconds) => change({ seconds })} format={secs} />
          <Stepper label="أدوار لكل فريق" value={settings.turnsEach} min={1} max={6} editable={editable} onChange={(turnsEach) => change({ turnsEach })} />
        </View>
      );
    }
    case 'potato': {
      const { settings, change } = settingsFor(room, 'potato');
      return (
        <View style={{ gap: 10 }}>
          <Stepper label="عدد الجولات" value={settings.rounds} min={1} max={15} editable={editable} onChange={(rounds) => change({ rounds })} />
          <Stepper label="أقل وقت للانفجار" value={settings.minFuse} min={5} max={60} step={5} editable={editable} onChange={(minFuse) => change({ minFuse })} format={secs} />
          <Stepper label="أطول وقت للانفجار" value={settings.maxFuse} min={10} max={120} step={5} editable={editable} onChange={(maxFuse) => change({ maxFuse })} format={secs} />
        </View>
      );
    }
    case 'ronda': {
      const { settings, change } = settingsFor(room, 'ronda');
      return <Stepper label="النقاط للفوز" value={settings.target} min={11} max={101} step={10} editable={editable} onChange={(target) => change({ target })} />;
    }
    case 'kanza': {
      const { settings, change } = settingsFor(room, 'kanza');
      return <Stepper label="عدد الأيدي" value={settings.hands} min={1} max={10} editable={editable} onChange={(hands) => change({ hands })} />;
    }
    case 'tris': {
      const { settings, change } = settingsFor(room, 'tris');
      return <Stepper label="النقاط للفوز" value={settings.target} min={11} max={61} step={10} editable={editable} onChange={(target) => change({ target })} />;
    }
    case 'konkan': {
      const { settings, change } = settingsFor(room, 'konkan');
      return <Stepper label="حدّ الخروج" value={settings.limit} min={30} max={300} step={10} editable={editable} onChange={(limit) => change({ limit })} />;
    }
    case 'unoflip': {
      const { settings, change } = settingsFor(room, 'unoflip');
      return <Stepper label="النقاط للفوز" value={settings.target} min={50} max={500} step={50} editable={editable} onChange={(target) => change({ target })} />;
    }
    case 'ludo': {
      const { settings, change } = settingsFor(room, 'ludo');
      return <Toggle label="الخروج بـ 1 أيضاً (وليس 6 فقط)" value={settings.exitOnOne} editable={editable} onChange={(exitOnOne) => change({ exitOnOne })} />;
    }
    case 'codenames': {
      const { settings, change } = settingsFor(room, 'codenames');
      return <Toggle label="الكلمة السوداء (تخسر إذا كشفتها)" value={settings.assassin} editable={editable} onChange={(assassin) => change({ assassin })} />;
    }
    case 'dama': {
      const { settings, change } = settingsFor(room, 'dama');
      return (
        <View style={{ gap: 6 }}>
          <Toggle label="الملك يطير على القطر كله" value={settings.flyingKings} editable={editable} onChange={(flyingKings) => change({ flyingKings })} />
          <Toggle label="القطع تأكل إلى الخلف" value={settings.backCapture} editable={editable} onChange={(backCapture) => change({ backCapture })} />
        </View>
      );
    }
    case 'draw': {
      const { settings, change } = settingsFor(room, 'draw');
      return (
        <View style={{ gap: 10 }}>
          <Stepper label="عدد الجولات" value={settings.rounds} min={1} max={5} editable={editable} onChange={(rounds) => change({ rounds })} />
          <Stepper label="وقت الرسم" value={settings.seconds} min={40} max={150} step={10} editable={editable} onChange={(seconds) => change({ seconds })} format={secs} />
        </View>
      );
    }
    case 'connect4':
    case 'chess':
    case 'kharbga':
    case 'battleship':
    case 'xo': {
      const { settings, change } = settingsFor(room, room.game);
      return (
        <View style={{ gap: 8 }}>
          <Txt v="bold">قوة البوت</Txt>
          <ChipPicker
            options={[
              { key: '1', label: 'سهل' },
              { key: '2', label: 'قوي' },
            ]}
            value={String(settings.level) as '1' | '2'}
            editable={editable}
            onChange={(v) => change({ level: Number(v) as 1 | 2 })}
          />
        </View>
      );
    }
    case 'sudoku': {
      const { settings, change } = settingsFor(room, 'sudoku');
      return (
        <View style={{ gap: 8 }}>
          <Txt v="bold">صعوبة اللغز</Txt>
          <ChipPicker
            options={[
              { key: 'easy', label: 'سهل' },
              { key: 'medium', label: 'متوسط' },
              { key: 'hard', label: 'صعب' },
            ]}
            value={settings.level}
            editable={editable}
            onChange={(level) => change({ level })}
          />
        </View>
      );
    }
    case 'trivia': {
      const { settings, change } = settingsFor(room, 'trivia');
      return (
        <View style={{ gap: 10 }}>
          <Stepper label="عدد الأسئلة" value={settings.rounds} min={5} max={30} step={5} editable={editable} onChange={(rounds) => change({ rounds })} />
          <Stepper label="وقت السؤال" value={settings.seconds} min={10} max={30} step={5} editable={editable} onChange={(seconds) => change({ seconds })} format={secs} />
          <Txt v="bold">نوع الأسئلة</Txt>
          <ChipPicker
            options={[
              { key: 'all', label: 'الكل' },
              { key: 'morocco', label: 'المغرب' },
              { key: 'geography', label: 'جغرافيا' },
              { key: 'science', label: 'علوم' },
              { key: 'sport', label: 'رياضة' },
              { key: 'animals', label: 'حيوانات' },
              { key: 'mixed', label: 'منوّعات' },
            ]}
            value={settings.category}
            editable={editable}
            onChange={(category) => change({ category })}
          />
        </View>
      );
    }
    case 'memory': {
      const { settings, change } = settingsFor(room, 'memory');
      return (
        <View style={{ gap: 8 }}>
          <Txt v="bold">عدد البطاقات</Txt>
          <ChipPicker
            options={MEMORY_SIZES.map((n) => ({ key: String(n), label: String(n * 2) }))}
            value={String(settings.pairs)}
            editable={editable}
            onChange={(v) => change({ pairs: Number(v) })}
          />
        </View>
      );
    }
    case 'kdab': {
      const { settings, change } = settingsFor(room, 'kdab');
      return <Stepper label="أكثر عدد من الأوراق في اللعبة الواحدة" value={settings.maxPlay} min={1} max={4} editable={editable} onChange={(maxPlay) => change({ maxPlay })} />;
    }
    case 'wave': {
      const { settings, change } = settingsFor(room, 'wave');
      return <Stepper label="كم مرة يعطي كل لاعب التلميح" value={settings.rounds} min={1} max={3} editable={editable} onChange={(rounds) => change({ rounds })} />;
    }
    case 'wordle': {
      const { settings, change } = settingsFor(room, 'wordle');
      return <Stepper label="عدد الكلمات" value={settings.rounds} min={1} max={10} editable={editable} onChange={(rounds) => change({ rounds })} />;
    }
    case 'huroof': {
      const { settings, change } = settingsFor(room, 'huroof');
      return <Stepper label="وقت الإجابة" value={settings.seconds} min={10} max={40} step={5} editable={editable} onChange={(seconds) => change({ seconds })} format={secs} />;
    }
    case 'quiz': {
      const { settings, change } = settingsFor(room, 'quiz');
      return (
        <View style={{ gap: 10 }}>
          <Stepper label="عدد الأسئلة" value={settings.rounds} min={5} max={30} step={5} editable={editable} onChange={(rounds) => change({ rounds })} />
          <Stepper label="وقت السؤال" value={settings.seconds} min={10} max={30} step={5} editable={editable} onChange={(seconds) => change({ seconds })} format={secs} />
          <Txt v="bold">نوع الأسئلة</Txt>
          <ChipPicker
            options={[
              { key: 'all', label: 'الكل' },
              { key: 'quran', label: 'القرآن' },
              { key: 'prophets', label: 'الأنبياء' },
              { key: 'seerah', label: 'السيرة' },
              { key: 'companions', label: 'الصحابة' },
              { key: 'worship', label: 'العبادات' },
              { key: 'hajj', label: 'الحج' },
              { key: 'history', label: 'التاريخ' },
              { key: 'places', label: 'أماكن' },
            ]}
            value={settings.category}
            editable={editable}
            onChange={(category) => change({ category })}
          />
        </View>
      );
    }
    case 'whois': {
      const { settings, change } = settingsFor(room, 'whois');
      return <Stepper label="عدد الجولات" value={settings.rounds} min={4} max={20} step={2} editable={editable} onChange={(rounds) => change({ rounds })} />;
    }
    case 'surah': {
      const { settings, change } = settingsFor(room, 'surah');
      return (
        <View style={{ gap: 10 }}>
          <Txt v="bold">المستوى</Txt>
          <ChipPicker
            options={[
              { key: 'easy', label: 'جزء عمّ' },
              { key: 'medium', label: 'من «ق» إلى «الناس»' },
              { key: 'hard', label: 'القرآن كاملاً' },
            ]}
            value={settings.level}
            editable={editable}
            onChange={(level) => change({ level })}
          />
          <Stepper label="عدد الآيات" value={settings.rounds} min={5} max={30} step={5} editable={editable} onChange={(rounds) => change({ rounds })} />
          <Stepper label="وقت السؤال" value={settings.seconds} min={10} max={40} step={5} editable={editable} onChange={(seconds) => change({ seconds })} format={secs} />
        </View>
      );
    }
    case 'hajj': {
      const { settings, change } = settingsFor(room, 'hajj');
      return <Toggle label="الأسئلة (أسئلة المحطات للجميع وخانات الاستفهام)" value={settings.questions} editable={editable} onChange={(questions) => change({ questions })} />;
    }
    case 'ladders': {
      const { settings, change } = settingsFor(room, 'ladders');
      return <Toggle label="الوصول إلى 100 بالرقم المضبوط" value={settings.exact} editable={editable} onChange={(exact) => change({ exact })} />;
    }
    case 'estate': {
      const { settings, change } = settingsFor(room, 'estate');
      return (
        <View style={{ gap: 10 }}>
          <Stepper label="المال عند البداية" value={settings.startCash} min={1000} max={3000} step={500} editable={editable} onChange={(startCash) => change({ startCash })} />
          <Stepper label="عدد الجولات" value={settings.rounds} min={0} max={60} step={10} editable={editable} onChange={(rounds) => change({ rounds })} format={(n) => (n === 0 ? 'بلا حد' : String(n))} />
        </View>
      );
    }
    case 'werewolf': {
      const { settings, change } = settingsFor(room, 'werewolf');
      const narrator = settings.narratorId ?? room.hostId;
      return (
        <View style={{ gap: 10 }}>
          <Txt v="bold">من الراوي؟</Txt>
          <Row wrap gap={8}>
            {room.players.filter((p) => !p.bot).map((p) => {
              const active = p.id === narrator;
              if (!editable && !active) return null;
              return (
                <Pressable
                  key={p.id}
                  disabled={!editable}
                  onPress={() => change({ narratorId: p.id })}
                  style={[styles.chip, active && { backgroundColor: C.yellow }]}>
                  <Avatar player={p} size={24} />
                  <Txt v="small" color={active ? C.ink : C.text}>
                    {p.name}
                  </Txt>
                </Pressable>
              );
            })}
          </Row>
          <Stepper
            label="عدد الذئاب"
            value={settings.wolves}
            min={0}
            max={5}
            editable={editable}
            onChange={(wolves) => change({ wolves })}
            format={(v) => (v === 0 ? 'تلقائي' : String(v))}
          />
          <Toggle label="العرّافة" value={settings.seer} editable={editable} onChange={(seer) => change({ seer })} />
          <Toggle label="الطبيب" value={settings.doctor} editable={editable} onChange={(doctor) => change({ doctor })} />
          <Toggle label="الصيّاد" value={settings.hunter} editable={editable} onChange={(hunter) => change({ hunter })} />
          <Toggle label="الساحرة (شفاء وسمّ)" value={settings.witch} editable={editable} onChange={(witch) => change({ witch })} />
          <Toggle label="الحارس" value={settings.guard} editable={editable} onChange={(guard) => change({ guard })} />
          <Toggle label="انتخاب العمدة" value={settings.mayor} editable={editable} onChange={(mayor) => change({ mayor })} />
          <Toggle label="المجنون (يفوز إذا أُقصي)" value={settings.tanner} editable={editable} onChange={(tanner) => change({ tanner })} />
          <Toggle label="الذئب الكبير" value={settings.bigwolf} editable={editable} onChange={(bigwolf) => change({ bigwolf })} />
          <Toggle label="الذئب الأبيض (يحتاج ذئبين)" value={settings.whitewolf} editable={editable} onChange={(whitewolf) => change({ whitewolf })} />
        </View>
      );
    }
  }
}

export function NarratorBadge({ room }: { room: RoomView }) {
  const id = room.settings.werewolf.narratorId ?? room.hostId;
  const p = room.players.find((x) => x.id === id);
  if (!p) return null;
  return (
    <Row gap={8}>
      <Avatar player={p} size={28} />
      <Txt v="small">الراوي: {p.name}</Txt>
    </Row>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 3,
    paddingStart: 3,
    paddingEnd: 12,
    borderRadius: 999,
    backgroundColor: C.surfaceStrong,
  },
});
