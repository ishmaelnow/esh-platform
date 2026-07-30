import { expect, test } from "@playwright/test";

const supabaseUrl = process.env.E2E_SUPABASE_URL;
const supabaseAnonKey = process.env.E2E_SUPABASE_ANON_KEY;
const driverEmail = process.env.E2E_DRIVER_EMAIL;
const driverPassword = process.env.E2E_DRIVER_PASSWORD;
const configured = Boolean(supabaseUrl && supabaseAnonKey && driverEmail && driverPassword);

test.describe("driver availability", () => {
  test.skip(
    !configured,
    "Set E2E_SUPABASE_URL, E2E_SUPABASE_ANON_KEY, E2E_DRIVER_EMAIL, and E2E_DRIVER_PASSWORD.",
  );

  test("an eligible driver can go online and return offline", async ({ page, request }) => {
    const response = await request.post(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      data: { email: driverEmail, password: driverPassword },
      headers: {
        apikey: supabaseAnonKey!,
        "Content-Type": "application/json",
      },
    });
    expect(response.ok(), await response.text()).toBe(true);
    const session = await response.json();

    await page.addInitScript(
      ({ persistedSession }) => {
        window.localStorage.setItem("esh-driver-portal-auth", JSON.stringify(persistedSession));
      },
      { persistedSession: session },
    );
    await page.goto("/");

    const availability = page.locator(".availability-card");
    await expect(availability.getByRole("heading", { name: "You are offline" })).toBeVisible();
    const goOnline = availability.getByRole("button", { name: "Go online" });
    await expect(goOnline).toBeEnabled();

    try {
      await goOnline.click();
      await expect(availability.getByRole("heading", { name: "You are online" })).toBeVisible();
      await expect(availability.getByText("You are online and ready for service.")).toBeVisible();
    } finally {
      const goOffline = availability.getByRole("button", { name: "Go offline" });
      if (await goOffline.isVisible()) await goOffline.click();
    }
    await expect(availability.getByRole("heading", { name: "You are offline" })).toBeVisible();
    await expect(availability.getByText("You are offline.")).toBeVisible();
  });
});
