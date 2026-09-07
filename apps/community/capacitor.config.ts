import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.esh.community",
  appName: "ESH Community",
  webDir: "public",
  server: {
    // The native shell loads the deployed public Community entry. Local testing can override this
    // with CAPACITOR_SERVER_URL (for example, http://10.0.2.2:3003 on an Android emulator).
    url: process.env.CAPACITOR_SERVER_URL || "https://community.eshapp.com",
    cleartext: false,
  },
  android: { allowMixedContent: false },
};

export default config;
