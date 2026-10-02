import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send } from "lucide-react";

function formatTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function Chat({ messages, currentUsername, onSend }) {
  const [draft, setDraft] = useState("");
  const historyRef = useRef(null);
  const hasScrolledInitialHistoryRef = useRef(false);

  useEffect(() => {
    const history = historyRef.current;
    if (!history || messages.length === 0) return;
    if (!hasScrolledInitialHistoryRef.current) {
      history.scrollTo({ top: history.scrollHeight });
      hasScrolledInitialHistoryRef.current = true;
      return;
    }
    const wasNearBottom = history.scrollHeight - history.scrollTop - history.clientHeight < 80;
    if (wasNearBottom) history.scrollTo({ top: history.scrollHeight, behavior: "smooth" });
  }, [messages]);

  function submit(event) {
    event.preventDefault();
    const message = draft.trim();
    if (!message) return;
    onSend(message);
    setDraft("");
  }

  return (
    <section aria-label="Live chat">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight"><MessageCircle size={16} className="text-rose-300" /> Live chat</h2>
          <p className="mt-1 text-xs text-zinc-500">Chat with everyone in the room</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/15 bg-emerald-400/[0.06] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />Live</span>
      </div>

      <div ref={historyRef} aria-live="polite" className="mb-3 flex h-64 flex-col gap-3 overflow-y-auto rounded-2xl border border-white/[0.07] bg-black/20 p-3.5 shadow-inner">
        {messages.length === 0 ? (
          <div className="m-auto flex max-w-48 flex-col items-center text-center">
            <div className="mb-3 grid h-10 w-10 place-items-center rounded-full border border-white/[0.07] bg-white/[0.035] text-zinc-500"><MessageCircle size={17} /></div>
            <p className="text-xs leading-5 text-zinc-500">No messages yet. Start the conversation.</p>
          </div>
        ) : messages.map((item) => {
          const isOwnMessage = item.username === currentUsername;
          const date = new Date(item.timestamp);
          return (
            <article key={item.id} className={`max-w-full animate-enter ${isOwnMessage ? "ml-5" : "mr-5"}`}>
              <div className={`mb-1 flex items-baseline justify-between gap-2 ${isOwnMessage ? "flex-row-reverse" : ""}`}>
                <span className={`truncate text-[11px] font-semibold ${isOwnMessage ? "text-rose-200" : "text-zinc-300"}`}>{isOwnMessage ? "You" : item.username}</span>
                <time className="shrink-0 text-[10px] text-zinc-600" dateTime={Number.isNaN(date.getTime()) ? undefined : date.toISOString()}>{formatTimestamp(item.timestamp)}</time>
              </div>
              <p className={`break-words rounded-2xl px-3.5 py-2.5 text-[13px] leading-5 shadow-sm ${isOwnMessage ? "rounded-tr-md border border-rose-400/10 bg-gradient-to-br from-rose-500/[0.13] to-rose-500/[0.05] text-zinc-100" : "rounded-tl-md border border-white/[0.05] bg-white/[0.045] text-zinc-300"}`}>{item.message}</p>
            </article>
          );
        })}
      </div>

      <form onSubmit={submit} className="flex gap-2 rounded-2xl border border-white/[0.07] bg-black/20 p-1.5 shadow-inner transition focus-within:border-rose-400/30 focus-within:ring-4 focus-within:ring-rose-400/[0.05]">
        <input
          aria-label="Chat message"
          maxLength={1000}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Write a message..."
          className="min-w-0 flex-1 rounded-xl bg-transparent px-3 py-2 text-sm text-white placeholder:text-zinc-600 outline-none"
        />
        <button aria-label="Send message" type="submit" disabled={!draft.trim()} className="grid w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#ff5148] to-rose-500 text-white shadow-[0_4px_15px_rgba(255,81,72,0.18)] transition-all duration-200 hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300">
          <Send size={16} />
        </button>
      </form>
    </section>
  );
}
