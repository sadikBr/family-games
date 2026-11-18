/**
 * A room on a computer (web): the stage in the middle (the lobby or the game, the phone layout made larger,
 * see src/ui/layout.ts) between two rails.
 * - the room rail: the game, the room's code (copy it, or the link that opens the join screen), who is
 *   around the table (whose turn it is, host, bots, offline), voice, reactions, sound, the room's
 *   settings and «مغادرة الغرفة»;
 * - the rules rail (wide windows): how to play this game, and what just happened (the game's last calls).
 * A full-screen game (the pool table) hides both. On a narrower screen this is just the phone room.
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { useWindowDimensions } from 'react-native';

import { GameArt } from '@/art/game-art';
import { Icon } from '@/art/icons';
import { GAMES } from '@/games/meta';
import { ReactionButton } from '@/games/reactions';
import { VoiceButton } from '@/games/voice-ui';
import { isMuted, onMuteChange, setMuted } from '@/lib/sfx';
import type { PlayerPublic, RoomView, Said } from '@/shared/protocol';
import { C } from '@/theme';
import { Avatar } from '@/ui/bits';
import { isDesktopSize } from '@/ui/layout';
import { num } from '@/ui/txt';

export interface DesktopRoomProps {
  room: RoomView;
  bare: boolean;
  onLeave: () => void;
  onMenu: () => void;
  children: ReactNode;
}

const cvar = (color: string) => ({ ['--c' as string]: color }) as CSSProperties;

export function DesktopRoom({ room, bare, onLeave, onMenu, children }: DesktopRoomProps) {
  const { width } = useWindowDimensions();
  if (!isDesktopSize(width)) return children;
  return (
    <div className="dk-room">
      {bare ? null : <RoomRail room={room} onLeave={onLeave} onMenu={onMenu} />}
      <div className="dk-room-stage">{children}</div>
      {bare ? null : <RulesRail room={room} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The room rail                                                       */
/* ------------------------------------------------------------------ */

function playerSub(room: RoomView, p: PlayerPublic): string {
  if (p.auto) return 'غير متصل — البوت يلعب عنه';
  if (!p.connected) return 'غير متصل';
  if (p.bot) return 'بوت';
  if (p.id === room.hostId) return 'المضيف';
  return 'متصل';
}

function RoomRail({ room, onLeave, onMenu }: { room: RoomView; onLeave: () => void; onMenu: () => void }) {
  const meta = GAMES[room.game];
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const [muted, setMutedState] = useState(isMuted());
  useEffect(() => onMuteChange(setMutedState), []);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(null), 1600);
    return () => clearTimeout(t);
  }, [copied]);
  const copy = (what: 'code' | 'link') => {
    const text = what === 'code' ? room.code : `${window.location.origin}/join?code=${room.code}`;
    navigator.clipboard?.writeText(text).then(
      () => setCopied(what),
      () => {},
    );
  };
  const playing = room.status === 'playing';
  const tour = room.tournament && room.tournament.stage !== 'setup';
  const turn = new Set(room.turn ?? []);
  return (
    <aside className="dk-rail dk-rail-start" aria-label="الغرفة">
      <div className="dk-rail-game" style={cvar(meta.color)}>
        <GameArt id={room.game} size={58} />
        <div style={{ minWidth: 0 }}>
          <div className="dk-rail-title">{meta.title}</div>
          <div className="dk-rail-sub">{tour ? 'بطولة جارية' : playing ? 'اللعب جارٍ' : 'غرفة الانتظار'}</div>
        </div>
      </div>

      <div className="dk-code-card">
        <span className="dk-code-label">رمز الغرفة — يدخل به الآخرون من هواتفهم</span>
        <div className="dk-code">{room.code}</div>
        <div className="dk-code-actions">
          <button className="dk-small-btn" data-done={copied === 'code' ? '1' : '0'} onClick={() => copy('code')}>
            <Icon name={copied === 'code' ? 'check' : 'key'} size={15} color={copied === 'code' ? C.green : C.text} />
            {copied === 'code' ? 'نُسخ الرمز' : 'انسخ الرمز'}
          </button>
          <button className="dk-small-btn" data-done={copied === 'link' ? '1' : '0'} onClick={() => copy('link')}>
            <Icon name={copied === 'link' ? 'check' : 'share'} size={15} color={copied === 'link' ? C.green : C.text} />
            {copied === 'link' ? 'نُسخ الرابط' : 'انسخ الرابط'}
          </button>
        </div>
      </div>

      <div className="dk-rail-head">
        <Icon name="users" size={16} color={C.muted} />
        حول الطاولة
        <span>{num(room.players.length)}</span>
      </div>
      <div className="dk-players">
        {room.players.map((p) => (
          <div key={p.id} className="dk-player" data-turn={playing && turn.has(p.id) ? '1' : '0'}>
            <Avatar player={p} size={36} crown={p.id === room.hostId} dim={!p.connected && !p.bot} />
            <div style={{ minWidth: 0 }}>
              <div className="dk-player-name">
                {p.name}
                {p.id === room.me ? ' (أنت)' : ''}
              </div>
              <div className="dk-player-sub">{playerSub(room, p)}</div>
            </div>
            {playing && turn.has(p.id) ? <span className="dk-turn-tag">الدور</span> : null}
          </div>
        ))}
      </div>

      <div className="dk-rail-tools">
        <VoiceButton size={40} />
        <ReactionButton size={40} />
        <button className="dk-icon-btn" style={{ width: 40, height: 40, borderRadius: 20 }} onClick={() => setMuted(!muted)} aria-label={muted ? 'شغّل الصوت' : 'اكتم الصوت'} title={muted ? 'الصوت مطفأ' : 'الصوت'}>
          <Icon name={muted ? 'mute' : 'sound'} size={20} color={C.text} />
        </button>
        <button className="dk-small-btn" onClick={onMenu} title="سرعة اللعب، البوتات، اللاعبون">
          <Icon name="sliders" size={15} color={C.text} />
          إعدادات الغرفة
        </button>
      </div>

      <button className="dk-leave" onClick={onLeave}>
        <Icon name="door" size={17} color="#F3A3B0" />
        مغادرة الغرفة
      </button>
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/* The rules rail                                                      */
/* ------------------------------------------------------------------ */

function RulesRail({ room }: { room: RoomView }) {
  const meta = GAMES[room.game];
  const steps = meta.variant?.(room.settings)?.howTo ?? meta.howTo;
  // the game's last calls, newest first (kept on this screen only)
  const [feed, setFeed] = useState<Said[]>([]);
  const [seen, setSeen] = useState<number | null>(null);
  const said = room.said;
  if (said && said.text && said.id !== seen) {
    setSeen(said.id);
    setFeed((f) => [said, ...f.filter((x) => x.id !== said.id)].slice(0, 8));
  }
  const by = (id?: string) => room.players.find((p) => p.id === id);
  return (
    <aside className="dk-rail dk-rail-end" aria-label="كيف نلعب">
      {room.status === 'playing' && feed.length ? (
        <>
          <div className="dk-rail-head">
            <Icon name="bell" size={16} color={C.muted} />
            ما يجري
          </div>
          <div className="dk-feed" aria-live="polite">
            {feed.map((s) => {
              const p = by(s.by);
              return (
                <div key={s.id} className="dk-feed-item">
                  {p ? <Avatar player={p} size={22} /> : <Icon name="sparkle" size={16} color={C.yellow} />}
                  <span>{s.text}</span>
                </div>
              );
            })}
          </div>
        </>
      ) : null}
      <div className="dk-rail-head">
        <Icon name="book" size={16} color={C.muted} />
        كيف نلعب «{meta.title}»؟
      </div>
      <ol className="dk-steps">
        {steps.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ol>
    </aside>
  );
}

