/**
 * Voice chat: the ICE servers phones use to find a path to each other.
 *
 * Phones on the same Wi-Fi, or on most home networks, connect directly with the help of a STUN
 * server. Some mobile networks block that; then the sound has to go through a TURN relay. If the
 * server has a Cloudflare Realtime TURN key (free up to 1,000 GB a month), it hands out short-lived
 * relay credentials:
 *   CF_TURN_KEY_ID     — the TURN key id (Cloudflare dashboard → Realtime → TURN)
 *   CF_TURN_API_TOKEN  — that key's API token
 * Without them, voice still works wherever a direct connection is possible.
 */
import type { IceServer } from '../src/shared/protocol';

const STUN: IceServer[] = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }];
const TTL_S = 24 * 3600;

let cached: { servers: IceServer[]; until: number } | null = null;
let pending: Promise<IceServer[]> | null = null;

async function fetchTurn(keyId: string, token: string): Promise<IceServer[]> {
  const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate-ice-servers`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ttl: TTL_S }),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`TURN credentials: HTTP ${res.status}`);
  const body = (await res.json()) as { iceServers?: IceServer | IceServer[] };
  const list = Array.isArray(body.iceServers) ? body.iceServers : body.iceServers ? [body.iceServers] : [];
  // port 53 URLs time out on many networks; drop them
  return list
    .map((s) => ({ ...s, urls: (Array.isArray(s.urls) ? s.urls : [s.urls]).filter((u) => !/:53(\?|$)/.test(u)) }))
    .filter((s) => s.urls.length);
}

/** STUN always; Cloudflare TURN too when configured (cached for half the credential lifetime). */
export async function iceServers(): Promise<IceServer[]> {
  const keyId = process.env.CF_TURN_KEY_ID ?? process.env.TURN_KEY_ID;
  const token = process.env.CF_TURN_API_TOKEN ?? process.env.TURN_KEY_API_TOKEN;
  if (!keyId || !token) return STUN;
  if (cached && Date.now() < cached.until) return cached.servers;
  pending ??= fetchTurn(keyId, token)
    .then((turn) => {
      const servers = [...STUN, ...turn.filter((s) => s.username)];
      cached = { servers, until: Date.now() + (TTL_S * 1000) / 2 };
      return servers;
    })
    .catch((e) => {
      console.warn('voice: no TURN relay —', String(e));
      cached = { servers: STUN, until: Date.now() + 60_000 }; // try again in a minute
      return STUN;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

/** Keep relayed WebRTC messages small and well-formed. */
export function cleanSignal(data: unknown): object | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  let ok = false;
  if (d.description && typeof d.description === 'object') {
    const desc = d.description as Record<string, unknown>;
    ok = (desc.type === 'offer' || desc.type === 'answer') && typeof desc.sdp === 'string' && desc.sdp.length < 20_000;
  } else if (d.candidate && typeof d.candidate === 'object') ok = JSON.stringify(d.candidate).length < 2_000;
  else if (d.restart === true) ok = true;
  return ok ? d : null;
}
