/**
 * The desktop web app's frame: the style sheet, a sidebar (brand, pages, categories, the code, groups, me)
 * and the page beside it. Rendered around the navigator on the web at every size so the navigator never
 * remounts; the sidebar only shows in a computer-sized window and outside a room (a room has its own rails).
 */
import { router, usePathname } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { useWindowDimensions } from 'react-native';

import { HeroArt } from '@/art/game-art';
import { Icon, type IconName } from '@/art/icons';
import { GAMES, GAME_GROUPS, GAME_ORDER } from '@/games/meta';
import { GroupsSection } from '@/groups/group-card';
import { CodeSheet } from '@/home/code-sheet';
import { StatusSheet } from '@/home/status-sheet';
import { client, useClient } from '@/lib/client';
import { useGamePrefs } from '@/lib/prefs';
import { useProfile } from '@/lib/profile';
import { isMuted, onMuteChange, setMuted } from '@/lib/sfx';
import { useMyStatus } from '@/lib/status';
import { STATUS_LABEL } from '@/shared/status';
import { C } from '@/theme';
import { Avatar } from '@/ui/bits';
import { isDesktopSize } from '@/ui/layout';
import { StatusDot } from '@/ui/status';
import { num } from '@/ui/txt';

import { DESKTOP_CSS } from './css';
import { scrollToSection, useActiveSection } from './store';

export function DesktopFrame({ children }: { children: ReactNode }) {
  const { width } = useWindowDimensions();
  const path = usePathname();
  const side = isDesktopSize(width) && !path.startsWith('/room');
  return (
    <div className="dk-app" data-side={side ? 'on' : 'off'}>
      <style>{DESKTOP_CSS}</style>
      <Sidebar path={path} shown={side} />
      <div className="dk-main">{children}</div>
    </div>
  );
}

function NavItem({ icon, label, on, count, onClick }: { icon: IconName; label: string; on?: boolean; count?: number; onClick: () => void }) {
  return (
    <button className="dk-nav-item" data-on={on ? '1' : '0'} onClick={onClick} aria-current={on ? 'page' : undefined}>
      <Icon name={icon} size={19} color={on ? C.yellow : C.muted} />
      {label}
      {count !== undefined ? <span className="dk-nav-count">{num(count)}</span> : null}
    </button>
  );
}

function Sidebar({ path, shown }: { path: string; shown: boolean }) {
  const { profile } = useProfile();
  const { effective } = useMyStatus();
  const { lastCode, room } = useClient();
  const { favorites } = useGamePrefs();
  const active = useActiveSection();
  const [code, setCode] = useState(false);
  const [status, setStatus] = useState(false);
  const [muted, setMutedState] = useState(isMuted());
  useEffect(() => onMuteChange(setMutedState), []);
  if (!shown) return <aside className="dk-side" />;

  const home = path === '/' || path === '';
  const favIds = favorites.filter((id) => GAMES[id]);
  const goSection = (key: string) => {
    if (home && scrollToSection(key)) return;
    router.navigate({ pathname: '/games', params: { group: key } });
  };

  return (
    <aside className="dk-side" aria-label="القائمة">
      <button className="dk-brand" onClick={() => router.navigate('/')} aria-label="ألعاب العائلة — الرئيسية">
        <HeroArt width={62} />
        <div style={{ textAlign: 'start' }}>
          <div className="dk-brand-name">ألعاب العائلة</div>
          <div className="dk-brand-sub">{num(GAME_ORDER.length)} لعبة لسهرات العائلة</div>
        </div>
      </button>

      <nav className="dk-nav">
        <NavItem icon="home" label="الرئيسية" on={home} onClick={() => router.navigate('/')} />
        <NavItem icon="cards" label="كل الألعاب" on={path === '/games'} onClick={() => router.navigate('/games')} />
        <NavItem icon="user" label="ملفي" on={path === '/profile'} onClick={() => router.navigate('/profile')} />
      </nav>

      <div className="dk-side-label">الفئات</div>
      <nav className="dk-nav">
        {favIds.length ? <NavItem icon="starFull" label="المفضلة" count={favIds.length} on={home && active === -2} onClick={() => goSection('fav')} /> : null}
        {GAME_GROUPS.map((g, i) => (
          <NavItem key={g.title} icon={g.icon} label={g.short} count={g.games.length} on={home && active === i} onClick={() => goSection(String(i))} />
        ))}
      </nav>

      <button className="dk-code-btn" onClick={() => setCode(true)}>
        <Icon name="key" size={20} color={C.yellow} />
        <span style={{ textAlign: 'start' }}>
          ادخل برمز
          <small>رمز غرفة أو مجموعة</small>
        </span>
      </button>
      {lastCode && !room ? (
        <button
          className="dk-back-room"
          onClick={() => {
            client.joinRoom(lastCode);
            router.push('/room');
          }}>
          <Icon name="door" size={18} color={C.green} />
          ارجع إلى الغرفة {num(lastCode)}
        </button>
      ) : null}

      <div>
        <GroupsSection />
      </div>

      <div className="dk-me">
        <button className="dk-me-who" onClick={() => setStatus(true)} aria-label="حالتي وملفي">
          <span style={{ position: 'relative', display: 'inline-flex' }}>
            <Avatar player={profile} size={40} dim={effective === 'invisible'} />
            <span style={{ position: 'absolute', bottom: -2, insetInlineStart: -2 }}>
              <StatusDot status={effective} size={13} ring="#1A1D42" />
            </span>
          </span>
          <span style={{ minWidth: 0 }}>
            <div className="dk-me-name">{profile.name || 'لاعب'}</div>
            <div className="dk-me-status">{STATUS_LABEL[effective]}</div>
          </span>
        </button>
        <button className="dk-icon-btn" onClick={() => setMuted(!muted)} aria-label={muted ? 'شغّل الصوت' : 'اكتم الصوت'}>
          <Icon name={muted ? 'mute' : 'sound'} size={19} color={C.muted} />
        </button>
      </div>

      <CodeSheet visible={code} onClose={() => setCode(false)} />
      <StatusSheet visible={status} onClose={() => setStatus(false)} />
    </aside>
  );
}
