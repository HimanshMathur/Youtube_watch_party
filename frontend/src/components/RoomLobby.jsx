import { useMemo, useState } from "react";
import { Film, Hash, LoaderCircle, LockKeyhole, LogIn, Plus, Radio, Sparkles, UserRound, Users, Play, ShieldCheck } from "lucide-react";

function generateRoomId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export default function RoomLobby({ onJoin, joining, error: externalError, invite }) {
  const savedName = localStorage.getItem("watch-party-name") || "";
  const [name, setName] = useState(savedName);
  const [roomId, setRoomId] = useState(invite?.roomId || "");
  const [mode, setMode] = useState(invite?.roomId ? "join" : "create");
  const [error, setError] = useState("");
  const inviteMode = Boolean(invite?.roomId);

  const generatedId = useMemo(() => generateRoomId(), []);

  function submit() {
    const cleanName = name.trim();
    const cleanRoom = (mode === "create" ? generatedId : (invite?.roomId || roomId)).trim().toUpperCase();
    if (cleanName.length < 2) return setError("Enter a name with at least 2 characters.");
    if (cleanRoom.length < 3) return setError("Enter a valid room ID.");
    localStorage.setItem("watch-party-name", cleanName);
    setError("");
    onJoin({
      username: cleanName,
      roomId: cleanRoom,
      create: mode === "create",
      inviteCredential: invite?.credential,
    });
  }

  return (
    <main id="home" className="relative isolate min-h-screen overflow-hidden bg-[#080C12] px-5 pb-12 text-[#F5F7FA] sm:px-8">
      <div aria-hidden="true" className="ambient-grid pointer-events-none absolute inset-0 -z-10 opacity-25" />
      <div aria-hidden="true" className="pointer-events-none absolute -left-24 top-20 -z-10 h-72 w-72 rounded-full bg-[#FF5A5F]/[0.045] blur-[110px]" />
      <div aria-hidden="true" className="pointer-events-none absolute right-0 top-24 -z-10 h-80 w-80 rounded-full bg-[#8B91C9]/[0.055] blur-[120px]" />
      <header className="sticky top-0 z-20 mx-auto max-w-6xl border-b border-[#28313D] bg-[#080C12]/95 backdrop-blur-md">
        <div className="flex min-h-[76px] flex-wrap items-center justify-between gap-x-6 gap-y-3 py-3">
          <a href="#home" className="flex shrink-0 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5A5F]/70">
            <span className="grid h-9 w-9 place-items-center rounded-xl border border-[#FF5A5F]/20 bg-[#FF5A5F]/[0.08] text-[#FF777B]"><Radio size={18} /></span>
            <span className="text-sm font-semibold tracking-tight text-[#F5F7FA]">Watch Party</span>
          </a>
          <nav aria-label="Main navigation" className="order-3 flex w-full items-center justify-center gap-1 sm:order-none sm:w-auto sm:gap-2">
            <a href="#home" className="rounded-lg px-3 py-2 text-sm text-[#A8B0BC] transition-colors hover:bg-[#151B24] hover:text-[#F5F7FA]">Home</a>
            <a href="#features" className="rounded-lg px-3 py-2 text-sm text-[#A8B0BC] transition-colors hover:bg-[#151B24] hover:text-[#F5F7FA]">Features</a>
          </nav>
          <a href="#room-card" className="shrink-0 rounded-lg border border-[#FF5A5F]/30 bg-[#FF5A5F]/[0.08] px-3.5 py-2 text-sm font-medium text-[#FF8589] transition-colors hover:border-[#FF5A5F]/50 hover:bg-[#FF5A5F]/[0.13]">Get started</a>
        </div>
      </header>
      <div className="mx-auto max-w-6xl">
        <div className="grid items-center gap-10 py-12 sm:py-16 lg:min-h-[570px] lg:grid-cols-[1.05fr_.8fr] lg:gap-16 lg:py-12">
          <section className="animate-enter max-w-2xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#28313D] bg-[#10151D]/80 px-3 py-1.5 text-[10px] font-semibold tracking-[0.17em] text-[#A8B0BC]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#FF5A5F]" /> REAL-TIME YOUTUBE WATCHING
            </div>
            <h1 className="max-w-2xl text-4xl font-bold leading-[1.08] tracking-[-0.04em] sm:text-5xl lg:text-[56px]">
              Watch together.<br /><span className="text-[#FF5A5F]">Stay in sync.</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-[#A8B0BC] sm:text-lg sm:leading-8">
              Create a private room, invite your friends, and watch YouTube together in real time with synchronized playback and live participants.
            </p>
            <div className="mt-8 flex max-w-xl flex-wrap gap-2.5 text-xs text-[#C1C7D0]">
              {[
                { label: "Play / Pause Sync", Icon: Play },
                { label: "Seek Sync", Icon: Sparkles },
                { label: "Live Roles", Icon: Users },
                { label: "Host Controls", Icon: ShieldCheck },
              ].map(({ label, Icon }) => (
              <span key={label} className="inline-flex items-center gap-2 rounded-lg border border-[#28313D] bg-[#10151D]/75 px-3 py-2"><Icon size={14} className="text-[#8B91C9]" />{label}</span>
              ))}
            </div>
          </section>

          <section id="room-card" className="animate-enter relative mx-auto w-full max-w-md scroll-mt-28 overflow-hidden rounded-2xl border border-[#28313D] bg-[#151B24]/95 p-6 shadow-[0_18px_55px_rgba(0,0,0,0.32)] sm:p-8" style={{ animationDelay: "100ms" }}>
            <div aria-hidden="true" className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
            <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-24 h-48 w-48 rounded-full bg-rose-500/[0.09] blur-3xl" />
            <div className="mb-8 flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-xl border border-[#FF5A5F]/15 bg-[#FF5A5F]/[0.07] text-[#FF777B]">
                <Film size={21} />
              </div>
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-[#F5F7FA]">Watch Party</h2>
                <p className="mt-0.5 text-sm text-[#707986]">Start or join a room</p>
              </div>
            </div>

            {inviteMode ? (
              <div className="mb-5 flex gap-3 rounded-xl border border-[#FF5A5F]/20 bg-[#FF5A5F]/[0.06] p-3.5 text-sm leading-6 text-[#E8B7BB]">
                <Sparkles size={16} className="mt-1 shrink-0 text-[#FF777B]" />
                <span>Invite detected for room <span className="font-semibold tracking-wider text-white">{invite.roomId}</span>. Enter your display name to join.</span>
              </div>
            ) : (
              <div className="mb-6 grid grid-cols-2 rounded-xl border border-[#28313D] bg-[#0D1219] p-1">
                <button onClick={() => setMode("create")} className={`rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5A5F]/70 ${mode === "create" ? "bg-[#222A35] text-white shadow-sm" : "text-[#A8B0BC] hover:bg-white/[0.035] hover:text-white"}`}>Create room</button>
                <button onClick={() => setMode("join")} className={`rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5A5F]/70 ${mode === "join" ? "bg-[#222A35] text-white shadow-sm" : "text-[#A8B0BC] hover:bg-white/[0.035] hover:text-white"}`}>Join room</button>
              </div>
            )}

            <label className="mb-2 block text-sm font-medium text-[#C1C7D0]">Your name</label>
            <div className="relative mb-4">
              <UserRound className="absolute left-3 top-3.5 text-[#707986]" size={17} />
              <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="e.g. Himansh" className="w-full rounded-xl border border-[#28313D] bg-[#0D1219] py-3.5 pl-10 pr-4 text-sm text-white placeholder:text-[#707986] outline-none transition-all duration-200 focus:border-[#FF5A5F]/65 focus:ring-4 focus:ring-[#FF5A5F]/[0.07]" />
            </div>

            {mode === "join" && !inviteMode && (
              <>
                <label className="mb-2 block text-sm font-medium text-[#C1C7D0]">Room ID</label>
                <div className="relative mb-4">
                  <Hash className="absolute left-3 top-3.5 text-[#707986]" size={17} />
                  <input value={roomId} onChange={(e) => setRoomId(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="e.g. A7K2P9" className="w-full rounded-xl border border-[#28313D] bg-[#0D1219] py-3.5 pl-10 pr-4 text-sm uppercase tracking-widest text-white placeholder:text-[#707986] outline-none transition-all duration-200 focus:border-[#FF5A5F]/65 focus:ring-4 focus:ring-[#FF5A5F]/[0.07]" />
                </div>
              </>
            )}

            {mode === "create" && <p className="mb-5 rounded-xl border border-[#28313D] bg-[#10151D] p-3.5 text-sm leading-5 text-[#A8B0BC]">Your room ID will be generated automatically when you create the room.</p>}
            {(error || externalError) && <p className="mb-4 rounded-xl border border-red-400/20 bg-red-400/[0.06] px-3.5 py-3 text-sm text-red-200">{error || externalError}</p>}

            <button onClick={submit} className="group flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#FF5A5F] to-[#C96F91] px-4 py-3.5 text-sm font-semibold text-white shadow-[0_6px_18px_rgba(201,111,145,0.16)] transition-all duration-200 hover:brightness-105 hover:shadow-[0_8px_22px_rgba(201,111,145,0.22)] active:scale-[.99] disabled:cursor-wait disabled:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8A91] focus-visible:ring-offset-2 focus-visible:ring-offset-[#151B24]">
              {joining ? <LoaderCircle size={18} className="animate-spin" /> : mode === "create" ? <Plus size={19} className="transition-transform group-hover:rotate-90" /> : <LogIn size={19} />}
              {joining ? "Connecting..." : mode === "create" ? "Create Watch Party" : "Join Watch Party"}
            </button>
          </section>
        </div>
        <section id="features" className="animate-enter scroll-mt-28 border-t border-[#28313D] py-10 sm:py-12" style={{ animationDelay: "180ms" }}>
          <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8B91C9]">Made for sharing the moment</p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-[#F5F7FA] sm:text-2xl">Everything you need to watch together</h2>
            </div>
            <p className="max-w-md text-sm leading-6 text-[#A8B0BC]">A private space for synchronized viewing and easy collaboration.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { title: "Synchronized playback", Icon: Play, tone: "text-[#FF777B] bg-[#FF5A5F]/[0.07]" },
              { title: "Live participants", Icon: Users, tone: "text-[#8B91C9] bg-[#8B91C9]/[0.08]" },
              { title: "Private rooms", Icon: LockKeyhole, tone: "text-[#8B91C9] bg-[#8B91C9]/[0.08]" },
              { title: "Role-based controls", Icon: ShieldCheck, tone: "text-[#FF777B] bg-[#FF5A5F]/[0.07]" },
            ].map(({ title, Icon, tone }) => (
              <div key={title} className="rounded-xl border border-[#28313D] bg-[#10151D]/80 p-4 transition-colors duration-200 hover:border-[#3A4655]">
                <span className={`mb-3 grid h-9 w-9 place-items-center rounded-lg ${tone}`}><Icon size={17} /></span>
                <h3 className="text-sm font-medium text-[#E4E8EE]">{title}</h3>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
