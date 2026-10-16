import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { RoleArt } from '@/art/game-art';
import { Icon, type IconName } from '@/art/icons';
import type { RoomView, WerewolfView, WolfRole, WolfStep } from '@/shared/protocol';
import { C, alpha } from '@/theme';
import { Avatar, Card, IconBubble, Pill, PlayerTag, Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { ConfirmModal } from '@/ui/controls';
import { Confetti, HoldReveal } from '@/ui/fun';
import { Txt } from '@/ui/txt';

import { PlayAgain, ResultBanner } from './common';
import { helpers, type Helpers } from './helpers';

export const ROLES: Record<WolfRole, { name: string; color: string; team: 'wolves' | 'village'; desc: string }> = {
  wolf: {
    name: 'ذئب',
    color: C.red,
    team: 'wolves',
    desc: 'في الليل، اتفق مع الذئاب الآخرين على ضحية. في النهار، تظاهر أنك قروي بريء.',
  },
  villager: {
    name: 'قروي',
    color: C.green,
    team: 'village',
    desc: 'ليست لديك قوة خاصة، لكن صوتك في النهار مهم جداً. اكتشف الذئاب.',
  },
  seer: {
    name: 'العرّافة',
    color: C.purple,
    team: 'village',
    desc: 'كل ليلة، أشر إلى لاعب وسيخبرك الراوي بالإشارة إن كان ذئباً أم لا.',
  },
  doctor: {
    name: 'الطبيب',
    color: C.cyan,
    team: 'village',
    desc: 'كل ليلة، أشر إلى لاعب لتحميه من الذئاب. يمكنك حماية نفسك.',
  },
  hunter: {
    name: 'الصيّاد',
    color: C.orange,
    team: 'village',
    desc: 'إذا متّ، تأخذ معك لاعباً واحداً تختاره.',
  },
};

/** Role illustration on its coloured disc. */
export function RoleBadge({ role, size = 40 }: { role: WolfRole; size?: number }) {
  return (
    <RoleArt role={role} size={size} />
  );
}

type ScriptArt = { role: WolfRole } | { icon: IconName };
const SCRIPT: Record<WolfStep, { art: ScriptArt; say: string; todo?: string }> = {
  sleep: { art: { icon: 'moon' }, say: 'حلّ الليل على القرية، الجميع يغمض عينيه', todo: 'تأكد أن الجميع أغمض عينيه' },
  wolves: { art: { role: 'wolf' }, say: 'أيها الذئاب، افتحوا أعينكم، واختاروا ضحيتكم بالإشارة', todo: 'اضغط على الضحية التي اختارتها الذئاب' },
  doctor: { art: { role: 'doctor' }, say: 'أيها الطبيب، افتح عينيك. من تريد أن تحمي الليلة؟', todo: 'اضغط على من اختار الطبيب حمايته' },
  seer: { art: { role: 'seer' }, say: 'أيتها العرّافة، افتحي عينيك. من تريدين أن تكشفي؟', todo: 'اضغط على من اختارته، ثم أشر لها بالجواب' },
  wake: { art: { icon: 'sun' }, say: 'طلع الصباح، الجميع يفتح عينيه', todo: 'اضغط الزر لمعرفة ما حدث في الليل' },
  announce: { art: { icon: 'bell' }, say: '' },
  vote: { art: { icon: 'vote' }, say: 'تناقشوا وصوّتوا: من تشكّون أنه ذئب؟', todo: 'اضغط على اللاعب الذي اختارته القرية' },
  hunter: { art: { role: 'hunter' }, say: 'الصيّاد مات، وسيأخذ معه لاعباً واحداً. من يختار؟', todo: 'اضغط على اختيار الصيّاد' },
};

function names(h: Helpers, ids: string[]) {
  return ids.map((id) => h.player(id).name).join(' و ');
}

function Collapsible({ title, icon, open, onToggle, children }: { title: string; icon: IconName; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <Card>
      <Pressable onPress={onToggle}>
        <Row>
          <Icon name={icon} size={18} color={C.muted} />
          <Txt v="h3" style={{ flex: 1 }}>
            {title}
          </Txt>
          <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
            <Icon name="chevron" size={18} color={C.muted} />
          </View>
        </Row>
      </Pressable>
      {open ? children : null}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Narrator                                                            */
/* ------------------------------------------------------------------ */

function Narrator({ room, view }: { room: RoomView; view: WerewolfView }) {
  const h = helpers(room);
  const n = view.narrator!;
  const [showRoles, setShowRoles] = useState(true);
  const [showLog, setShowLog] = useState(false);
  const [toggle, setToggle] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [voteTarget, setVoteTarget] = useState<string | null>(null);
  const alive = view.participants.filter((id) => view.alive[id]);
  const wolvesAlive = alive.filter((id) => n.roles[id] === 'wolf').length;
  const villageAlive = alive.length - wolvesAlive;
  const step = SCRIPT[n.step];
  const night = view.phase === 'night';
  const picking = ['wolves', 'doctor', 'seer', 'hunter', 'vote'].includes(n.step);
  const selected =
    n.step === 'wolves'
      ? n.wolvesTarget
      : n.step === 'doctor'
        ? n.doctorSave
        : n.step === 'seer'
          ? n.seerCheck
          : n.step === 'hunter'
            ? n.hunterTarget
            : n.step === 'vote'
              ? voteTarget
              : null;
  const roleDead = (r: WolfRole) => view.participants.filter((id) => n.roles[id] === r).every((id) => !view.alive[id]);

  if (view.phase === 'over') {
    return (
      <>
        <Over room={room} view={view} />
        <Btn size="lg" icon="shuffle" label="جولة جديدة بأدوار جديدة" onPress={() => h.act('again')} />
      </>
    );
  }

  let announce = '';
  if (n.step === 'announce') {
    announce = view.lastDeaths?.length ? `للأسف، ${names(h, view.lastDeaths)} لم يستيقظ هذا الصباح` : 'لم يمت أحد الليلة';
  }

  const nextLabel: Partial<Record<WolfStep, string>> = {
    wake: 'اكشف ما حدث',
    announce: n.hunterAfter === 'night' ? 'التالي: الصيّاد' : 'إلى التصويت',
    hunter: 'نفّذ اختيار الصيّاد',
  };

  return (
    <>
      <Txt v="small" center color={C.muted}>
        {night ? `الليلة ${view.day}` : `النهار ${view.day}`} · {wolvesAlive} ذئاب · {villageAlive} قرويين
      </Txt>

      {/* Script */}
      <Animated.View key={n.step + view.day} entering={FadeIn.duration(200)} style={[styles.script, { backgroundColor: night ? '#232A6B' : '#5A3F1E' }]}>
        <Row gap={10}>
          {'role' in step.art ? <RoleBadge role={step.art.role} size={44} /> : <IconBubble icon={step.art.icon} size={44} color="rgba(255,255,255,0.12)" iconColor={C.yellow} />}
          <Txt v="small" color="rgba(255,255,255,0.75)" style={{ flex: 1 }}>
            قل بصوت عالٍ
          </Txt>
        </Row>
        <Txt v="h2">«{announce || step.say}»</Txt>
        {step.todo ? (
          <Txt v="small" color="rgba(255,255,255,0.8)">
            {step.todo}
          </Txt>
        ) : null}
        {(n.step === 'doctor' && roleDead('doctor')) || (n.step === 'seer' && roleDead('seer')) ? (
          <Txt v="small" color={C.yellow}>
            هذا الدور ميت. قلها على كل حال حتى لا يعرف أحد، ثم تابع
          </Txt>
        ) : null}
      </Animated.View>

      {/* Picker */}
      {picking ? (
        <Card>
          {n.step !== 'vote' && n.auto[n.step as 'wolves' | 'doctor' | 'seer' | 'hunter'] ? (
            <Row gap={6} center>
              <Icon name="bot" size={16} color={C.cyan} />
              <Txt v="small" center color={C.cyan}>
                هذا الدور لبوت، تم الاختيار تلقائياً
              </Txt>
            </Row>
          ) : null}
          <Row wrap gap={6} center>
            {alive
              .filter((id) => !(n.step === 'wolves' && n.roles[id] === 'wolf'))
              .map((id) => (
                <PlayerTag
                  key={id}
                  player={h.player(id)}
                  size={52}
                  sub={ROLES[n.roles[id]].name}
                  selected={selected === id}
                  onPress={() => (n.step === 'vote' ? setVoteTarget(voteTarget === id ? null : id) : h.act('pick', { target: id }))}
                />
              ))}
          </Row>
          {n.step === 'seer' && n.seerCheck ? (
            <View style={{ alignItems: 'center' }}>
              <Txt v="h2" center color={n.roles[n.seerCheck] === 'wolf' ? C.red : C.green}>
                {h.player(n.seerCheck).name} {n.roles[n.seerCheck] === 'wolf' ? 'ذئب' : 'ليس ذئباً'}
              </Txt>
              <Txt v="small" color={C.muted}>
                أشر للعرّافة بإبهامك بدون كلام
              </Txt>
            </View>
          ) : null}
          {n.step === 'vote' ? (
            <View style={{ gap: 8 }}>
              {voteTarget ? (
                <Btn
                  size="lg"
                  icon="vote"
                  label={`أقصِ ${h.player(voteTarget).name}`}
                  color={C.red}
                  onPress={() => {
                    h.act('eliminate', { target: voteTarget });
                    setVoteTarget(null);
                  }}
                />
              ) : null}
              <Btn
                size="sm"
                ghost
                label="لا أحد (تعادل)"
                onPress={() => {
                  h.act('eliminate', { target: null });
                  setVoteTarget(null);
                }}
              />
            </View>
          ) : null}
        </Card>
      ) : null}

      {view.phase === 'day' && view.accusations.length ? <Accusations room={room} view={view} /> : null}

      {n.step !== 'vote' ? <Btn size="xl" icon="next" label={nextLabel[n.step] ?? 'التالي'} onPress={() => h.act('next')} /> : null}

      {/* Night summary for the narrator */}
      {night && (n.wolvesTarget || n.doctorSave) ? (
        <Txt v="small" center color={C.muted}>
          الضحية: {n.wolvesTarget ? h.player(n.wolvesTarget).name : '—'} · المحمي: {n.doctorSave ? h.player(n.doctorSave).name : '—'}
        </Txt>
      ) : null}

      <Collapsible title="كل الأدوار (لك فقط)" icon="eye" open={showRoles} onToggle={() => setShowRoles((s) => !s)}>
        <View style={{ gap: 6 }}>
          {view.participants.map((id) => {
            const role = n.roles[id];
            const r = ROLES[role];
            const dead = !view.alive[id];
            return (
              <Pressable key={id} onLongPress={() => setToggle(id)}>
                <Row style={[styles.roleRow, { opacity: dead ? 0.5 : 1 }]}>
                  <Avatar player={h.player(id)} size={32} />
                  <Txt v="bold" style={{ flex: 1, textDecorationLine: dead ? 'line-through' : 'none' }} numberOfLines={1}>
                    {h.player(id).name}
                  </Txt>
                  <Txt v="small" color={r.color}>
                    {r.name}
                  </Txt>
                  <RoleBadge role={role} size={30} />
                  {dead ? <Icon name="skull" size={18} color={C.dim} /> : null}
                </Row>
              </Pressable>
            );
          })}
          <Txt v="tiny" color={C.dim} center>
            اضغط مطوّلاً على لاعب لتغيير حالته (حي/ميت) يدوياً
          </Txt>
        </View>
      </Collapsible>

      <Collapsible title="سجل الأحداث" icon="book" open={showLog} onToggle={() => setShowLog((s) => !s)}>
        {n.log.map((l, i) => (
          <Txt key={i} v="small" color={C.muted}>
            {l}
          </Txt>
        ))}
      </Collapsible>

      <Btn size="sm" ghost icon="stop" label="إنهاء وكشف الأدوار" onPress={() => setConfirmEnd(true)} />

      <ConfirmModal
        visible={!!toggle}
        icon={toggle && view.alive[toggle] ? 'skull' : 'heart'}
        title={toggle ? `${view.alive[toggle] ? 'قتل' : 'إحياء'} ${h.player(toggle).name}؟` : ''}
        onCancel={() => setToggle(null)}
        onConfirm={() => {
          if (toggle) h.act('toggleAlive', { target: toggle });
          setToggle(null);
        }}
      />
      <ConfirmModal
        visible={confirmEnd}
        icon="stop"
        title="إنهاء اللعبة؟"
        message="ستُكشف كل الأدوار للجميع"
        danger
        onCancel={() => setConfirmEnd(false)}
        onConfirm={() => {
          setConfirmEnd(false);
          h.act('end');
        }}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Players                                                             */
/* ------------------------------------------------------------------ */

/** What the bots say during the day. */
function Accusations({ room, view }: { room: RoomView; view: WerewolfView }) {
  const h = helpers(room);
  return (
    <Card>
      <Txt v="h3">البوتات تتكلم</Txt>
      {view.accusations.map((a) => (
        <Row key={a.by} gap={8}>
          <Avatar player={h.player(a.by)} size={30} />
          <Txt v="small" style={{ flex: 1 }}>
            {h.player(a.by).name}: «أنا أشك في {h.player(a.target).name}»
          </Txt>
        </Row>
      ))}
    </Card>
  );
}

function RoleCard({ view, h, height }: { view: WerewolfView; h: Helpers; height?: number }) {
  if (!view.myRole) return null;
  const r = ROLES[view.myRole];
  return (
    <HoldReveal hint="اضغط مطوّلاً لرؤية دورك" height={height}>
      <View style={{ alignItems: 'center', gap: 4 }}>
        <RoleBadge role={view.myRole} size={100} />
        <Txt v="display" color={r.color} size={36}>
          {r.name}
        </Txt>
        <Txt v="small" center color={C.ink}>
          {r.desc}
        </Txt>
        {view.wolfPack && view.wolfPack.length ? (
          <Txt v="bold" center color={C.red}>
            الذئاب معك: {names(h, view.wolfPack)}
          </Txt>
        ) : null}
      </View>
    </HoldReveal>
  );
}

function Over({ room, view }: { room: RoomView; view: WerewolfView }) {
  const h = helpers(room);
  const roles = view.revealed ?? view.narrator?.roles ?? {};
  const myTeam = view.myRole ? ROLES[view.myRole].team : null;
  const won = !!view.winner && myTeam === view.winner;
  return (
    <>
      {won ? <Confetti /> : null}
      <ResultBanner
        tone={view.winner === 'wolves' ? 'bad' : view.winner === 'village' ? 'good' : 'neutral'}
        art={view.winner ? <RoleBadge role={view.winner === 'wolves' ? 'wolf' : 'villager'} size={72} /> : undefined}
        title={view.winner === 'wolves' ? 'فازت الذئاب' : view.winner === 'village' ? 'فازت القرية' : 'انتهت اللعبة'}
      />
      <Card>
        <Txt v="h3">الأدوار</Txt>
        <View style={{ gap: 6 }}>
          {view.participants.map((id) => (
            <Row key={id} style={[styles.roleRow, { opacity: view.alive[id] ? 1 : 0.55 }]}>
              <Avatar player={h.player(id)} size={30} />
              <Txt v="bold" style={{ flex: 1 }} numberOfLines={1}>
                {h.player(id).name}
              </Txt>
              {roles[id] ? (
                <>
                  <Txt v="small" color={ROLES[roles[id]].color}>
                    {ROLES[roles[id]].name}
                  </Txt>
                  <RoleBadge role={roles[id]} size={28} />
                </>
              ) : null}
              {view.alive[id] ? null : <Icon name="skull" size={16} color={C.dim} />}
            </Row>
          ))}
        </View>
      </Card>
    </>
  );
}

function PlayerScreen({ room, view }: { room: RoomView; view: WerewolfView }) {
  const h = helpers(room);
  const narrator = h.player(view.narratorId);
  if (!view.participants.includes(h.me)) {
    return (
      <Card style={{ alignItems: 'center' }}>
        <IconBubble icon="eye" size={60} iconColor={C.yellow} />
        <Txt v="title">أنت تتفرّج</Txt>
      </Card>
    );
  }
  if (view.phase === 'over') {
    return (
      <>
        <Over room={room} view={view} />
        <PlayAgain room={room} />
      </>
    );
  }
  const amDead = !view.alive[h.me];
  const night = view.phase === 'night';

  return (
    <>
      {amDead ? (
        <Card color={alpha(C.red, 0.18)} style={{ alignItems: 'center' }}>
          <Icon name="skull" size={36} color={C.text} />
          <Txt v="h2">أنت ميت، ممنوع الكلام</Txt>
          <Txt v="small" color={C.muted}>
            يمكنك المتابعة بصمت
          </Txt>
        </Card>
      ) : null}

      {night ? (
        <Animated.View entering={FadeIn.duration(400)} style={[styles.phase, { backgroundColor: '#0A0D22' }]}>
          <Icon name="moon" size={44} color={C.yellow} />
          <Txt v="display">الليلة {view.day}</Txt>
          <Txt center color={C.muted}>
            أغمض عينيك واستمع للراوي.{'\n'}افتحها فقط عندما يناديك.
          </Txt>
        </Animated.View>
      ) : (
        <Animated.View entering={FadeIn.duration(300)} style={[styles.phase, { backgroundColor: '#5A3F1E' }]}>
          <Icon name="sun" size={44} color={C.yellow} />
          <Txt v="title">النهار {view.day}</Txt>
          <Txt v="h3" center>
            {view.lastDeaths?.length ? `مات الليلة: ${names(h, view.lastDeaths)}` : 'لم يمت أحد الليلة'}
          </Txt>
          {view.lastEliminated ? (
            <Txt v="bold" center>
              أقصت القرية: {h.player(view.lastEliminated).name}
            </Txt>
          ) : null}
          <Txt v="small" center color="rgba(255,255,255,0.8)">
            تناقشوا: من هو الذئب؟
          </Txt>
        </Animated.View>
      )}

      {view.phase === 'day' && view.accusations.length ? <Accusations room={room} view={view} /> : null}

      <RoleCard view={view} h={h} height={night ? 200 : 230} />

      <Card>
        <Txt v="h3">القرية</Txt>
        <Row wrap gap={6} center>
          {(Object.keys(view.roleCounts) as WolfRole[]).map((r) => (
            <Pill key={r} label={`${view.roleCounts[r]} ${ROLES[r].name}`} color={alpha(ROLES[r].color, 0.25)} />
          ))}
        </Row>
        <Row wrap gap={6} center>
          {view.participants.map((id) => (
            <PlayerTag key={id} player={h.player(id)} size={46} dim={!view.alive[id]} badge={!view.alive[id] ? 'skull' : id === h.me ? 'star' : undefined} />
          ))}
        </Row>
      </Card>
      <Row gap={8} center>
        <Avatar player={narrator} size={26} badge="mic" />
        <Txt v="small" color={C.muted}>
          الراوي: {narrator.name}
        </Txt>
      </Row>
    </>
  );
}

export function WerewolfGame({ room, view }: { room: RoomView; view: WerewolfView }) {
  if (view.narrator) return <Narrator room={room} view={view} />;
  return <PlayerScreen room={room} view={view} />;
}

const styles = StyleSheet.create({
  roleRow: { borderRadius: 14, paddingHorizontal: 8, paddingVertical: 5, backgroundColor: C.bg2 },
  script: { borderRadius: 22, padding: 16, gap: 8 },
  phase: { borderRadius: 22, padding: 22, alignItems: 'center', gap: 6 },
});
