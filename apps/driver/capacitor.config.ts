import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.esh.driver",
  appName: "ESH Driver",
  webDir: "public",
  server: {
    // The native shell loads the deployed Next.js Driver app. Local testing can override this
    // with CAPACITOR_SERVER_URL (for example, http://10.0.2.2:3002 on an Android emulator).
    url: process.env.CAPACITOR_SERVER_URL || "https://driver.eshapp.com",
    cleartext: false,
  },
  android: { allowMixedContent: false },
};

export default config;
