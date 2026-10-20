/**
 * A game's short sheet, opened by a tap on its card: the emblem, the name and what it is, how many
 * play, the first steps of how to play (all of them on request), the favourite star and «ابدأ».
 */
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GameArt } from '@/art/game-art';
import { Icon } from '@/art/icons';
import { GAMES } from '@/games/meta';
import { toggleFavorite, useGamePrefs } from '@/lib/prefs';
import { haptic } from '@/lib/sfx';
import { BOT_GAMES, type GameId } from '@/shared/protocol';
import { C, F, alpha, shade } from '@/theme';
import { Row } from '@/ui/bits';
import { Btn, IconBtn } from '@/ui/btn';
import { Txt, num } from '@/ui/txt';

import { playersLabel, startGame } from './games';

const SHORT_STEPS = 3;

export function GameSheet({ id, onClose }: { id: GameId | null; onClose: () => void }) {
  // keep the last game on screen while the sheet fades out
  const [shown, setShown] = useState<GameId | null>(id);
  const [allSteps, setAllSteps] = useState(false);
  if (id && id !== shown) {
    setShown(id);
    setAllSteps(false);
  }
  const { favorites } = useGamePrefs();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const game = shown ? GAMES[shown] : null;
  if (!game) return null;
  const fav = favorites.includes(game.id);
  const steps = allSteps ? game.howTo : game.howTo.slice(0, SHORT_STEPS);
  const more = game.howTo.length - SHORT_STEPS;

  return (
    <Modal visible={!!id} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="إغلاق" />
        <View style={[styles.sheet, { maxHeight: height - insets.top - 24, paddingBottom: 16 + insets.bottom }]}>
          <Row style={styles.top}>
            <IconBtn
              icon={fav ? 'starFull' : 'star'}
              size={40}
              iconColor={fav ? C.yellow : C.text}
              onPress={() => toggleFavorite(game.id)}
              label={fav ? `أزل ${game.title} من المفضلة` : `أضف ${game.title} إلى المفضلة`}
            />
            <View style={{ flex: 1 }} />
            <IconBtn icon="close" size={40} onPress={onClose} label="إغلاق" />
          </Row>

          <View style={[styles.stage, { backgroundColor: shade(game.color, -0.45), borderColor: alpha(game.color, 0.6) }]}>
            <GameArt id={game.id} size={92} />
          </View>
          <Txt v="title" center numberOfLines={1}>
            {game.title}
          </Txt>
          <Txt v="small" center color={C.muted}>
            {game.tagline}
          </Txt>
          <Row gap={6} center wrap style={{ marginTop: 2 }}>
            <View style={styles.pill}>
              <Icon name="users" size={13} color={C.muted} />
              <Txt v="tiny" color={C.text}>
                عدد اللاعبين: {playersLabel(game)}
              </Txt>
            </View>
            {BOT_GAMES.includes(game.id) ? (
              <View style={styles.pill}>
                <Icon name="bot" size={13} color={C.muted} />
                <Txt v="tiny" color={C.text}>
                  يمكن اللعب مع البوتات
                </Txt>
              </View>
            ) : null}
          </Row>

          <ScrollView style={styles.howTo} contentContainerStyle={{ gap: 6, paddingVertical: 2 }} showsVerticalScrollIndicator={false}>
            <Txt v="tiny" color={C.yellow}>
              طريقة اللعب
            </Txt>
            {steps.map((s, i) => (
              <Row key={i} gap={8} style={{ alignItems: 'flex-start' }}>
                <View style={styles.stepNo}>
                  <Txt v="tiny" color={C.muted} style={{ fontSize: 11, lineHeight: 16 }}>
                    {num(i + 1)}
                  </Txt>
                </View>
                <Txt v="small" style={{ flex: 1 }}>
                  {s}
                </Txt>
              </Row>
            ))}
            {more > 0 ? (
              <Pressable
                onPress={() => {
                  haptic.tap();
                  setAllSteps(!allSteps);
                }}
                accessibilityRole="button"
                hitSlop={6}
                style={({ pressed }) => [styles.moreBtn, pressed && { opacity: 0.6 }]}>
                <Txt v="small" color={C.yellow} style={{ fontFamily: F.bold }}>
                  {allSteps ? 'أقل' : 'كل القواعد'}
                </Txt>
                <Icon name="down" size={14} color={C.yellow} />
              </Pressable>
            ) : null}
          </ScrollView>

          <Btn
            size="xl"
            icon="play"
            label="ابدأ"
            onPress={() => {
              const g = game.id;
              onClose();
              startGame(g);
            }}
          />
          <Txt v="tiny" center color={C.dim}>
            تُفتح غرفة، ثم يدخلها الآخرون برمزها من هواتفهم
          </Txt>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', backgroundColor: 'rgba(8,9,24,0.72)', direction: 'rtl' },
  sheet: {
    width: '100%',
    maxWidth: 560,
    gap: 6,
    paddingHorizontal: 18,
    paddingTop: 12,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: C.bg2,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: C.borderStrong,
    overflow: 'hidden',
  },
  top: { marginBottom: -34 },
  stage: { alignSelf: 'center', width: 116, height: 116, borderRadius: 58, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, height: 26, borderRadius: 13, backgroundColor: C.surface },
  howTo: { flexShrink: 1, marginTop: 6, marginBottom: 6, padding: 12, borderRadius: 18, backgroundColor: alpha('#000000', 0.18) },
  stepNo: { width: 20, height: 20, borderRadius: 10, marginTop: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface },
  moreBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', minHeight: 32 },
});
