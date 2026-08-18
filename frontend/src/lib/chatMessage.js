const OWNER_TYPES = new Set(["owner", "admin", "administrator"]);
const WORKER_TYPES = new Set(["worker", "employee"]);

export function normalizeSenderType(value) {
  const type = String(value || "").trim().toLowerCase();
  if (OWNER_TYPES.has(type)) return "owner";
  if (WORKER_TYPES.has(type)) return "worker";
  return null;
}

/** Returns true only when the message can be attributed to the current actor. */
export function isOwnMessage(message, currentActor) {
  const messageType = normalizeSenderType(message?.sender_type);
  const actorType = normalizeSenderType(currentActor?.type || currentActor?.sender_type);
  if (!messageType || !actorType || messageType !== actorType) return false;

  const senderId = message?.sender_id;
  if (senderId !== undefined && senderId !== null && String(senderId).trim()) {
    return currentActor?.id !== undefined
      && currentActor?.id !== null
      && String(currentActor.id) === String(senderId);
  }

  // sender_type is only a safe fallback for legacy records that have no ID.
  return messageType === actorType;
}

export function isSameMessageSender(message, previousMessage) {
  if (!message || !previousMessage) return false;
  const type = normalizeSenderType(message.sender_type);
  if (!type || type !== normalizeSenderType(previousMessage.sender_type)) return false;

  const senderId = message.sender_id ? String(message.sender_id) : null;
  const previousSenderId = previousMessage.sender_id ? String(previousMessage.sender_id) : null;
  return !senderId || !previousSenderId || senderId === previousSenderId;
}
