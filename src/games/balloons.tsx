/**
 * «البالونات» — the screen. The setter chooses a category and writes the secret word (checked live: Arabic
 * letters, one word, 3–10 letters, «ال» taken off; the server checks the spelling), or asks the app for
 * one; the others watch the balloons wait. Then: the balloon scene (balloons-scene.tsx), the category, the
 * word as letter boxes (each found letter in its joined shape), the 28-letter keyboard (tried letters in
 * green / struck red), «أعرف الكلمة!», the players' strip; the round's result; the final podium.
 */
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { GameArt } from '@/art/game-art';
import { Icon } from '@/art/icons';
import { client } from '@/lib/client';
import { haptic } from '@/lib/sfx';
import {
  BALLOONS_CATS,
  BALLOONS_CAT_LABEL,
  BALLOONS_KEYS,
  BALLOONS_KEY_ALSO,
  BALLOONS_KEY_RULE,
  BALLOONS_ROUNDS,
  BALLOONS_TURN_SECONDS,
  prepareWord,
  slotForms,
  type BalloonsCat,
  type BalloonsSettings as Settings,
  type BalloonsView,
} from '@/shared/games/balloons';
import { li } from '@/shared/li';
import type { RoomView } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { Avatar, Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { ChipPicker, Toggle } from '@/ui/controls';
import { Field } from '@/ui/field';
import { TimerBar } from '@/ui/fun';
import { Txt, num } from '@/ui/txt';

import { BalloonScene } from './balloons-scene';
import { Spectator } from './common';
import { helpers, type Helpers } from './helpers';
import { HostNext, QuizFinal, ResultRows, RoundHeader } from './islamic-ui';
import { PlayerStrip } from './player-strip';
import { useScreenClock, useSettled } from './touch-motion';
import { dk } from '@/ui/layout';

const PINK = '#E86FA6';
const CREAM = '#FFF4DA';

/** «3 حروف»، «11 حرفاً» */
const lettersText = (n: number) => (n <= 10 ? `${num(n)} حروف` : `${num(n)} حرفاً`);

export function BalloonsGame({ room, view }: { room: RoomView; view: BalloonsView }) {
  useScreenClock();
  const h = helpers(room);
  if (view.phase === 'final') return <QuizFinal room={room} scores={view.scores} game="balloons" h={h} sub="أحسنتم جميعاً!" />;
  if (!view.players.includes(h.me)) return <Spectator room={room} />;
  return <BalloonsRound key={view.round} room={room} view={view} h={h} />;
}

function useInner() {
  const { width } = useWindowDimensions();
  return Math.min(width - 32, dk(520));
}

function BalloonsRound({ room, view, h }: { room: RoomView; view: BalloonsView; h: Helpers }) {
  const inner = useInner();
  const mine = view.scores[h.me] ?? 0;
  const setterName = view.setter ? h.player(view.setter).name : null;
  return (
    <>
      <RoundHeader
        label={view.setter ? (view.setter === h.me ? 'كلمتك' : `كلمة ${setterName}`) : 'كلمة من التطبيق'}
        round={view.round}
        rounds={view.rounds}
        right={
          <Txt v="tiny" color={C.muted}>
            نقاطك: {num(mine)}
          </Txt>
        }
      />
      {view.phase === 'set' && view.setter === h.me ? (
        <SetWord view={view} h={h} />
      ) : (
        <>
          <BalloonScene
            balloons={view.balloons}
            max={view.maxBalloons}
            won={view.phase === 'reveal' ? !!view.result?.won : null}
            width={inner}
            guesser={view.last && !view.last.ok ? view.last.by : null}
            me={h.me}
          />
          {view.phase === 'set' ? <Waiting view={view} h={h} /> : <Board view={view} h={h} />}
        </>
      )}
      {view.phase === 'guess' ? <Guess view={view} h={h} /> : null}
      {view.phase === 'reveal' && view.result ? <Reveal view={view} h={h} /> : null}
      {view.phase !== 'reveal' ? (
        <PlayerStrip
          room={room}
          active={view.phase === 'set' && view.setter ? [view.setter] : view.turn ? [view.turn] : []}
          entries={view.players.map((id) => ({ id, score: view.scores[id] ?? 0, sub: id === view.setter ? 'صاحب الكلمة' : undefined }))}
        />
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* The setter writes the word                                          */
/* ------------------------------------------------------------------ */

const CAT_OPTIONS = BALLOONS_CATS.map((c) => ({ key: c, label: BALLOONS_CAT_LABEL[c] }));

function SetWord({ view, h }: { view: BalloonsView; h: Helpers }) {
  const [cat, setCat] = useState<BalloonsCat | null>(null);
  const [text, setText] = useState('');
  const [sent, setSent] = useState(false);
  const t = text.trim();
  const p = t ? prepareWord(t) : null;
  const ok = !!p?.ok && !!cat;
  // a refused word (the server's error shows as a message): the buttons come back
  useEffect(() => {
    if (!sent) return;
    const id = setTimeout(() => setSent(false), 2500);
    return () => clearTimeout(id);
  }, [sent]);
  const send = (word: string | null) => {
    if (!cat) return;
    haptic.medium();
    setSent(true);
    h.act('set', { round: view.round, cat, ...(word ? { word } : {}) });
  };
  return (
    <View style={styles.panel}>
      <Row gap={8}>
        <GameArt id="balloons" size={40} />
        <View style={{ flex: 1 }}>
          <Txt v="h2">دورك لاختيار الكلمة السرية</Txt>
          <Txt v="tiny" color={C.muted}>
            لا يراها أحد غيرك. سيخمّنها الآخرون حرفاً حرفاً.
          </Txt>
        </View>
      </Row>
      <Txt v="bold">١. فئة الكلمة</Txt>
      <ChipPicker<BalloonsCat> value={(cat ?? '') as BalloonsCat} onChange={setCat} options={CAT_OPTIONS} />
      <Txt v="bold">٢. الكلمة</Txt>
      <Field
        value={text}
        onChangeText={setText}
        onSubmitEditing={() => ok && send(t)}
        placeholder="اكتب كلمة واحدة…"
        placeholderTextColor={C.dim}
        style={[styles.input, { borderColor: t ? alpha(p?.ok ? C.green : C.yellow, 0.7) : C.border }]}
        maxLength={24}
        returnKeyType="done"
        autoCorrect={false}
        autoCapitalize="none"
        autoComplete="off"
      />
      {p ? (
        <Row gap={6} center>
          <Icon name={p.ok ? 'check' : 'info'} size={14} color={p.ok ? C.green : C.yellow} />
          <Txt v="tiny" color={p.ok ? C.green : C.yellow} style={{ flexShrink: 1 }}>
            {p.ok ? `${lettersText(p.word.chars.length)}${p.word.alStripped ? ' · حُذفت «ال» من أول الكلمة' : ''}` : p.error}
          </Txt>
        </Row>
      ) : null}
      <Btn size="lg" icon="play" label={cat ? 'ابدأ الجولة' : 'اختر الفئة أولاً'} color={PINK} disabled={!ok || sent} onPress={() => send(t)} />
      <Btn size="sm" ghost icon="shuffle" label="كلمة من التطبيق في هذه الفئة" disabled={!cat || sent} onPress={() => send(null)} />
      <Txt v="tiny" center color={C.dim}>
        من 3 إلى 10 حروف، يعرفها قاموس التطبيق، حتى لا يفسد خطأ في الكتابة الجولة.
      </Txt>
    </View>
  );
}

function Waiting({ view, h }: { view: BalloonsView; h: Helpers }) {
  const p = h.player(view.setter);
  return (
    <View style={[styles.panel, { alignItems: 'center' }]}>
      <Avatar player={p} size={46} />
      <Txt v="h2" center>
        الكلمة السرية عند {p.name}
      </Txt>
      <Txt v="small" center color={C.muted}>
        بانتظار الفئة والكلمة…
      </Txt>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* The word                                                            */
/* ------------------------------------------------------------------ */

function Board({ view, h }: { view: BalloonsView; h: Helpers }) {
  const n = view.slots.length;
  return (
    <View style={{ gap: 8 }}>
      <Row gap={8} center wrap>
        {view.cat ? (
          <View style={styles.catChip}>
            <Txt v="bold" color={C.text} style={{ fontSize: 15 }}>
              {BALLOONS_CAT_LABEL[view.cat]}
            </Txt>
          </View>
        ) : null}
        <Txt v="tiny" color={C.muted}>
          {lettersText(n)}
        </Txt>
        <Row gap={3}>
          {Array.from({ length: view.maxBalloons }, (_, i) => (
            <View key={i} style={[styles.dot, { backgroundColor: i < view.balloons ? PINK : C.raised }]} />
          ))}
        </Row>
      </Row>
      <WordBoxes slots={view.slots} />
      {view.setter === h.me && view.secret && view.phase === 'guess' ? (
        <Txt v="tiny" center color={C.muted}>
          كلمتك: «{view.secret}» — لا يراها الآخرون{view.alStripped ? ' (بلا «ال»)' : ''}
        </Txt>
      ) : null}
    </View>
  );
}

/** The word as letter boxes, right to left: each found letter in its shape inside the word. */
function WordBoxes({ slots }: { slots: (string | null)[] }) {
  const inner = useInner();
  const settled = useSettled();
  const n = Math.max(1, slots.length);
  const gap = n > 8 ? 3 : 5;
  const size = Math.min(50, Math.floor((inner - gap * (n - 1)) / n));
  const forms = slotForms(slots);
  return (
    <View style={{ flexDirection: 'row', gap, justifyContent: 'center' }} accessibilityLabel={slots.map((c) => c ?? 'مربع فارغ').join('، ')}>
      {forms.map((f, i) => (
        <View key={i} style={[styles.box, { width: size, height: Math.round(size * 1.18), borderRadius: Math.round(size * 0.24) }, f ? styles.boxOn : styles.boxOff]}>
          {f ? (
            <Animated.View key={f} entering={settled ? FadeIn.duration(320) : undefined}>
              <Txt style={{ fontFamily: F.display, color: C.ink, fontSize: Math.round(size * 0.62), lineHeight: Math.round(size * 1.08), textAlign: 'center' }}>{f}</Txt>
            </Animated.View>
          ) : (
            <View style={[styles.blank, { width: size * 0.42 }]} />
          )}
        </View>
      ))}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Guessing                                                            */
/* ------------------------------------------------------------------ */

function Guess({ view, h }: { view: BalloonsView; h: Helpers }) {
  const myTurn = view.turn === h.me;
  // both reset by the next move: the keys wait for the answer to a letter sent (a refusal shows as a
  // message and frees them after a moment), and the word box closes
  const moveKey = `${view.last?.seq ?? 0}|${view.turn}|${view.tried.length}`;
  const [pendingAt, setPendingAt] = useState<string | null>(null);
  const [wordAt, setWordAt] = useState<string | null>(null);
  const pending = pendingAt === moveKey;
  const wordOpen = myTurn && wordAt === moveKey;
  useEffect(() => {
    if (!pendingAt) return;
    const id = setTimeout(() => setPendingAt(null), 2500);
    return () => clearTimeout(id);
  }, [pendingAt]);
  const turnName = view.turn ? h.player(view.turn).name : '';
  return (
    <>
      {view.endsAt ? <TimerBar key={`${view.turn}|${view.last?.seq ?? 0}`} endsAt={view.endsAt} total={view.timerTotal} onTick={myTurn} /> : null}
      <View style={[styles.turn, myTurn && { borderColor: alpha(PINK, 0.8), backgroundColor: alpha(PINK, 0.14) }]}>
        {view.turn ? <Avatar player={h.player(view.turn)} size={26} /> : null}
        <Txt v="bold" color={myTurn ? C.text : C.muted} style={{ flexShrink: 1 }}>
          {myTurn ? 'دورك: اختر حرفاً' : view.setter === h.me ? `الدور ${li(turnName)} · كلمتك تحت الاختبار` : `الدور ${li(turnName)}`}
        </Txt>
      </View>
      <Keyboard
        view={view}
        enabled={myTurn && !pending}
        onKey={(key) => {
          haptic.tap();
          setPendingAt(moveKey);
          h.act('letter', { round: view.round, key });
        }}
      />
      <Txt v="tiny" center color={C.dim}>
        {BALLOONS_KEY_RULE}
      </Txt>
      {myTurn ? (
        wordOpen ? (
          <WordGuess view={view} h={h} onClose={() => setWordAt(null)} />
        ) : (
          <Btn size="md" icon="sparkle" label="أعرف الكلمة!" color={C.yellow} disabled={pending} onPress={() => setWordAt(moveKey)} />
        )
      ) : null}
      {view.wrongWords.length ? (
        <Row gap={6} center wrap>
          <Txt v="tiny" color={C.muted}>
            كلمات جُرّبت:
          </Txt>
          {view.wrongWords.map((w, i) => (
            <View key={i} style={styles.wrongWord}>
              <Txt v="tiny" color={C.muted} style={{ textDecorationLine: 'line-through' }}>
                {w.text}
              </Txt>
            </View>
          ))}
        </Row>
      ) : null}
    </>
  );
}

/** The 28 letters, 7 a row, in alphabetical order (right to left). */
function Keyboard({ view, enabled, onKey }: { view: BalloonsView; enabled: boolean; onKey: (key: string) => void }) {
  const inner = useInner();
  const gap = 5;
  const w = Math.floor((inner - gap * 6) / 7);
  const hgt = Math.min(54, Math.round(w * 1.12));
  const tried = new Map(view.tried.map((t) => [t.key, t]));
  return (
    <View style={{ gap, opacity: enabled ? 1 : 0.6 }}>
      {[0, 1, 2, 3].map((row) => (
        <Row key={row} gap={gap} style={{ justifyContent: 'center' }}>
          {BALLOONS_KEYS.slice(row * 7, row * 7 + 7).map((key) => {
            const t = tried.get(key);
            const also = BALLOONS_KEY_ALSO[key];
            const bg = t ? (t.ok ? alpha(C.green, 0.28) : alpha(C.red, 0.12)) : C.surfaceStrong;
            const border = t ? (t.ok ? alpha(C.green, 0.8) : alpha(C.red, 0.35)) : C.borderStrong;
            const color = t ? (t.ok ? C.green : alpha(C.text, 0.35)) : C.text;
            return (
              <Pressable
                key={key}
                disabled={!enabled || !!t}
                onPress={() => onKey(key)}
                accessibilityRole="button"
                accessibilityLabel={`حرف ${key}${t ? (t.ok ? ' — في الكلمة' : ' — ليس في الكلمة') : ''}`}
                style={({ pressed }) => [styles.key, { width: w, height: hgt, backgroundColor: pressed ? alpha(PINK, 0.35) : bg, borderColor: border }]}>
                <Txt style={{ fontFamily: F.display, fontSize: Math.round(w * 0.56), lineHeight: Math.round(hgt * 0.95), color, textAlign: 'center', textDecorationLine: t && !t.ok ? 'line-through' : 'none', textDecorationColor: C.red }}>{key}</Txt>
                {also ? <Txt style={[styles.also, { color: t ? color : C.muted }]}>{also}</Txt> : null}
              </Pressable>
            );
          })}
        </Row>
      ))}
    </View>
  );
}

/** «أعرف الكلمة!»: the whole word (same number of letters, or the button waits). */
function WordGuess({ view, h, onClose }: { view: BalloonsView; h: Helpers; onClose: () => void }) {
  const [text, setText] = useState('');
  const t = text.trim();
  const p = t ? prepareWord(t) : null;
  const n = view.slots.length;
  const sameLen = !!p?.ok && p.word.chars.length === n;
  const hint = !p ? `الكلمة من ${lettersText(n)}` : !p.ok ? p.error : sameLen ? 'جاهزة: صحيحة = الجولة لك، وخاطئة = بالون ينفجر' : `الكلمة من ${lettersText(n)}، وكتبت ${lettersText(p.word.chars.length)}`;
  const send = () => {
    if (!sameLen) return;
    haptic.medium();
    h.act('word', { round: view.round, text: t });
    onClose();
  };
  return (
    <View style={[styles.panel, { borderColor: alpha(C.yellow, 0.6) }]}>
      <Txt v="bold">ما الكلمة؟</Txt>
      <Row gap={8} style={{ alignItems: 'center' }}>
        <Field
          value={text}
          onChangeText={setText}
          onSubmitEditing={send}
          placeholder="اكتب الكلمة كاملة…"
          placeholderTextColor={C.dim}
          style={[styles.input, { flex: 1, borderColor: t ? alpha(sameLen ? C.green : C.yellow, 0.7) : C.border }]}
          maxLength={24}
          autoFocus
          returnKeyType="send"
          submitBehavior="submit"
          autoCorrect={false}
          autoCapitalize="none"
        />
        <Btn size="md" icon="check" label="جرّب" color={C.green} disabled={!sameLen} onPress={send} />
      </Row>
      <Txt v="tiny" color={sameLen ? C.green : C.muted}>
        {hint}
      </Txt>
      <Btn size="sm" ghost icon="close" label="رجوع إلى الحروف" onPress={onClose} />
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* The round's result                                                  */
/* ------------------------------------------------------------------ */

function Reveal({ view, h }: { view: BalloonsView; h: Helpers }) {
  const r = view.result!;
  const settled = useSettled();
  const last = view.round >= view.rounds;
  const color = r.won ? C.green : r.how === 'left' ? C.muted : PINK;
  const by = r.by ? h.player(r.by).name : null;
  const title = r.how === 'left' ? 'نهاية الجولة' : r.won ? 'أحسنتم! وُجدت الكلمة' : 'هبطت السلة على الأرض';
  const sub =
    r.how === 'word' && by
      ? `تخمين الكلمة كاملة: ${by} (${num(`+${r.gains[r.by!] ?? 0}`)})`
      : r.how === 'letters' && by
        ? `آخر حرف: ${by}`
        : r.how === 'balloons' && view.setter
          ? `لصاحب الكلمة ${num(view.maxBalloons)} نقاط`
          : r.how === 'balloons'
            ? 'انفجرت البالونات كلها'
            : null;
  const setterGain = view.setter ? (r.gains[view.setter] ?? 0) : 0;
  return (
    <>
      <Animated.View entering={settled ? FadeIn.duration(260) : undefined} style={[styles.result, { borderColor: alpha(color, 0.65), backgroundColor: alpha(color, 0.14) }]}>
        <Txt v="tiny" color={C.muted} center>
          {title}
        </Txt>
        <Txt v="display" center style={{ color: CREAM }}>
          {r.word}
        </Txt>
        {sub ? (
          <Txt v="small" center color={C.muted}>
            {sub}
          </Txt>
        ) : null}
        {view.setter && r.how !== 'left' && r.how !== 'balloons' && setterGain > 0 ? (
          <Txt v="tiny" center color={C.dim}>
            لصاحب الكلمة نقطة عن كل بالون انفجر: {num(`+${setterGain}`)}
          </Txt>
        ) : null}
      </Animated.View>
      <ResultRows
        h={h}
        lines={view.players.map((id) => {
          const g = r.gains[id] ?? 0;
          return { id, detail: id === view.setter ? 'صاحب الكلمة' : undefined, gain: g ? num(`+${g}`) : num(0), good: g > 0, total: view.scores[id] ?? 0 };
        })}
      />
      <HostNext h={h} last={last} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Lobby settings                                                      */
/* ------------------------------------------------------------------ */

const ROUND_OPTIONS = BALLOONS_ROUNDS.map((r) => ({ key: String(r), label: r === 0 ? 'كل لاعب مرة' : `${num(r)} جولات` }));
const TURN_OPTIONS = BALLOONS_TURN_SECONDS.map((s) => ({ key: String(s), label: s === 0 ? 'بلا وقت' : `${num(s)} ث` }));
const APP_CAT_OPTIONS: { key: BalloonsCat | 'mix'; label: string }[] = [{ key: 'mix', label: 'منوّعة' }, ...CAT_OPTIONS];

export function BalloonsSettings({ room, editable }: { room: RoomView; editable: boolean }) {
  const s = room.settings.balloons;
  const change = (patch: Partial<Settings>) => client.roomAction({ type: 'settings', game: 'balloons', patch });
  const two = room.players.length <= 2;
  return (
    <View style={{ gap: 10 }}>
      <Txt v="bold">عدد الجولات</Txt>
      <ChipPicker<string> editable={editable} value={String(s.rounds)} onChange={(v) => change({ rounds: Number(v) })} options={ROUND_OPTIONS} />
      <Toggle label="الكلمة من التطبيق" value={s.appWords} editable={editable} onChange={(v) => change({ appWords: v })} />
      {s.appWords || two ? (
        <>
          <Txt v="bold">فئة كلمات التطبيق</Txt>
          <ChipPicker<BalloonsCat | 'mix'> editable={editable} value={s.cat} onChange={(v) => change({ cat: v })} options={APP_CAT_OPTIONS} />
        </>
      ) : null}
      <Txt v="bold">وقت الدور</Txt>
      <ChipPicker<string> editable={editable} value={String(s.turnSec)} onChange={(v) => change({ turnSec: Number(v) })} options={TURN_OPTIONS} />
      <Row gap={8}>
        <GameArt id="balloons" size={40} />
        <Txt v="tiny" color={C.muted} style={{ flex: 1 }}>
          {s.appWords || two
            ? 'الكلمة من قوائم التطبيق ويخمّنها الجميع بالتناوب.'
            : 'في كل جولة يكتب لاعب كلمة سرية، ويخمّنها الآخرون حرفاً حرفاً قبل أن تنفجر البالونات السبعة.'}
        </Txt>
      </Row>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: C.surface, borderRadius: 20, borderWidth: 1.5, borderColor: C.border, padding: 14, gap: 10 },
  input: {
    fontFamily: F.bold,
    fontSize: 20,
    lineHeight: 28,
    color: C.text,
    backgroundColor: C.bg3,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    writingDirection: 'rtl',
    textAlign: 'right',
    borderWidth: 2,
  },
  catChip: { backgroundColor: alpha(PINK, 0.22), borderColor: alpha(PINK, 0.6), borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 2 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  box: { alignItems: 'center', justifyContent: 'center', borderWidth: 2, overflow: 'hidden' },
  boxOn: { backgroundColor: CREAM, borderColor: '#F2C23D' },
  boxOff: { backgroundColor: C.surface, borderColor: C.borderStrong },
  blank: { height: 3, borderRadius: 2, backgroundColor: alpha(C.text, 0.35), marginTop: 14 },
  turn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, borderWidth: 1.5, borderColor: C.border, paddingVertical: 6, paddingHorizontal: 10 },
  key: { borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  also: { position: 'absolute', top: 1, left: 4, fontFamily: F.bold, fontSize: 10, lineHeight: 14 },
  wrongWord: { borderRadius: 999, borderWidth: 1, borderColor: C.border, paddingHorizontal: 8, backgroundColor: C.surface },
  result: { borderRadius: 20, borderWidth: 1.5, paddingVertical: 10, paddingHorizontal: 14, gap: 2 },
});
