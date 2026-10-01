import { Platform } from "react-native";
import type { HealthProvider, RawHealthData } from "./types";

/**
 * One interface over both platforms. Each native module is loaded only on its
 * own platform (HealthKit on iOS, Health Connect on Android).
 */
export interface HealthSource {
  provider: HealthProvider;
  /** "Apple Health" / "Health Connect" */
  label: string;
  available(): Promise<{ ok: true } | { ok: false; reason: string }>;
  /** Shows the system permission screen. */
  requestAccess(): Promise<boolean>;
  /** Whether access is still granted. iOS can't tell (privacy), so it returns null there. */
  accessGranted(): Promise<boolean | null>;
  read(fromDate: string, toDate: string, timeZone: string): Promise<RawHealthData>;
  /** Where the user changes what's shared. */
  manageHint: string;
}

export function healthSource(): HealthSource | null {
  if (Platform.OS === "ios") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const apple = require("./apple") as typeof import("./apple");
    return {
      provider: "apple_health",
      label: "Apple Health",
      async available() {
        return apple.appleHealthAvailable() ? { ok: true } : { ok: false, reason: "Health data isn't available on this device." };
      },
      requestAccess: apple.requestAppleHealthAccess,
      async accessGranted() {
        return null;
      },
      read: apple.readAppleHealth,
      manageHint: "Change what's shared in the Health app → Sharing → Apps → Jarvis.",
    };
  }
  if (Platform.OS === "android") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const hc = require("./healthConnect") as typeof import("./healthConnect");
    return {
      provider: "health_connect",
      label: "Health Connect",
      async available() {
        const a = await hc.healthConnectAvailability();
        if (a === "available") return { ok: true };
        return { ok: false, reason: a === "needs_update" ? "Update Health Connect from the Play Store, then try again." : "Health Connect isn't available on this phone." };
      },
      requestAccess: hc.requestHealthConnectAccess,
      accessGranted: hc.healthConnectAccessGranted,
      read: hc.readHealthConnect,
      manageHint: "Change what's shared in Settings → Health Connect → App permissions → Jarvis.",
    };
  }
  return null;
}
