/**
 * «خلية الحروف» — the screen. While playing: the timer, my rank on the way to «عبقري», the word line
 * with what became of my last word, the honeycomb (tap the letters; on a computer the keyboard types
 * too, Enter sends, Backspace deletes), «احذف» «اخلط» «أدخل», my words in alphabetical order, everyone's
 * points and number of words, «انتهيت». After a hive: everyone's words (the ones found by two players
 * or more marked) and the best words nobody found; at the end the podium. Lobby settings: hives and
 * minutes per hive.
 */
import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { client } from '@/lib/client';
import { haptic } from '@/lib/sfx';
import {
  KHALIA_KEY_ALSO,
  KHALIA_MAX_LEN,
  KHALIA_MINUTES,
  KHALIA_RANKS,
  KHALIA_ROUNDS,
  khaliaKey,
  khaliaRank,
  type KhaliaFeedback,
  type KhaliaResult,
  type KhaliaSettings as Settings,
  type KhaliaView,
  type KhaliaWord,
} from '@/shared/games/khalia';
import type { RoomView } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { Avatar, Card, Row } from '@/ui/bits';
import { Btn, IconBtn } from '@/ui/btn';
import { ChipPicker, ConfirmModal } from '@/ui/controls';
import { Confetti, Podium, Scoreboard, TimerBar } from '@/ui/fun';
import { dk } from '@/ui/layout';
import { useContentWidth } from '@/ui/screen';
import { Txt, num } from '@/ui/txt';

import { PlayAgain, ResultBanner, Spectator } from './common';
import { helpers, type Helpers } from './helpers';
import { HostNext, RoundHeader, winnerTitle } from './islamic-ui';
import { COMB, HONEY, Honeycomb } from './khalia-hive';
import { PlayerStrip } from './player-strip';

const nameOf = (h: Helpers, view: KhaliaView, id: string) => (h.players.some((p) => p.id === id) ? h.player(id).name : (view.names[id] ?? '؟'));

/** «كلمة واحدة»، «كلمتان»، «3 كلمات»، «11 كلمة» */
function wordsText(n: number) {
  if (n === 0) return 'لا كلمات';
  if (n === 1) return 'كلمة واحدة';
  if (n === 2) return 'كلمتان';
  return n <= 10 ? `${num(n)} كلمات` : `${num(n)} كلمة`;
}

/** «نقطة واحدة»، «نقطتان»، «5 نقاط»، «14 نقطة» */
function pointsText(n: number) {
  if (n === 1) return 'نقطة واحدة';
  if (n === 2) return 'نقطتان';
  return n >= 3 && n <= 10 ? `${num(n)} نقاط` : `${num(n)} نقطة`;
}

const byAlpha = (a: KhaliaWord, b: KhaliaWord) => a.key.localeCompare(b.key, 'ar');

export function KhaliaGame({ room, view }: { room: RoomView; view: KhaliaView }) {
  const h = helpers(room);
  const width = useContentWidth();
  if (view.phase === 'final') return <Final room={room} view={view} h={h} width={width} />;
  if (!view.players.includes(h.me)) return <Spectator room={room} />;
  return (
    <>
      <RoundHeader
        label={view.rounds > 1 ? `الخلية ${num(view.round)} من ${num(view.rounds)}` : 'خلية الحروف'}
        round={0}
        rounds={0}
        right={
          view.rounds > 1 ? (
            <Txt v="tiny" color={C.muted}>
              المجموع: {num(view.scores[h.me] ?? 0)}
            </Txt>
          ) : undefined
        }
      />
      <TimerBar endsAt={view.endsAt} total={view.timerTotal} onTick={view.phase === 'play'} />
      {view.phase === 'play' ? (
        <Play key={view.round} room={room} view={view} h={h} width={width} />
      ) : (
        <Animated.View entering={FadeIn.duration(220)} style={{ gap: 12 }}>
          <Txt v="title" center>
            انتهى الوقت!
          </Txt>
          <RoundWords view={view} h={h} width={width} />
          <HostNext h={h} last={view.round >= view.rounds} />
        </Animated.View>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Playing                                                             */
/* ------------------------------------------------------------------ */

/** Letters of an English keyboard → the Arabic letters on the same keys (a computer without the Arabic layout). */
const LATIN_KEYS: Record<string, string> = {
  KeyQ: 'ض', KeyW: 'ص', KeyE: 'ث', KeyR: 'ق', KeyT: 'ف', KeyY: 'غ', KeyU: 'ع', KeyI: 'ه', KeyO: 'خ', KeyP: 'ح', BracketLeft: 'ج', BracketRight: 'د',
  KeyA: 'ش', KeyS: 'س', KeyD: 'ي', KeyF: 'ب', KeyG: 'ل', KeyH: 'ا', KeyJ: 'ت', KeyK: 'ن', KeyL: 'م', Semicolon: 'ك', Quote: 'ط',
  KeyZ: 'ئ', KeyX: 'ء', KeyC: 'ؤ', KeyV: 'ر', KeyB: 'لا', KeyN: 'ى', KeyM: 'ة', Comma: 'و', Period: 'ز', Slash: 'ظ', Backquote: 'ذ',
};

/** The keys a physical key press types (an Arabic letter, or the letter on the same key of the Arabic layout). */
function typedKeys(e: KeyboardEvent): string {
  const direct = khaliaKey(e.key);
  if (direct) return direct;
  if (/^[a-zA-Z]$/.test(e.key) || /^[[\];',./`]$/.test(e.key)) return khaliaKey(LATIN_KEYS[e.code] ?? '');
  return '';
}

interface Shown {
  id: string;
  kind: KhaliaFeedback['kind'];
  text: string;
  points: number;
}

function Play({ room, view, h, width }: { room: RoomView; view: KhaliaView; h: Helpers; width: number }) {
  const [typed, setTyped] = useState('');
  const [order, setOrder] = useState(view.outer);
  const [confirm, setConfirm] = useState(false);
  const [shown, setShown] = useState<Shown | null>(null);
  const playing = !view.done;
  const letters = [view.centre, ...view.outer];

  // a new answer from the server (only mine): show it, then let it fade
  const seq = view.feedback?.seq ?? 0;
  const lastSeq = useRef(seq);
  useEffect(() => {
    if (!view.feedback || seq === lastSeq.current) return;
    lastSeq.current = seq;
    const f = view.feedback;
    setShown({ id: `s${seq}`, kind: f.kind, text: f.text, points: f.points });
    if (f.kind === 'bad') haptic.light();
    else haptic.success();
  }, [seq, view.feedback]);
  useEffect(() => {
    if (!shown) return;
    const id = setTimeout(() => setShown((s) => (s?.id === shown.id ? null : s)), shown.kind === 'pangram' ? 3200 : 2200);
    return () => clearTimeout(id);
  }, [shown]);
  const local = (text: string) => setShown({ id: `l${Date.now()}`, kind: 'bad', text, points: 0 });

  const add = (k: string) => {
    if (!playing) return;
    setTyped((t) => ([...t].length >= KHALIA_MAX_LEN ? t : t + k));
  };
  const del = () => setTyped((t) => [...t].slice(0, -1).join(''));
  const shuffle = () => {
    haptic.tap();
    setOrder((o) => {
      for (let tries = 0; tries < 5; tries++) {
        const n = [...o];
        for (let i = n.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [n[i], n[j]] = [n[j], n[i]];
        }
        if (n.join('') !== o.join('')) return n;
      }
      return o;
    });
  };
  const send = () => {
    if (!typed || !playing) return;
    haptic.medium();
    client.act({ type: 'word', word: typed, round: view.round });
    setTyped('');
  };

  // the web: the keyboard types too (Arabic letters, or the same keys on another layout), Enter, Backspace
  const ref = useRef({ send, del, add, letters, local });
  useEffect(() => {
    ref.current = { send, del, add, letters, local };
  });
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const r = ref.current;
      if (e.key === 'Enter') {
        e.preventDefault();
        r.send();
        return;
      }
      if (e.key === 'Backspace') {
        e.preventDefault();
        r.del();
        return;
      }
      const keys = typedKeys(e);
      if (!keys) return;
      e.preventDefault();
      for (const k of keys) {
        if (r.letters.includes(k)) r.add(k);
        else r.local('حروف الخلية فقط');
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // the hive and its buttons fit a short phone without scrolling (320×640)
  const { height } = useWindowDimensions();
  const hiveW = Math.min(width - 24, dk(300), Math.max(210, height - 410));
  const mine = [...view.myWords].sort(byAlpha);
  const points = view.myWords.reduce((a, w) => a + w.points, 0);
  const also = letters.filter((l) => KHALIA_KEY_ALSO[l]);

  return (
    <>
      <Progress points={points} max={view.max} width={Math.min(width, dk(420))} />

      <View style={styles.line}>
        <Txt selectable={false} numberOfLines={1} adjustsFontSizeToFit style={styles.lineText}>
          {typed ? (
            [...typed].map((c, i) => (
              <Txt key={i} style={[styles.lineText, { color: c === view.centre ? HONEY : C.text }]}>
                {c}
              </Txt>
            ))
          ) : (
            <Txt style={[styles.lineText, { color: C.dim, fontSize: 18 }]}>{playing ? (Platform.OS === 'web' ? 'المس الحروف أو اكتب' : 'المس الحروف لتكوين كلمة') : 'في انتظار الآخرين'}</Txt>
          )}
        </Txt>
      </View>
      <View style={styles.feedback}>
        {shown ? (
          <Animated.View key={shown.id} entering={FadeIn.duration(160)} exiting={FadeOut.duration(220)} style={[styles.fbPill, fbStyle(shown.kind)]}>
            <Txt v="bold" color={shown.kind === 'bad' ? C.text : C.ink}>
              {shown.text}
            </Txt>
            {shown.points && shown.kind === 'ok' ? (
              <Txt v="bold" color={C.ink}>
                +{num(shown.points)}
              </Txt>
            ) : null}
            {shown.kind === 'pangram' ? (
              <Txt v="tiny" color={C.ink}>
                ({pointsText(shown.points)})
              </Txt>
            ) : null}
          </Animated.View>
        ) : null}
      </View>

      <Honeycomb centre={view.centre} outer={order.length === 6 ? order : view.outer} width={hiveW} onLetter={add} disabled={!playing} />

      <Row gap={10} style={{ justifyContent: 'center', alignItems: 'center' }}>
        <Btn size="md" ghost label="احذف" disabled={!typed || !playing} onPress={del} style={styles.sideBtn} />
        <IconBtn icon="shuffle" label="اخلط" size={50} onPress={shuffle} />
        <Btn size="md" label="أدخل" color={HONEY} disabled={[...typed].length < 1 || !playing} onPress={send} style={styles.sideBtn} />
      </Row>
      {also.length ? (
        <Row gap={6} wrap style={{ justifyContent: 'center' }}>
          {also.map((l) => (
            <View key={l} style={styles.alsoChip}>
              <Txt v="bold" size={14} color={HONEY}>
                {l}
              </Txt>
              <Txt v="tiny" color={C.muted}>
                {`تشمل ${KHALIA_KEY_ALSO[l]}`}
              </Txt>
            </View>
          ))}
        </Row>
      ) : null}

      <Card style={{ gap: 8, padding: 12 }}>
        <Row gap={8}>
          <Txt v="bold" style={{ flex: 1 }}>
            كلماتي
          </Txt>
          <Txt v="tiny" color={C.muted}>
            {wordsText(view.myWords.length)} من {num(view.answers)} · {pointsText(points)}
          </Txt>
        </Row>
        {mine.length ? (
          <Row gap={6} wrap>
            {mine.map((w) => (
              <WordChip key={w.key} w={w} fresh={w.key === view.myWords[view.myWords.length - 1]?.key} />
            ))}
          </Row>
        ) : (
          <Txt v="small" color={C.dim}>
            لا كلمات بعد. {view.pangrams > 1 ? `في الخلية ${num(view.pangrams)} «كلمات خلية» تستعمل الحروف السبعة.` : 'في الخلية «كلمة خلية» تستعمل الحروف السبعة كلها.'}
          </Txt>
        )}
      </Card>

      <PlayerStrip
        room={room}
        gains={false}
        entries={view.board.map((b) => ({ id: b.id, score: b.points, sub: b.done ? 'انتهى ✓' : wordsText(b.count) }))}
      />

      {playing ? <Btn size="sm" ghost icon="stop" label="انتهيت" onPress={() => setConfirm(true)} /> : null}
      <ConfirmModal
        visible={confirm}
        icon="stop"
        title="إنهاء البحث في هذه الخلية؟"
        message="لا كلمات أخرى بعد ذلك في هذه الخلية. تنتهي حين ينهي الجميع أو ينتهي الوقت."
        confirmLabel="انتهيت"
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          setTyped('');
          client.act({ type: 'done' });
        }}
      />
    </>
  );
}

function fbStyle(kind: KhaliaFeedback['kind']) {
  if (kind === 'pangram') return { backgroundColor: HONEY, borderColor: HONEY };
  if (kind === 'ok') return { backgroundColor: COMB, borderColor: COMB };
  return { backgroundColor: alpha(C.red, 0.22), borderColor: alpha(C.red, 0.6) };
}

/** My way to «عبقري»: a line with a dot per rank, my points on it. */
function Progress({ points, max, width }: { points: number; max: number; width: number }) {
  const rank = khaliaRank(points, max);
  const share = max > 0 ? Math.min(1, points / max) : 0;
  // the dots sit at the ranks' thresholds, the last one at «عبقري»
  const top = KHALIA_RANKS[KHALIA_RANKS.length - 1].min;
  const track = width - 12;
  const x = (min: number) => Math.round(Math.min(1, min / top) * track);
  return (
    <View style={{ width, alignSelf: 'center', gap: 2 }}>
      <Row gap={8} style={{ justifyContent: 'space-between' }}>
        <Txt v="tiny" color={HONEY}>
          {KHALIA_RANKS[rank].label}
        </Txt>
        <Txt v="tiny" color={C.muted}>
          {pointsText(points)}
        </Txt>
      </Row>
      <View style={styles.track}>
        <View style={[styles.trackFill, { width: x(share) }]} />
        {KHALIA_RANKS.map((r, i) => (
          <View key={r.label} style={[styles.dot, { right: x(r.min), backgroundColor: i <= rank ? HONEY : C.surfaceStrong, borderColor: i <= rank ? HONEY : C.borderStrong }]} />
        ))}
      </View>
    </View>
  );
}

function WordChip({ w, fresh, shared, missed }: { w: KhaliaWord; fresh?: boolean; shared?: boolean; missed?: boolean }) {
  const chip = (
    <View style={[styles.chip, w.pangram && styles.chipPangram, shared && styles.chipShared, missed && (w.pangram ? styles.chipMissedPangram : styles.chipMissed)]}>
      <Txt v="bold" size={15} color={w.pangram ? (missed ? HONEY : C.ink) : missed ? C.muted : C.text}>
        {w.word}
      </Txt>
      <Txt v="tiny" color={w.pangram && !missed ? C.ink : HONEY}>
        +{num(w.points)}
      </Txt>
    </View>
  );
  return fresh ? (
    <Animated.View key={w.key} entering={FadeIn.duration(260)}>
      {chip}
    </Animated.View>
  ) : (
    chip
  );
}

/* ------------------------------------------------------------------ */
/* After a hive                                                        */
/* ------------------------------------------------------------------ */

function RoundWords({ view, h, width }: { view: KhaliaView; h: Helpers; width: number }) {
  const results: KhaliaResult[] = [...(view.results ?? [])].sort((a, b) => b.points - a.points);
  const all = new Set(results.flatMap((r) => r.words.map((w) => w.key)));
  const anyShared = results.some((r) => r.words.some((w) => w.shared));
  const mine = results.find((r) => r.id === h.me)?.points ?? 0;
  return (
    <View style={{ gap: 10 }}>
      <Honeycomb centre={view.centre} outer={view.outer} width={Math.min(width * 0.5, dk(170))} small />
      <Txt v="small" center color={C.muted}>
        {`وجدتم ${wordsText(all.size)} من ${num(view.answers)} · مرتبتك: ${KHALIA_RANKS[khaliaRank(mine, view.max)].label}`}
      </Txt>
      {view.missed && view.missed.length ? (
        <Card style={styles.missed}>
          <Txt v="bold" center color={HONEY}>
            أجمل الكلمات التي فاتتكم
          </Txt>
          <Row gap={6} wrap style={{ justifyContent: 'center' }}>
            {view.missed.map((w) => (
              <WordChip key={w.key} w={w} missed />
            ))}
          </Row>
          {view.missedMore ? (
            <Txt v="tiny" center color={C.dim}>
              {`و${wordsText(view.missedMore)} أخرى`}
            </Txt>
          ) : null}
        </Card>
      ) : (
        <Txt v="bold" center color={HONEY}>
          لم تفتكم أي كلمة!
        </Txt>
      )}
      {results.map((r) => (
        <Card key={r.id} style={{ gap: 8, padding: 12 }}>
          <Row gap={8}>
            <Avatar player={h.player(r.id)} size={28} />
            <Txt v="bold" style={{ flex: 1 }} numberOfLines={1}>
              {nameOf(h, view, r.id)}
              {r.id === h.me ? ' (أنت)' : ''}
            </Txt>
            <Txt v="tiny" color={C.muted}>
              {wordsText(r.words.length)}
            </Txt>
            <Txt style={{ fontFamily: F.black, fontSize: 16, lineHeight: 24, color: r.points ? C.green : C.dim, minWidth: 40, textAlign: 'center' }}>{`+${num(r.points)}`}</Txt>
          </Row>
          {r.words.length ? (
            <Row gap={6} wrap>
              {[...r.words].sort(byAlpha).map((w) => (
                <WordChip key={w.key} w={w} shared={w.shared} />
              ))}
            </Row>
          ) : (
            <Txt v="small" color={C.dim}>
              لا كلمات في هذه الخلية
            </Txt>
          )}
        </Card>
      ))}
      {anyShared ? (
        <Txt v="tiny" center color={C.dim}>
          الكلمة المؤطرة بخط متقطع وجدها أكثر من لاعب (تُحسب لكل منهم)
        </Txt>
      ) : null}
    </View>
  );
}

function Final({ room, view, h, width }: { room: RoomView; view: KhaliaView; h: Helpers; width: number }) {
  const ids = view.players;
  const best = ids.length ? Math.max(...ids.map((id) => view.scores[id] ?? 0)) : 0;
  const winners = ids.filter((id) => (view.scores[id] ?? 0) === best);
  const won = winners.includes(h.me) && winners.length === 1;
  return (
    <>
      {won ? <Confetti /> : null}
      <ResultBanner
        tone={won ? 'good' : 'neutral'}
        art={<Honeycomb centre={view.centre} outer={view.outer} width={72} small />}
        title={winnerTitle(winners.map((id) => nameOf(h, view, id)))}
        sub={`${pointsText(best)} — خلية عامرة بالكلمات!`}
      />
      {ids.length > 1 ? <Podium players={room.players} scores={view.scores} /> : null}
      <Scoreboard players={room.players} scores={view.scores} highlight={h.me} />
      {view.results ? (
        <>
          <Txt v="h3" center color={C.muted}>
            {view.rounds > 1 ? 'كلمات الخلية الأخيرة' : 'كلمات الخلية'}
          </Txt>
          <RoundWords view={view} h={h} width={width} />
        </>
      ) : null}
      <PlayAgain room={room} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Lobby settings                                                      */
/* ------------------------------------------------------------------ */

const ROUND_OPTIONS = KHALIA_ROUNDS.map((n) => ({ key: String(n), label: n === 1 ? 'خلية واحدة' : n === 2 ? 'خليتان' : `${num(n)} خلايا` }));
const MINUTE_OPTIONS = KHALIA_MINUTES.map((n) => ({ key: String(n), label: `${num(n)} دقائق` }));

export function KhaliaSettings({ room, editable }: { room: RoomView; editable: boolean }) {
  const s = room.settings.khalia;
  const change = (patch: Partial<Settings>) => client.roomAction({ type: 'settings', game: 'khalia', patch });
  return (
    <View style={{ gap: 10 }}>
      <Txt v="bold">عدد الخلايا</Txt>
      <ChipPicker<string> editable={editable} value={String(s.rounds)} onChange={(v) => change({ rounds: Number(v) })} options={ROUND_OPTIONS} />
      <Txt v="bold">وقت كل خلية</Txt>
      <ChipPicker<string> editable={editable} value={String(s.minutes)} onChange={(v) => change({ minutes: Number(v) })} options={MINUTE_OPTIONS} />
      <Row gap={10}>
        <Honeycomb centre="ب" outer={['ك', 'ت', 'ر', 'م', 'س', 'ا']} width={44} small />
        <Txt v="tiny" color={C.muted} style={{ flex: 1 }}>
          الجميع يرى نفس الخلية في نفس الوقت. حرف الوسط في كل كلمة، و«كلمة الخلية» بالحروف السبعة تزيد 7 نقاط.
        </Txt>
      </Row>
    </View>
  );
}

const styles = StyleSheet.create({
  line: { minHeight: 52, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, marginTop: -4 },
  alsoChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 10, backgroundColor: alpha(C.surfaceStrong, 0.6) },
  lineText: { fontFamily: F.display, fontSize: 34, lineHeight: 52, color: C.text, textAlign: 'center' },
  feedback: { height: 32, alignItems: 'center', justifyContent: 'center', marginTop: -10, marginBottom: -6 },
  fbPill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 1 },
  sideBtn: { minWidth: 104 },
  track: { height: 10, borderRadius: 5, backgroundColor: C.surfaceStrong, justifyContent: 'center', marginHorizontal: 6 },
  trackFill: { position: 'absolute', right: 0, top: 3, bottom: 3, borderRadius: 3, backgroundColor: alpha(HONEY, 0.75) },
  dot: { position: 'absolute', width: 12, height: 12, borderRadius: 6, borderWidth: 2, marginRight: -6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.surfaceStrong, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2, borderWidth: 1.5, borderColor: 'transparent' },
  chipPangram: { backgroundColor: HONEY, borderColor: HONEY },
  chipShared: { borderColor: alpha(C.muted, 0.7), borderStyle: 'dashed' },
  chipMissed: { backgroundColor: 'rgba(255,255,255,0.04)', borderColor: alpha(HONEY, 0.35) },
  chipMissedPangram: { backgroundColor: alpha(HONEY, 0.12), borderColor: HONEY },
  missed: { gap: 8, paddingVertical: 12, borderWidth: 1.5, borderColor: alpha(HONEY, 0.5) },
});
