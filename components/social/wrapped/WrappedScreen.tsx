import { useQuery } from "convex/react";
import { useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { type ComponentRef, useRef, useState } from "react";
import { FlatList, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import Animated from "react-native-reanimated";
import { useSafeAreaFrame, useSafeAreaInsets } from "react-native-safe-area-context";
import { captureRef } from "react-native-view-shot";

import { useSwipeDownToClose } from "@/components/motion/useSwipeDownToClose";
import { Header, Icon, Screen } from "@/components/ui";
import type { Id } from "@/convex/_generated/dataModel";
import { useCurrentLeague } from "@/lib/currentLeague";
import { haptics } from "@/lib/native/haptics";
import { shareImage, shareText } from "@/lib/native/share";
import { colors, font, fontFamily, layout, radius, SCREEN_MARGIN, spacing } from "@/theme";

import { socialApi } from "../contract";
import { leaveScreen } from "../leave";
import { ScreenState } from "../ScreenState";
import { WrappedCard } from "./WrappedCard";
import { cardShareText, indexAfterTap, pageIndexFromOffset, tapClosesStory } from "./wrappedLogic";

const WHITE = colors.background;
const SEGMENT_TRACK = "rgba(255,255,255,0.35)";
const CONTROL_BACKDROP = "rgba(0,0,0,0.45)";

/** The weekly Wrapped: five full-screen story cards with progress segments and tap paging. */
export function WrappedScreen() {
  const params = useLocalSearchParams<{ leagueId?: string; weekNumber?: string }>();
  const currentLeague = useCurrentLeague();
  const leagueId = (params.leagueId as Id<"leagues"> | undefined) ?? currentLeague.leagueId;
  const weekNumber = params.weekNumber ? Number(params.weekNumber) : undefined;
  const wrapped = useQuery(socialApi.wrapped.get, leagueId ? { leagueId, ...(weekNumber === undefined ? {} : { weekNumber }) } : "skip");

  // Story pages follow the app canvas, including its centered web layout.
  const { width, height } = useSafeAreaFrame();
  const insets = useSafeAreaInsets();
  const list = useRef<FlatList>(null);
  // One wrapper view per card, so Share captures just the card without the segments and buttons on top.
  const cardViews = useRef<(ComponentRef<typeof View> | null)[]>([]);
  const [index, setIndex] = useState(0);
  // Stories close with a swipe down; cards page sideways underneath it.
  const swipe = useSwipeDownToClose(leaveScreen);

  if (!wrapped || wrapped.cards.length === 0) {
    return (
      <Screen>
        <Header title="Wrapped" onBack={leaveScreen} />
        <ScreenState loading={wrapped === undefined} message="No wrapped yet" />
      </Screen>
    );
  }

  const { cards } = wrapped;
  const settle = (target: number) => {
    if (target === index) return;
    haptics.select();
    setIndex(target);
  };
  const goTo = (target: number) => {
    if (target === index) return;
    list.current?.scrollToIndex({ index: target, animated: true });
    settle(target);
  };

  // The web has no image share sheet, and a capture can fail (a card still loading), so text is the fallback.
  const share = async () => {
    const card = cards[index];
    const view = cardViews.current[index];
    if (Platform.OS !== "web" && view) {
      const uri = await captureRef(view, { format: "png", result: "tmpfile" }).catch(() => undefined);
      if (uri && (await shareImage(uri, card.title))) return;
    }
    await shareText(cardShareText(card));
  };

  return (
    <GestureDetector gesture={swipe.gesture}>
      <Animated.View style={[styles.root, swipe.style]}>
        <StatusBar style="light" />
        <FlatList
          ref={list}
          data={cards}
          keyExtractor={(card) => card.kind}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          getItemLayout={(_, position) => ({ length: width, offset: width * position, index: position })}
          onMomentumScrollEnd={(event) => settle(pageIndexFromOffset(event.nativeEvent.contentOffset.x, width, cards.length))}
          renderItem={({ item, index: position }) => (
            <View ref={(view) => void (cardViews.current[position] = view)} collapsable={false}>
              <WrappedCard
                card={item}
                width={width}
                height={height}
                topInset={insets.top}
                onTap={(tapX) =>
                  tapClosesStory(tapX, width, index, cards.length) ? leaveScreen() : goTo(indexAfterTap(tapX, width, index, cards.length))
                }
              />
            </View>
          )}
        />
        <View style={[styles.top, { top: insets.top + spacing.sm }]} pointerEvents="box-none">
          <View style={styles.segments} pointerEvents="none">
            {cards.map((card, position) => (
              <View key={card.kind} style={[styles.segment, position <= index && styles.segmentFilled]} />
            ))}
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Share card" onPress={share} hitSlop={6} style={styles.control}>
            <Icon name="share-outline" size={18} color={WHITE} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={leaveScreen} hitSlop={6} style={styles.control}>
            <Text style={styles.close}>{"\u2715"}</Text>
          </Pressable>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.text },
  top: { position: "absolute", left: SCREEN_MARGIN, right: SCREEN_MARGIN, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  segments: { flex: 1, flexDirection: "row", gap: spacing.xs },
  segment: { flex: 1, height: spacing.xs, borderRadius: radius.pill, backgroundColor: SEGMENT_TRACK },
  segmentFilled: { backgroundColor: WHITE },
  // A dark disc behind each control, so it reads on any photo: on a phone the X landed on a lit
  // sign in the champion card's picture and looked like it had a box of its own.
  control: {
    width: layout.avatarCompact,
    height: layout.avatarCompact,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: CONTROL_BACKDROP,
  },
  close: { color: WHITE, fontSize: font.title, lineHeight: 20, fontFamily: fontFamily.bold },
});
