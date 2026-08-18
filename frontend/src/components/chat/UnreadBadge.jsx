export function formatUnreadCount(count) {
  const unread = Math.max(0, Number(count) || 0);
  return unread > 99 ? "99+" : String(unread);
}

export default function UnreadBadge({ count, className = "" }) {
  if (!(Number(count) > 0)) return null;

  return (
    <span
      aria-label={`${count} unread message${Number(count) === 1 ? "" : "s"}`}
      className={`chat-unread-badge ${className}`}
    >
      {formatUnreadCount(count)}
    </span>
  );
}
