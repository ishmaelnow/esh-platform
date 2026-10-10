import { expect, type Page } from "@playwright/test";

export async function messageFixture(page: Page, role: "rider" | "driver") {
  const messages = [{ messageId: "incoming", senderRole: role === "rider" ? "driver" : "rider", body: "<img src=x onerror=alert(1)> At the entrance", sentAt: new Date().toISOString() }];
  let fail = true;
  const ids: string[] = [];
  await page.route("**/rest/v1/rpc/my_trip_messages", (route) => {
    const args = route.request().postDataJSON() as { role_value: string };
    expect(args.role_value).toBe(role);
    return route.fulfill({ json: messages });
  });
  await page.route("**/rest/v1/rpc/send_my_trip_message", (route) => {
    const args = route.request().postDataJSON() as { body_value: string; request_value: string; role_value: string };
    expect(args.role_value).toBe(role); ids.push(args.request_value);
    if (fail) return route.fulfill({ status: 400, json: { message: "fixture failure" } });
    messages.push({ messageId: "sent", senderRole: role, body: args.body_value, sentAt: new Date().toISOString() });
    return route.fulfill({ json: "sent" });
  });
  return async () => {
    await page.getByText("Trip messages", { exact: true }).click();
    await expect(page.getByText("<img src=x onerror=alert(1)> At the entrance", { exact: true })).toBeVisible();
    await expect(page.locator(".trip-message-list img")).toHaveCount(0);
    await page.getByLabel("Trip message", { exact: true }).fill("I am outside");
    await page.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Message could not be confirmed" })).toBeVisible();
    await expect(page.getByLabel("Trip message", { exact: true })).toHaveValue("I am outside");
    fail = false;
    await page.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(page.getByText("I am outside", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Trip message", { exact: true })).toHaveValue("");
    expect(ids[0]).toBe(ids[1]);
    await page.locator(".trip-messages").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/${role}-trip-messages-414.png`, fullPage: true });
    await page.setViewportSize({ width: 414, height: 560 });
    await page.getByLabel("Trip message", { exact: true }).fill("Keyboard check");
    await page.getByRole("button", { name: "Send message", exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByRole("button", { name: "Send message", exact: true })).toBeInViewport();
  };
}
