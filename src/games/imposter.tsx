import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { GameArt } from '@/art/game-art';
import { Icon } from '@/art/icons';
import { haptic } from '@/lib/sfx';
import { IMPOSTER_ANSWER_MAX, type ImposterView, type RoomView } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { Avatar, Card, PlayerTag, Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { Field } from '@/ui/field';
import { Confetti, HoldReveal, Podium, Scoreboard, TimerBar } from '@/ui/fun';
import { Txt, num } from '@/ui/txt';
import { li } from '@/shared/li';

import { HostNote, PhaseTitle, PlayAgain, ResultBanner, Spectator, WaitingFor } from './common';
import { helpers, type Helpers } from './helpers';
import { RoundHeader } from './islamic-ui';
import { PlayerStrip } from './player-strip';

const INK_SOFT = '#6B6488';
const GUESS_MS = 25_000; // keep in sync with server/games/imposter.ts

/** «سؤال مختلف»: a question on a light card. */
function QuestionCard({ label, text, color = C.ink }: { label: string; text: string; color?: string }) {
  return (
    <View style={styles.qCard}>
      <Txt v="small" color={INK_SOFT} center>
        {label}
      </Txt>
      <Txt v="h2" color={color} center>
        {text}
      </Txt>
    </View>
  );
}

/** «سؤال مختلف»: type an answer (it can be changed until the reveal). */
function AnswerBox({ view, h }: { view: ImposterView; h: Helpers }) {
  const [edit, setEdit] = useState<{ round: number; text: string } | null>(null);
  const editing = edit?.round === view.round ? edit : null;
  if (view.myAnswer && !editing) {
    return (
      <View style={styles.answerCard}>
        <Txt v="small" center color={C.muted}>
          جوابك
        </Txt>
        <Txt v="h2" center color={C.yellow}>
          {view.myAnswer}
        </Txt>
        <Btn size="sm" ghost icon="edit" label="تعديل الجواب" onPress={() => setEdit({ round: view.round, text: view.myAnswer ?? '' })} />
      </View>
    );
  }
  const text = editing?.text ?? '';
  const send = () => {
    if (!text.trim()) return;
    haptic.medium();
    h.act('answer', { text });
    setEdit(null);
  };
  return (
    <View style={styles.answerCard}>
      <Txt v="bold" center color={C.yellow}>
        اكتب جوابك
      </Txt>
      <Row gap={8}>
        <Field
          value={text}
          onChangeText={(t) => setEdit({ round: view.round, text: t })}
          onSubmitEditing={send}
          placeholder="جواب قصير"
          placeholderTextColor={C.dim}
          autoCorrect={false}
          maxLength={IMPOSTER_ANSWER_MAX}
          returnKeyType="send"
          style={styles.input}
        />
        <Btn size="md" icon="check" label="أرسل" disabled={!text.trim()} onPress={send} />
      </Row>
    </View>
  );
}

/** «سؤال مختلف»: everyone's answer, with their name. */
function AnswersList({ view, h }: { view: ImposterView; h: Helpers }) {
  return (
    <Card style={{ gap: 8 }}>
      {view.participants.map((id) => {
        const a = view.answers[id] ?? '';
        return (
          <Row key={id} gap={10}>
            <Avatar player={h.player(id)} size={34} />
            <Txt v="small" numberOfLines={1} style={{ width: 76 }} color={C.muted}>
              {h.player(id).name}
            </Txt>
            <View style={[styles.bubble, !a && { backgroundColor: C.surface }]}>
              <Txt v="bold" color={a ? C.ink : C.dim} numberOfLines={2}>
                {a || 'لا جواب'}
              </Txt>
            </View>
          </Row>
        );
      })}
    </Card>
  );
}

function SecretCard({ view, height, partners }: { view: ImposterView; height?: number; partners?: string }) {
  const s = view.secret;
  if (!s || s.role === 'question') return null;
  return (
    <HoldReveal height={height}>
      {s.role === 'civilian' ? (
        <View style={{ alignItems: 'center', gap: 4 }}>
          <Txt v="bold" color={INK_SOFT}>
            {s.category}
          </Txt>
          <Txt v="display" color={C.ink} size={44}>
            {s.word}
          </Txt>
          <Txt v="small" color={INK_SOFT}>
            لا تقلها، بل لمّح إليها فقط
          </Txt>
        </View>
      ) : (
        <View style={{ alignItems: 'center', gap: 2 }}>
          <GameArt id="imposter" size={76} />
          <Txt v="title" color={C.red}>
            أنت الدخيل
          </Txt>
          {s.category ? (
            <Txt v="bold" color={C.ink}>
              الموضوع: {s.category}
            </Txt>
          ) : (
            <Txt v="small" color={INK_SOFT}>
              لا تعرف حتى الموضوع
            </Txt>
          )}
          {partners ? (
            <Txt v="small" color={INK_SOFT}>
              شريكك: {partners}
            </Txt>
          ) : null}
        </View>
      )}
    </HoldReveal>
  );
}

export function ImposterGame({ room, view }: { room: RoomView; view: ImposterView }) {
  const h = helpers(room);
  const { me, isHost, player, act } = h;
  if (!view.participants.includes(me)) return <Spectator room={room} />;
  const partnerNames =
    view.secret?.role === 'imposter' ? view.secret.partners.map((id) => player(id).name).join('، ') : '';

  const qMode = view.mode === 'question';
  const myQuestion = view.secret?.role === 'question' ? view.secret.question : '';

  switch (view.phase) {
    case 'answer': {
      const notAnswered = view.participants.filter((id) => !view.answered.includes(id)).map(player);
      return (
        <>
          <RoundHeader label={`الجولة ${num(view.round)} من ${num(view.totalRounds)}`} round={0} rounds={0} />
          <PhaseTitle icon="question" title="سؤالك" sub="أجب بصدق وباختصار، ولا تُرِ سؤالك لأحد" />
          <TimerBar endsAt={view.answerEndsAt} total={view.answerSeconds * 1000} onTick={!view.myAnswer} />
          <QuestionCard label="السؤال" text={myQuestion} />
          <AnswerBox view={view} h={h} />
          <WaitingFor players={notAnswered} label="في انتظار جواب" />
          {isHost && notAnswered.length ? <Btn size="sm" ghost icon="skip" label="اكشف الأجوبة الآن" onPress={() => act('revealAnswers')} /> : null}
        </>
      );
    }

    case 'answers': {
      return (
        <>
          <PhaseTitle icon="chat" title="الأجوبة" sub="ناقشوا بصوت عالٍ: من جاءه سؤال مختلف؟" />
          <QuestionCard label="السؤال الحقيقي" text={view.question ?? ''} />
          {myQuestion ? (
            <Txt v="small" center color={C.dim}>
              سؤالك أنت: {myQuestion}
            </Txt>
          ) : null}
          <AnswersList view={view} h={h} />
          {isHost ? (
            <Btn size="xl" icon="vote" label="افتح التصويت" onPress={() => act('toVote')} />
          ) : (
            <HostNote>المضيف يفتح التصويت عندما تنتهون من النقاش</HostNote>
          )}
        </>
      );
    }

    case 'reveal': {
      const ready = view.ready.includes(me);
      const notReady = view.participants.filter((id) => !view.ready.includes(id)).map(player);
      return (
        <>
          <RoundHeader label={`الجولة ${num(view.round)} من ${num(view.totalRounds)}`} round={0} rounds={0} />
          <PhaseTitle icon="eye" title="سرّك" sub="انظر إلى سرّك دون أن يراك أحد" />
          <SecretCard view={view} partners={partnerNames} />
          <Btn size="xl" icon="check" label={ready ? 'جاهز' : 'رأيت، أنا جاهز'} color={C.green} disabled={ready} onPress={() => act('ready')} />
          <WaitingFor players={notReady} />
          {isHost && notReady.length ? <Btn size="sm" ghost icon="skip" label="ابدأ بدون انتظار" onPress={() => act('skipReady')} /> : null}
        </>
      );
    }

    case 'clues': {
      return (
        <>
          <PhaseTitle icon="chat" title="وقت التلميحات" sub="يقول كلٌّ منكم كلمة واحدة، بهذا الترتيب" />
          <PlayerStrip
            room={room}
            active={view.order.slice(0, 1)}
            entries={view.order.map((id, i) => ({
              id,
              sub: view.botClues[id] ? `«${view.botClues[id]}»` : i === 0 ? 'البداية' : undefined,
            }))}
          />
          <SecretCard view={view} height={160} partners={partnerNames} />
          <Txt v="small" center color={C.dim}>
            يمكنكم القيام بجولتين من التلميحات قبل التصويت
          </Txt>
          {isHost ? (
            <Btn size="xl" icon="vote" label="افتح التصويت" onPress={() => act('toVote')} />
          ) : (
            <HostNote>المضيف يفتح التصويت عندما تنتهون</HostNote>
          )}
        </>
      );
    }

    case 'vote': {
      const others = view.participants.filter((id) => id !== me);
      const notVoted = view.participants.filter((id) => !view.voted.includes(id)).map(player);
      return (
        <>
          <PhaseTitle icon="search" title="من هو الدخيل؟" sub={qMode ? 'من جاءه السؤال المختلف؟ اضغط على من تشكّ فيه' : 'اضغط على من تشكّ فيه'} />
          {qMode && view.question ? (
            <Txt v="small" center color={C.muted}>
              السؤال الحقيقي: {view.question}
            </Txt>
          ) : null}
          <Card>
            <Row wrap gap={10} center>
              {others.map((id) => (
                <PlayerTag
                  key={id}
                  player={player(id)}
                  size={62}
                  selected={view.myVote === id}
                  badge={view.voted.includes(id) ? 'check' : undefined}
                  sub={qMode ? `«${view.answers[id] || '—'}»` : view.botClues[id] ? `«${view.botClues[id]}»` : undefined}
                  onPress={() => act('vote', { target: id })}
                />
              ))}
            </Row>
          </Card>
          <Txt center v="small" color={C.muted}>
            صوّت {num(view.voted.length)} من {num(view.participants.length)}
            {view.myVote ? ' · يمكنك تغيير صوتك' : ''}
          </Txt>
          <WaitingFor players={notVoted} label="في انتظار تصويت" />
          {isHost ? <Btn size="sm" ghost icon="skip" label="اكشف النتيجة الآن" onPress={() => act('forceResolve')} /> : null}
        </>
      );
    }

    case 'guess': {
      const g = player(view.guesserId);
      if (view.guessOptions) {
        return (
          <>
            <PhaseTitle icon="target" color={C.red} title="انكشفت" sub="فرصة أخيرة: ما هي الكلمة السرية؟" />
            <TimerBar endsAt={view.guessEndsAt} total={GUESS_MS} onTick />
            <View style={{ gap: 10 }}>
              {view.guessOptions.map((w) => (
                <Btn key={w} size="lg" label={w} ghost onPress={() => act('guess', { word: w })} />
              ))}
            </View>
          </>
        );
      }
      return (
        <>
          <PhaseTitle art={<Avatar player={g} size={92} ring={C.red} />} title={`انكشف الدخيل: ${g.name}`} sub="فرصة أخيرة لتخمين الكلمة السرية والنجاة…" />
          <TimerBar endsAt={view.guessEndsAt} total={GUESS_MS} />
        </>
      );
    }

    case 'result': {
      const r = view.result!;
      const iWasImposter = r.imposters.includes(me);
      const last = view.round >= view.totalRounds;
      const iWon = (r.winners === 'imposters') === iWasImposter;
      const accused = r.accused ? player(r.accused) : null;
      let story: string;
      if (!accused) story = 'تعادل في الأصوات، فنجا الدخيل';
      else if (!r.caught) story = `صوّتّم على ${accused.name}، والدخيل شخص آخر`;
      else if (r.guessCorrect) story = `انكشف الدخيل ${accused.name}، لكن تخمينه للكلمة صحيح`;
      else if (r.guessed === '') story = `أمسكتم بالدخيل ${accused.name}، ولا تخمين للكلمة في الوقت`;
      else story = `أمسكتم بالدخيل ${accused.name}`;
      return (
        <>
          {iWon ? <Confetti burst={view.round} /> : null}
          <ResultBanner tone={r.winners === 'civilians' ? 'good' : 'bad'} title={r.winners === 'civilians' ? 'فاز المواطنون' : 'فاز الدخيل'} sub={story} />
          <Card style={{ alignItems: 'center', gap: 8 }}>
            <Txt v="small" color={C.muted}>
              الدخيل كان
            </Txt>
            <Row gap={12} center>
              {r.imposters.map((id) => (
                <PlayerTag key={id} player={player(id)} size={64} />
              ))}
            </Row>
            {qMode && r.question && r.imposterQuestion ? (
              <View style={{ alignSelf: 'stretch', gap: 8 }}>
                <QuestionCard label="السؤال الحقيقي" text={r.question} />
                <QuestionCard label={r.imposters.length > 1 ? 'سؤال الدخلاء' : 'سؤال الدخيل'} text={r.imposterQuestion} color={C.red} />
              </View>
            ) : (
              <>
                <Txt v="small" color={C.muted}>
                  والكلمة السرية
                </Txt>
                <Txt v="display" color={C.yellow}>
                  {r.word}
                </Txt>
              </>
            )}
            {r.guessed ? (
              <Row gap={6}>
                <Txt v="small">خمّن الدخيل: «{r.guessed}»</Txt>
                <Icon name={r.guessCorrect ? 'check' : 'close'} size={16} color={r.guessCorrect ? C.green : C.red} />
              </Row>
            ) : null}
          </Card>
          <Card>
            <Txt v="h3">الأصوات</Txt>
            {Object.entries(r.votes).map(([from, to]) => (
              <Row key={from} gap={8}>
                <Avatar player={player(from)} size={26} />
                <Txt v="small" numberOfLines={1} style={{ flex: 1 }}>
                  {player(from).name}
                </Txt>
                <Icon name="next" size={14} color={C.dim} />
                <Avatar player={player(to)} size={26} ring={r.imposters.includes(to) ? C.red : undefined} />
                <Txt v="small" numberOfLines={1} style={{ flex: 1 }} color={r.imposters.includes(to) ? C.red : C.text}>
                  {player(to).name}
                </Txt>
              </Row>
            ))}
          </Card>
          <View style={{ gap: 6 }}>
            <Txt v="small" center color={C.muted}>
              النقاط
            </Txt>
            <PlayerStrip room={room} entries={view.participants.map((id) => ({ id, score: view.scores[id] ?? 0 }))} />
          </View>
          {isHost ? (
            last ? (
              <Btn size="xl" icon="trophy" label="النتيجة النهائية" onPress={() => act('next')} />
            ) : (
              <Btn size="xl" icon="refresh" label="جولة جديدة" onPress={() => act('next')} />
            )
          ) : (
            <HostNote>{last ? 'المضيف يعرض النتيجة النهائية' : 'المضيف يبدأ الجولة التالية'}</HostNote>
          )}
        </>
      );
    }

    case 'final': {
      const scores = Object.fromEntries(view.participants.map((id) => [id, view.scores[id] ?? 0]));
      const best = Math.max(...Object.values(scores));
      const winners = Object.keys(scores).filter((id) => scores[id] === best);
      const won = winners.includes(me);
      return (
        <>
          {won ? <Confetti /> : null}
          <ResultBanner
            tone={won ? 'good' : 'neutral'}
            art={<GameArt id="imposter" size={84} />}
            title={winners.length === 1 ? `الفوز ${li(player(winners[0]).name)}` : 'تعادل!'}
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

const styles = StyleSheet.create({
  qCard: { backgroundColor: '#FBF7EC', borderRadius: 20, paddingVertical: 16, paddingHorizontal: 14, gap: 4 },
  answerCard: { backgroundColor: C.surface, borderRadius: 20, padding: 12, gap: 8, borderWidth: 2, borderColor: alpha(C.yellow, 0.6) },
  input: { flex: 1, backgroundColor: C.bg2, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, minHeight: 46, color: C.text, fontFamily: F.bold, fontSize: 17, textAlign: 'right', borderWidth: 2, borderColor: C.yellow },
  bubble: { flex: 1, backgroundColor: '#FBF7EC', borderRadius: 14, paddingVertical: 6, paddingHorizontal: 12 },
});
