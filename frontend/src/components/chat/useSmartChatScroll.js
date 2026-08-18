import { useCallback, useEffect, useRef } from "react";

const NEAR_BOTTOM_PX = 96;

export default function useSmartChatScroll(messages, conversationId) {
  const listRef = useRef(null);
  const nearBottomRef = useRef(true);
  const initializedRef = useRef(false);
  const previousLastIdRef = useRef(null);
  const forceNextScrollRef = useRef(false);

  useEffect(() => {
    initializedRef.current = false;
    nearBottomRef.current = true;
    previousLastIdRef.current = null;
    forceNextScrollRef.current = false;
  }, [conversationId]);

  const onScroll = useCallback(() => {
    const node = listRef.current;
    if (!node) return;
    nearBottomRef.current = node.scrollHeight - node.scrollTop - node.clientHeight <= NEAR_BOTTOM_PX;
  }, []);

  const scrollAfterSend = useCallback(() => {
    forceNextScrollRef.current = true;
  }, []);

  useEffect(() => {
    const node = listRef.current;
    if (!node) return;

    const lastId = messages.at(-1)?.id || null;
    const hasNewLastMessage = lastId !== previousLastIdRef.current;
    const shouldScroll = !initializedRef.current || forceNextScrollRef.current || (hasNewLastMessage && nearBottomRef.current);

    if (shouldScroll) {
      node.scrollTo({
        top: node.scrollHeight,
        behavior: initializedRef.current ? "smooth" : "auto",
      });
      nearBottomRef.current = true;
    }

    initializedRef.current = true;
    forceNextScrollRef.current = false;
    previousLastIdRef.current = lastId;
  }, [messages, conversationId]);

  return { listRef, onScroll, scrollAfterSend };
}
