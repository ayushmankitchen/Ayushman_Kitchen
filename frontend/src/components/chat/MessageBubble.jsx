import AudioPlayer from "@/components/chat/AudioPlayer";
import { isOwnMessage, isSameMessageSender } from "@/lib/chatMessage";

export default function MessageBubble({ message, previousMessage, currentActor, receivedLabel }) {
  const own = isOwnMessage(message, currentActor);
  const sameSender = isSameMessageSender(message, previousMessage);
  const showSender = !own && !sameSender;
  const time = message.created_at
    ? new Date(message.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : "";

  return (
    <div className={`flex w-full ${sameSender ? "mt-1" : "mt-3"} ${own ? "justify-end" : "justify-start"}`}>
      <div className={`flex max-w-full flex-col ${own ? "items-end" : "items-start"}`}>
        {showSender && receivedLabel && (
          <span className="mb-1 px-1 text-[10px] font-medium text-slate-500">{receivedLabel}</span>
        )}

        {message.message_type === "audio" ? (
          <AudioPlayer audioUrl={message.audio_url} duration={message.duration} own={own} />
        ) : (
          <div className={`chat-bubble max-w-[82%] break-words rounded-2xl px-3.5 py-2 text-sm shadow-sm ${
            own
              ? "rounded-br-md bg-teal-800 text-white"
              : "rounded-bl-md border border-stone-200 bg-white text-slate-900"
          }`}>
            {message.text}
          </div>
        )}

        <span className="mt-0.5 min-h-[14px] px-1 text-[10px] leading-[14px] text-slate-400 tabular-nums">
          {time}{own ? ` · ${message.read_at ? "Seen" : "Sent"}` : ""}
        </span>
      </div>
    </div>
  );
}
