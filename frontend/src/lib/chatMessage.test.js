import { isOwnMessage, isSameMessageSender, normalizeSenderType } from "./chatMessage";

describe("chat message ownership", () => {
  const admin = { type: "owner", id: "admin-1" };
  const worker = { type: "worker", id: "worker-1" };

  test("normalizes current and historical role aliases", () => {
    expect(normalizeSenderType("ADMIN")).toBe("owner");
    expect(normalizeSenderType("WORKER")).toBe("worker");
  });

  test("uses exact sender identity when sender_id exists", () => {
    expect(isOwnMessage({ sender_type: "owner", sender_id: "admin-1" }, admin)).toBe(true);
    expect(isOwnMessage({ sender_type: "owner", sender_id: "other-admin" }, admin)).toBe(false);
    expect(isOwnMessage({ sender_type: "worker", sender_id: "worker-1" }, worker)).toBe(true);
    expect(isOwnMessage({ sender_type: "worker", sender_id: "other-worker" }, worker)).toBe(false);
  });

  test("safely handles legacy messages without sender_id", () => {
    expect(isOwnMessage({ sender_type: "ADMIN" }, admin)).toBe(true);
    expect(isOwnMessage({ sender_type: "WORKER" }, worker)).toBe(true);
    expect(isOwnMessage({ sender_type: "unknown" }, admin)).toBe(false);
  });

  test("groups legacy and current aliases as the same logical sender", () => {
    expect(isSameMessageSender(
      { sender_type: "owner", sender_id: "admin-1" },
      { sender_type: "ADMIN" },
    )).toBe(true);
    expect(isSameMessageSender(
      { sender_type: "worker", sender_id: "worker-2" },
      { sender_type: "worker", sender_id: "worker-1" },
    )).toBe(false);
  });
});
