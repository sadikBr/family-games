/** Phones: no desktop frame (the web version, frame.web.tsx, adds the sidebar on a computer). */
import type { ReactNode } from 'react';

export function DesktopFrame({ children }: { children: ReactNode }) {
  return children;
}
