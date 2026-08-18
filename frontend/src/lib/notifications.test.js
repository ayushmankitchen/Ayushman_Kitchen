jest.mock("axios", () => ({
  create: () => ({
    post: jest.fn(),
    interceptors: { request: { use: jest.fn() } },
  }),
}));

import { clearConversationNotifications, updateAppBadge } from "./notifications";

test("sets and clears the app badge from the supplied backend count", () => {
  const setAppBadge = jest.fn(() => Promise.resolve());
  const clearAppBadge = jest.fn(() => Promise.resolve());
  Object.defineProperty(navigator, "setAppBadge", { configurable: true, value: setAppBadge });
  Object.defineProperty(navigator, "clearAppBadge", { configurable: true, value: clearAppBadge });

  updateAppBadge(3);
  updateAppBadge(0);

  expect(setAppBadge).toHaveBeenCalledWith(3);
  expect(clearAppBadge).toHaveBeenCalledTimes(1);
});

test("closes tagged notifications and sends the authoritative total to the worker", async () => {
  const close = jest.fn();
  const postMessage = jest.fn();
  const registration = {
    active: { postMessage },
    getNotifications: jest.fn(async () => [{ close }]),
  };
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { getRegistration: jest.fn(async () => registration) },
  });

  await clearConversationNotifications("conversation-1", 2);

  expect(postMessage).toHaveBeenCalledWith({
    type: "CONVERSATION_READ",
    conversationId: "conversation-1",
    totalUnreadCount: 2,
  });
  expect(registration.getNotifications).toHaveBeenCalledWith({ tag: "conversation-1" });
  expect(close).toHaveBeenCalledTimes(1);
});
