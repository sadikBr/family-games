/**
 * Desktop layout (the web app on a computer). The app is drawn for phones: one column, at most 560 px.
 * In a browser window at least DESKTOP_MIN wide, two other widths take over:
 *
 * - «page» screens (home, the games list, a group) get a wide container (PAGE_MAX) with grids instead of
 *   sideways shelves;
 * - «stage» screens (a room: the lobby and every game) keep the phone layout but larger: a column sized
 *   to the window (taller windows → wider column, STAGE_MAX at most), and the games' own size caps grow
 *   by the same factor (`dk`), so boards, tables and cards fill it.
 *
 * Phones and tablets in an app are untouched (the factor is 1 there).
 */
import { Dimensions, Platform, useWindowDimensions } from 'react-native';

export const DESKTOP_MIN = 900;
/** the phone column */
export const PHONE_MAX = 560;
/** «page» screens on a computer */
export const PAGE_MAX = 1180;
/** «stage» screens: the column grows with the window, up to this */
export const STAGE_MAX = 860;

export type ScreenWidth = 'phone' | 'page' | 'stage';

export const isDesktopSize = (width: number) => Platform.OS === 'web' && width >= DESKTOP_MIN;

/** A room's side rails on a computer (src/desktop/room.web.tsx): one below WIDE_MIN, two from it. */
export const RAIL = 300;
export const WIDE_MIN = 1280;
export const railsWidth = (width: number) => (width >= WIDE_MIN ? 2 * RAIL : RAIL);

/**
 * The stage column on a computer: what the rails leave, about 78% of the window's height at most (a
 * square board fits), up to 860 px.
 */
export function stageWidth(width: number, height: number): number {
  if (!isDesktopSize(width)) return Math.min(width - 32, PHONE_MAX);
  const room = width - railsWidth(width) - 48;
  return Math.round(Math.max(Math.min(PHONE_MAX, room), Math.min(room, height * 0.78, STAGE_MAX)));
}

/** The content width of a screen of this kind. */
export function columnWidth(kind: ScreenWidth, width: number, height: number): number {
  if (!isDesktopSize(width) || kind === 'phone') return Math.min(width - 32, PHONE_MAX);
  if (kind === 'page') return Math.min(width - 64, PAGE_MAX);
  return stageWidth(width, height);
}

/** How much larger than on a phone the stage is (1 on phones). */
export function stageFactor(width: number, height: number): number {
  return isDesktopSize(width) ? stageWidth(width, height) / PHONE_MAX : 1;
}

/**
 * A game's size cap, grown with the stage on a computer: `Math.min(width - 32, dk(480))`. Reads the window
 * directly, so it suits the games' existing `useWindowDimensions()` (they re-render when it changes).
 */
export function dk(px: number): number {
  const { width, height } = Dimensions.get('window');
  return Math.round(px * stageFactor(width, height));
}

/** Is this a computer-sized browser window? */
export function useDesktop(): boolean {
  const { width } = useWindowDimensions();
  return isDesktopSize(width);
}
