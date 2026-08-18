import React from "react";
import { act } from "react-dom/test-utils";
import { createRoot } from "react-dom/client";
import UnreadBadge, { formatUnreadCount } from "./UnreadBadge";

function renderBadge(count) {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const node = document.createElement("div");
  const root = createRoot(node);
  act(() => root.render(<UnreadBadge count={count} />));
  return { node, root };
}

test("does not render a badge for a zero unread count", () => {
  const { node, root } = renderBadge(0);
  expect(node.childNodes).toHaveLength(0);
  act(() => root.unmount());
});

test("caps large unread counts without changing the accessible total", () => {
  const { node, root } = renderBadge(127);
  expect(node.textContent).toBe("99+");
  expect(node.firstChild.getAttribute("aria-label")).toBe("127 unread messages");
  expect(formatUnreadCount(9)).toBe("9");
  act(() => root.unmount());
});
