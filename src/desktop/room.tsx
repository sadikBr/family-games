/** Phones: no rails around the room (room.web.tsx adds them in a computer-sized browser window). */
import type { ReactNode } from 'react';

import type { RoomView } from '@/shared/protocol';

export interface DesktopRoomProps {
  room: RoomView;
  bare: boolean;
  onLeave: () => void;
  onMenu: () => void;
  children: ReactNode;
}

export function DesktopRoom({ children }: DesktopRoomProps) {
  return children;
}
