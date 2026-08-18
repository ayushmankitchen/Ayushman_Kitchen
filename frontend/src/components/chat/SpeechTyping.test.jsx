import React from "react";
import { act } from "react-dom/test-utils";
import { createRoot } from "react-dom/client";
import SpeechTyping from "./SpeechTyping";

test("shows a non-blocking fallback when speech recognition is unsupported", async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  delete window.SpeechRecognition;
  delete window.webkitSpeechRecognition;
  const node = document.createElement("div");
  const root = createRoot(node);
  await act(async () => root.render(<SpeechTyping onSpeechResult={() => {}} />));
  expect(node.textContent).toContain("text and voice messages still work");
  await act(async () => root.unmount());
});
