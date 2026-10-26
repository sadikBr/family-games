/**
 * «من الفاعل؟» — the detective notebook (a private grid: the 21 cards × the players) and the history
 * of suggestions. The phone writes the certain facts by itself (clueFacts: my cards, the cards shown
 * to me, and — with the helper — who could not disprove); the player adds ✗ / ✓ / ? in any other cell.
 * The marks stay on this phone only (AsyncStorage, under the game's random key), never on the server.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { haptic } from '@/lib/sfx';
import {
  CLUE_BY_ID,
  CLUE_KINDS,
  CLUE_KIND_ASK,
  CLUE_KIND_TITLE,
  clueCell,
  clueFacts,
  clueOfKind,
  clueRow,
  type ClueEntry,
  type ClueMark,
  type ClueView,
} from '@/shared/games/clue';
import type { PlayerPublic, RoomView } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { Avatar, Row } from '@/ui/bits';
import { Txt, num } from '@/ui/txt';

import { ClueArt } from './clue-art';

const KEY = 'fg.clue.notes.v1';

export type ClueMarks = Record<string, ClueMark>;

/** My notebook marks for this game, kept on the phone (a new game starts a clean page). */
export function useClueNotes(gameKey: string): [ClueMarks, (cell: string, m: ClueMark | null) => void] {
  const [st, setSt] = useState<{ key: string; marks: ClueMarks }>({ key: '', marks: {} });
  useEffect(() => {
    let alive = true;
    const done = (marks: ClueMarks) => {
      if (alive) setSt((s) => (s.key === gameKey ? s : { key: gameKey, marks }));
    };
    try {
      AsyncStorage.getItem(KEY)
        .then((raw) => {
          const saved = raw ? (JSON.parse(raw) as { key?: string; marks?: ClueMarks }) : null;
          done(saved?.key === gameKey && saved.marks ? saved.marks : {});
        })
        .catch(() => done({}));
    } catch {
      done({});
    }
    return () => {
      alive = false;
    };
  }, [gameKey]);
  const marks = st.key === gameKey ? st.marks : {};
  const setMark = (cell: string, m: ClueMark | null) => {
    const next = { ...marks };
    if (m) next[cell] = m;
    else delete next[cell];
    setSt({ key: gameKey, marks: next });
    try {
      AsyncStorage.setItem(KEY, JSON.stringify({ key: gameKey, marks: next })).catch(() => {});
    } catch {
      // storage unavailable: the marks live as long as the screen
    }
  };
  return [marks, setMark];
}

/** What my notebook says about each card: in my hand, held by someone, in the file, or unknown. */
export function cardStates(view: ClueView, me: string, marks: ClueMarks): Record<string, 'mine' | 'out' | 'in' | null> {
  const facts = clueFacts(view, me);
  const cell = (card: string, p: string) => facts[clueCell(card, p)] ?? marks[clueCell(card, p)];
  const out: Record<string, 'mine' | 'out' | 'in' | null> = {};
  for (const kind of CLUE_KINDS) for (const c of clueOfKind(kind)) out[c.id] = view.myHand.includes(c.id) ? 'mine' : clueRow(c.id, view.order, cell);
  return out;
}

const NEXT: Record<string, ClueMark | null> = { none: 'n', n: 'y', y: 'q', q: null };

export function Notebook({ view, room, me, marks, setMark, width }: { view: ClueView; room: RoomView; me: string; marks: ClueMarks; setMark: (cell: string, m: ClueMark | null) => void; width: number }) {
  const facts = clueFacts(view, me);
  // me first, then the others in seat order after me
  const at = Math.max(0, view.order.indexOf(me));
  const cols = [...view.order.slice(at), ...view.order.slice(0, at)];
  const playerOf = (id: string): PlayerPublic => room.players.find((p) => p.id === id) ?? { id, name: view.names[id] ?? '؟', avatar: 'owl', color: C.dim, connected: false };
  const colW = Math.max(28, Math.min(40, Math.floor((width - 112) / cols.length)));
  const cell = (card: string, p: string) => facts[clueCell(card, p)] ?? marks[clueCell(card, p)];
  return (
    <View style={{ gap: 6 }}>
      <Txt v="small" center color={C.muted}>
        المس خانة لتضع ✗ ثم ✓ ثم ؟ — الخانات الملوّنة مؤكدة يكتبها الهاتف وحده
      </Txt>
      <View style={{ backgroundColor: '#F4E9D2', borderRadius: 16, padding: 6, gap: 1 }}>
        <Row gap={0} style={{ paddingBottom: 4 }}>
          <View style={{ flex: 1 }} />
          {cols.map((p) => (
            <View key={p} style={{ width: colW, alignItems: 'center' }}>
              <Avatar player={playerOf(p)} size={22} ring={p === me ? C.yellow : undefined} dim={view.out.includes(p)} />
              <Txt style={{ fontFamily: F.bold, fontSize: 10, lineHeight: 14, color: '#5A4632' }}>{num(view.handCounts[p] ?? 0)}</Txt>
            </View>
          ))}
        </Row>
        {CLUE_KINDS.map((kind) => (
          <View key={kind} style={{ gap: 1 }}>
            <Row gap={6} style={{ paddingTop: 4, paddingBottom: 2, paddingHorizontal: 4 }}>
              <Txt style={{ fontFamily: F.black, fontSize: 13, lineHeight: 19, color: '#7A3E1E' }}>{CLUE_KIND_TITLE[kind]}</Txt>
              <Txt style={{ fontFamily: F.bold, fontSize: 11, lineHeight: 17, color: '#9A7A5A' }}>{CLUE_KIND_ASK[kind]}</Txt>
            </Row>
            {clueOfKind(kind).map((c) => {
              const row = clueRow(c.id, view.order, cell);
              return (
                <Row key={c.id} gap={0} style={{ minHeight: 30, borderRadius: 8, backgroundColor: row === 'in' ? alpha(C.yellow, 0.45) : 'rgba(90,70,50,0.07)' }}>
                  <Row gap={4} style={{ flex: 1, paddingHorizontal: 3, minWidth: 0 }}>
                    <ClueArt id={c.id} size={20} />
                    <Txt
                      numberOfLines={1}
                      style={{ flexShrink: 1, fontFamily: F.bold, fontSize: 12, lineHeight: 18, color: row === 'out' ? '#A8977F' : '#2B2118', textDecorationLine: row === 'out' ? 'line-through' : 'none' }}>
                      {row === 'in' ? '★ ' : ''}
                      {c.short}
                    </Txt>
                  </Row>
                  {cols.map((p) => {
                    const id = clueCell(c.id, p);
                    const auto = facts[id];
                    const m = auto ?? marks[id];
                    return (
                      <Pressable
                        key={p}
                        disabled={!!auto}
                        hitSlop={2}
                        onPress={() => {
                          haptic.tap();
                          setMark(id, NEXT[marks[id] ?? 'none']);
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={`${c.name} — ${playerOf(p).name}: ${m === 'y' ? 'معه' : m === 'n' ? 'ليست معه' : m === 'q' ? 'شك' : 'فارغة'}`}
                        style={{ width: colW, height: 28, alignItems: 'center', justifyContent: 'center' }}>
                        <Mark m={m} auto={!!auto} />
                      </Pressable>
                    );
                  })}
                </Row>
              );
            })}
          </View>
        ))}
      </View>
      <Row gap={12} center wrap>
        <Legend m="y" auto label="مؤكد" />
        <Legend m="n" auto label="مؤكد" />
        <Legend m="y" label="ظنّي" />
        <Legend m="q" label="شك" />
        <Txt v="tiny" color={C.muted}>
          ★ في الملف السري
        </Txt>
      </Row>
    </View>
  );
}

function Mark({ m, auto }: { m: ClueMark | undefined; auto: boolean }) {
  if (!m) return <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(90,70,50,0.18)' }} />;
  const color = m === 'y' ? C.green : m === 'n' ? C.red : '#C98A1E';
  const ch = m === 'y' ? '✓' : m === 'n' ? '✗' : '؟';
  return (
    <View
      style={{
        width: 22,
        height: 22,
        borderRadius: 6,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: auto ? color : 'transparent',
        borderWidth: auto ? 0 : 1.6,
        borderColor: color,
        opacity: auto && m === 'n' ? 0.75 : 1,
      }}>
      <Txt style={{ fontFamily: F.black, fontSize: 13, lineHeight: 18, color: auto ? '#FFFFFF' : color }}>{ch}</Txt>
    </View>
  );
}

function Legend({ m, auto = false, label }: { m: ClueMark; auto?: boolean; label: string }) {
  return (
    <Row gap={4}>
      <View style={{ backgroundColor: '#F4E9D2', borderRadius: 7, padding: 1 }}>
        <Mark m={m} auto={auto} />
      </View>
      <Txt v="tiny" color={C.muted}>
        {label}
      </Txt>
    </Row>
  );
}

/** One line of the history: who suggested what, who could not disprove, who showed a card. */
function EntryRow({ e, view, room, me }: { e: ClueEntry; view: ClueView; room: RoomView; me: string }) {
  const player = (id: string): PlayerPublic => room.players.find((p) => p.id === id) ?? { id, name: view.names[id] ?? '؟', avatar: 'owl', color: C.dim, connected: false };
  const by = player(e.by);
  const triple = `${CLUE_BY_ID[e.who]?.short} · ${CLUE_BY_ID[e.what]?.short} · ${CLUE_BY_ID[e.where]?.short}`;
  if (e.kind === 'accuse') {
    return (
      <View style={{ backgroundColor: alpha(e.correct ? C.green : C.red, 0.16), borderRadius: 14, padding: 8, gap: 2, borderWidth: 1.5, borderColor: alpha(e.correct ? C.green : C.red, 0.5) }}>
        <Row gap={6}>
          <Avatar player={by} size={22} />
          <Txt v="bold" style={{ flex: 1 }} numberOfLines={1}>
            اتهام نهائي من {by.name}
          </Txt>
          <Txt v="tiny" color={e.correct ? C.green : C.red}>
            {e.correct ? 'صحيح ✓' : 'خاطئ ✗'}
          </Txt>
        </Row>
        <Txt v="small" color={C.muted}>
          {triple}
        </Txt>
      </View>
    );
  }
  const shower = e.shownBy ? player(e.shownBy) : null;
  return (
    <View style={{ backgroundColor: C.surface, borderRadius: 14, padding: 8, gap: 4, borderWidth: 1, borderColor: C.border }}>
      <Row gap={6}>
        <Txt v="tiny" color={C.dim}>
          {num(e.n)}
        </Txt>
        <Avatar player={by} size={22} />
        <Txt v="bold" style={{ flex: 1 }} numberOfLines={1}>
          {by.id === me ? 'أنت' : by.name}
        </Txt>
      </Row>
      <Txt v="small">{triple}</Txt>
      <Row gap={4} wrap>
        {e.passed.map((p) => (
          <Row key={p} gap={2} style={{ backgroundColor: alpha(C.red, 0.14), borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1 }}>
            <Avatar player={player(p)} size={16} />
            <Txt v="tiny" color={C.red}>
              ✗
            </Txt>
          </Row>
        ))}
        {shower ? (
          <Row gap={4} style={{ backgroundColor: alpha(C.green, 0.16), borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1 }}>
            <Avatar player={shower} size={16} />
            <Txt v="tiny" color={C.green}>
              {e.card ? `ورقة: ${CLUE_BY_ID[e.card]?.short}` : 'ورقة معروضة'}
            </Txt>
          </Row>
        ) : e.done ? (
          <Txt v="tiny" color={C.yellow}>
            لم يستطع أحد النفي!
          </Txt>
        ) : (
          <Txt v="tiny" color={C.muted}>
            …
          </Txt>
        )}
      </Row>
    </View>
  );
}

export function History({ view, room, me }: { view: ClueView; room: RoomView; me: string }) {
  if (!view.log.length) {
    return (
      <Txt center color={C.muted} style={{ paddingVertical: 20 }}>
        لا اتهامات بعد. أول اتهام مؤقت يظهر هنا.
      </Txt>
    );
  }
  return (
    <View style={{ gap: 6 }}>
      {[...view.log].reverse().map((e) => (
        <EntryRow key={e.n} e={e} view={view} room={room} me={me} />
      ))}
    </View>
  );
}
