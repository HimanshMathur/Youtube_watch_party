import { useEffect, useRef, useState } from "react";
import { Crown, Hash, LogOut, Radio, Shield, UserRound, Wifi, WifiOff } from "lucide-react";
import RoomLobby from "./components/RoomLobby";
import Participants from "./components/Participants";
import RoomControls from "./components/RoomControls";
import YouTubePlayer from "./components/YouTubePlayer";
import Chat from "./components/Chat";
import { socket } from "./socket";

function getInviteFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return {
    roomId: (params.get("room") || params.get("roomId") || "").toUpperCase(),
    credential: params.get("password")
      || params.get("roomPassword")
      || params.get("token")
      || params.get("access_token")
      || params.get("invite")
      || params.get("key")
      || "",
  };
}

function createSessionId() {
  if (globalThis.crypto?.getRandomValues) {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export default function App() {
  const [room, setRoom] = useState(null);
  const [users, setUsers] = useState([]);
  const [playback, setPlayback] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [connection, setConnection] = useState(socket.connected);
  const [reconnecting, setReconnecting] = useState(false);
  const [error, setError] = useState("");
  const [joining, setJoining] = useState(false);
  const roomRef = useRef(room);
  roomRef.current = room;

  useEffect(() => {
    const onConnect = () => {
      setConnection(true);
      const pendingLeaveRoom = localStorage.getItem("watch-party-pending-leave-room");
      const pendingLeaveSession = localStorage.getItem("watch-party-pending-leave-session");
      if (pendingLeaveRoom && pendingLeaveSession) {
        socket.emit("leave-room", { roomId: pendingLeaveRoom, sessionId: pendingLeaveSession }, ({ ok } = {}) => {
          if (ok
            && localStorage.getItem("watch-party-pending-leave-room") === pendingLeaveRoom
            && localStorage.getItem("watch-party-pending-leave-session") === pendingLeaveSession) {
            localStorage.removeItem("watch-party-pending-leave-room");
            localStorage.removeItem("watch-party-pending-leave-session");
          }
        });
        return;
      }
      const invite = getInviteFromUrl();
      const savedName = localStorage.getItem("watch-party-name");
      const sessionId = localStorage.getItem("watch-party-session");
      const savedRoomId = localStorage.getItem("watch-party-room");
      const activeRoom = roomRef.current;
      const roomId = invite.roomId || savedRoomId;
      if (roomId && savedName && sessionId && (!activeRoom || activeRoom.roomId === roomId)) {
        setJoining(true);
        socket.emit("join-room", {
          username: savedName,
          roomId,
          create: false,
          sessionId,
          inviteCredential: invite.roomId ? invite.credential : "",
        });
      }
    };
    const onDisconnect = () => {
      setConnection(false);
      setReconnecting(true);
    };
    const onReconnectAttempt = () => setReconnecting(true);
    const onConnectError = () => {
      setConnection(false);
      setJoining(false);
      setError("Unable to connect to the watch-party server. Check your connection and try again.");
    };
    const onJoined = ({ roomId, userId, role, sessionId }) => {
      setJoining(false);
      setReconnecting(false);
      setError("");
      if (sessionId) localStorage.setItem("watch-party-session", sessionId);
      localStorage.setItem("watch-party-room", roomId);
      setRoom({ roomId, userId, role });
      const url = new URL(window.location.href);
      url.searchParams.set("room", roomId);
      window.history.replaceState({}, "", url);
    };
    const onUsers = (list) => setUsers(list);
    const onState = (state) => setPlayback(state);
    const onChatHistory = (history) => setChatMessages(Array.isArray(history) ? history : []);
    const onChatMessage = (message) => setChatMessages((previous) => [...previous, message].slice(-200));
    const onError = (message) => {
      setJoining(false);
      setReconnecting(false);
      if (String(message).includes("access to this room was removed")
        || String(message).includes("room session expired")
        || String(message).startsWith("Room not found.")) {
        localStorage.removeItem("watch-party-session");
        localStorage.removeItem("watch-party-room");
        localStorage.removeItem("watch-party-pending-leave-room");
        localStorage.removeItem("watch-party-pending-leave-session");
        setRoom(null);
        setUsers([]);
        setPlayback(null);
        setChatMessages([]);
      }
      setError(message);
    };
    const onRemoved = (message) => {
      setError(message);
      localStorage.removeItem("watch-party-session");
      localStorage.removeItem("watch-party-room");
      localStorage.removeItem("watch-party-pending-leave-room");
      localStorage.removeItem("watch-party-pending-leave-session");
      setRoom(null);
      setUsers([]);
      setPlayback(null);
      setChatMessages([]);
    };
    const onRoleAssigned = ({ participants }) => {
      if (Array.isArray(participants)) setUsers(participants);
    };
    const onParticipantRemoved = ({ participants }) => {
      if (Array.isArray(participants)) setUsers(participants);
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.io.on("reconnect_attempt", onReconnectAttempt);
    socket.on("connect_error", onConnectError);
    socket.on("joined-room", onJoined);
    socket.on("participants", onUsers);
    socket.on("room-state", onState);
    socket.on("chat-history", onChatHistory);
    socket.on("chat-message", onChatMessage);
    socket.on("room-error", onError);
    socket.on("removed-from-room", onRemoved);
    socket.on("role_assigned", onRoleAssigned);
    socket.on("participant_removed", onParticipantRemoved);
    if (socket.connected) onConnect();

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.io.off("reconnect_attempt", onReconnectAttempt);
      socket.off("connect_error", onConnectError);
      socket.off("joined-room", onJoined);
      socket.off("participants", onUsers);
      socket.off("room-state", onState);
      socket.off("chat-history", onChatHistory);
      socket.off("chat-message", onChatMessage);
      socket.off("room-error", onError);
      socket.off("removed-from-room", onRemoved);
      socket.off("role_assigned", onRoleAssigned);
      socket.off("participant_removed", onParticipantRemoved);
    };
  }, []);

  function joinRoom({ username, roomId, create, inviteCredential }) {
    setError("");
    setJoining(true);
    const sessionId = localStorage.getItem("watch-party-session") || createSessionId();
    localStorage.setItem("watch-party-session", sessionId);
    socket.emit("join-room", { username, roomId, create, sessionId, inviteCredential });
  }

  function leaveRoom() {
    const roomId = room?.roomId || localStorage.getItem("watch-party-room");
    const sessionId = localStorage.getItem("watch-party-session");
    if (roomId && sessionId) {
      localStorage.setItem("watch-party-pending-leave-room", roomId);
      localStorage.setItem("watch-party-pending-leave-session", sessionId);
      if (socket.connected) {
        socket.emit("leave-room", { roomId, sessionId }, ({ ok } = {}) => {
          if (ok
            && localStorage.getItem("watch-party-pending-leave-room") === roomId
            && localStorage.getItem("watch-party-pending-leave-session") === sessionId) {
            localStorage.removeItem("watch-party-pending-leave-room");
            localStorage.removeItem("watch-party-pending-leave-session");
          }
        });
      }
    }
    localStorage.removeItem("watch-party-session");
    localStorage.removeItem("watch-party-room");
    setRoom(null);
    setUsers([]);
    setPlayback(null);
    setChatMessages([]);
    const url = new URL(window.location.href);
    ["room", "roomId", "password", "roomPassword", "token", "access_token", "invite", "key"]
      .forEach((parameter) => url.searchParams.delete(parameter));
    window.history.replaceState({}, "", url);
  }

  function changeRole(userId, role) {
    socket.emit("set-role", { userId, role });
  }

  function removeUser(userId) {
    if (window.confirm("Remove this participant from the room?")) {
      socket.emit("remove_participant", { userId });
    }
  }

  if (!room) {
    const invite = getInviteFromUrl();
    return <RoomLobby onJoin={joinRoom} joining={joining} error={error} invite={invite} />;
  }

  const me = users.find((user) => user.id === room.userId);
  const role = me?.role || room.role;

  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-[#090A0F] px-4 py-5 text-[#F5F7FA] sm:px-6 lg:px-8 lg:py-7">
      <div aria-hidden="true" className="pointer-events-none absolute -left-40 top-28 -z-10 h-96 w-96 rounded-full bg-rose-500/[0.055] blur-[130px]" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-36 top-0 -z-10 h-96 w-96 rounded-full bg-violet-500/[0.065] blur-[130px]" />
      <div className="mx-auto max-w-[1500px]">
        <header className="animate-enter mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/[0.08] bg-[#11131B]/80 px-4 py-3 shadow-panel backdrop-blur-xl sm:px-5">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-gradient-to-br from-[#ff5148]/20 to-violet-500/15 text-rose-300 shadow-[0_0_24px_rgba(255,81,72,0.12)]"><Radio size={19} /></div>
            <div><h1 className="text-base font-semibold tracking-tight">Watch Party</h1><div className="mt-1 inline-flex items-center gap-1.5 rounded-md border border-white/[0.07] bg-black/20 px-2 py-0.5 text-[11px] text-zinc-500"><Hash size={11} /><span>Room</span><span className="font-semibold tracking-[0.16em] text-zinc-200">{room.roomId}</span></div></div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <span className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${connection ? "border-emerald-500/20 bg-emerald-500/[0.055] text-emerald-200" : "border-red-500/20 bg-red-500/[0.06] text-red-200"}`}>
              <span className={`relative grid h-2 w-2 place-items-center rounded-full ${connection ? "bg-emerald-400" : "bg-red-400"}`}>{connection && <span className="absolute h-2 w-2 animate-ping rounded-full bg-emerald-400/60" />}</span>
              {connection ? <Wifi size={13} /> : <WifiOff size={13} />} {connection ? "Connected" : reconnecting ? "Reconnecting..." : "Disconnected"}
            </span>
            <span className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs capitalize ${role === "host" ? "border-rose-400/25 bg-gradient-to-r from-rose-400/[0.12] to-red-400/[0.05] text-rose-200" : role === "moderator" ? "border-violet-400/20 bg-violet-400/[0.07] text-violet-200" : "border-white/[0.08] bg-white/[0.035] text-zinc-300"}`}>
              {role === "host" ? <Crown size={13} /> : role === "moderator" ? <Shield size={13} /> : <UserRound size={13} />}{role}
            </span>
            <button onClick={leaveRoom} className="rounded-lg border border-white/[0.08] bg-white/[0.035] p-2 text-zinc-400 transition-all duration-200 hover:border-red-400/25 hover:bg-red-400/10 hover:text-red-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/70" title="Leave room"><LogOut size={17} /></button>
          </div>
        </header>

        {error && <div className="mb-5 rounded-xl border border-red-400/20 bg-red-400/[0.07] px-4 py-3 text-sm text-red-200 shadow-inner">{error}</div>}

        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_370px]">
          <section className="animate-enter min-w-0 rounded-3xl border border-white/[0.09] bg-[#11131B]/85 p-4 shadow-panel backdrop-blur-xl sm:p-5 lg:p-6">
            <div className="mb-5 flex items-center justify-between gap-4"><div><p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-rose-300/80">Theater</p><h2 className="text-lg font-semibold tracking-tight">Now watching</h2><p className="mt-1 text-sm text-zinc-400">Everyone with playback permissions stays synchronized.</p></div><span className="hidden rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-1.5 text-[11px] text-zinc-400 sm:inline-flex">WATCH PARTY</span></div>
            {playback && <div className="rounded-2xl bg-gradient-to-br from-rose-500/[0.09] via-transparent to-violet-500/[0.08] p-px shadow-glow"><div className="rounded-2xl bg-[#090A0F] p-1"><YouTubePlayer roomId={room.roomId} role={role} playback={playback} /></div></div>}
            <div className="mt-6 border-t border-white/[0.08] pt-5"><RoomControls roomId={room.roomId} role={role} currentUserId={room.userId} onLeave={leaveRoom} /></div>
          </section>

          <aside className="animate-enter min-w-0 rounded-3xl border border-white/[0.09] bg-[#11131B]/85 p-4 shadow-panel backdrop-blur-xl sm:p-5" style={{ animationDelay: "90ms" }}>
            <Participants users={users} currentUserId={room.userId} isHost={role === "host"} onRoleChange={changeRole} onRemove={removeUser} />
            <div className="mt-6 border-t border-white/[0.08] pt-5">
              <Chat messages={chatMessages} currentUsername={localStorage.getItem("watch-party-name")} onSend={(message) => socket.emit("send-chat-message", { message })} />
            </div>
            <div className="mt-6 rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.045] to-white/[0.015] p-4 text-xs leading-5 text-zinc-400 shadow-inner">
              <p className="mb-3 font-semibold text-zinc-100">Room permissions</p>
              <div className="space-y-2.5">
                <p className="flex items-start gap-2.5"><Crown size={14} className="mt-0.5 shrink-0 text-rose-300" /><span><span className="font-medium text-zinc-200">Host:</span> change video, playback, roles, remove users.</span></p>
                <p className="flex items-start gap-2.5"><Shield size={14} className="mt-0.5 shrink-0 text-violet-300" /><span><span className="font-medium text-zinc-200">Moderator:</span> playback and video controls.</span></p>
                <p className="flex items-start gap-2.5"><UserRound size={14} className="mt-0.5 shrink-0 text-zinc-400" /><span><span className="font-medium text-zinc-200">Participant:</span> request playback and video changes.</span></p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
