// Business fixtures only. Map styles/tiles are never substituted with generated geometry.
// Cache unchanged public provider responses in memory across preview test contexts.
const publicMapResources = new Map();
function publicMapResource(url) {
  if (!publicMapResources.has(url)) {
    const pending = fetch(url, { signal: AbortSignal.timeout(15000) }).then(async (response) => {
      if (!response.ok) throw new Error(`Public map resource returned ${response.status}`);
      return { status: response.status, contentType: response.headers.get("content-type") || "application/octet-stream", body: Buffer.from(await response.arrayBuffer()) };
    }).catch((error) => { publicMapResources.delete(url); throw error; });
    publicMapResources.set(url, pending);
  }
  return publicMapResources.get(url);
}
async function setupDriverPreview(page, options = {}) {
  let requestedStatus = options.online ? "online" : "offline";
  let applicantRecord = null;
  await page.addInitScript(() => localStorage.setItem("esh-driver-portal-auth", JSON.stringify({
    access_token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJwcmV2aWV3In0.preview", refresh_token: "preview-only",
    token_type: "bearer", expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: "preview-driver", email: "driver-preview@example.invalid", aud: "authenticated", role: "authenticated" },
  })));
  await page.route("https://driver-preview.invalid/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith("/auth/")) return route.fulfill({ json: { user: { id: "preview-driver", email: "driver-preview@example.invalid" } } });
    const rpc = url.pathname.split("/").pop();
    if (options.applicant && rpc === "activate_my_driver_account") return route.fulfill({ status: 400, json: { message: "An approved application is required." } });
    const availability = { requestedStatus, effectiveStatus: requestedStatus, eligible: true, blockers: [], statusChangedAt: new Date().toISOString(), selectedServiceAreaId: "preview-area", selectedServiceAreaName: "Preview area" };
    if (rpc === "set_my_driver_availability") {
      requestedStatus = route.request().postDataJSON().target_status;
      return route.fulfill({ json: { ...availability, requestedStatus, effectiveStatus: requestedStatus } });
    }
    const responses = {
      activate_my_driver_account: true,
      my_driver_portal_summary: { driverProfileId: "preview-driver", driverNumber: "PREVIEW", displayName: "Design preview driver", email: "driver-preview@example.invalid", phone: null, status: "active", onboardingStatus: "approved", documentCompliance: true, documents: [], notificationPreferences: { expirationRemindersEnabled: true }, vehicle: null },
      my_assigned_vehicle_compliance: { compliant: true, documents: [] },
      my_driver_availability: availability,
      my_driver_location_sharing: { sharingEnabled: false, consentedAt: null, latitude: null, longitude: null, accuracyMeters: null, recordedAt: null },
      my_driver_service_areas: [{ serviceAreaId: "preview-area", name: "Preview area", centerLatitude: 32.832, centerLongitude: -96.771, radiusKm: 20, coverageMode: "all_drivers", selected: true }],
      my_driver_dispatch: { offers: [], trips: [] }, my_driver_reputation: [],
      my_driver_wallet: { currencyCode: "USD", balanceMinor: 0, pendingMinor: 0, availableMinor: 0, paidMinor: 0, trips: [] },
      my_driver_payout_account: { exists: false, onboardingStatus: "not_started", requirementsCurrentlyDue: [] },
      my_driver_bank_payouts: [], my_driver_earnings_notification_preferences: { earningsUpdatesEnabled: true },
      my_driver_sms_notification_settings: { enabled: false, maskedPhone: null, verifiedAt: null },
      list_transport_application_tenants: [{ tenant_slug: "preview-company", display_name: "Application preview company" }],
    };
    return route.fulfill({ json: responses[rpc] ?? [] });
  });
  await page.route("**/api/**", async (route) => {
    if (new URL(route.request().url()).hostname.endsWith("mapbox.com")) return route.continue();
    if (options.applicant && new URL(route.request().url()).pathname === "/api/applications/driver") {
      if (route.request().method() === "POST") {
        const form = await new Response(route.request().postDataBuffer(), { headers: { "Content-Type": route.request().headers()["content-type"] } }).formData();
        const fields = [["personalPhoto", "personal_photo"], ["driverIdPhoto", "driver_id_photo"], ["vehiclePhoto", "vehicle_photo"], ["document", "reference_document"], ["insurance", "insurance"]];
        applicantRecord = { applicationId: "preview-application", tenantSlug: "preview-company", companyName: "Application preview company",
          fullName: String(form.get("fullName") || "Preview applicant"), phone: String(form.get("phone") || ""), status: "submitted", submittedAt: new Date().toISOString(),
          documents: fields.map(([field, type]) => ({ type, status: "pending", fileName: form.get(field)?.name || "Preview upload", reviewNotes: null })) };
        return route.fulfill({ json: { ok: true } });
      }
      return route.fulfill({ json: { applications: applicantRecord ? [applicantRecord] : [] } });
    }
    return route.fulfill({ status: 400, json: { message: "Preview only: external actions are blocked." } });
  });
  // Real OpenFreeMap style/tiles with a dummy SDK token, exactly as the Rider preview.
  // No invented map geometry or congestion is returned.
  await page.route("https://api.mapbox.com/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.includes("/styles/")) {
      try { return await route.fulfill(await publicMapResource("https://tiles.openfreemap.org/styles/liberty")); }
      catch { return route.abort().catch(() => {}); }
    }
    if (url.pathname.includes("mapbox-traffic")) return route.fulfill({ status: 503, json: { message: "Live traffic requires Driver's real public configuration." } });
    return route.fulfill({ json: {} });
  });
  await page.route("https://tiles.openfreemap.org/**", async (route) => {
    try { return await route.fulfill(await publicMapResource(route.request().url())); }
    catch { return route.abort().catch(() => {}); }
  });
}
module.exports = { setupDriverPreview };
