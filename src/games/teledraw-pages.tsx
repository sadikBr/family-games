/**
 * «الرسم المتسلسل» — pages and books: one page (a phrase, a drawing or a guess, with its author), the
 * big page-by-page reveal everyone watches together, and a book browser for the votes and the end.
 */
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated from 'react-native-reanimated';

import { Icon } from '@/art/icons';
import type { TeledrawPage, TeledrawRef, TeledrawView } from '@/shared/games/teledraw';
import type { PlayerPublic, RoomView } from '@/shared/protocol';
import { C, alpha } from '@/theme';
import { useAccent } from '@/ui/accent';
import { Avatar, Card, Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { TimerBar } from '@/ui/fun';
import { SoftIn } from '@/ui/motion';
import { Txt, num } from '@/ui/txt';

import { HostNote } from './common';
import { helpers } from './helpers';
import { Sketch } from './teledraw-canvas';
import { dk } from '@/ui/layout';

/** A player, also one who left (their name is kept by the game). */
export function useWho(room: RoomView, view: TeledrawView) {
  const h = helpers(room);
  return (id: string): PlayerPublic => {
    const p = h.player(id);
    return room.players.some((x) => x.id === id) ? p : { ...p, name: view.names[id] ?? '؟', connected: true };
  };
}

export const NOTHING = '(لا شيء)';
export const LEFT = '(غادر)';

const LABEL: Record<TeledrawPage['kind'], string> = { phrase: 'جملة البداية', draw: 'رسمة', guess: 'تخمين' };

/** The width pages are drawn at. */
export function usePageWidth() {
  const { width } = useWindowDimensions();
  return Math.min(width - 32, dk(440));
}

/** Author line: avatar, «رسمة من سارة». */
function Author({ page, who, small }: { page: TeledrawPage; who: (id: string) => PlayerPublic; small?: boolean }) {
  const p = who(page.by);
  return (
    <Row gap={6} center>
      <Avatar player={p} size={small ? 20 : 26} />
      <Txt v="tiny" color={C.muted} numberOfLines={1} style={{ flexShrink: 1 }}>
        {LABEL[page.kind]} من {p.name}
        {page.auto ? ' — اختيار تلقائي' : ''}
      </Txt>
    </Row>
  );
}

/** One page. `size` = width; small pages (previous page, book lists) use a smaller font and sketch. */
export function PageCard({ page, who, size, frame, small }: { page: TeledrawPage; who: (id: string) => PlayerPublic; size: number; frame?: string; small?: boolean }) {
  const accent = useAccent();
  const note = page.left ? LEFT : page.empty ? NOTHING : undefined;
  if (page.kind === 'draw') {
    return (
      <View style={{ gap: 6, alignItems: 'center' }}>
        <Sketch strokes={page.strokes ?? []} size={size} note={note} frame={frame} />
        <Author page={page} who={who} small={small} />
      </View>
    );
  }
  return (
    <View style={[styles.textPage, { width: size, borderColor: frame ?? alpha(accent, 0.5), paddingVertical: small ? 8 : 16 }]}>
      <Txt v={small ? 'h2' : 'display'} center color={note ? C.dim : C.text} style={small ? null : { fontSize: size < 300 ? 27 : 32 }}>
        {note ?? `«${page.text}»`}
      </Txt>
      <Author page={page} who={who} small={small} />
    </View>
  );
}

/** Small dots: pages of the book, the ones shown filled. */
function PageDots({ shown, length, color }: { shown: number; length: number; color: string }) {
  return (
    <Row gap={5} center style={{ direction: 'ltr' }}>
      {Array.from({ length }, (_, i) => (
        <View key={i} style={{ width: i === shown - 1 ? 18 : 8, height: 8, borderRadius: 4, backgroundColor: i < shown ? color : C.surfaceStrong }} />
      ))}
    </Row>
  );
}

/** The last text of a book (its final guess, or the phrase if no guess was made). */
const lastText = (pages: TeledrawPage[]) => [...pages].reverse().find((p) => p.kind !== 'draw' && !p.left && !p.empty) ?? null;

/** The reveal: the book's owner and progress, the previous page small, the current page big. */
export function Reveal({ room, view }: { room: RoomView; view: TeledrawView }) {
  const h = helpers(room);
  const who = useWho(room, view);
  const accent = useAccent();
  const w = usePageWidth();
  const r = view.reveal!;
  const owner = who(r.owner);
  const at = r.pages.length - 1;
  const page = r.pages[at];
  const prev = at > 0 ? r.pages[at - 1] : null;
  const lastPage = at === r.length - 1;
  const lastBook = r.book === r.books - 1;
  const canTurn = h.isHost || r.canTurn;
  const start = r.pages[0];
  const end = lastPage ? lastText(r.pages) : null;
  const nextLabel = !lastPage ? 'الصفحة التالية' : !lastBook ? 'الدفتر التالي' : 'إلى النهاية';
  const turn = () => h.act(h.isHost ? 'next' : 'turn', { at: `${r.book}:${at}` });

  return (
    <>
      <Card style={{ gap: 8, paddingVertical: 10 }}>
        <Row gap={10}>
          <Avatar player={owner} size={40} ring={owner.color} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt v="h2" numberOfLines={1}>
              دفتر {owner.name}
            </Txt>
            <Txt v="tiny" color={C.muted}>
              الدفتر {num(r.book + 1)} من {num(r.books)} — الصفحة {num(at + 1)} من {num(r.length)}
            </Txt>
          </View>
        </Row>
        <PageDots shown={at + 1} length={r.length} color={accent} />
      </Card>

      {prev ? (
        <View style={{ alignItems: 'center', gap: 4, opacity: 0.85 }}>
          <PageCard page={prev} who={who} size={prev.kind === 'draw' ? Math.round(w * 0.42) : w} small />
          <Icon name="down" size={22} color={accent} />
        </View>
      ) : null}

      <Animated.View key={`${r.book}:${at}`} entering={SoftIn} style={{ alignItems: 'center' }}>
        {/* a book's last drawing a little smaller, so the «from → to» card fits under it */}
        <PageCard page={page} who={who} size={page.kind === 'draw' && lastPage ? Math.round(w * 0.74) : w} frame={page.kind === 'draw' ? accent : undefined} />
      </Animated.View>

      {lastPage && end && start && end !== start ? (
        <Animated.View entering={SoftIn}>
          <Card outline={alpha(C.yellow, 0.7)} style={{ gap: 6, alignItems: 'center' }}>
            <Txt v="tiny" color={C.muted}>
              من البداية إلى النهاية
            </Txt>
            <Txt v="h3" center>
              «{start.text}»
            </Txt>
            <Icon name="down" size={18} color={C.yellow} />
            <Txt v="title" center color={C.yellow}>
              «{end.text}»
            </Txt>
          </Card>
        </Animated.View>
      ) : null}

      {r.auto ? <TimerBar endsAt={view.endsAt} total={view.total} /> : null}
      {canTurn ? (
        <Btn size="lg" icon="next" label={nextLabel} onPress={turn} />
      ) : (
        <HostNote>{r.auto ? 'الصفحات تنتقل وحدها' : `تقليب الصفحات: لصاحب الدفتر (${owner.name}) أو للمضيف`}</HostNote>
      )}
    </>
  );
}

/** Tabs to open any book (each phone browses on its own). */
function BookTabs({ room, view, index }: { room: RoomView; view: TeledrawView; index: number }) {
  const h = helpers(room);
  const who = useWho(room, view);
  const accent = useAccent();
  return (
    <Row wrap gap={6} center>
      {view.owners.map((id, i) => {
        const on = i === index;
        return (
          <Pressable
            key={id}
            onPress={() => h.act('browse', { book: i })}
            accessibilityLabel={`دفتر ${who(id).name}`}
            style={[styles.tab, { borderColor: on ? accent : C.border, backgroundColor: on ? alpha(accent, 0.2) : C.surface }]}>
            <Avatar player={who(id)} size={30} />
          </Pressable>
        );
      })}
    </Row>
  );
}

/** A whole book, page under page; with `vote` each page others made gets a vote button. */
export function BookBrowser({
  room,
  view,
  vote,
}: {
  room: RoomView;
  view: TeledrawView;
  vote?: { myDraw: TeledrawRef | null; myGuess: TeledrawRef | null; locked: boolean };
}) {
  const h = helpers(room);
  const who = useWho(room, view);
  const w = usePageWidth();
  const b = view.browse;
  if (!b) return null;
  const owner = who(b.owner);
  const same = (r: TeledrawRef | null, i: number) => !!r && r.book === b.index && r.page === i;
  return (
    <View style={{ gap: 12 }}>
      <BookTabs room={room} view={view} index={b.index} />
      <Txt v="h2" center>
        دفتر {owner.name}
      </Txt>
      {b.pages.map((p, i) => {
        const cat = p.kind === 'draw' ? 'draw' : p.kind === 'guess' ? 'guess' : null;
        const can = vote && cat && !p.empty && !p.left;
        const mine = p.by === h.me;
        const picked = cat === 'draw' ? same(vote?.myDraw ?? null, i) : cat === 'guess' ? same(vote?.myGuess ?? null, i) : false;
        return (
          <View key={i} style={{ gap: 6, alignItems: 'center' }}>
            <PageCard page={p} who={who} size={p.kind === 'draw' ? Math.round(w * 0.72) : w} frame={picked ? C.yellow : undefined} small />
            {can && !mine ? (
              <Btn
                size="sm"
                icon={picked ? 'starFull' : 'star'}
                label={picked ? (cat === 'draw' ? 'صوتك: أفضل رسمة' : 'صوتك: أطرف تخمين') : cat === 'draw' ? 'أفضل رسمة' : 'أطرف تخمين'}
                ghost={!picked}
                disabled={vote.locked}
                onPress={() => h.act('vote', { cat, book: b.index, page: i })}
              />
            ) : null}
            {i < b.pages.length - 1 ? <Icon name="down" size={16} color={C.dim} /> : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  textPage: { alignSelf: 'center', backgroundColor: C.surface, borderRadius: 18, borderWidth: 2, paddingHorizontal: 14, gap: 6, alignItems: 'center' },
  tab: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
