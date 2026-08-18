import React from "react";
import { act } from "react-dom/test-utils";
import { createRoot } from "react-dom/client";
import WorkerAvatar, { getInitials, getColorPalette } from "./WorkerAvatar";

function renderAvatar(props) {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const node = document.createElement("div");
  document.body.appendChild(node);
  const root = createRoot(node);
  act(() => root.render(<WorkerAvatar {...props} />));
  return {
    node,
    root,
    cleanup: () => {
      act(() => root.unmount());
      node.remove();
    },
  };
}

describe("WorkerAvatar", () => {
  test("getInitials generates correct initials", () => {
    expect(getInitials("Ramesh Kumar")).toBe("RK");
    expect(getInitials("Amit")).toBe("AM");
    expect(getInitials("Amit Kumar Verma")).toBe("AV");
    expect(getInitials("")).toBe("W");
    expect(getInitials(null)).toBe("W");
  });

  test("getColorPalette returns consistent palette object", () => {
    const p1 = getColorPalette("Ramesh Kumar");
    const p2 = getColorPalette("Ramesh Kumar");
    expect(p1).toEqual(p2);
    expect(p1.bg).toBeDefined();
    expect(p1.text).toBeDefined();
  });

  test("renders initials fallback with accessible label when no photo is provided", () => {
    const { node, cleanup } = renderAvatar({ name: "Ramesh Kumar" });
    const fallback = node.querySelector('[data-testid="worker-avatar-fallback"]');
    expect(fallback).not.toBeNull();
    expect(fallback.textContent).toBe("RK");
    expect(fallback.getAttribute("aria-label")).toBe("Ramesh Kumar profile photo");
    cleanup();
  });

  test("renders img element when photoUrl is provided", () => {
    const { node, cleanup } = renderAvatar({
      name: "Ramesh Kumar",
      photoUrl: "https://res.cloudinary.com/demo/image/upload/sample.jpg",
    });
    const img = node.querySelector('[data-testid="worker-avatar-img"]');
    expect(img).not.toBeNull();
    expect(img.getAttribute("src")).toBe("https://res.cloudinary.com/demo/image/upload/sample.jpg");
    expect(img.getAttribute("alt")).toBe("Ramesh Kumar profile photo");
    cleanup();
  });

  test("falls back to initials when img triggers onError", () => {
    const { node, cleanup } = renderAvatar({
      name: "Ramesh Kumar",
      photoUrl: "https://example.com/broken.jpg",
    });
    const img = node.querySelector('[data-testid="worker-avatar-img"]');
    expect(img).not.toBeNull();

    act(() => {
      img.dispatchEvent(new Event("error"));
    });

    const fallback = node.querySelector('[data-testid="worker-avatar-fallback"]');
    expect(fallback).not.toBeNull();
    expect(fallback.textContent).toBe("RK");
    cleanup();
  });
});
