/** Phones: no desktop home (home.web.tsx draws it in a computer-sized browser window). */
export interface DesktopHomeProps {
  mode: 'home' | 'catalog';
  group?: string;
  search?: boolean;
}

export function DesktopHome(_props: DesktopHomeProps) {
  return null;
}
