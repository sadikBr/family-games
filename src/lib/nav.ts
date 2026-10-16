import { router } from 'expo-router';

/** Go back if there is a previous screen, otherwise go home (e.g. a screen opened from a link or after a restart). */
export function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}
