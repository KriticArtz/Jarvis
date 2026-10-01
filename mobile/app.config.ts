import type { ConfigContext, ExpoConfig } from "expo/config";

/**
 * Jarvis iOS/Android app. Health access is READ-ONLY and limited to the five
 * data types Jarvis uses (steps, active energy, distance, sleep, workouts).
 *
 * Set the bundle id / package name to identifiers you own before the first
 * store build (JARVIS_IOS_BUNDLE_ID / JARVIS_ANDROID_PACKAGE).
 */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Jarvis",
  slug: "jarvis",
  scheme: "jarvis",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  ios: {
    bundleIdentifier: process.env.JARVIS_IOS_BUNDLE_ID ?? "com.jarvis.app",
    supportsTablet: false,
    infoPlist: { ITSAppUsesNonExemptEncryption: false },
  },
  android: {
    package: process.env.JARVIS_ANDROID_PACKAGE ?? "com.jarvis.app",
    // Health Connect: read-only, exactly the five types Jarvis uses.
    permissions: [
      "android.permission.health.READ_STEPS",
      "android.permission.health.READ_ACTIVE_CALORIES_BURNED",
      "android.permission.health.READ_DISTANCE",
      "android.permission.health.READ_SLEEP",
      "android.permission.health.READ_EXERCISE",
    ],
    // Expo/React Native add these by default; Jarvis doesn't use them (least privilege for a health app).
    blockedPermissions: [
      "android.permission.READ_EXTERNAL_STORAGE",
      "android.permission.WRITE_EXTERNAL_STORAGE",
      "android.permission.SYSTEM_ALERT_WINDOW",
      "android.permission.VIBRATE",
    ],
  },
  plugins: [
    [
      "@kingstinct/react-native-healthkit",
      {
        NSHealthShareUsageDescription:
          "Jarvis reads your steps, active energy, distance, sleep and workouts to understand your activity and help you plan around it. You choose what to share.",
        // Read-only: Jarvis never writes to Apple Health.
        NSHealthUpdateUsageDescription: false,
        background: false,
      },
    ],
    "react-native-health-connect",
    // Health Connect needs Android 8+ (API 26).
    ["expo-build-properties", { android: { minSdkVersion: 26, compileSdkVersion: 36, targetSdkVersion: 36 } }],
    "expo-secure-store",
  ],
});
