/**
 * Small pieces shared by the word/code races («كلمة السر»، «كلمة قرآنية»، «فك الشيفرة»، «شبكة الكلمات»).
 */
import { useEffect, useState } from 'react';

import { useClient } from '@/lib/client';

/**
 * True for a moment after the server refuses a move (a word not in the dictionary…): the row being
 * typed lights up in red instead of shaking. An error that was already there when the screen opened
 * doesn't count.
 */
export function useRefusedFlash(ms = 900): boolean {
  const { error } = useClient();
  const id = error?.id ?? null;
  const [seen, setSeen] = useState(id);
  useEffect(() => {
    if (id === null || id === seen) return;
    const t = setTimeout(() => setSeen(id), ms);
    return () => clearTimeout(t);
  }, [id, seen, ms]);
  return id !== null && id !== seen;
}
