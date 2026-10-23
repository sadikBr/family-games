import { useKeepAwake } from 'expo-keep-awake';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';

import { GameArt } from '@/art/game-art';
import { GameView } from '@/games/game-view';
import { Lobby, LobbyFooter } from '@/games/lobby';
import { TurnBar } from '@/games/turn-bar';
import { VoiceButton, VoiceStrip } from '@/games/voice-ui';
import { ReactionButton, ReactionLayer } from '@/games/reactions';
import { RoomMenu, shareRoom } from '@/games/room-menu';
import { EndTournamentModal, TournamentChip, TournamentFallback, TournamentFooter, TournamentScreen, TournamentSlotProvider } from '@/games/tournament';
import { GAMES } from '@/games/meta';
import { client, useClient } from '@/lib/client';
import { goBack } from '@/lib/nav';
import { notePlayed } from '@/lib/prefs';
import { isRemoteServer } from '@/lib/server-url';
import { alertTurn, playFx } from '@/lib/sfx';
import { speak } from '@/lib/speech';
import { C } from '@/theme';
import { Icon } from '@/art/icons';
import { Card, IconBubble, Pill, Row } from '@/ui/bits';
import { Btn, IconBtn } from '@/ui/btn';
import { ConfirmModal, ConnectionBanner, Header } from '@/ui/controls';
import { AccentContext } from '@/ui/accent';
import { ImmersiveContext } from '@/ui/immersive';
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
  const { room, error, lastCode } = useClient();
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmLobby, setConfirmLobby] = useState(false);
  const [menu, setMenu] = useState(false);
  const [staleError] = useState(() => client.snap.error?.id);
  // games' final screens register their tournament actions; without any, the room shows a plain bar
  const [slots, setSlots] = useState(0);
  const registerSlot = useCallback((d: number) => setSlots((n) => n + d), []);
  // a game in full screen (e.g. the pool table): no header around it
  const [immersive, setImmersive] = useState(false);
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

  // «قراءة الأحداث»: read the game's big calls aloud (never one that was already there when the screen opened)
  // (0 = nothing was there: the game's very first call, e.g. a quiz's first question, is read)
  const said = room?.said ?? null;
  const hasRoom = !!room;
  const lastSaid = useRef<number | null>(null);
  useEffect(() => {
    if (!hasRoom) return;
    if (lastSaid.current === null) {
      lastSaid.current = said?.id ?? 0;
      return;
    }
    if (said && said.id !== lastSaid.current) {
      lastSaid.current = said.id;
      if (said.voice) speak(said.voice);
    }
  }, [said, hasRoom]);

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

  // the page was reloaded on the room screen (web): go back into the last room, or home if there is none
  useEffect(() => {
    if (room || !client.coldRoomScreen) return;
    // give the saved room code a moment to load from storage
    const t = setTimeout(() => {
      if (!client.coldRoomScreen) return;
      if (lastCode) client.joinRoom(lastCode);
      else router.replace('/');
    }, 600);
    return () => clearTimeout(t);
  }, [room, lastCode]);

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
  const t = room.tournament ?? null;
  // between the games of a tournament, and its champion: the room shows the tournament, not the game
  const between = !playing && !!t && (t.stage === 'standings' || t.stage === 'final');
  // the header says «البطولة» whenever the waiting room is about the tournament
  const tourHeader = !playing && !!t;
  const inTournament = !!t && t.stage !== 'setup';
  const glow = night ? undefined : between && t?.stage === 'final' ? C.yellow : meta.color;
  const bare = immersive && playing;

  return (
    <AccentContext.Provider value={between && t?.stage === 'final' ? C.yellow : meta.color}>
    <ImmersiveContext.Provider value={setImmersive}>
    <View style={{ flex: 1 }}>
    <Screen
      bg={night ? C.night : C.bg}
      glow={glow}
      bare={bare}
      scrollKey={`${room.status}|${room.game}|${t?.stage ?? ''}`}
      footer={playing ? undefined : between ? <TournamentFooter room={room} /> : <LobbyFooter room={room} />}
      header={
        bare ? (
          <ConnectionBanner />
        ) : (
        <>
          <Header
            onBack={() => setConfirmLeave(true)}
            title={
              tourHeader ? (
                <Row gap={8} style={{ maxWidth: '100%' }}>
                  <Icon name="trophy" size={24} color={C.yellow} />
                  <Txt v="h2" numberOfLines={1} style={{ flexShrink: 1 }} size={width < 360 ? 17 : undefined}>
                    البطولة
                  </Txt>
                </Row>
              ) : (
              <Row gap={8} style={{ maxWidth: '100%' }}>
                {/* the emblem only when the title still fits next to it */}
                {width >= 410 || meta.title.length <= (width >= 360 ? 8 : 6) ? <GameArt id={room.game} size={width >= 410 ? 34 : 28} /> : null}
                <Txt v="h2" numberOfLines={1} style={{ flexShrink: 1 }} size={width < 360 ? 17 : undefined}>
                  {meta.title}
                </Txt>
              </Row>
              )
            }
            right={
              <Row gap={6}>
                {/* the code pill only on wide phones: elsewhere the game's title needs the room (the code
                    is always in the room menu, and big in the lobby) */}
                {width >= 412 ? (
                  <Pressable onPress={() => shareRoom(room)} accessibilityLabel={`رمز الغرفة ${room.code} — شارك`} hitSlop={6}>
                    <Pill label={room.code} icon="key" />
                  </Pressable>
                ) : null}
                {/* «تفاعل»: in the header, so it never covers a game's own controls */}
                <ReactionButton size={width < 360 ? 34 : 38} />
                <VoiceButton size={width < 360 ? 34 : 38} />
                <IconBtn icon="users" size={width < 360 ? 34 : 38} onPress={() => setMenu(true)} label="قائمة الغرفة" />
              </Row>
            }
          />
          <ConnectionBanner />
          <VoiceStrip room={room} />
          <TurnBar room={room} />
          <TournamentChip room={room} />
        </>
        )
      }>
      {playing && room.view ? (
        <TournamentSlotProvider value={registerSlot}>
          <GameView room={room} view={room.view} />
        </TournamentSlotProvider>
      ) : between ? (
        <TournamentScreen room={room} />
      ) : (
        <Lobby room={room} />
      )}
      {playing && t?.stage === 'playing' && t.done && slots === 0 ? <TournamentFallback room={room} /> : null}

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
      <EndTournamentModal visible={confirmLobby && inTournament} onClose={() => setConfirmLobby(false)} />
      <ConfirmModal
        visible={confirmLobby && !inTournament}
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
    {/* reactions: big, over everything in the room (never taking a touch) */}
    <ReactionLayer room={room} />
    </View>
    </ImmersiveContext.Provider>
    </AccentContext.Provider>
  );
}
