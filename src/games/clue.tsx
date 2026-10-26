/**
 * «من الفاعل؟» — the family mystery on each phone: three tabs (the investigation, the detective
 * notebook, the history). On my turn: pick a room on the house plan, a character and an item, then
 * «اتهام مؤقت»; the card shown to me appears here only. When a suggestion asks me for a card and I hold
 * several, a panel above the tabs asks which one to show (with a timer).
 */
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { client } from '@/lib/client';
import { haptic } from '@/lib/sfx';
import {
  CLUE_BY_ID,
  CLUE_MYSTERIES,
  CLUE_SHOW_SECS,
  CLUE_WHAT,
  CLUE_WHERE,
  CLUE_WHO,
  clueSentence,
  clueTriple,
  type ClueKind,
  type ClueTriple,
  type ClueView,
} from '@/shared/games/clue';
import { li } from '@/shared/li';
import type { PlayerPublic, RoomView } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { Avatar, Card, Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { ChipPicker, ConfirmModal, Toggle } from '@/ui/controls';
import { Confetti, TimerBar } from '@/ui/fun';
import { useContentWidth } from '@/ui/screen';
import { Txt, num } from '@/ui/txt';

import { ClueArt, ClueCardFace, ClueTile, HousePlan } from './clue-art';
import { History, Notebook, cardStates, useClueNotes } from './clue-notebook';
import { PlayAgain, ResultBanner, Spectator } from './common';
import { helpers, type Helpers } from './helpers';
import { PlayerStrip } from './player-strip';
import { useSettled } from './touch-motion';

type Tab = 'play' | 'notes' | 'log';
type States = Record<string, 'mine' | 'out' | 'in' | null>;

const playerOf = (h: Helpers, view: ClueView, id: string): PlayerPublic => (h.players.some((p) => p.id === id) ? h.player(id) : { ...h.player(id), name: view.names[id] ?? '؟' });

function Tabs({ tab, onTab, alert }: { tab: Tab; onTab: (t: Tab) => void; alert: boolean }) {
  const items: { key: Tab; label: string }[] = [
    { key: 'play', label: 'التحقيق' },
    { key: 'notes', label: 'الدفتر' },
    { key: 'log', label: 'السجل' },
  ];
  return (
    <Row gap={4} style={{ backgroundColor: C.bg3, borderRadius: 14, padding: 4 }}>
      {items.map((it) => {
        const on = it.key === tab;
        return (
          <Pressable
            key={it.key}
            onPress={() => {
              haptic.tap();
              onTab(it.key);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={{ flex: 1, borderRadius: 10, paddingVertical: 6, alignItems: 'center', backgroundColor: on ? C.yellow : 'transparent' }}>
            <Row gap={4}>
              <Txt v="bold" color={on ? C.ink : C.text} style={{ fontSize: 14, lineHeight: 21 }}>
                {it.label}
              </Txt>
              {alert && it.key === 'play' && !on ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.red }} /> : null}
            </Row>
          </Pressable>
        );
      })}
    </Row>
  );
}

/** A small chip in the line of who was asked: ✗ could not disprove, … choosing, ✓ showed a card. */
function AskChip({ p, kind, label }: { p: PlayerPublic; kind: 'pass' | 'wait' | 'show'; label: string }) {
  const color = kind === 'pass' ? C.red : kind === 'wait' ? C.yellow : C.green;
  return (
    <Row gap={4} style={{ backgroundColor: alpha(color, 0.15), borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: alpha(color, 0.45) }}>
      <Avatar player={p} size={18} />
      <Txt v="tiny" color={color} numberOfLines={1}>
        {label}
      </Txt>
    </Row>
  );
}

/** This turn's suggestion: the three cards, who could not disprove, who showed a card (and, for me, which). */
function Current({ view, h, width }: { view: ClueView; h: Helpers; width: number }) {
  const settled = useSettled();
  const cur = view.current;
  if (!cur) return null;
  const by = playerOf(h, view, cur.by);
  const mine = cur.by === h.me;
  const cw = Math.min(86, Math.floor((width - 40) / 3));
  const shower = cur.shownBy ? playerOf(h, view, cur.shownBy) : null;
  return (
    <Card style={{ gap: 8 }}>
      <Row gap={8}>
        <Avatar player={by} size={28} />
        <Txt v="bold" style={{ flex: 1 }} numberOfLines={1}>
          {mine ? 'اتهامك المؤقت' : `اتهام مؤقت من ${by.name}`}
        </Txt>
      </Row>
      <Row gap={8} center>
        {clueTriple(cur).map((id) => (
          <ClueCardFace key={id} id={id} width={cw} dim={!!cur.card && cur.card !== id && (mine || cur.shownBy === h.me)} selected={!!cur.card && cur.card === id} />
        ))}
      </Row>
      <Row gap={5} wrap center>
        {cur.passed.map((p) => (
          <AskChip key={p} p={playerOf(h, view, p)} kind="pass" label="بلا ورقة" />
        ))}
        {cur.pending ? <AskChip p={playerOf(h, view, cur.pending)} kind="wait" label="اختيار ورقة…" /> : null}
        {shower ? <AskChip p={shower} kind="show" label="ورقة معروضة" /> : null}
      </Row>
      {cur.pending && cur.pending !== h.me ? <TimerBar endsAt={view.endsAt} total={view.timerTotal} /> : null}
      {cur.done ? (
        <Animated.View key={cur.n} entering={settled ? FadeIn.duration(320) : undefined} style={{ alignItems: 'center', gap: 4 }}>
          {!shower ? (
            <>
              <Txt v="h3" center color={C.yellow}>
                لم يستطع أحد النفي!
              </Txt>
              <Txt v="small" center color={C.muted}>
                {mine ? 'كل ورقة منها ليست في يدك هي في الملف السري.' : 'لا ورقة من الثلاث في أيدي باقي اللاعبين.'}
              </Txt>
            </>
          ) : cur.card && mine ? (
            <Txt v="bold" center color={C.green}>
              الورقة المعروضة عليك من {shower.name}: {CLUE_BY_ID[cur.card]?.name}
            </Txt>
          ) : cur.card && cur.shownBy === h.me ? (
            <Txt v="bold" center color={C.cyan}>
              ورقتك المعروضة على {by.name}: {CLUE_BY_ID[cur.card]?.name}
            </Txt>
          ) : (
            <Txt v="small" center color={C.muted}>
              ورقة من {shower.name} إلى {by.name} — لا يعرفها غيرهما
            </Txt>
          )}
        </Animated.View>
      ) : null}
    </Card>
  );
}

/** I hold several of the suggested cards: which one to show (only the suggester will see it). */
function Choose({ view, h, width }: { view: ClueView; h: Helpers; width: number }) {
  const c = view.choose;
  if (!c) return null;
  const to = playerOf(h, view, c.to);
  const cw = Math.min(100, Math.floor((width - 40) / 3));
  return (
    <Card outline={C.yellow} style={{ gap: 8 }}>
      <Txt v="h3" center>
        اختر الورقة المعروضة على {to.name}
      </Txt>
      <Txt v="small" center color={C.muted}>
        لا يراها أحد غيره. يرى الآخرون أن ورقة عُرضت فقط.
      </Txt>
      <TimerBar endsAt={view.endsAt} total={view.timerTotal} onTick />
      <Row gap={10} center>
        {c.options.map((id) => (
          <Pressable
            key={id}
            onPress={() => {
              haptic.medium();
              client.act({ type: 'show', card: id });
            }}
            accessibilityRole="button"
            accessibilityLabel={`اعرض ${CLUE_BY_ID[id]?.name}`}
            style={({ pressed }) => ({ transform: [{ translateY: pressed ? 2 : 0 }] })}>
            <ClueCardFace id={id} width={cw} />
          </Pressable>
        ))}
      </Row>
    </Card>
  );
}

/** Three rows of pickers: who, what and (for the final accusation) where. */
function KindPicker({ kind, ids, value, onPick, width, states, exclude }: { kind: ClueKind; ids: string[]; value: string | null; onPick: (id: string) => void; width: number; states: States; exclude?: string | null }) {
  const per = 3;
  const gap = 6;
  const w = Math.floor((width - gap * (per - 1)) / per);
  const title = kind === 'who' ? 'من؟' : kind === 'what' ? 'بماذا؟' : 'أين؟';
  return (
    <View style={{ gap: 4 }}>
      <Txt v="bold" color={C.muted}>
        {title}
      </Txt>
      <Row gap={gap} wrap>
        {ids.map((id) => (
          <ClueTile key={id} id={id} width={w} selected={value === id} disabled={exclude === id} state={states[id]} onPress={() => onPick(id)} />
        ))}
      </Row>
    </View>
  );
}

/** The final accusation: three choices and a confirmation (one chance only). */
function Accuse({ view, width, states, initial, onClose }: { view: ClueView; width: number; states: States; initial: Partial<ClueTriple>; onClose: () => void }) {
  const [t, setT] = useState<Partial<ClueTriple>>(initial);
  const [confirm, setConfirm] = useState(false);
  const full = !!(t.who && t.what && t.where);
  return (
    <Card outline={C.red} style={{ gap: 10 }}>
      <Txt v="h3" center>
        الاتهام النهائي
      </Txt>
      <Txt v="small" center color={C.muted}>
        مرة واحدة فقط: الاتهام الخاطئ يعني الخروج من التخمين (مع بقاء عرض الأوراق على الآخرين).
      </Txt>
      <KindPicker kind="who" ids={CLUE_WHO} value={t.who ?? null} onPick={(who) => setT({ ...t, who })} width={width - 28} states={states} />
      <KindPicker kind="what" ids={CLUE_WHAT} value={t.what ?? null} onPick={(what) => setT({ ...t, what })} width={width - 28} states={states} />
      <KindPicker kind="where" ids={CLUE_WHERE} value={t.where ?? null} onPick={(where) => setT({ ...t, where })} width={width - 28} states={states} />
      <Btn size="lg" icon="search" label="أتّهم!" color={C.red} disabled={!full} onPress={() => setConfirm(true)} />
      <Btn size="md" label="رجوع" ghost onPress={onClose} />
      <ConfirmModal
        visible={confirm}
        danger
        icon="search"
        title="متأكد من الاتهام؟"
        message={full ? clueSentence(t as ClueTriple) : undefined}
        confirmLabel="أتّهم"
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          if (full) client.act({ type: 'accuse', ...t });
          onClose();
        }}
      />
    </Card>
  );
}

/** My turn: a room on the plan, a character and an item → «اتهام مؤقت». */
function Suggest({ view, room, h, width, states, onAccuse }: { view: ClueView; room: RoomView; h: Helpers; width: number; states: States; onAccuse: () => void }) {
  const key = `${view.log.length}`;
  const [draft, setDraft] = useState<{ key: string; t: Partial<ClueTriple> }>({ key: '', t: {} });
  const t = draft.key === key ? draft.t : {};
  const set = (patch: Partial<ClueTriple>) => setDraft({ key, t: { ...t, ...patch } });
  const from = view.rooms[h.me] ?? null;
  const full = !!(t.who && t.what && t.where);
  return (
    <Card style={{ gap: 10 }}>
      <Txt v="h3" center>
        دورك: أيّ غرفة؟
      </Txt>
      <Txt v="small" center color={C.muted}>
        {from ? `أنت في ${CLUE_BY_ID[from].name}. اختر غرفة أخرى، ثم شخصية وأداة.` : 'اختر غرفة من البيت، ثم شخصية وأداة.'}
      </Txt>
      <HousePlan width={width - 28} players={room.players} rooms={view.rooms} me={h.me} from={from} picked={t.where ?? null} onPick={(where) => set({ where })} states={states} />
      <KindPicker kind="who" ids={CLUE_WHO} value={t.who ?? null} onPick={(who) => set({ who })} width={width - 28} states={states} />
      <KindPicker kind="what" ids={CLUE_WHAT} value={t.what ?? null} onPick={(what) => set({ what })} width={width - 28} states={states} />
      <Txt v="bold" center color={full ? C.text : C.dim}>
        {full ? clueSentence(t as ClueTriple) : 'اختر الغرفة والشخصية والأداة'}
      </Txt>
      <Btn
        size="lg"
        icon="search"
        label="اتهام مؤقت"
        disabled={!full}
        onPress={() => {
          if (full) client.act({ type: 'suggest', ...t });
        }}
      />
      <Btn size="md" icon="target" label="الاتهام النهائي…" ghost onPress={onAccuse} />
    </Card>
  );
}

function MyCards({ view, width }: { view: ClueView; width: number }) {
  if (!view.myHand.length) return null;
  const n = view.myHand.length;
  const per = Math.min(n, width < 340 ? 4 : 6);
  const cw = Math.min(78, Math.floor((width - 6 * (per - 1)) / per));
  return (
    <View style={{ gap: 6 }}>
      <Txt v="bold" color={C.muted}>
        أوراقي ({num(n)}) — ليست في الملف السري
      </Txt>
      <Row gap={6} wrap center>
        {view.myHand.map((id) => (
          <ClueCardFace key={id} id={id} width={cw} />
        ))}
      </Row>
    </View>
  );
}

function PlayTab({ view, room, h, width, states }: { view: ClueView; room: RoomView; h: Helpers; width: number; states: States }) {
  const [accusing, setAccusing] = useState(false);
  const myTurn = view.turn === h.me && (view.phase === 'turn' || view.phase === 'after');
  const out = view.out.includes(h.me);
  // the notebook's sure cards (★) are offered first, else the suggestion just made
  const sure = (ids: string[]) => ids.find((id) => states[id] === 'in');
  const initial: Partial<ClueTriple> = {
    who: sure(CLUE_WHO) ?? view.current?.who,
    what: sure(CLUE_WHAT) ?? view.current?.what,
    where: sure(CLUE_WHERE) ?? view.current?.where,
  };
  const entries = view.order.map((id) => {
    const r = view.rooms[id];
    const where = view.out.includes(id) ? 'خارج التخمين' : r ? CLUE_BY_ID[r].short : 'خارج البيت';
    return { id, sub: `${num(view.handCounts[id] ?? 0)} أوراق · ${where}`, out: view.out.includes(id) };
  });
  return (
    <>
      <PlayerStrip room={room} entries={entries} active={view.turn ? [view.turn] : []} gains={false} />
      {out ? (
        <Txt v="small" center color={C.orange}>
          خارج التخمين بعد اتهام خاطئ — مع بقاء عرض أوراقك على الآخرين.
        </Txt>
      ) : null}
      {myTurn && accusing ? <Accuse view={view} width={width} states={states} initial={initial} onClose={() => setAccusing(false)} /> : null}
      <Current view={view} h={h} width={width} />
      {myTurn && !accusing && view.phase === 'after' ? (
        <Card style={{ gap: 8 }}>
          <Txt v="small" center color={C.muted}>
            سجّل الجديد في الدفتر. الحل مؤكد؟ قدّم الاتهام النهائي، وإلا فأنهِ الدور.
          </Txt>
          <Btn size="lg" icon="next" label="إنهاء الدور" color={C.cyan} onPress={() => client.act({ type: 'end' })} />
          <Btn size="md" icon="target" label="الاتهام النهائي…" ghost onPress={() => setAccusing(true)} />
        </Card>
      ) : null}
      {myTurn && !accusing && view.phase === 'turn' ? <Suggest view={view} room={room} h={h} width={width} states={states} onAccuse={() => setAccusing(true)} /> : null}
      {!myTurn ? <HousePlan width={width} players={room.players} rooms={view.rooms} me={h.me} states={states} /> : null}
      <MyCards view={view} width={width} />
    </>
  );
}

function Final({ view, room, h, width }: { view: ClueView; room: RoomView; h: Helpers; width: number }) {
  const env = view.envelope;
  const won = view.winner === h.me;
  const title = view.winner ? (won ? 'اللغز محلول! الفوز لك' : `الفوز ${li(playerOf(h, view, view.winner).name)}`) : 'لم يُحلّ اللغز';
  const cw = Math.min(96, Math.floor((width - 40) / 3));
  return (
    <>
      {won ? <Confetti /> : null}
      <ResultBanner
        tone={won ? 'good' : 'neutral'}
        art={view.winner ? <Avatar player={playerOf(h, view, view.winner)} size={64} badge="star" /> : <ClueArt id={env?.who ?? 'zahra'} size={64} />}
        title={title}
        sub={CLUE_MYSTERIES[view.mystery]?.title}
      />
      {env ? (
        <Card style={{ gap: 8, alignItems: 'center' }}>
          <Txt v="h3" center>
            الملف السري
          </Txt>
          <Row gap={8} center>
            {clueTriple(env).map((id) => (
              <ClueCardFace key={id} id={id} width={cw} />
            ))}
          </Row>
          <Txt v="bold" center color={C.yellow}>
            الفاعل: {clueSentence(env)}
          </Txt>
        </Card>
      ) : null}
      {view.hands ? (
        <Card style={{ gap: 6 }}>
          <Txt v="bold" color={C.muted}>
            أوراق الجميع
          </Txt>
          {view.order.map((id) => (
            <Row key={id} gap={8} style={{ alignItems: 'flex-start', backgroundColor: C.bg3, borderRadius: 12, padding: 6 }}>
              <View style={{ width: 64, alignItems: 'center', gap: 2 }}>
                <Avatar player={playerOf(h, view, id)} size={28} badge={view.out.includes(id) ? 'skull' : id === view.winner ? 'star' : undefined} />
                <Txt v="tiny" center numberOfLines={1} style={{ maxWidth: 64 }}>
                  {id === h.me ? 'أنت' : playerOf(h, view, id).name}
                </Txt>
              </View>
              <Row gap={4} wrap style={{ flex: 1 }}>
                {(view.hands?.[id] ?? []).map((c) => (
                  <View key={c} style={{ alignItems: 'center', width: 48 }}>
                    <ClueArt id={c} size={30} />
                    <Txt v="tiny" center numberOfLines={1} color={C.muted} style={{ fontSize: 10, lineHeight: 14 }}>
                      {CLUE_BY_ID[c]?.short}
                    </Txt>
                  </View>
                ))}
              </Row>
            </Row>
          ))}
        </Card>
      ) : null}
      <PlayAgain room={room} />
    </>
  );
}

export function ClueGame({ room, view }: { room: RoomView; view: ClueView }) {
  const h = helpers(room);
  const width = useContentWidth();
  const [marks, setMark] = useClueNotes(view.gameKey);
  const [tab, setTab] = useState<Tab>('play');
  // back to the investigation once when my turn starts or a card is asked of me
  const callKey = view.choose ? `c:${view.current?.n}` : view.turn === h.me && view.phase === 'turn' ? `t:${view.log.length}` : '';
  const [seen, setSeen] = useState(callKey);
  if (callKey !== seen) {
    setSeen(callKey);
    if (callKey) setTab('play');
  }

  if (view.phase === 'final') return <Final view={view} room={room} h={h} width={width} />;
  if (!view.order.includes(h.me)) return <Spectator room={room} />;

  const states = cardStates(view, h.me, marks);
  const myCall = (view.turn === h.me && view.phase !== 'show') || !!view.choose;
  return (
    <>
      <Txt v="h2" center color={C.yellow} style={{ fontFamily: F.display }}>
        {CLUE_MYSTERIES[view.mystery]?.title}
      </Txt>
      <Choose view={view} h={h} width={width} />
      <Tabs tab={tab} onTab={setTab} alert={myCall} />
      {tab === 'play' ? <PlayTab view={view} room={room} h={h} width={width} states={states} /> : null}
      {tab === 'notes' ? <Notebook view={view} room={room} me={h.me} marks={marks} setMark={setMark} width={width} /> : null}
      {tab === 'log' ? <History view={view} room={room} me={h.me} /> : null}
    </>
  );
}

/** Lobby settings: the notebook helper and the time to choose which card to show. */
export function ClueSettings({ room, editable }: { room: RoomView; editable: boolean }) {
  const s = room.settings.clue;
  const change = (patch: Record<string, unknown>) => client.roomAction({ type: 'settings', game: 'clue', patch });
  return (
    <View style={{ gap: 8 }}>
      <Toggle label="الدفتر يشطب أوراق من لم يستطع النفي" value={s.helper} editable={editable} onChange={(helper) => change({ helper })} />
      <Txt v="bold">وقت اختيار الورقة المعروضة</Txt>
      <ChipPicker
        options={CLUE_SHOW_SECS.map((n) => ({ key: String(n), label: `${n} ثانية` }))}
        value={String(s.showSecs)}
        editable={editable}
        onChange={(v) => change({ showSecs: Number(v) })}
      />
    </View>
  );
}
