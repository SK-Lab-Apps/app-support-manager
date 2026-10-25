import { darkColors, lightColors } from "@appsupportkit/design-tokens";
import { SupportButton } from "@appsupportkit/support-sdk";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import {
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from "react-native";

// Point these at your Supabase project (Settings → API → Project URL). The
// demo key works if you ran supabase/seed.sql on that (dev) project.
const SUPABASE_URL = "https://azfchgxaakvwtvclfnzn.supabase.co";
const API_KEY = "sk_support_demo_habitloop_2f8a1c";

// The SDK follows the app's appearance by default; the toggle cycles through
// that and both pinned modes so each can be checked from one build.
const THEME_CYCLE = ["system", "light", "dark"] as const;
type ThemeChoice = (typeof THEME_CYCLE)[number];
const THEME_LABEL: Record<ThemeChoice, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

export default function App() {
  const [choice, setChoice] = useState<ThemeChoice>("system");
  const systemScheme = useColorScheme();
  const theme =
    choice === "system" ? (systemScheme === "dark" ? "dark" : "light") : choice;
  const colors = theme === "dark" ? darkColors : lightColors;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
      <StatusBar style={theme === "dark" ? "light" : "dark"} />
      <View style={styles.header}>
        <Text
          style={{
            color: colors.textPrimary,
            fontSize: 16,
            fontWeight: "600",
            letterSpacing: -0.2,
          }}
        >
          Habitloop
        </Text>
        <View style={styles.headerActions}>
          <Pressable
            onPress={() =>
              setChoice(
                THEME_CYCLE[(THEME_CYCLE.indexOf(choice) + 1) % THEME_CYCLE.length],
              )
            }
            accessibilityLabel={`Theme: ${THEME_LABEL[choice]}`}
            style={{
              height: 32,
              paddingHorizontal: 10,
              borderRadius: 6,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
              {THEME_LABEL[choice]}
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.body}>
        <Text
          style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20 }}
        >
          Host app content. Tap the support button — the bottom sheet, threads,
          and unread badge come from @appsupportkit/support-sdk.
        </Text>
      </View>

      {/* The launcher positions itself with `style`; here, a floating action
          button in the corner. Use variant="soft" or "minimal" to place it
          in a header or toolbar instead. */}
      <SupportButton
        appName="Habitloop"
        apiKey={API_KEY}
        supabaseUrl={SUPABASE_URL}
        user={{
          name: "Maya Okafor",
          isPaid: true,
          revenuecatId: "rc_anon_8f31bd2c",
          appVersion: "2.4.1",
        }}
        theme={choice}
        style={styles.launcher}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 12 },
  body: { paddingHorizontal: 20, paddingTop: 8 },
  launcher: { position: "absolute", right: 20, bottom: 32 },
});
