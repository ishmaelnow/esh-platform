// Local Transportation UI test host. Only nonsecret fixtures; no production traffic or writes.
const { spawn } = require("node:child_process");
const path = require("node:path");
const root = path.resolve(__dirname, "../..");
const port = 3014;
const origin = `http://localhost:${port}`;
async function main() {
  let occupied = false;
  try { await fetch(origin, { signal: AbortSignal.timeout(1000) }); occupied = true; } catch { /* Free port. */ }
  if (occupied) throw new Error("Stop the existing server on port 3014 before this test.");
  const server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "dev", "--port", String(port)], {
    cwd: path.join(root, "apps/transportation"), stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: "https://support-preview.invalid", NEXT_PUBLIC_SUPABASE_ANON_KEY: "preview-only",
      NEXT_PUBLIC_ADMIN_SURFACE: "transportation", NEXT_TELEMETRY_DISABLED: "1" },
  });
  let logs = "";
  const capture = (chunk) => { logs = (logs + chunk.toString()).slice(-6000); };
  server.stdout.on("data", capture); server.stderr.on("data", capture);
  try {
    let ready = false;
    for (let attempt = 0; attempt < 120; attempt++) {
      if (server.exitCode !== null) throw new Error(`Transportation preview exited before startup.\n${logs}`);
      try { ready = (await fetch(origin, { signal: AbortSignal.timeout(1000) })).ok; } catch { /* Starting. */ }
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (!ready) throw new Error(`Transportation preview did not start.\n${logs}`);
    const child = spawn(process.execPath, [require.resolve("@playwright/test/cli"), "test", "tests/e2e/trip-support-admin.spec.ts", "--workers=1"],
      { cwd: root, stdio: "inherit", env: { ...process.env, PLAYWRIGHT_BASE_URL: origin } });
    const code = await new Promise((resolve) => child.once("exit", resolve));
    if (code !== 0) throw new Error("Transportation support browser check failed.");
  } finally { server.kill(); }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
