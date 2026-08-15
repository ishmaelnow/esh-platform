import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.esh.rider",
  appName: "ESH Rider",
  webDir: "public",
  server: {
    // The native shell loads the deployed Next.js Rider app. Local testing can override this
    // with CAPACITOR_SERVER_URL (for example, http://10.0.2.2:3001 on an Android emulator).
    url: process.env.CAPACITOR_SERVER_URL || "https://rider.eshapp.com",
    cleartext: false,
  },
  android: { allowMixedContent: false },
};

export default config;
