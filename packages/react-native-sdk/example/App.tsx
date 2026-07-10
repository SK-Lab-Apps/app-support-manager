import { darkColors, lightColors } from "@appsupportkit/design-tokens";
import { SupportButton } from "@appsupportkit/support-sdk";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";

// Point these at your Supabase project (Settings → API → Project URL). The
// demo key works if you ran supabase/seed.sql on that (dev) project.
const SUPABASE_URL = "https://azfchgxaakvwtvclfnzn.supabase.co";
const API_KEY = "sk_support_demo_habitloop_2f8a1c";

export default function App() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
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
            onPress={() => setTheme(theme === "dark" ? "light" : "dark")}
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
              {theme === "dark" ? "Light" : "Dark"}
            </Text>
          </Pressable>
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
            theme={theme}
          />
        </View>
      </View>

      <View style={styles.body}>
        <Text
          style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20 }}
        >
          Host app content. Tap the support button above — the bottom sheet,
          threads, and unread badge come from @appsupportkit/support-sdk.
        </Text>
      </View>
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
});
