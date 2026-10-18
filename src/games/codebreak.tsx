/** «فك الشيفرة» — race to crack the same secret colour code: tap colours to fill the holes, «تحقق». */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { client } from '@/lib/client';
import { haptic } from '@/lib/sfx';
import { CODEBREAK_TRIES, type CodebreakLevel, type CodebreakResult, type CodebreakView } from '@/shared/games/codebreak';
import type { RoomView } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { useAccent } from '@/ui/accent';
import { Avatar, Card, Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { ChipPicker, Stepper, Toggle } from '@/ui/controls';
import { Confetti, Podium, Scoreboard, TimerBar } from '@/ui/fun';
import { useContentWidth } from '@/ui/screen';
import { Txt, num } from '@/ui/txt';
import { li } from '@/shared/li';

import { KeyLine, KeyPegs, PEGS, Peg } from './codebreak-pegs';
import { PlayAgain, ResultBanner, Spectator } from './common';
import { helpers, type Helpers } from './helpers';
import { RoundHeader } from './islamic-ui';
import { useRefusedFlash } from './wordle-ui';

const nameOf = (h: Helpers, view: CodebreakView, id: string) => (h.players.some((p) => p.id === id) ? h.player(id).name : (view.names[id] ?? '؟'));

const secs = (ms: number) => {
  const t = Math.round(ms / 1000);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

/** The secret code in a little frame (reveal, final, my own finish). */
function CodeShow({ code, size }: { code: number[]; size: number }) {
  const accent = useAccent();
  return (
    <Row gap={6} center style={[styles.codeFrame, { borderColor: alpha(accent, 0.8) }]}>
      {code.map((c, i) => (
        <Peg key={i} c={c} size={size} />
      ))}
    </Row>
  );
}

/** The others' progress: one line of clue dots per try (never their colours). */
function Others({ view, h }: { view: CodebreakView; h: Helpers }) {
  if (!view.others.length) return null;
  return (
    <Row gap={8} wrap center>
      {view.others.map((o) => (
        <View key={o.id} style={[styles.other, o.solved && { borderColor: C.green, backgroundColor: alpha(C.green, 0.12) }]}>
          <View style={{ alignItems: 'center', gap: 2 }}>
            <Avatar player={h.player(o.id)} size={26} badge={o.solved ? 'check' : undefined} dim={o.done && !o.solved} />
            <Txt v="tiny" color={C.muted} numberOfLines={1} style={{ maxWidth: 64 }}>
              {nameOf(h, view, o.id)}
            </Txt>
            <Txt v="tiny" color={o.solved ? C.green : C.dim}>
              {num(`${o.rows.length}/${view.maxTries}`)}
            </Txt>
          </View>
          <View style={{ gap: 2 }}>
            {o.rows.map((r, i) => (
              <Animated.View key={i} entering={i === o.rows.length - 1 ? FadeIn.duration(260) : undefined}>
                <KeyLine black={r.black} white={r.white} pegs={view.pegs} />
              </Animated.View>
            ))}
          </View>
        </View>
      ))}
    </Row>
  );
}

function Results({ results, view, h }: { results: CodebreakResult[]; view: CodebreakView; h: Helpers }) {
  return (
    <View style={{ gap: 6 }}>
      {[...results]
        .sort((a, b) => b.points - a.points)
        .map((r) => (
          <Row key={r.id} gap={8} style={styles.result}>
            <Avatar player={h.player(r.id)} size={26} />
            <Txt v="bold" style={{ flex: 1 }} numberOfLines={1}>
              {nameOf(h, view, r.id)}
            </Txt>
            {r.first ? (
              <View style={styles.firstChip}>
                <Txt v="tiny" color={C.ink}>
                  الأول
                </Txt>
              </View>
            ) : null}
            <Txt v="tiny" color={C.muted}>
              {r.tries === null ? 'لم يُفكّ' : `${num(r.tries)} محاولات · ${num(secs(r.ms ?? 0))}`}
            </Txt>
            <Txt style={{ fontFamily: F.black, fontSize: 15, lineHeight: 22, color: r.points ? C.green : C.dim, minWidth: 48, textAlign: 'center' }}>
              {r.points ? `+${num(r.points)}` : '0'}
            </Txt>
          </Row>
        ))}
    </View>
  );
}

/** My board: past tries with their clues, then the row I'm filling. */
function Board({ view, draft, playing, onClear, width }: { view: CodebreakView; draft: (number | null)[]; playing: boolean; onClear: (i: number) => void; width: number }) {
  const refused = useRefusedFlash();
  const accent = useAccent();
  const keyW = view.pegs <= 4 ? 26 : 38;
  // row: number (22) + pegs + clue dots, with 6px gaps and 10px padding each side
  const peg = Math.floor(Math.min(46, (width - 20 - 22 - keyW - 6 * (view.pegs + 1)) / view.pegs));
  // the row I fill keeps big tap targets on narrow phones (it may then be a little wider than the tries above)
  const big = Math.max(peg, Math.floor(Math.min(42, (width - 20 - 22 - 6 * view.pegs) / view.pegs)));
  const firstEmpty = draft.indexOf(null);
  return (
    <View style={[styles.board, { borderColor: alpha(accent, 0.5) }]}>
      {view.myRows.map((r, i) => (
        <Animated.View key={i} entering={i === view.myRows.length - 1 ? FadeInDown.duration(220) : undefined}>
          <Row gap={6} style={styles.boardRow}>
            <Txt v="tiny" color={C.dim} style={{ width: 22, textAlign: 'center' }}>
              {num(i + 1)}
            </Txt>
            <Row gap={6} style={{ flex: 1, justifyContent: 'center', direction: 'ltr' }}>
              {r.guess.map((c, j) => (
                <Peg key={j} c={c} size={peg} />
              ))}
            </Row>
            <View style={{ width: keyW, alignItems: 'center' }}>
              <KeyPegs black={r.black} white={r.white} pegs={view.pegs} />
            </View>
          </Row>
        </Animated.View>
      ))}
      {playing ? (
        <View>
          <Row gap={6} style={[styles.boardRow, styles.current, refused && styles.refused]}>
            <Txt v="tiny" color={C.yellow} style={{ width: 22, textAlign: 'center' }}>
              {num(view.myRows.length + 1)}
            </Txt>
            <Row gap={6} style={{ flex: 1, justifyContent: 'center', direction: 'ltr' }}>
              {draft.map((c, j) => (
                <Pressable
                  key={j}
                  onPress={() => onClear(j)}
                  disabled={c === null}
                  hitSlop={4}
                  accessibilityRole="button"
                  accessibilityLabel={c === null ? `خانة ${j + 1} فارغة` : `خانة ${j + 1}: ${PEGS[c].name} — المس لتفرغها`}>
                  <Peg c={c} size={big} active={j === firstEmpty} />
                </Pressable>
              ))}
            </Row>
            {big > peg ? null : <View style={{ width: keyW }} />}
          </Row>
        </View>
      ) : null}
    </View>
  );
}

/** The colour buttons: one row of 6, or 8 in one row (wide phones) or two rows of 4. */
function Palette({ view, draft, onPick, width }: { view: CodebreakView; draft: (number | null)[]; onPick: (c: number) => void; width: number }) {
  const n = view.colors;
  const gap = 8;
  const oneRow = (width - (n - 1) * gap) / n >= 44;
  const perRow = oneRow ? n : Math.ceil(n / 2);
  const size = Math.floor(Math.min(56, (width - (perRow - 1) * gap) / perRow));
  const full = !draft.includes(null);
  return (
    <View style={{ gap, alignItems: 'center' }}>
      {Array.from({ length: Math.ceil(n / perRow) }, (_, r) => (
        <Row key={r} gap={gap} center style={{ direction: 'ltr' }}>
          {Array.from({ length: Math.min(perRow, n - r * perRow) }, (_, k) => {
            const c = r * perRow + k;
            const used = !view.repeats && draft.includes(c);
            const off = used || full;
            return (
              <Pressable
                key={c}
                onPress={() => onPick(c)}
                disabled={off}
                accessibilityRole="button"
                accessibilityLabel={PEGS[c].name}
                style={({ pressed }) => [{ opacity: off ? 0.35 : 1 }, pressed && { transform: [{ scale: 0.92 }] }]}>
                <Peg c={c} size={size} />
              </Pressable>
            );
          })}
        </Row>
      ))}
    </View>
  );
}

function CodeArt({ size }: { size: number }) {
  return (
    <Row gap={4} style={{ direction: 'ltr' }}>
      {[0, 3, 1, 4].map((c) => (
        <Peg key={c} c={c} size={size} />
      ))}
    </Row>
  );
}

function Final({ room, view, h }: { room: RoomView; view: CodebreakView; h: Helpers }) {
  const ids = view.players;
  const best = ids.length ? Math.max(...ids.map((id) => view.scores[id] ?? 0)) : 0;
  const winners = ids.filter((id) => (view.scores[id] ?? 0) === best);
  const won = winners.length === 1 && winners[0] === h.me;
  const title = winners.length === 1 ? (winners[0] === h.me ? 'فزت!' : `الفوز ${li(nameOf(h, view, winners[0]))}`) : 'تعادل!';
  return (
    <>
      {won ? <Confetti /> : null}
      <ResultBanner tone={won ? 'good' : 'neutral'} art={<CodeArt size={30} />} title={title} sub={`${num(view.rounds)} ${view.rounds === 1 ? 'رمز' : 'رموز'} — أحسنتم جميعاً`} />
      {ids.length > 1 ? <Podium players={room.players} scores={view.scores} /> : null}
      <Scoreboard players={room.players} scores={view.scores} highlight={h.me} />
      {view.code ? (
        <Card style={{ gap: 8 }}>
          <Txt v="bold" center color={C.muted}>
            الرمز الأخير
          </Txt>
          <CodeShow code={view.code} size={34} />
          {view.results ? <Results results={view.results} view={view} h={h} /> : null}
        </Card>
      ) : null}
      <PlayAgain room={room} />
    </>
  );
}

export function CodebreakGame({ room, view }: { room: RoomView; view: CodebreakView }) {
  const h = helpers(room);
  const width = useContentWidth();
  const rowKey = `${view.round}:${view.myRows.length}`;
  const [typed, setTyped] = useState<{ key: string; slots: (number | null)[] }>({ key: '', slots: [] });

  if (view.phase === 'final') return <Final room={room} view={view} h={h} />;
  if (!view.players.includes(h.me)) return <Spectator room={room} />;

  const draft = typed.key === rowKey && typed.slots.length === view.pegs ? typed.slots : Array<number | null>(view.pegs).fill(null);
  const solved = view.myRows.some((r) => r.black === view.pegs);
  const out = solved || view.myRows.length >= view.maxTries;
  const playing = view.phase === 'play' && !out;
  const full = !draft.includes(null);
  const left = view.maxTries - view.myRows.length;

  const pick = (c: number) => {
    const i = draft.indexOf(null);
    if (i < 0 || (!view.repeats && draft.includes(c))) return;
    haptic.tap();
    const next = [...draft];
    next[i] = c;
    setTyped({ key: rowKey, slots: next });
  };
  const clear = (i: number) => {
    haptic.tap();
    const next = [...draft];
    next[i] = null;
    setTyped({ key: rowKey, slots: next });
  };
  const check = () => {
    if (!full) return;
    haptic.medium();
    // the row stays until the server accepts it (a new row clears it), so a refused guess can be fixed
    client.act({ type: 'guess', code: draft });
  };

  return (
    <>
      <RoundHeader
        label={`الرمز ${num(view.round)} من ${num(view.rounds)}`}
        round={0}
        rounds={0}
        right={
          <Txt v="tiny" color={C.muted}>
            {num(view.pegs)} خانات · {num(view.colors)} ألوان{view.repeats ? ' · بالتكرار' : ''}
          </Txt>
        }
      />
      {view.phase === 'play' || view.phase === 'reveal' ? <TimerBar endsAt={view.endsAt} total={view.timerTotal} /> : null}
      {view.hurried ? (
        <Txt v="small" center color={C.yellow}>
          نصف اللاعبين أنهوا — بقي وقت قصير
        </Txt>
      ) : null}

      {view.phase === 'reveal' ? (
        <Animated.View entering={FadeIn.duration(220)} style={{ gap: 10 }}>
          <Txt v="title" center>
            الرمز السري
          </Txt>
          {view.code ? <CodeShow code={view.code} size={40} /> : null}
          {view.results ? <Results results={view.results} view={view} h={h} /> : null}
          <Txt v="small" center color={C.muted}>
            الرمز التالي بعد لحظات…
          </Txt>
        </Animated.View>
      ) : null}

      {view.phase === 'play' ? (
        <>
          <Board view={view} draft={draft} playing={playing} onClear={clear} width={width} />
          {playing ? (
            <>
              <Row gap={10} center>
                <Txt v="tiny" color={C.muted}>
                  ● في مكانه
                </Txt>
                <Txt v="tiny" color={C.muted}>
                  ○ في مكان آخر
                </Txt>
                <Txt v="tiny" color={left <= 2 ? C.orange : C.muted}>
                  {left === 1 ? 'آخر محاولة!' : `بقيت ${num(left)} محاولات`}
                </Txt>
              </Row>
              <Palette view={view} draft={draft} onPick={pick} width={width} />
              <Btn size="lg" icon="check" label="تحقق" color={C.green} disabled={!full} onPress={check} />
            </>
          ) : (
            <Animated.View entering={FadeIn.duration(200)} style={{ gap: 8 }}>
              <Txt v="bold" center color={solved ? C.green : C.orange}>
                {solved ? `أحسنت! فككت الرمز في ${num(view.myRows.length)} محاولات — في انتظار الآخرين` : 'انتهت محاولاتك — هذا هو الرمز:'}
              </Txt>
              {!solved && view.code ? <CodeShow code={view.code} size={36} /> : null}
            </Animated.View>
          )}
        </>
      ) : null}

      <Others view={view} h={h} />
    </>
  );
}

/** Lobby settings: rounds, the code (pegs, colours, repeats), tries and the bots' level. */
export function CodebreakSettings({ room, editable }: { room: RoomView; editable: boolean }) {
  const s = room.settings.codebreak;
  const change = (patch: Record<string, unknown>) => client.roomAction({ type: 'settings', game: 'codebreak', patch });
  return (
    <View style={{ gap: 8 }}>
      <Stepper label="عدد الرموز (الجولات)" value={s.rounds} min={1} max={10} editable={editable} onChange={(rounds) => change({ rounds })} />
      <Txt v="bold">طول الرمز</Txt>
      <ChipPicker
        options={[
          { key: '4', label: '4 خانات' },
          { key: '5', label: '5 خانات' },
        ]}
        value={String(s.pegs)}
        editable={editable}
        onChange={(v) => change({ pegs: Number(v) })}
      />
      <Txt v="bold">عدد الألوان</Txt>
      <ChipPicker
        options={[
          { key: '6', label: '6 ألوان' },
          { key: '8', label: '8 ألوان' },
        ]}
        value={String(s.colors)}
        editable={editable}
        onChange={(v) => change({ colors: Number(v) })}
      />
      <Toggle label="يمكن أن يتكرر اللون في الرمز" value={s.repeats} editable={editable} onChange={(repeats) => change({ repeats })} />
      <Stepper label="عدد المحاولات" value={s.maxTries} min={CODEBREAK_TRIES.min} max={CODEBREAK_TRIES.max} editable={editable} onChange={(maxTries) => change({ maxTries })} />
      <Txt v="bold">مستوى البوتات</Txt>
      <ChipPicker
        options={[
          { key: 'easy', label: 'سهل' },
          { key: 'medium', label: 'متوسط' },
          { key: 'hard', label: 'صعب' },
        ]}
        value={s.level}
        editable={editable}
        onChange={(level: CodebreakLevel) => change({ level })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  board: { backgroundColor: C.bg3, borderRadius: 18, padding: 10, gap: 6, borderWidth: 1.5 },
  boardRow: { paddingVertical: 2 },
  current: { backgroundColor: alpha(C.yellow, 0.08), borderRadius: 12, paddingVertical: 6, borderWidth: 1.5, borderColor: 'transparent' },
  refused: { borderColor: C.red, backgroundColor: alpha(C.red, 0.14) },
  codeFrame: { alignSelf: 'center', backgroundColor: C.bg3, borderRadius: 16, paddingVertical: 8, paddingHorizontal: 12, borderWidth: 2, direction: 'ltr' },
  other: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: C.surface, borderRadius: 14, padding: 6, borderWidth: 1.5, borderColor: C.border },
  result: { backgroundColor: C.surface, borderRadius: 14, paddingVertical: 6, paddingHorizontal: 10 },
  firstChip: { backgroundColor: C.yellow, borderRadius: 999, paddingHorizontal: 8 },
});
