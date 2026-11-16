import { useQuery } from "convex/react";
import { useIsFocused } from "expo-router";
import { type ComponentRef, type ReactNode, useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaFrame } from "react-native-safe-area-context";
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Svg, { Defs, Mask, Rect as SvgRect } from "react-native-svg";

import { Artwork } from "@/components/art";
import { ease } from "@/components/motion";
import { cardStyle } from "@/components/ui";
import { backend } from "@/lib/backend";
import { haptics } from "@/lib/native/haptics";
import {
  colors,
  duration,
  layout,
  radius,
  SCREEN_MARGIN,
  spacing,
  spring,
  type,
} from "@/theme";

import { hasSeenTour, markTourSeen, useCoachResets } from "./store";
import {
  arrowOffset,
  bubbleLeft,
  bubbleSide,
  type CoachTargetId,
  isOnScreen,
  type Rect,
  spotlightFrame,
  TOURS,
  type TourId,
} from "./tours";

type ViewType = ComponentRef<typeof View>;

const ARROW = 14;
const BUBBLE_MAX = 300;
const SUNNY = 32;
const CUTOUT_RADIUS = radius.control;
const AnimatedRect = Animated.createAnimatedComponent(SvgRect);

/**
 * Every mounted target, by id, app-wide: a tour can point outside its own screen, such as the
 * league switcher in the tab header above Roster. Ids are unique per screen, and only the focused
 * screen's tour runs.
 */
const targets = new Map<CoachTargetId, ViewType>();

/** Marks the element a tour step points at; otherwise a plain View. */
export function CoachTarget({
  id,
  children,
}: {
  id: CoachTargetId;
  children: ReactNode;
}) {
  return (
    <View
      ref={(view) => {
        if (view) targets.set(id, view);
        else targets.delete(id);
      }}
      collapsable={false}
    >
      {children}
    </View>
  );
}

type Step = { title: string; text: string; cutout: Rect };

/**
 * Runs one screen's first-run tour: once the screen is focused and its content has arrived
 * (ready), it measures each step's target and walks through the ones on screen. A dark scrim
 * with a spotlight cut around the target slides from one target to the next, and Sunny speaks
 * each tip from a small bubble beside it. Got it or Skip marks the tour seen for this player.
 */
export function CoachTour({
  tour,
  ready = true,
  children,
}: {
  tour: TourId;
  ready?: boolean;
  children: ReactNode;
}) {
  const me = useQuery(backend.users.me);
  const focused = useIsFocused();
  const resets = useCoachResets();
  const screen = useSafeAreaFrame();
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [index, setIndex] = useState(0);
  const userId = me?._id;

  useEffect(() => {
    if (!userId || !focused || !ready) return;
    let live = true;
    // After the screen's entrance has played, so the targets are where they will stay.
    const timer = setTimeout(async () => {
      if (await hasSeenTour(userId, tour)) return;
      const measured = await Promise.all(
        TOURS[tour].map(
          ({ target, title, text }) =>
            new Promise<Step | null>((resolve) => {
              const view = targets.get(target);
              if (!view) return resolve(null);
              view.measureInWindow((x, y, width, height) => {
                // measureInWindow includes the desktop gutters; the modal's
                // coordinates start at the app canvas instead.
                const rect = { x: x - screen.x, y: y - screen.y, width, height };
                resolve(
                  isOnScreen(rect, screen)
                    ? {
                        title,
                        text,
                        cutout: spotlightFrame(rect, screen, SCREEN_MARGIN),
                      }
                    : null,
                );
              });
            }),
        ),
      );
      const shown = measured.filter((step): step is Step => step !== null);
      if (live && shown.length > 0) {
        setIndex(0);
        setSteps(shown);
      }
    }, duration.slow * 3);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [userId, focused, ready, tour, resets, screen]);

  function finish() {
    setSteps(null);
    if (userId) void markTourSeen(userId, tour);
  }

  return (
    <>
      {children}
      {steps ? (
        <Modal
          transparent
          visible
          animationType="fade"
          statusBarTranslucent
          onRequestClose={finish}
        >
          <Spotlight
            steps={steps}
            index={index}
            screen={screen}
            onNext={() =>
              index === steps.length - 1 ? finish() : setIndex(index + 1)
            }
            onSkip={finish}
          />
        </Modal>
      ) : null}
    </>
  );
}

function Spotlight({
  steps,
  index,
  screen,
  onNext,
  onSkip,
}: {
  steps: Step[];
  index: number;
  screen: { width: number; height: number };
  onNext: () => void;
  onSkip: () => void;
}) {
  const step = steps[index];
  const last = index === steps.length - 1;
  const x = useSharedValue(step.cutout.x);
  const y = useSharedValue(step.cutout.y);
  const width = useSharedValue(step.cutout.width);
  const height = useSharedValue(step.cutout.height);
  const lift = useSharedValue(0);

  useEffect(() => {
    // The light slides to the next target; the bubble fades and lifts in after it.
    x.value = withSpring(step.cutout.x, spring.gentle);
    y.value = withSpring(step.cutout.y, spring.gentle);
    width.value = withSpring(step.cutout.width, spring.gentle);
    height.value = withSpring(step.cutout.height, spring.gentle);
    lift.value = 0;
    lift.value = withTiming(1, {
      duration: duration.base,
      easing: ease.standard,
    });
    haptics.select();
  }, [step, x, y, width, height, lift]);

  const hole = useAnimatedProps(() => ({
    x: x.value,
    y: y.value,
    width: width.value,
    height: height.value,
  }));
  const glow = useAnimatedStyle(() => ({
    left: x.value,
    top: y.value,
    width: width.value,
    height: height.value,
  }));
  const bubbleIn = useAnimatedStyle(() => ({
    opacity: lift.value,
    transform: [{ translateY: (1 - lift.value) * spacing.sm }],
  }));

  const side = bubbleSide(step.cutout, screen.height);
  const bubbleWidth = Math.min(BUBBLE_MAX, screen.width - SCREEN_MARGIN * 2);
  const left = bubbleLeft(
    step.cutout,
    bubbleWidth,
    screen.width,
    SCREEN_MARGIN,
  );
  const gap = ARROW / 2 + spacing.sm;
  const place =
    side === "below"
      ? { top: step.cutout.y + step.cutout.height + gap }
      : { bottom: screen.height - step.cutout.y + gap };

  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onNext}
        accessibilityLabel="Next tip"
      >
        <Svg width={screen.width} height={screen.height}>
          <Defs>
            <Mask
              id="coach-hole"
              x="0"
              y="0"
              width={screen.width}
              height={screen.height}
            >
              <SvgRect
                x="0"
                y="0"
                width={screen.width}
                height={screen.height}
                fill="white"
              />
              <AnimatedRect
                animatedProps={hole}
                rx={CUTOUT_RADIUS}
                ry={CUTOUT_RADIUS}
                fill="black"
              />
            </Mask>
          </Defs>
          <SvgRect
            x="0"
            y="0"
            width={screen.width}
            height={screen.height}
            fill="black"
            opacity={0.55}
            mask="url(#coach-hole)"
          />
        </Svg>
      </Pressable>
      <Animated.View pointerEvents="none" style={[styles.glow, glow]} />
      <Animated.View
        key={index}
        style={[styles.bubble, { width: bubbleWidth, left }, place, bubbleIn]}
        accessibilityViewIsModal
        accessibilityLiveRegion="polite"
      >
        <View
          style={[
            styles.arrow,
            {
              left: arrowOffset(
                step.cutout,
                { left, width: bubbleWidth },
                ARROW,
                radius.card,
              ),
            },
            side === "below" ? styles.arrowTop : styles.arrowBottom,
          ]}
        />
        <View style={styles.speech}>
          <View style={styles.sunny}>
            <Artwork name="sunny" size={SUNNY} />
          </View>
          <View style={styles.words}>
            <Text style={styles.title}>{step.title}</Text>
            <Text style={styles.text}>{step.text}</Text>
          </View>
        </View>
        <View style={styles.actions}>
          <View
            style={styles.dots}
            accessibilityLabel={`Tip ${index + 1} of ${steps.length}`}
          >
            {steps.length > 1
              ? steps.map((_, i) => (
                  <View
                    key={i}
                    style={[styles.dot, i === index && styles.dotOn]}
                  />
                ))
              : null}
          </View>
          <View style={styles.right}>
            {last ? null : (
              <Pressable
                onPress={onSkip}
                style={styles.skip}
                accessibilityRole="button"
                testID="coach-skip"
              >
                <Text style={styles.skipLabel}>Skip</Text>
              </Pressable>
            )}
            <Pressable
              onPress={onNext}
              style={styles.next}
              accessibilityRole="button"
              testID="coach-next"
            >
              <Text style={styles.nextLabel}>{last ? "Got it" : "Next"}</Text>
            </Pressable>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  glow: {
    position: "absolute",
    borderRadius: CUTOUT_RADIUS,
    borderWidth: 2,
    borderColor: colors.accentTint,
    shadowColor: colors.accentTint,
    shadowOpacity: 0.9,
    shadowRadius: spacing.md,
    shadowOffset: { width: 0, height: 0 },
  },
  bubble: {
    ...cardStyle,
    position: "absolute",
    padding: spacing.md,
    gap: spacing.md,
  },
  arrow: {
    position: "absolute",
    width: ARROW,
    height: ARROW,
    backgroundColor: colors.surface,
    borderColor: colors.divider,
    transform: [{ rotate: "45deg" }],
  },
  arrowTop: {
    top: -ARROW / 2,
    borderLeftWidth: cardStyle.borderWidth,
    borderTopWidth: cardStyle.borderWidth,
  },
  arrowBottom: {
    bottom: -ARROW / 2,
    borderRightWidth: cardStyle.borderWidth,
    borderBottomWidth: cardStyle.borderWidth,
  },
  speech: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  sunny: {
    width: SUNNY + spacing.sm,
    height: SUNNY + spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.accentTint,
    alignItems: "center",
    justifyContent: "center",
  },
  words: { flex: 1, gap: spacing.xs },
  title: { ...type.label, color: colors.text },
  text: { ...type.small, color: colors.textMuted },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dots: { flexDirection: "row", gap: spacing.xs },
  dot: {
    width: spacing.sm - 2,
    height: spacing.sm - 2,
    borderRadius: radius.pill,
    backgroundColor: colors.divider,
  },
  dotOn: { backgroundColor: colors.accent },
  right: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  skip: {
    minHeight: layout.rowMin,
    minWidth: layout.rowMin,
    paddingHorizontal: spacing.sm,
    justifyContent: "center",
    alignItems: "center",
  },
  skipLabel: { ...type.small, color: colors.textMuted },
  next: {
    minHeight: layout.pillHeight + spacing.md,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  nextLabel: { ...type.label, color: colors.onAccent },
});
