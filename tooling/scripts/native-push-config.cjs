// Firebase client configuration only. Never provide an Admin SDK service-account key here.
const fs = require("node:fs");
const path = require("node:path");

function validateFirebaseConfig(encoded, product) {
  if (!["rider", "driver"].includes(product)) throw new Error("Expected rider or driver.");
  if (!encoded || encoded.length > 100000 || !/^[A-Za-z0-9+/=\s]+$/.test(encoded))
    throw new Error("Firebase client configuration is missing or invalid.");
  let config;
  try { config = JSON.parse(Buffer.from(encoded, "base64").toString("utf8")); }
  catch { throw new Error("Firebase client configuration is not valid JSON."); }
  if (config.type === "service_account" || config.private_key)
    throw new Error("A server credential must never be included in a mobile build.");
  if (config.project_info?.project_id !== "esh-platform-609d3")
    throw new Error("Firebase client configuration belongs to a different project.");
  const clients = config.client;
  const matching = Array.isArray(clients) ? clients.filter((client) =>
    client?.client_info?.android_client_info?.package_name === `com.esh.${product}`) : [];
  if (matching.length !== 1 || !matching[0]?.client_info?.mobilesdk_app_id)
    throw new Error("Firebase client configuration does not match this app.");
  return { ...config, client: matching };
}

if (require.main === module) {
  try {
    const product = process.argv[2];
    const config = validateFirebaseConfig(process.env[`${String(product).toUpperCase()}_GOOGLE_SERVICES_JSON_BASE64`], product);
    const target = path.resolve(__dirname, "../../apps", product, "android/app/google-services.json");
    fs.writeFileSync(target, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
    console.log(`Firebase client configuration validated for ESH ${product}.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { validateFirebaseConfig };
