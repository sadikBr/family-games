import {
  BalooBhaijaan2_500Medium,
  BalooBhaijaan2_700Bold,
  BalooBhaijaan2_800ExtraBold,
} from '@expo-google-fonts/baloo-bhaijaan-2';
import { AmiriQuran_400Regular } from '@expo-google-fonts/amiri-quran';
import { Lalezar_400Regular } from '@expo-google-fonts/lalezar';
import { useFonts } from 'expo-font';
import { DarkTheme, Stack, ThemeProvider, router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { GroupCallSheet, PushPrompt } from '@/groups/call-sheet';
import { client } from '@/lib/client';
import { loadProfile } from '@/lib/profile';
import { initPush } from '@/lib/push';
import { loadServerOverride } from '@/lib/server-url';
import { initSfx } from '@/lib/sfx';
import { initSpeech } from '@/lib/speech';
import { C } from '@/theme';
import { Toast } from '@/ui/controls';

SplashScreen.preventAutoHideAsync().catch(() => {});

const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: C.bg, card: C.bg, primary: C.yellow },
};

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Lalezar_400Regular,
    AmiriQuran_400Regular,
    BalooBhaijaan2_500Medium,
    BalooBhaijaan2_700Bold,
    BalooBhaijaan2_800ExtraBold,
  });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    Promise.all([loadProfile(), loadServerOverride(), client.init(), initSfx(), initSpeech()]).finally(() => {
      setReady(true);
      // connected while the app is open: the family sees who is here, and group calls arrive
      client.start();
    });
  }, []);

  const done = (fontsLoaded || !!fontError) && ready;
  useEffect(() => {
    if (done) SplashScreen.hideAsync().catch(() => {});
  }, [done]);

  // a tapped group-call notification: straight into that room
  useEffect(() => {
    if (!done) return;
    return initPush((code) => {
      client.joinRoom(code);
      router.push('/room');
    });
  }, [done]);

  if (!done) return <View style={styles.root} />;

  return (
    <ThemeProvider value={theme}>
      <View style={styles.root}>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: C.bg },
            animation: 'fade_from_bottom',
          }}>
          <Stack.Screen name="profile" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        </Stack>
        <Toast />
        <GroupCallSheet />
        <PushPrompt />
      </View>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, direction: 'rtl' },
});
