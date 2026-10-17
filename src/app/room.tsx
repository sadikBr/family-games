import { useKeepAwake } from 'expo-keep-awake';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';

import { GameArt } from '@/art/game-art';
import { GameView } from '@/games/game-view';
import { Lobby } from '@/games/lobby';
import { TurnBar } from '@/games/turn-bar';
import { VoiceButton, VoiceStrip } from '@/games/voice-ui';
import { RoomMenu, shareRoom } from '@/games/room-menu';
import { GAMES } from '@/games/meta';
import { client, useClient } from '@/lib/client';
import { goBack } from '@/lib/nav';
import { notePlayed } from '@/lib/prefs';
import { isRemoteServer } from '@/lib/server-url';
import { alertTurn, playFx } from '@/lib/sfx';
import { C } from '@/theme';
import { Card, IconBubble, Pill, Row } from '@/ui/bits';
import { Btn, IconBtn } from '@/ui/btn';
import { ConfirmModal, ConnectionBanner, Header } from '@/ui/controls';
import { Screen } from '@/ui/screen';
import { Txt } from '@/ui/txt';

function Connecting() {
  const { status, url } = useClient();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 4000);
    return () => clearTimeout(t);
  }, []);
  return (
    <Screen header={<Header onBack={goBack} />} scroll={false}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <IconBubble icon={slow && status !== 'online' ? 'wifiOff' : 'door'} size={72} iconColor={C.yellow} />
        <Txt v="title">جارٍ الدخول…</Txt>
        {slow && status !== 'online' ? (
          <Card style={{ gap: 6 }}>
            <Txt v="bold" center>
              {isRemoteServer(url) ? 'جارٍ إيقاظ الخادم…' : 'لا يمكن الوصول إلى الخادم'}
            </Txt>
            <Txt v="small" center color={C.muted}>
              {isRemoteServer(url)
                ? 'الخادم يستيقظ بعد فترة راحة — قد يستغرق ذلك دقيقة. تأكد أيضاً من اتصال الهاتف بالإنترنت.'
                : 'تأكد أن الخادم يعمل على الحاسوب (bun run server) وأن الهاتف متصل بشبكة الواي فاي نفسها.'}
            </Txt>
            <Txt v="tiny" center color={C.dim} style={{ writingDirection: 'ltr' }}>
              {url}
            </Txt>
            <Btn size="sm" label="إعدادات الخادم" icon="sliders" ghost onPress={() => router.push('/profile')} />
          </Card>
        ) : null}
      </View>
    </Screen>
  );
}

export default function RoomScreen() {
  useKeepAwake();
  const { width } = useWindowDimensions();
  const { room, error } = useClient();
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmLobby, setConfirmLobby] = useState(false);
  const [menu, setMenu] = useState(false);
  const [staleError] = useState(() => client.snap.error?.id);
  const lastFx = useRef<number | null>(null);
  const fx = room?.fx;
  const me = room?.me;

  // sounds & vibration for game events
  useEffect(() => {
    if (!fx || !me) return;
    if (lastFx.current === null) {
      lastFx.current = fx.id;
      return;
    }
    if (fx.id !== lastFx.current) {
      lastFx.current = fx.id;
      playFx(fx.kind, me, fx.target);
    }
  }, [fx, me]);

  // «دورك!»: chime + buzz when the game starts waiting for me
  const myTurn = !!room?.myTurn;
  const wasMyTurn = useRef(false);
  useEffect(() => {
    if (myTurn && !wasMyTurn.current) alertTurn();
    wasMyTurn.current = myTurn;
  }, [myTurn]);

  // a game that really started goes to «لعبتموها مؤخراً» on the home screen
  const startedGame = room?.status === 'playing' ? room.game : null;
  useEffect(() => {
    if (startedGame) notePlayed(startedGame);
  }, [startedGame]);

  // room vanished (wrong code, kicked…) → back home
  useEffect(() => {
    if (!room && (error?.code === 'no_room' || error?.code === 'kicked') && error.id !== staleError) router.replace('/');
  }, [room, error, staleError]);

  // kicked: we had a room and lost it without leaving
  const hadRoom = useRef(false);
  useEffect(() => {
    if (room) hadRoom.current = true;
    else if (hadRoom.current) router.replace('/');
  }, [room]);

  if (!room) return <Connecting />;

  const meta = GAMES[room.game];
  const playing = room.status === 'playing';
  const night = room.game === 'werewolf' && playing;

  return (
    <Screen
      bg={night ? C.night : C.bg}
      scrollKey={`${room.status}|${room.game}`}
      header={
        <>
          <Header
            onBack={() => setConfirmLeave(true)}
            title={
              <Row gap={8} style={{ maxWidth: '100%' }}>
                {/* on narrow phones the title needs the room more than the emblem does */}
                {playing && width >= 410 ? <GameArt id={room.game} size={34} /> : null}
                <Txt v="h2" numberOfLines={1} style={{ flexShrink: 1 }} size={width < 360 ? 17 : undefined}>
                  {playing ? meta.title : 'غرفة الانتظار'}
                </Txt>
              </Row>
            }
            right={
              <Row gap={6}>
                {/* narrow phones: the code moves to the room menu to leave space for the mic */}
                {width >= 360 ? (
                  <Pressable onPress={() => shareRoom(room)} accessibilityLabel={`رمز الغرفة ${room.code} — شارك`} hitSlop={6}>
                    <Pill label={room.code} icon="key" />
                  </Pressable>
                ) : null}
                <VoiceButton />
                <IconBtn icon="users" size={38} onPress={() => setMenu(true)} label="قائمة الغرفة" />
              </Row>
            }
          />
          <ConnectionBanner />
          <VoiceStrip room={room} />
          <TurnBar room={room} />
        </>
      }>
      {playing && room.view ? <GameView room={room} view={room.view} /> : <Lobby room={room} />}

      <RoomMenu room={room} visible={menu} onClose={() => setMenu(false)} onLobby={() => setConfirmLobby(true)} />

      <ConfirmModal
        visible={confirmLeave}
        icon="door"
        title="مغادرة الغرفة؟"
        message="يمكنك الرجوع لاحقاً بنفس الرمز"
        confirmLabel="غادر"
        cancelLabel="ابقَ"
        danger
        onCancel={() => setConfirmLeave(false)}
        onConfirm={() => {
          setConfirmLeave(false);
          hadRoom.current = false;
          client.leaveRoom();
          goBack();
        }}
      />
      <ConfirmModal
        visible={confirmLobby}
        icon="home"
        title="إنهاء اللعبة؟"
        message="سيعود الجميع إلى غرفة الانتظار لاختيار لعبة أخرى"
        confirmLabel="نعم"
        cancelLabel="لا"
        onCancel={() => setConfirmLobby(false)}
        onConfirm={() => {
          setConfirmLobby(false);
          client.roomAction({ type: 'lobby' });
        }}
      />
    </Screen>
  );
}
