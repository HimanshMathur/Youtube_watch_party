import { useEffect, useState } from "react";
import { Check, Copy, Link2, LogOut, Settings2 } from "lucide-react";
import { socket } from "../socket";

function getVideoId(value) {
  try {
    const url = new URL(value);
    if (url.hostname.includes("youtu.be")) return url.pathname.slice(1).split("/")[0];
    if (url.hostname.includes("youtube.com")) return url.searchParams.get("v") || url.pathname.split("/").pop();
  } catch {
    if (/^[A-Za-z0-9_-]{11}$/.test(value.trim())) return value.trim();
  }
  return null;
}

function formatClock(value) {
  const seconds = Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
}

export default function RoomControls({ roomId, role, currentUserId, onLeave }) {
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [requests, setRequests] = useState([]);
  const [seekTime, setSeekTime] = useState("0");
  const [requestVideo, setRequestVideo] = useState("");
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    const handleCreated = (request) => {
      setRequests((prev) => {
        const remaining = prev.filter((item) => item.id !== request.id);
        return [...remaining, request];
      });
    };

    const handleUpdated = (request) => {
      setRequests((prev) => {
        const remaining = prev.filter((item) => item.id !== request.id);
        return [...remaining, request];
      });
    };

    socket.on("action_request_created", handleCreated);
    socket.on("action_request_updated", handleUpdated);
    socket.on("request_status", handleUpdated);

    return () => {
      socket.off("action_request_created", handleCreated);
      socket.off("action_request_updated", handleUpdated);
      socket.off("request_status", handleUpdated);
    };
  }, []);

  async function copyInvite() {
    try {
      const inviteUrl = new URL(window.location.href);
      inviteUrl.searchParams.set("room", roomId);
      await navigator.clipboard.writeText(inviteUrl.toString());
      setCopied(true);
      setLocalError("");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setLocalError("Unable to copy the invite link. Check clipboard permissions.");
    }
  }

  function emitDirectVideoChange() {
    const videoId = getVideoId(url);
    if (!videoId) {
      setLocalError("Enter a valid YouTube URL or video ID.");
      return;
    }
    socket.emit("change-video", { videoId });
    setUrl("");
    setLocalError("");
  }

  function requestAction(action, payload) {
    socket.emit("request_action", { action, payload });
  }

  function approveRequest(requestId) {
    socket.emit("approve_action", { requestId });
  }

  function rejectRequest(requestId) {
    socket.emit("reject_action", { requestId });
  }

  function requestSeek() {
    const time = Number(seekTime);
    if (!Number.isFinite(time) || time < 0) {
      setLocalError("Enter a valid seek time in seconds.");
      return;
    }
    requestAction("seek", { time });
    setSeekTime("0");
    setLocalError("");
  }

  function requestVideoChange() {
    const videoId = getVideoId(requestVideo);
    if (!videoId) {
      setLocalError("Enter a valid YouTube URL or video ID.");
      return;
    }
    requestAction("change_video", { videoId });
    setRequestVideo("");
    setLocalError("");
  }

  const pendingRequests = requests.filter((request) => request.status === "pending");
  const myRequests = requests.filter((request) => request.requesterUserId === currentUserId);

  return (
    <div className="space-y-3">
      {(role === "host" || role === "moderator") && (
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 shadow-inner">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><span className="grid h-7 w-7 place-items-center rounded-lg bg-rose-400/10 text-rose-300"><Settings2 size={15} /></span> Video controls</div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && emitDirectVideoChange()} placeholder="Paste YouTube URL or video ID" className="min-w-0 flex-1 rounded-xl border border-white/[0.09] bg-black/25 px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 outline-none transition-all duration-200 focus:border-rose-400/50 focus:ring-4 focus:ring-rose-400/[0.06]" />
            <button onClick={emitDirectVideoChange} className="rounded-xl bg-gradient-to-r from-[#ff5148] to-rose-500 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_4px_18px_rgba(255,81,72,0.16)] transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 active:translate-y-0 active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300">Change</button>
          </div>
        </div>
      )}

      {role === "participant" && (
        <div className="rounded-2xl border border-violet-300/10 bg-gradient-to-br from-violet-400/[0.045] to-white/[0.02] p-4 shadow-inner">
          <div className="mb-3 text-sm font-semibold text-zinc-100">Request controls</div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => requestAction("play", {})} className="rounded-xl border border-white/[0.09] bg-white/[0.035] px-3.5 py-2 text-sm text-zinc-200 transition-all duration-200 hover:border-rose-300/20 hover:bg-rose-300/[0.07] active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/70">Request Play</button>
            <button onClick={() => requestAction("pause", {})} className="rounded-xl border border-white/[0.09] bg-white/[0.035] px-3.5 py-2 text-sm text-zinc-200 transition-all duration-200 hover:border-rose-300/20 hover:bg-rose-300/[0.07] active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/70">Request Pause</button>
          </div>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input value={seekTime} onChange={(e) => setSeekTime(e.target.value)} placeholder="Seek time in seconds" className="min-w-0 flex-1 rounded-xl border border-white/[0.09] bg-black/25 px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 outline-none transition-all duration-200 focus:border-rose-400/50 focus:ring-4 focus:ring-rose-400/[0.06]" />
            <button onClick={requestSeek} className="rounded-xl border border-white/[0.09] bg-white/[0.035] px-3.5 py-2.5 text-sm text-zinc-200 transition-all duration-200 hover:border-rose-300/20 hover:bg-rose-300/[0.07] active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/70">Request Seek</button>
          </div>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input value={requestVideo} onChange={(e) => setRequestVideo(e.target.value)} placeholder="Paste YouTube URL or video ID" className="min-w-0 flex-1 rounded-xl border border-white/[0.09] bg-black/25 px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 outline-none transition-all duration-200 focus:border-rose-400/50 focus:ring-4 focus:ring-rose-400/[0.06]" />
            <button onClick={requestVideoChange} className="rounded-xl border border-white/[0.09] bg-white/[0.035] px-3.5 py-2.5 text-sm text-zinc-200 transition-all duration-200 hover:border-rose-300/20 hover:bg-rose-300/[0.07] active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/70">Request Change</button>
          </div>

          {myRequests.length > 0 && (
            <div className="mt-4 space-y-2 text-xs text-zinc-300">
              <p className="font-semibold text-zinc-100">Your requests</p>
              {myRequests.map((request) => (
                <div key={request.id} className="rounded-xl border border-white/[0.07] bg-black/20 px-3 py-2.5">
                  <span className="font-medium capitalize">{request.action.replace("_", " ")}</span>
                  <span className="ml-2 text-zinc-400">{request.status}</span>
                  {request.action === "seek" && <div className="mt-1 text-zinc-400">Target: {formatClock(request.payload?.time)}</div>}
                  {request.action === "change_video" && <div className="mt-1 text-zinc-400">Video: {request.payload?.videoId}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {localError && <p role="alert" className="text-sm text-red-300">{localError}</p>}

      {(role === "host" || role === "moderator") && pendingRequests.length > 0 && (
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 shadow-inner">
          <div className="mb-3 text-sm font-semibold">Pending requests</div>
          <div className="space-y-3">
            {pendingRequests.map((request) => (
              <div key={request.id} className="rounded-xl border border-white/[0.07] bg-black/20 p-3.5">
                <p className="text-sm text-zinc-200">
                  <span className="font-semibold">{request.requesterUsername}</span> wants to {request.action === "change_video" ? "change the video" : request.action === "seek" ? "seek" : request.action.replace("_", " ")}.
                </p>
                {request.action === "seek" && (
                  <p className="mt-1 text-sm text-zinc-400">Seek to: {formatClock(request.payload?.time)}</p>
                )}
                {request.action === "change_video" && (
                  <p className="mt-1 text-sm text-zinc-400">Video: {request.payload?.videoId}</p>
                )}
                <div className="mt-3 flex gap-2">
                  <button onClick={() => approveRequest(request.id)} className="rounded-lg border border-emerald-400/15 bg-emerald-400/[0.06] px-3 py-1.5 text-xs font-medium text-emerald-200 transition-all duration-200 hover:bg-emerald-400/10 active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300">Approve</button>
                  <button onClick={() => rejectRequest(request.id)} className="rounded-lg border border-red-400/15 bg-red-400/[0.06] px-3 py-1.5 text-xs font-medium text-red-200 transition-all duration-200 hover:bg-red-400/10 active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300">Reject</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button onClick={copyInvite} className="flex items-center gap-2 rounded-xl border border-white/[0.09] bg-white/[0.035] px-3.5 py-2.5 text-sm text-zinc-200 transition-all duration-200 hover:border-rose-300/20 hover:bg-rose-300/[0.06] active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/70">
          {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? "Copied" : "Copy invite"}
        </button>
        <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.025] px-3.5 py-2.5 text-sm text-zinc-400"><Link2 size={15} /> {roomId}</div>
        <button onClick={onLeave} className="ml-auto flex items-center gap-2 rounded-xl border border-red-400/15 bg-red-400/[0.045] px-3.5 py-2.5 text-sm text-red-200 transition-all duration-200 hover:border-red-400/25 hover:bg-red-400/[0.09] active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"><LogOut size={15} /> Leave</button>
      </div>
    </div>
  );
}
