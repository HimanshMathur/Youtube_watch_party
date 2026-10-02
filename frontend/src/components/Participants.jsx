import { UserX } from "lucide-react";

export default function Participants({ users, currentUserId, isHost, onRoleChange, onRemove }) {
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">Participants</h2>
          <p className="mt-1 text-xs text-[#9CA3AF]">{users.length} in this room</p>
        </div>
      </div>
      <div className="space-y-2">
        {users.map((user) => {
          return (
            <div key={user.id} className="group rounded-2xl border border-white/[0.07] bg-white/[0.025] p-3 transition-all duration-200 hover:border-white/[0.13] hover:bg-white/[0.045]">
              <div className="flex min-w-0 items-center gap-3">
                <div className={`relative grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br text-xs font-bold text-white shadow-inner ${user.role === "host" ? "from-[#ff5148] to-rose-500" : user.role === "moderator" ? "from-violet-500 to-indigo-500" : "from-zinc-600 to-zinc-800"}`}>
                  {(user.name || "?").slice(0, 2).toUpperCase()}
                  <span className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-[#171a24] ${user.connected === false ? "bg-amber-400" : "bg-emerald-400"}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-zinc-100">{user.name}{user.id === currentUserId ? " (you)" : ""}</p>
                  <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
                    <span className={`rounded-md border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] ${
                      user.role === "host" ? "border-rose-400/25 bg-rose-400/[0.09] text-rose-200"
                        : user.role === "moderator" ? "border-violet-400/20 bg-violet-400/[0.07] text-violet-200"
                          : "border-white/[0.08] bg-white/[0.035] text-zinc-400"
                    }`}>{user.role}</span>
                    {user.connected === false && <span className="text-amber-300">· Reconnecting</span>}
                  </p>
                </div>
                {isHost && user.id !== currentUserId && user.role !== "host" && (
                  <div className="flex items-center gap-1 opacity-100 transition-opacity duration-200 md:opacity-60 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                    {user.connected !== false && (
                      <select
                        value={user.role}
                        onChange={(e) => onRoleChange(user.id, e.target.value)}
                        title="Change role"
                        className="max-w-[130px] rounded-lg border border-white/[0.1] bg-[#11131B] px-2 py-1.5 text-xs text-zinc-300 outline-none transition-all duration-200 hover:border-white/20 focus:border-rose-400/60 focus:ring-2 focus:ring-rose-400/10"
                      >
                        <option value="participant">Participant</option>
                        <option value="moderator">Moderator</option>
                        <option value="host">Transfer Host</option>
                      </select>
                    )}
                    <button title="Remove participant" onClick={() => onRemove(user.id)} className="rounded-lg border border-transparent p-2 text-zinc-500 transition-all duration-200 hover:border-red-400/15 hover:bg-red-400/10 hover:text-red-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/70"><UserX size={15} /></button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
