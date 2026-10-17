import { StyleSheet, View } from 'react-native';

import { GameArt } from '@/art/game-art';
import { Icon } from '@/art/icons';
import type { ImposterView, RoomView } from '@/shared/protocol';
import { C } from '@/theme';
import { Avatar, Card, PlayerTag, Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { Confetti, HoldReveal, Podium, Scoreboard, TimerBar } from '@/ui/fun';
import { Txt, num } from '@/ui/txt';

import { HostNote, PhaseTitle, PlayAgain, ResultBanner, Spectator, WaitingFor } from './common';
import { helpers } from './helpers';

const INK_SOFT = '#6B6488';
const GUESS_MS = 25_000; // keep in sync with server/games/imposter.ts

function SecretCard({ view, height, partners }: { view: ImposterView; height?: number; partners?: string }) {
  const s = view.secret;
  if (!s) return null;
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
  const { me, isHost, player, act } = helpers(room);
  if (!view.participants.includes(me)) return <Spectator room={room} />;
  const partnerNames =
    view.secret?.role === 'imposter' ? view.secret.partners.map((id) => player(id).name).join('، ') : '';

  switch (view.phase) {
    case 'reveal': {
      const ready = view.ready.includes(me);
      const notReady = view.participants.filter((id) => !view.ready.includes(id)).map(player);
      return (
        <>
          <PhaseTitle title={`الجولة ${num(view.round)} من ${num(view.totalRounds)}`} sub="انظر إلى سرّك دون أن يراك أحد" />
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
          <Card>
            <Row wrap gap={4} center>
              {view.order.map((id, i) => (
                <View key={id}>
                  <PlayerTag player={player(id)} size={48} badge={i === 0 ? 'mic' : undefined} sub={i === 0 ? 'يبدأ' : `${i + 1}`} ring={i === 0 ? C.yellow : undefined} />
                  {view.botClues[id] ? (
                    <View style={styles.bubble}>
                      <Txt v="tiny" color={C.ink} center numberOfLines={1}>
                        {view.botClues[id]}
                      </Txt>
                    </View>
                  ) : null}
                </View>
              ))}
            </Row>
          </Card>
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
          <PhaseTitle icon="search" title="من هو الدخيل؟" sub="اضغط على من تشكّ فيه" />
          <Card>
            <Row wrap gap={10} center>
              {others.map((id) => (
                <PlayerTag
                  key={id}
                  player={player(id)}
                  size={62}
                  selected={view.myVote === id}
                  badge={view.voted.includes(id) ? 'check' : undefined}
                  sub={view.botClues[id] ? `«${view.botClues[id]}»` : undefined}
                  onPress={() => act('vote', { target: id })}
                />
              ))}
            </Row>
          </Card>
          <Txt center v="small" color={C.muted}>
            صوّت {view.voted.length} من {view.participants.length}
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
                <Btn key={w} size="lg" label={w} color={C.surfaceStrong} textColor={C.text} onPress={() => act('guess', { word: w })} />
              ))}
            </View>
          </>
        );
      }
      return (
        <>
          <PhaseTitle title={`${g.name} انكشف`} />
          <TimerBar endsAt={view.guessEndsAt} total={GUESS_MS} />
          <Card style={{ alignItems: 'center', gap: 10 }}>
            <Avatar player={g} size={92} />
            <Txt v="h3" center>
              يحاول تخمين الكلمة السرية لينجو…
            </Txt>
          </Card>
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
      else if (!r.caught) story = `صوّتّم على ${accused.name} وهو بريء`;
      else if (r.guessCorrect) story = `انكشف ${accused.name}، لكنه خمّن الكلمة`;
      else if (r.guessed === '') story = `أمسكتم بالدخيل ${accused.name}، ولم يخمّن الكلمة في الوقت`;
      else story = `أمسكتم بالدخيل ${accused.name}`;
      return (
        <>
          {iWon ? <Confetti burst={view.round} /> : null}
          <ResultBanner tone={r.winners === 'civilians' ? 'good' : 'bad'} title={r.winners === 'civilians' ? 'فاز المواطنون' : 'فاز الدخيل'} sub={story} />
          <Card style={{ alignItems: 'center' }}>
            <Txt v="small" color={C.muted}>
              الدخيل كان
            </Txt>
            <Row gap={12} center>
              {r.imposters.map((id) => (
                <PlayerTag key={id} player={player(id)} size={64} />
              ))}
            </Row>
            <Txt v="small" color={C.muted}>
              والكلمة السرية
            </Txt>
            <Txt v="display" color={C.yellow}>
              {r.word}
            </Txt>
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
          <Card>
            <Txt v="h3">النقاط</Txt>
            <Scoreboard players={room.players} scores={view.scores} highlight={me} />
          </Card>
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

const styles = StyleSheet.create({
  bubble: {
    backgroundColor: C.text,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 1,
    marginTop: 2,
    alignSelf: 'center',
    maxWidth: 92,
  },
});
