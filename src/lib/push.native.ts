/**
 * Push notifications on phones (expo-notifications + the Expo push service).
 *
 * - The server sends a push to members whose app is closed (or who are «بعيد» / «غير مرئي») when
 *   someone in their group presses «لنلعب» — never to «مشغول» members.
 * - Android gets its push token through Firebase (google-services.json, see README «المجموعات»).
 *   If there is no token (permission refused, no Google services, a build without the Firebase file),
 *   getExpoPushTokenAsync throws: we log it once and carry on without push — the in-app invitation
 *   still reaches everyone who has the app open.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import type * as NotificationsModule from 'expo-notifications';
import { AppState, Platform } from 'react-native';

import { client } from './client';
import { askUser } from './push-ask';

const ASKED_KEY = 'fg.pushAsked.v1';
export const CALL_CHANNEL = 'group-calls';

let warned = false;
const handled = new Set<string>();

/**
 * Loaded lazily: Expo Go and APKs built before groups don't have the notifications native module,
 * and a plain import would crash the whole app at start. Without it, push is simply off.
 */
let mod: typeof NotificationsModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  mod = require('expo-notifications') as typeof NotificationsModule;
} catch {
  mod = null;
}
const Notifications = mod!;
const available = mod !== null;

async function ensureChannel() {
  if (!available || Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync(CALL_CHANNEL, {
      name: 'دعوات المجموعات',
      description: 'عندما تبدأ إحدى مجموعاتك اللعب',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 250, 150, 250],
      lightColor: '#F2B33D',
    });
  } catch {}
}

async function registerToken() {
  if (!available) return;
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    client.setPushToken(data);
  } catch (e) {
    if (!warned) {
      warned = true;
      console.log('push notifications are off (no push token):', e instanceof Error ? e.message : e);
    }
  }
}

function handleResponse(res: NotificationsModule.NotificationResponse | null, onCall: (code: string) => void) {
  if (!res) return;
  const id = res.notification.request.identifier;
  if (handled.has(id)) return;
  handled.add(id);
  const data = res.notification.request.content.data as { kind?: unknown; code?: unknown } | undefined;
  if (data?.kind === 'groupCall' && typeof data.code === 'string' && /^\d{4}$/.test(data.code)) onCall(data.code);
  Notifications.clearLastNotificationResponseAsync().catch(() => {});
}

export function initPush(onCall: (code: string) => void): () => void {
  if (!available) return () => {};
  // a partly available module (Expo Go) must never take the app down
  try {
    Notifications.setNotificationHandler({
      handleNotification: async (n) => {
        // the app is open and already shows this invitation (or I'm in that room): no second banner
        // (a «بعيد» or «غير مرئي» phone gets the in-app call and the push — see server/groups.ts)
        const data = n.request.content.data as { kind?: unknown; code?: unknown } | undefined;
        const shown =
          data?.kind === 'groupCall' && AppState.currentState === 'active' && (client.snap.call?.code === data.code || client.snap.room?.code === data.code);
        return { shouldShowBanner: !shown, shouldShowList: !shown, shouldPlaySound: !shown, shouldSetBadge: false };
      },
    });
    ensureChannel().then(async () => {
      try {
        const perm = await Notifications.getPermissionsAsync();
        if (perm.granted) await registerToken();
      } catch {}
    });
    const sub = Notifications.addNotificationResponseReceivedListener((res) => handleResponse(res, onCall));
    // opened from a notification while the app was closed
    Notifications.getLastNotificationResponseAsync()
      .then((res) => handleResponse(res, onCall))
      .catch(() => {});
    return () => sub.remove();
  } catch {
    return () => {};
  }
}

export async function askForPushOnce(): Promise<void> {
  if (!available) return;
  try {
    const perm = await Notifications.getPermissionsAsync();
    if (perm.granted) return registerToken();
    if (!perm.canAskAgain || (await AsyncStorage.getItem(ASKED_KEY))) return;
    await AsyncStorage.setItem(ASKED_KEY, '1');
    if (!(await askUser())) return;
    await ensureChannel(); // Android 13+ shows the system prompt only once a channel exists
    const res = await Notifications.requestPermissionsAsync();
    if (res.granted) await registerToken();
  } catch {}
}
