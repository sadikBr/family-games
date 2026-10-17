/** «الجاسوس» — the screen. */
import { useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import { Icon } from '@/art/icons';
import { client } from '@/lib/client';
import { haptic } from '@/lib/sfx';
import { useCountdown } from '@/lib/time';
import { SPY_MINUTES, type SpySettings as Settings, type SpyView } from '@/shared/games/spy';
import type { RoomView } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { Avatar, Card, Pill, PlayerTag, Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { ChipPicker, ConfirmModal, Stepper } from '@/ui/controls';
import { Confetti, HoldReveal, Podium, Scoreboard, TimerBar } from '@/ui/fun';
import { useContentWidth } from '@/ui/screen';
import { Txt, num } from '@/ui/txt';

import { HostNote, PhaseTitle, PlayAgain, ResultBanner, Spectator, WaitingFor } from './common';
import { helpers, type Helpers } from './helpers';

const INK_SOFT = '#6B6488';
const GUESS_MS = 30_000; // keep in sync with server/games/spy.ts

function SecretCard({ view, height, h }: { view: SpyView; height?: number; h: Helpers }) {
  const s = view.secret;
  if (!s) return null;
  return (
    <HoldReveal height={height} hint="اضغط مطوّلاً لرؤية المكان">
      {s.role === 'civilian' ? (
        <View style={{ alignItems: 'center', gap: 2 }}>
          <Txt v="small" color={INK_SOFT}>
            المكان
          </Txt>
          <Txt v="display" color={C.ink} size={34} center adjustsFontSizeToFit numberOfLines={1}>
            {s.location}
          </Txt>
          <Txt v="bold" color={INK_SOFT}>
            دورك: {s.part}
          </Txt>
        </View>
      ) : (
        <View style={{ alignItems: 'center', gap: 2 }}>
          <Icon name="eye" size={44} color={C.red} />
          <Txt v="title" color={C.red}>
            أنت الجاسوس
          </Txt>
          <Txt v="small" color={INK_SOFT} center>
            لا تعرف المكان: اكتشفه من الأسئلة
          </Txt>
          {s.partners.length ? (
            <Txt v="small" color={C.ink}>
              شريكك: {s.partners.map((id) => h.player(id).name).join('، ')}
            </Txt>
          ) : null}
        </View>
      )}
    </HoldReveal>
  );
}

/** Every possible location. Anyone can cross places out (on their own phone); the spy can reveal and guess from here. */
function LocationList({ view, isSpy, onReveal }: { view: SpyView; isSpy: boolean; onReveal?: () => void }) {
  const [open, setOpen] = useState(false);
  const [crossed, setCrossed] = useState<string[]>([]);
  return (
    <Card>
      <Pressable onPress={() => setOpen((o) => !o)} style={{ minHeight: 40, justifyContent: 'center' }}>
        <Row gap={8}>
          <Icon name="search" size={18} color={C.muted} />
          <Txt v="h3" style={{ flex: 1 }}>
            الأماكن الممكنة ({num(view.locations.length)})
          </Txt>
          <View style={{ transform: [{ rotate: open ? '-90deg' : '90deg' }] }}>
            <Icon name="chevron" size={18} color={C.muted} />
          </View>
        </Row>
      </Pressable>
      {open ? (
        <>
          <Txt v="tiny" color={C.dim}>
            اضغط على مكان لشطبه (على هاتفك فقط)
          </Txt>
          <Row wrap gap={6}>
            {view.locations.map((l) => {
              const off = crossed.includes(l);
              return (
                <Pressable
                  key={l}
                  onPress={() => {
                    haptic.tap();
                    setCrossed((c) => (off ? c.filter((x) => x !== l) : [...c, l]));
                  }}
                  style={[styles.place, off && styles.placeOff]}>
                  <Txt v="small" color={off ? C.dim : C.text} style={off ? { textDecorationLine: 'line-through' } : null}>
                    {l}
                  </Txt>
                </Pressable>
              );
            })}
          </Row>
          {isSpy && onReveal ? <Btn size="lg" icon="target" label="أنا الجاسوس! سأخمّن المكان" color={C.red} onPress={onReveal} /> : null}
        </>
      ) : null}
    </Card>
  );
}

const clock = (ms: number) => {
  const secs = Math.ceil(ms / 1000);
  return num(`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`);
};

/** The round's clock as a bar with minutes:seconds; grey while paused. */
function RoundTimer({ endsAt, pausedLeft, total }: { endsAt: number | null; pausedLeft: number | null; total: number }) {
  const running = useCountdown(endsAt, 250);
  const paused = endsAt === null;
  const left = paused ? (pausedLeft ?? 0) : running;
  const ratio = Math.min(1, left / Math.max(1, total));
  const color = paused ? C.dim : left > 60_000 ? C.green : left > 20_000 ? C.yellow : C.red;
  return (
    <Row gap={10}>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${ratio * 100}%`, backgroundColor: color }]} />
      </View>
      <Txt style={{ fontFamily: F.black, fontSize: 17, lineHeight: 26, color }}>
        {paused ? `متوقّف · ${clock(left)}` : clock(left)}
      </Txt>
    </Row>
  );
}

function storyOf(view: SpyView, h: Helpers): string {
  const r = view.result!;
  const name = (id: string | null) => h.player(id).name;
  const spyWord = r.spies.length > 1 ? 'الجاسوسان' : 'الجاسوس';
  switch (r.how) {
    case 'caught':
      return `أمسكتم بـ${name(r.accused)}، وهو جاسوس!`;
    case 'wrongAccuse':
      return `اتّهمتم ${name(r.accused)} وهو بريء`;
    case 'tie':
      return `انتهى الوقت ولم تتّفقوا على أحد، فنجا ${spyWord}`;
    case 'guessRight':
      return `كشف ${name(view.guesserId)} نفسه وخمّن المكان صحيحاً`;
    case 'guessWrong':
      return r.guessed ? `كشف ${name(view.guesserId)} نفسه وخمّن «${r.guessed}» خطأً` : `كشف ${name(view.guesserId)} نفسه ولم يخمّن في الوقت`;
    case 'spyLeft':
      return `غادر ${spyWord} اللعبة`;
  }
}

export function SpyGame({ room, view }: { room: RoomView; view: SpyView }) {
  const h = helpers(room);
  const { me, isHost, player, act } = h;
  const { width } = useWindowDimensions();
  const contentW = useContentWidth();
  const [accusing, setAccusing] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [revealAsk, setRevealAsk] = useState(false);
  if (!view.participants.includes(me)) return <Spectator room={room} />;

  const isSpy = view.secret?.role === 'spy';
  const tagSize = width < 360 ? 46 : 54;
  const revealModal = (
    <ConfirmModal
      visible={revealAsk}
      icon="target"
      danger
      title="تكشف نفسك؟"
      message="سيعرف الجميع أنك الجاسوس، ولديك 30 ثانية لتخمين المكان. إن أصبت فزت، وإن أخطأت فاز المواطنون."
      onCancel={() => setRevealAsk(false)}
      onConfirm={() => {
        setRevealAsk(false);
        act('spyReveal');
      }}
    />
  );
  const header = (
    <Txt v="small" center color={C.dim}>
      الجولة {num(view.round)} من {num(view.totalRounds)}
      {view.spyCount > 1 ? ' · جاسوسان' : ''}
    </Txt>
  );

  switch (view.phase) {
    case 'reveal': {
      const ready = view.ready.includes(me);
      const notReady = view.participants.filter((id) => !view.ready.includes(id)).map(player);
      return (
        <>
          <PhaseTitle icon="eye" title={`الجولة ${num(view.round)} من ${num(view.totalRounds)}`} sub="انظر إلى سرّك دون أن يراك أحد" />
          <SecretCard view={view} h={h} />
          <Btn size="xl" icon="check" label={ready ? 'جاهز' : 'رأيت، أنا جاهز'} color={C.green} disabled={ready} onPress={() => act('ready')} />
          <WaitingFor players={notReady} />
          {isHost && notReady.length ? <Btn size="sm" ghost icon="skip" label="ابدأ بدون انتظار" onPress={() => act('skipReady')} /> : null}
        </>
      );
    }

    case 'play': {
      const asker = player(view.askerId);
      const isAsker = view.askerId === me;
      const canAccuse = !view.accusers.includes(me);
      const askIdx = view.askerId ? view.order.indexOf(view.askerId) : 0;
      return (
        <>
          {header}
          <RoundTimer endsAt={view.endsAt} pausedLeft={view.pausedLeft} total={view.totalMs} />
          {view.failed ? (
            <Card color={alpha(C.yellow, 0.18)}>
              <Txt v="bold" center>
                فشل اتّهام {player(view.failed.by).name} لـ{player(view.failed.target).name} (نعم {num(view.failed.yes)} · لا {num(view.failed.no)})
              </Txt>
            </Card>
          ) : null}
          <Card style={{ alignItems: 'center', gap: 8 }}>
            <Avatar player={asker} size={72} ring={C.yellow} badge="mic" />
            <Txt v="title" center>
              {isAsker ? 'دورك في السؤال' : `دور ${asker.name} في السؤال`}
            </Txt>
            <Txt v="small" center color={C.muted}>
              {isAsker ? 'اختر أي لاعب واسأله سؤالاً عن المكان' : 'يختار لاعباً ويسأله سؤالاً'}
            </Txt>
            {isAsker ? (
              <Btn size="lg" icon="next" label="سألتُ، التالي" onPress={() => act('nextAsker', { idx: askIdx })} />
            ) : isHost ? (
              <Btn size="sm" ghost icon="next" label="التالي" onPress={() => act('nextAsker', { idx: askIdx })} />
            ) : null}
            <Row wrap gap={4} center style={{ direction: 'rtl' }}>
              {view.order.map((id) => (
                <Avatar key={id} player={player(id)} size={26} ring={id === view.askerId ? C.yellow : undefined} />
              ))}
            </Row>
          </Card>
          <SecretCard view={view} height={130} h={h} />
          {accusing ? (
            <Card outline={alpha(C.red, 0.7)}>
              <Txt v="h3" center>
                من تتّهم؟
              </Txt>
              <Row wrap gap={8} center>
                {view.participants
                  .filter((id) => id !== me)
                  .map((id) => (
                    <PlayerTag key={id} player={player(id)} size={tagSize} onPress={() => setConfirm(id)} />
                  ))}
              </Row>
              <Btn size="sm" ghost label="إلغاء" onPress={() => setAccusing(false)} />
            </Card>
          ) : (
            <Btn
              size="lg"
              icon="siren"
              label={canAccuse ? 'أتّهم لاعباً' : 'استعملت اتّهامك'}
              color={C.red}
              disabled={!canAccuse}
              onPress={() => setAccusing(true)}
            />
          )}
          <LocationList view={view} isSpy={isSpy} onReveal={() => setRevealAsk(true)} />
          <ConfirmModal
            visible={confirm !== null}
            icon="siren"
            danger
            title={`تتّهم ${player(confirm).name}؟`}
            message="يتوقف الوقت ويصوّت الجميع. لك اتّهام واحد في الجولة."
            onCancel={() => setConfirm(null)}
            onConfirm={() => {
              const target = confirm;
              setConfirm(null);
              setAccusing(false);
              if (target) act('accuse', { target });
            }}
          />
          {revealModal}
        </>
      );
    }

    case 'accuse': {
      const acc = view.accusation!;
      const target = player(acc.target);
      const by = player(acc.by);
      const isTarget = acc.target === me;
      const voters = view.participants.filter((id) => id !== acc.target);
      const waiting = voters.filter((id) => !acc.voted.includes(id)).map(player);
      return (
        <>
          {header}
          <RoundTimer endsAt={null} pausedLeft={view.pausedLeft} total={view.totalMs} />
          <PhaseTitle icon="siren" color={C.red} title="اتّهام!" sub={`${by.name} يتّهم ${target.name} بأنه الجاسوس`} />
          <Card style={{ alignItems: 'center', gap: 8 }}>
            <Row gap={14} center>
              <PlayerTag player={by} size={56} />
              <Icon name="next" size={24} color={C.red} />
              <PlayerTag player={target} size={72} ring={C.red} />
            </Row>
            {isTarget ? (
              <Txt v="h3" center>
                دافع عن نفسك بصوت عالٍ!
              </Txt>
            ) : view.myAccuseVote !== null ? (
              <Pill label={view.myAccuseVote ? 'صوّتّ: نعم، هو الجاسوس' : 'صوّتّ: لا، ليس هو'} icon="check" color={view.myAccuseVote ? alpha(C.red, 0.3) : alpha(C.green, 0.25)} />
            ) : (
              <>
                <Txt v="h3" center>
                  هل {target.name} هو الجاسوس؟
                </Txt>
                <Row gap={10} style={{ alignSelf: 'stretch' }}>
                  <Btn flex size="xl" icon="check" label="نعم" color={C.red} onPress={() => act('accuseVote', { yes: true })} />
                  <Btn flex size="xl" icon="close" label="لا" color={C.green} onPress={() => act('accuseVote', { yes: false })} />
                </Row>
              </>
            )}
          </Card>
          <Txt v="small" center color={C.muted}>
            يكفي أن توافق الأغلبية. صوّت {num(acc.voted.length)} من {num(voters.length)}
          </Txt>
          <WaitingFor players={waiting} label="في انتظار تصويت" />
          {isHost ? <Btn size="sm" ghost icon="skip" label="أنهِ التصويت الآن" onPress={() => act('forceResolve')} /> : null}
        </>
      );
    }

    case 'spyGuess': {
      const g = player(view.guesserId);
      if (view.guesserId === me) {
        return (
          <>
            <PhaseTitle icon="target" color={C.red} title="أين نحن؟" sub="اختر المكان. لديك فرصة واحدة" />
            <TimerBar endsAt={view.guessEndsAt} total={GUESS_MS} onTick />
            <Row wrap gap={8}>
              {view.locations.map((l) => (
                <Pressable
                  key={l}
                  accessibilityRole="button"
                  onPress={() => {
                    haptic.tap();
                    act('spyGuess', { location: l });
                  }}
                  style={({ pressed }) => [styles.guess, { width: (contentW - 8) / 2 }, pressed && { backgroundColor: C.raised }]}>
                  <Txt v="bold" center numberOfLines={2} style={{ fontSize: 15 }}>
                    {l}
                  </Txt>
                </Pressable>
              ))}
            </Row>
          </>
        );
      }
      return (
        <>
          <PhaseTitle title={`${g.name} هو الجاسوس!`} sub="كشف نفسه، ويحاول تخمين المكان…" />
          <TimerBar endsAt={view.guessEndsAt} total={GUESS_MS} />
          <Card style={{ alignItems: 'center', gap: 10 }}>
            <Avatar player={g} size={96} ring={C.red} />
            <Txt v="h3" center>
              إن خمّن المكان فاز، وإن أخطأ فزتم
            </Txt>
          </Card>
        </>
      );
    }

    case 'finalVote': {
      const others = view.participants.filter((id) => id !== me);
      const notVoted = view.participants.filter((id) => !view.finalVoted.includes(id)).map(player);
      return (
        <>
          {header}
          <PhaseTitle icon="clock" title="انتهى الوقت!" sub="من هو الجاسوس؟ اضغط على من تشكّ فيه" />
          <Card>
            <Row wrap gap={10} center>
              {others.map((id) => (
                <PlayerTag
                  key={id}
                  player={player(id)}
                  size={tagSize + 6}
                  selected={view.myFinalVote === id}
                  badge={view.finalVoted.includes(id) ? 'check' : undefined}
                  onPress={() => act('finalVote', { target: id })}
                />
              ))}
            </Row>
          </Card>
          <Txt center v="small" color={C.muted}>
            صوّت {num(view.finalVoted.length)} من {num(view.participants.length)}
            {view.myFinalVote ? ' · يمكنك تغيير صوتك' : ''}
          </Txt>
          <WaitingFor players={notVoted} label="في انتظار تصويت" />
          <SecretCard view={view} height={130} h={h} />
          <LocationList view={view} isSpy={isSpy} onReveal={() => setRevealAsk(true)} />
          {isHost ? <Btn size="sm" ghost icon="skip" label="اكشف النتيجة الآن" onPress={() => act('forceResolve')} /> : null}
          {revealModal}
        </>
      );
    }

    case 'result': {
      const r = view.result!;
      const iWasSpy = r.spies.includes(me);
      const iWon = r.how !== 'spyLeft' && (r.winners === 'spies') === iWasSpy;
      const last = view.round >= view.totalRounds;
      const civilians = view.participants.filter((id) => id in r.parts);
      return (
        <>
          {iWon ? <Confetti burst={view.round} /> : null}
          <ResultBanner
            tone={r.how === 'spyLeft' ? 'neutral' : r.winners === 'civilians' ? 'good' : 'bad'}
            title={r.how === 'spyLeft' ? 'انتهت الجولة' : r.winners === 'civilians' ? 'فاز المواطنون' : r.spies.length > 1 ? 'فاز الجاسوسان' : 'فاز الجاسوس'}
            sub={storyOf(view, h)}
          />
          <Card style={{ alignItems: 'center' }}>
            <Txt v="small" color={C.muted}>
              {r.spies.length > 1 ? 'الجاسوسان' : 'الجاسوس'}
            </Txt>
            <Row gap={12} center>
              {r.spies.map((id) => (
                <PlayerTag key={id} player={player(id)} size={64} ring={C.red} />
              ))}
            </Row>
            <Txt v="small" color={C.muted}>
              والمكان
            </Txt>
            <Txt v="display" color={C.yellow} center>
              {r.location}
            </Txt>
          </Card>
          <Card>
            <Txt v="h3">الأدوار</Txt>
            {civilians.map((id) => (
              <Row key={id} gap={8}>
                <Avatar player={player(id)} size={26} />
                <Txt v="small" numberOfLines={1} style={{ flex: 1 }}>
                  {player(id).name}
                </Txt>
                <Txt v="small" color={C.muted} numberOfLines={1} style={{ flexShrink: 1 }}>
                  {r.parts[id]}
                </Txt>
              </Row>
            ))}
          </Card>
          {r.votes ? (
            <Card>
              <Txt v="h3">التصويت الأخير</Txt>
              {Object.entries(r.votes).map(([from, to]) => (
                <Row key={from} gap={8}>
                  <Avatar player={player(from)} size={26} />
                  <Txt v="small" numberOfLines={1} style={{ flex: 1 }}>
                    {player(from).name}
                  </Txt>
                  <Icon name="next" size={14} color={C.dim} />
                  <Avatar player={player(to)} size={26} ring={r.spies.includes(to) ? C.red : undefined} />
                  <Txt v="small" numberOfLines={1} style={{ flex: 1 }} color={r.spies.includes(to) ? C.red : C.text}>
                    {player(to).name}
                  </Txt>
                </Row>
              ))}
            </Card>
          ) : null}
          <Card>
            <Row gap={8}>
              <Txt v="h3" style={{ flex: 1 }}>
                النقاط
              </Txt>
              {r.points[me] ? <Pill label={`+${r.points[me]} لك`} icon="star" color={alpha(C.green, 0.25)} /> : null}
            </Row>
            <Scoreboard players={room.players} scores={Object.fromEntries(view.participants.map((id) => [id, view.scores[id] ?? 0]))} highlight={me} />
          </Card>
          {isHost ? (
            <Btn size="xl" icon={last ? 'trophy' : 'refresh'} label={last ? 'النتيجة النهائية' : 'جولة جديدة'} onPress={() => act('next')} />
          ) : (
            <HostNote>{last ? 'المضيف يعرض النتيجة النهائية' : 'المضيف يبدأ الجولة التالية'}</HostNote>
          )}
        </>
      );
    }

    case 'final': {
      const scores = Object.fromEntries(view.participants.map((id) => [id, view.scores[id] ?? 0]));
      const best = Math.max(0, ...Object.values(scores));
      const winners = Object.keys(scores).filter((id) => scores[id] === best);
      const won = winners.includes(me);
      return (
        <>
          {won ? <Confetti /> : null}
          <ResultBanner
            tone={won ? 'good' : 'neutral'}
            art={<Icon name="trophy" size={56} color={C.yellow} />}
            title={winners.length === 1 ? `فاز ${player(winners[0]).name}` : 'تعادل!'}
            sub="انتهت كل الجولات"
          />
          <Podium players={room.players} scores={scores} />
          <Scoreboard players={room.players} scores={scores} highlight={me} />
          <PlayAgain room={room} />
        </>
      );
    }
  }
}

/** Lobby settings. */
export function SpySettings({ room, editable }: { room: RoomView; editable: boolean }) {
  const settings = room.settings.spy;
  const change = (patch: Partial<Settings>) => client.roomAction({ type: 'settings', game: 'spy', patch: patch as Record<string, unknown> });
  return (
    <View style={{ gap: 10 }}>
      <Txt v="bold">عدد الجواسيس</Txt>
      <ChipPicker
        editable={editable}
        value={String(settings.spies)}
        onChange={(v) => change({ spies: Number(v) })}
        options={[
          { key: '0', label: 'تلقائي' },
          { key: '1', label: 'جاسوس واحد' },
          { key: '2', label: 'جاسوسان' },
        ]}
      />
      <Txt v="tiny" color={C.muted}>
        تلقائي: جاسوس واحد، واثنان من 7 لاعبين فما فوق.
      </Txt>
      <Txt v="bold">مدة الجولة</Txt>
      <ChipPicker
        editable={editable}
        value={String(settings.minutes)}
        onChange={(v) => change({ minutes: Number(v) })}
        options={SPY_MINUTES.map((m) => ({ key: String(m), label: `${m} دقائق` }))}
      />
      <Stepper label="عدد الجولات" value={settings.rounds} min={1} max={10} editable={editable} onChange={(rounds) => change({ rounds })} />
    </View>
  );
}

const styles = StyleSheet.create({
  place: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minHeight: 40,
    justifyContent: 'center',
    backgroundColor: C.surfaceStrong,
  },
  guess: {
    minHeight: 48,
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingVertical: 6,
    justifyContent: 'center',
    backgroundColor: C.surfaceStrong,
    borderBottomWidth: 3,
    borderBottomColor: C.bg3,
  },
  placeOff: { backgroundColor: 'transparent', borderWidth: 1, borderColor: C.border },
  track: { flex: 1, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.1)', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
});
