import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { RoleArt } from '@/art/game-art';
import { Icon, type IconName } from '@/art/icons';
import { isWolfRole, type RoomView, type WerewolfView, type WolfPickStep, type WolfRole, type WolfStep, type WolfWinner } from '@/shared/protocol';
import { C, alpha } from '@/theme';
import { Avatar, Card, IconBubble, Pill, PlayerTag, Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { ConfirmModal } from '@/ui/controls';
import { Confetti, HoldReveal } from '@/ui/fun';
import { Txt } from '@/ui/txt';

import { PlayAgain, ResultBanner } from './common';
import { helpers, type Helpers } from './helpers';

export const ROLES: Record<WolfRole, { name: string; color: string; team: WolfWinner; desc: string }> = {
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
  witch: {
    name: 'الساحرة',
    color: '#5BC25A',
    team: 'village',
    desc: 'لديك جرعة شفاء وجرعة سمّ، كل واحدة مرة واحدة في اللعبة. كل ليلة يريك الراوي ضحية الذئاب: أنقذها أو سمّم لاعباً آخر.',
  },
  guard: {
    name: 'الحارس',
    color: C.blue,
    team: 'village',
    desc: 'كل ليلة، أشر إلى لاعب لتحرسه من الذئاب. لا يمكنك حراسة نفس اللاعب ليلتين متتاليتين.',
  },
  tanner: {
    name: 'المجنون',
    color: C.pink,
    team: 'tanner',
    desc: 'أنت لست مع أحد! تفوز وحدك إذا أقصتك القرية في التصويت. تصرّف بشكل مريب… لكن ليس كثيراً.',
  },
  whitewolf: {
    name: 'الذئب الأبيض',
    color: '#9FD8F5',
    team: 'whitewolf',
    desc: 'تصطاد مع الذئاب، لكنك تريد الفوز وحدك: كل ليلتين يمكنك قتل ذئب. تفوز إذا بقيت آخر حيّ.',
  },
  bigwolf: {
    name: 'الذئب الكبير',
    color: '#E0603A',
    team: 'wolves',
    desc: 'ذئب مع الذئاب، وتختار ضحية ثانية كل ليلة وحدك، ما دام لم يمت أي ذئب.',
  },
};

const WIN: Record<WolfWinner, { title: string; art: WolfRole; tone: 'good' | 'bad' | 'neutral' }> = {
  wolves: { title: 'فازت الذئاب', art: 'wolf', tone: 'bad' },
  village: { title: 'فازت القرية', art: 'villager', tone: 'good' },
  tanner: { title: 'فاز المجنون!', art: 'tanner', tone: 'neutral' },
  whitewolf: { title: 'فاز الذئب الأبيض وحده', art: 'whitewolf', tone: 'bad' },
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
  bigwolf: { art: { role: 'bigwolf' }, say: 'أيها الذئب الكبير، ابقَ مستيقظاً واختر ضحية ثانية', todo: 'اضغط على الضحية الثانية' },
  whitewolf: { art: { role: 'whitewolf' }, say: 'أيها الذئب الأبيض، افتح عينيك. هل تريد قتل ذئب الليلة؟', todo: 'اضغط على الذئب الذي اختاره، أو تابع بدون اختيار' },
  guard: { art: { role: 'guard' }, say: 'أيها الحارس، افتح عينيك. من تحرس الليلة؟', todo: 'اضغط على من اختار حراسته (لا يمكن نفس لاعب الليلة الماضية)' },
  witch: { art: { role: 'witch' }, say: 'أيتها الساحرة، افتحي عينيك. هذه ضحية الذئاب: هل تنقذينها؟ وهل تسمّمين أحداً؟', todo: 'أشر لها إلى الضحية، ثم سجّل اختيارها' },
  mayor: { art: { icon: 'crown' }, say: 'حان وقت انتخاب العمدة: صوته يعدّ بصوتين ويحسم التعادل', todo: 'اضغط على العمدة الذي اختارته القرية' },
};

const PICK_STEPS: WolfStep[] = ['wolves', 'bigwolf', 'whitewolf', 'guard', 'doctor', 'seer', 'witch', 'hunter', 'mayor', 'vote'];

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
  const wolvesAlive = alive.filter((id) => isWolfRole(n.roles[id])).length;
  const villageAlive = alive.length - wolvesAlive;
  const mayorSuccession = n.step === 'mayor' && !!view.mayorId && !view.alive[view.mayorId];
  const step = mayorSuccession
    ? { art: { icon: 'crown' as IconName }, say: `العمدة ${h.player(view.mayorId!).name} مات. من يختار خليفةً له؟`, todo: 'اضغط على العمدة الجديد' }
    : SCRIPT[n.step];
  const night = view.phase === 'night';
  const picking = PICK_STEPS.includes(n.step) && !(n.step === 'witch' && n.poisonUsed && n.healUsed);
  const selectedBy: Partial<Record<WolfStep, string | null>> = {
    wolves: n.wolvesTarget,
    bigwolf: n.bigwolfTarget,
    whitewolf: n.whitewolfTarget,
    guard: n.guardSave,
    doctor: n.doctorSave,
    seer: n.seerCheck,
    witch: n.witchPoison,
    hunter: n.hunterTarget,
    mayor: n.mayorPick,
    vote: voteTarget,
  };
  const selected = selectedBy[n.step] ?? null;
  // who can be picked at this step (mirrors the server's rules)
  const candidates = alive.filter((id) => {
    const r = n.roles[id];
    if (n.step === 'wolves') return !isWolfRole(r);
    if (n.step === 'bigwolf') return !isWolfRole(r) && id !== n.wolvesTarget;
    if (n.step === 'whitewolf') return isWolfRole(r) && r !== 'whitewolf';
    if (n.step === 'guard') return id !== n.lastGuard;
    if (n.step === 'hunter') return r !== 'hunter';
    if (n.step === 'witch') return !n.poisonUsed;
    return true;
  });
  const victims = [n.wolvesTarget, n.bigwolfTarget].filter((id): id is string => !!id);
  const roleDead = (r: WolfRole) => view.participants.filter((id) => n.roles[id] === r).every((id) => !view.alive[id]);
  const stepRole: Partial<Record<WolfStep, WolfRole>> = { doctor: 'doctor', seer: 'seer', guard: 'guard', witch: 'witch', bigwolf: 'bigwolf', whitewolf: 'whitewolf' };

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

  const after = n.steps[n.steps.indexOf(n.step) + 1];
  const nextLabel: Partial<Record<WolfStep, string>> = {
    wake: 'اكشف ما حدث',
    announce: after === 'hunter' ? 'التالي: الصيّاد' : after === 'mayor' ? 'التالي: العمدة' : 'إلى التصويت',
    hunter: 'نفّذ اختيار الصيّاد',
    mayor: n.mayorPick ? `${h.player(n.mayorPick).name} هو العمدة` : 'بدون عمدة',
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
        {stepRole[n.step] && roleDead(stepRole[n.step]!) ? (
          <Txt v="small" color={C.yellow}>
            هذا الدور ميت. قلها على كل حال حتى لا يعرف أحد، ثم تابع
          </Txt>
        ) : null}
      </Animated.View>

      {/* Picker */}
      {picking ? (
        <Card>
          {n.step !== 'vote' && n.auto[n.step as WolfPickStep] ? (
            <Row gap={6} center>
              <Icon name="bot" size={16} color={C.cyan} />
              <Txt v="small" center color={C.cyan}>
                هذا الدور لبوت، تم الاختيار تلقائياً
              </Txt>
            </Row>
          ) : null}
          {n.step === 'witch' ? (
            <View style={{ gap: 6 }}>
              <Txt v="bold" center>
                {victims.length ? `ضحية الليلة: ${names(h, victims)}` : 'لا ضحية الليلة'}
              </Txt>
              {n.healUsed ? (
                <Txt v="small" center color={C.dim}>
                  جرعة الشفاء استُعملت
                </Txt>
              ) : (
                <Row wrap gap={6} center>
                  {victims.map((id) => (
                    <Btn key={id} size="sm" icon="heart" color={n.witchHeal === id ? C.green : C.surfaceStrong} label={`${n.witchHeal === id ? 'أنقذتْ' : 'أنقذ'} ${h.player(id).name}`} onPress={() => h.act('heal', { target: id })} />
                  ))}
                </Row>
              )}
              <Txt v="small" center color={n.poisonUsed ? C.dim : C.muted}>
                {n.poisonUsed ? 'جرعة السمّ استُعملت' : 'جرعة السمّ: اضغط على من تريد تسميمه (اختياري)'}
              </Txt>
            </View>
          ) : null}
          {n.step === 'guard' && n.lastGuard ? (
            <Txt v="small" center color={C.dim}>
              حرس الليلة الماضية {h.player(n.lastGuard).name}
            </Txt>
          ) : null}
          <Row wrap gap={6} center>
            {candidates.map((id) => (
              <PlayerTag
                key={id}
                player={h.player(id)}
                size={52}
                sub={ROLES[n.roles[id]].name}
                crown={view.mayorId === id}
                selected={selected === id}
                onPress={() => (n.step === 'vote' ? setVoteTarget(voteTarget === id ? null : id) : h.act('pick', { target: id }))}
              />
            ))}
          </Row>
          {n.step === 'seer' && n.seerCheck ? (
            <View style={{ alignItems: 'center' }}>
              <Txt v="h2" center color={isWolfRole(n.roles[n.seerCheck]) ? C.red : C.green}>
                {h.player(n.seerCheck).name} {isWolfRole(n.roles[n.seerCheck]) ? 'ذئب' : 'ليس ذئباً'}
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
      {night && (victims.length || n.doctorSave || n.guardSave) ? (
        <Txt v="small" center color={C.muted}>
          الضحية: {victims.length ? names(h, victims) : '—'} · المحمي: {[n.doctorSave, n.guardSave, n.witchHeal].filter(Boolean).length ? names(h, [...new Set([n.doctorSave, n.guardSave, n.witchHeal].filter((x): x is string => !!x))]) : '—'}
          {n.witchPoison ? ` · السمّ: ${h.player(n.witchPoison).name}` : ''}
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
                  <Avatar player={h.player(id)} size={32} crown={view.mayorId === id} />
                  <Txt v="bold" style={{ flex: 1, textDecorationLine: dead ? 'line-through' : 'none' }} numberOfLines={1}>
                    {h.player(id).name}
                    {view.mayorId === id ? ' (العمدة)' : ''}
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
        <Animated.View key={a.by} entering={FadeIn.duration(300)}>
          <Row gap={8}>
            <Avatar player={h.player(a.by)} size={30} />
            <Txt v="small" style={{ flex: 1 }}>
              {h.player(a.by).name}: «أنا أشك في {h.player(a.target).name}»
            </Txt>
          </Row>
        </Animated.View>
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
            {view.myRole === 'whitewolf' ? 'الذئاب (فرائسك أيضاً)' : 'الذئاب معك'}: {names(h, view.wolfPack)}
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
  const w = view.winner ? WIN[view.winner] : null;
  return (
    <>
      {won ? <Confetti /> : null}
      <ResultBanner tone={w?.tone ?? 'neutral'} art={w ? <RoleBadge role={w.art} size={72} /> : undefined} title={w?.title ?? 'انتهت اللعبة'} sub={view.endNote ?? undefined} />
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
          {view.mayorId && view.alive[view.mayorId] ? (
            <Txt v="small" center color={C.yellow}>
              العمدة: {h.player(view.mayorId).name} (صوته بصوتين)
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
            <PlayerTag key={id} player={h.player(id)} size={46} crown={view.mayorId === id && view.alive[id]} dim={!view.alive[id]} badge={!view.alive[id] ? 'skull' : id === h.me ? 'star' : undefined} />
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
