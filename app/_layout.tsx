import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { Nunito_400Regular, Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold, useFonts } from "@expo-google-fonts/nunito";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { AuthGate } from "@/components/AuthGate";
import { LiveToastHost } from "@/components/live/LiveToastHost";
import { NotificationsHost } from "@/components/notifications/NotificationsHost";
import { sheetOptions } from "@/components/ui/Sheet";
import { convex } from "@/lib/convex";
import { CurrentLeagueProvider } from "@/lib/currentLeague";
import { tokenStorage } from "@/lib/tokenStorage";
import { colors } from "@/theme";
import "@/theme/web.css";

export { RootError as ErrorBoundary } from "@/components/shell/RootError";

export default function RootLayout() {
  // The four Nunito weights the theme names (theme/tokens.ts fontFamily). A failed load falls back
  // to the system face rather than holding the app on a blank page.
  const [fontsLoaded, fontError] = useFonts({ Nunito_400Regular, Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold });
  if (!fontsLoaded && !fontError) return <View style={[styles.root, { backgroundColor: colors.background }]} />;
  return (
    // Swipe actions (react-native-gesture-handler) only receive touches under this root view.
    <GestureHandlerRootView style={styles.root}>
      <ConvexAuthProvider client={convex} storage={tokenStorage}>
        <AuthGate>
          <CurrentLeagueProvider>
            {/* Draws nothing: raises notifications from the live queries and opens the screen a tapped one names. */}
            <NotificationsHost />
            {/* Every screen draws its own Header from components/ui, so the native one stays hidden. */}
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.background },
                // Back is a swipe from anywhere on the left half of a pushed screen, as in iOS Mail, not only from the edge.
                gestureEnabled: true,
                fullScreenGestureEnabled: true,
              }}
            >
              <Stack.Screen name="(tabs)" />
              {/* Screens that draw, pan a map or scroll sideways keep the edge-only back swipe, so a sideways drag stays theirs. */}
              <Stack.Screen name="canvas/index" options={{ fullScreenGestureEnabled: false }} />
              <Stack.Screen name="group/[dropId]" options={{ fullScreenGestureEnabled: false }} />
              <Stack.Screen name="how-it-works" options={{ fullScreenGestureEnabled: false }} />
              <Stack.Screen name="leaderboards/index" options={{ fullScreenGestureEnabled: false }} />
              <Stack.Screen name="league-settings/season" options={{ fullScreenGestureEnabled: false }} />
              {/* Every sheet shares one presentation (components/ui/Sheet), so the task sheet, switcher and group sheet look and move alike. */}
              {/* The task sheet hugs its content (title, task, how-to, Submit Proof) instead of opening at half height. */}
              <Stack.Screen name="task/[taskId]" options={sheetOptions("fitToContents")} />
              {/* The camera and the verdict photo fill the top of the screen, so their status bar is light, as on Wrapped. */}
              {/* Full screen for the camera, but it rises from the bottom like the task sheet it replaces, so the step reads as one motion. */}
              <Stack.Screen name="proof/[taskId]" options={{ presentation: "fullScreenModal", animation: "slide_from_bottom", statusBarStyle: "light" }} />
              <Stack.Screen name="proof/verdict" options={{ statusBarStyle: "light" }} />
              {/* Wrapped draws full-bleed photos and dark cards, so its status bar is light; the native modal owns that, not expo-status-bar. */}
              <Stack.Screen name="wrapped/index" options={{ presentation: "fullScreenModal", animation: "slide_from_bottom", statusBarStyle: "light" }} />
              <Stack.Screen name="league-switcher" options={sheetOptions()} />
              {/* A form with unsaved input: its X (with a confirm) is the way out, so no grabber promising a swipe. */}
              <Stack.Screen name="group/new" options={sheetOptions(undefined, { grabber: false })} />
            </Stack>
            <LiveToastHost />
          </CurrentLeagueProvider>
        </AuthGate>
        <StatusBar style="dark" />
      </ConvexAuthProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
