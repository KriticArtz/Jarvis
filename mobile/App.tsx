import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, AppState, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View, useColorScheme } from "react-native";
import { StatusBar } from "expo-status-bar";
import type { Session } from "@supabase/supabase-js";
import { signIn, signOut, supabase } from "./src/auth";
import { api, type SourceStatus } from "./src/api";
import { configProblem } from "./src/config";
import { healthSource } from "./src/health";
import { connect, disconnect, syncIfDue, syncNow, type FlowResult } from "./src/sync";

/**
 * Minimal Jarvis companion app: sign in with the existing Jarvis account,
 * connect Apple Health (iOS) or Health Connect (Android), and keep it synced.
 * Everything else stays in the web app.
 */
const STATE_LABEL: Record<SourceStatus["state"], string> = {
  not_connected: "Not connected",
  syncing: "Syncing",
  connected: "Connected",
  needs_attention: "Needs attention",
};
const CATEGORIES = ["Steps", "Active energy", "Distance", "Sleep", "Workouts"];

export default function App() {
  const dark = useColorScheme() === "dark";
  const c = dark ? COLORS.dark : COLORS.light;
  const source = healthSource();
  const problem = configProblem();
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<SourceStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<FlowResult | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const refresh = useCallback(async () => {
    if (!source) return;
    try {
      const { sources } = await api.status();
      setStatus(sources.find((s) => s.provider === source.provider) ?? null);
    } catch {
      setStatus(null);
    }
  }, [source]);

  useEffect(() => {
    if (!session) return;
    void refresh();
    // Sync when the app opens / comes back to the foreground.
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void syncIfDue().then(() => refresh());
    });
    void syncIfDue().then(() => refresh());
    return () => sub.remove();
  }, [session, refresh]);

  const run = async (name: string, fn: () => Promise<FlowResult | { ok: boolean; error?: string }>) => {
    setBusy(name);
    setMsg(null);
    try {
      const res = await fn();
      if ("message" in res) setMsg(res as FlowResult);
      else if (!res.ok) setMsg({ ok: false, message: (res as { error?: string }).error ?? "Something went wrong." });
    } catch {
      setMsg({ ok: false, message: "Something went wrong. Check your connection and try again." });
    } finally {
      setBusy(null);
      void refresh();
    }
  };

  if (!ready) {
    return (
      <SafeAreaView style={[s.screen, { backgroundColor: c.bg }]}>
        <ActivityIndicator color={c.accent} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[s.screen, { backgroundColor: c.bg }]}>
      <StatusBar style={dark ? "light" : "dark"} />
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Text style={[s.brand, { color: c.text }]}>Jarvis</Text>

        {problem ? (
          <Text style={[s.note, { color: c.danger }]}>{problem}</Text>
        ) : !session ? (
          <View style={[s.card, { backgroundColor: c.surface }]}>
            <Text style={[s.title, { color: c.text }]}>Sign in</Text>
            <Text style={[s.body, { color: c.muted }]}>Use the same account as the Jarvis web app.</Text>
            <TextInput
              style={[s.input, { backgroundColor: c.surface2, color: c.text }]}
              placeholder="Email"
              placeholderTextColor={c.muted}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            <TextInput
              style={[s.input, { backgroundColor: c.surface2, color: c.text }]}
              placeholder="Password"
              placeholderTextColor={c.muted}
              secureTextEntry
              autoComplete="password"
              value={password}
              onChangeText={setPassword}
            />
            <Button label={busy === "signin" ? "Signing in…" : "Sign in"} c={c} disabled={!!busy} onPress={() => run("signin", () => signIn(email, password))} />
          </View>
        ) : !source ? (
          <Text style={[s.note, { color: c.muted }]}>Health data isn&apos;t supported on this device.</Text>
        ) : (
          <>
            <View style={[s.card, { backgroundColor: c.surface }]}>
              <View style={s.row}>
                <Text style={[s.title, { color: c.text }]}>{source.label}</Text>
                <Text style={[s.badge, { color: status?.state === "needs_attention" ? c.warning : c.accent, backgroundColor: c.surface2 }]}>
                  {STATE_LABEL[status?.state ?? "not_connected"]}
                </Text>
              </View>
              <Text style={[s.body, { color: c.muted }]}>Connect your health data to give your AI a better understanding of your activity, routines, and progress.</Text>
              <View style={s.chips}>
                {CATEGORIES.map((cat) => (
                  <Text key={cat} style={[s.chip, { backgroundColor: c.surface2, color: c.text }]}>
                    {cat}
                  </Text>
                ))}
              </View>
              {status?.lastSyncedAt ? <Text style={[s.small, { color: c.muted }]}>Last synced {new Date(status.lastSyncedAt).toLocaleString()}</Text> : null}

              {!status || status.state === "not_connected" ? (
                <Button label={busy === "connect" ? "Connecting…" : `Connect ${source.label}`} c={c} disabled={!!busy} onPress={() => run("connect", () => connect(source))} />
              ) : (
                <>
                  {status.state === "needs_attention" ? (
                    <Button label={busy === "connect" ? "Reconnecting…" : "Reconnect"} c={c} disabled={!!busy} onPress={() => run("connect", () => connect(source))} />
                  ) : (
                    <Button label={busy === "sync" ? "Syncing…" : "Sync now"} c={c} disabled={!!busy} onPress={() => run("sync", () => syncNow(source))} />
                  )}
                  <Button label={busy === "disconnect" ? "Disconnecting…" : "Disconnect and delete synced data"} c={c} secondary disabled={!!busy} onPress={() => run("disconnect", () => disconnect(source))} />
                </>
              )}
            </View>
            <Text style={[s.small, { color: c.muted }]}>
              You control which health data you share with Jarvis. Only daily totals and workout summaries are sent — no heart rate, locations or medical records. {source.manageHint}
            </Text>
            <Pressable accessibilityRole="button" onPress={() => run("signout", async () => (await signOut(), { ok: true }))} style={s.link}>
              <Text style={{ color: c.accent, fontSize: 15 }}>Sign out</Text>
            </Pressable>
          </>
        )}
        {msg ? <Text style={[s.note, { color: msg.ok ? c.success : c.danger }]}>{msg.message}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Button({ label, onPress, disabled, secondary, c }: { label: string; onPress: () => void; disabled?: boolean; secondary?: boolean; c: (typeof COLORS)["light"] }) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [s.button, { backgroundColor: secondary ? c.surface2 : c.accent, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 }]}
    >
      <Text style={{ color: secondary ? c.text : c.onAccent, fontSize: 16, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}

/** Jarvis "ocean" theme tokens (src/app/globals.css), light and dark. */
const COLORS = {
  light: { bg: "#f5f6f7", surface: "#ffffff", surface2: "#eef0f2", text: "#15171a", muted: "#6c7278", accent: "#0a7ea4", onAccent: "#ffffff", success: "#1a8a4a", warning: "#b25f00", danger: "#c42b2b" },
  dark: { bg: "#0b0c0d", surface: "#161819", surface2: "#222528", text: "#f1f2f3", muted: "#9aa1a8", accent: "#3cc3de", onAccent: "#03232b", success: "#4ade80", warning: "#fbbf24", danger: "#f87171" },
};

const s = StyleSheet.create({
  screen: { flex: 1, justifyContent: "center" },
  content: { padding: 20, gap: 16 },
  brand: { fontSize: 32, fontWeight: "700" },
  card: { borderRadius: 24, padding: 20, gap: 12 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  title: { fontSize: 20, fontWeight: "600" },
  body: { fontSize: 15, lineHeight: 21 },
  small: { fontSize: 13, lineHeight: 18 },
  note: { fontSize: 15, lineHeight: 21 },
  badge: { fontSize: 12, fontWeight: "600", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: "hidden" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { fontSize: 13, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, overflow: "hidden" },
  input: { minHeight: 48, borderRadius: 16, paddingHorizontal: 16, fontSize: 16 },
  button: { minHeight: 48, borderRadius: 999, alignItems: "center", justifyContent: "center", paddingHorizontal: 20 },
  link: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start" },
});
