import { expect, type Page } from "@playwright/test";

export async function messageFixture(page: Page, role: "rider" | "driver") {
  const bookingId = "90000000-0000-4000-8000-000000000001", incomingId = "a0000000-0000-4000-8000-000000000001";
  const messages = [{ messageId: incomingId, senderRole: role === "rider" ? "driver" : "rider", body: "<img src=x onerror=alert(1)> At the entrance", sentAt: new Date().toISOString() }];
  let unread = true;
  const marks: string[][] = [];
  await page.route("**/rest/v1/rpc/my_trip_attention", (route) => route.fulfill({ json: unread ? [{ kind: "messages", bookingId, itemId: bookingId, count: 1 }] : [] }));
  await page.route("**/rest/v1/rpc/mark_my_trip_messages_read", (route) => {
    const args = route.request().postDataJSON() as { message_values: string[]; role_value: string; booking_value: string };
    expect(args.role_value).toBe(role); expect(args.booking_value).toBe(bookingId); marks.push(args.message_values);
    unread = false; return route.fulfill({ json: true });
  });
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
    await expect(page.locator(".trip-messages summary .trip-unread-badge")).toHaveText("1");
    expect(marks).toEqual([]);
    await page.locator(".trip-messages summary").click();
    await expect(page.getByText("<img src=x onerror=alert(1)> At the entrance", { exact: true })).toBeVisible();
    await expect(page.locator(".trip-message-list img")).toHaveCount(0);
    await page.locator(".trip-read-marker").scrollIntoViewIfNeeded();
    await expect.poll(() => marks.length).toBe(1);
    expect(marks).toEqual([[incomingId]]);
    await expect(page.locator(".trip-messages summary .trip-unread-badge")).toHaveCount(0);
    await page.getByLabel("Trip message", { exact: true }).fill("I am outside");
    await page.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Message could not be confirmed" })).toBeVisible();
    await expect(page.getByLabel("Trip message", { exact: true })).toHaveValue("I am outside");
    fail = false;
    await page.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(page.getByText("I am outside", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Trip message", { exact: true })).toHaveValue("");
    expect(ids[0]).toBe(ids[1]);
    expect(marks).toEqual([[incomingId]]);
    await page.locator(".trip-messages").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/${role}-trip-messages-414.png`, fullPage: true });
    await page.setViewportSize({ width: 414, height: 560 });
    await page.getByLabel("Trip message", { exact: true }).fill("Keyboard check");
    await page.getByRole("button", { name: "Send message", exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByRole("button", { name: "Send message", exact: true })).toBeInViewport();
  };
}
