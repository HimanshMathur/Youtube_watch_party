require("dotenv").config();

const express = require("express");
const http = require("http");
const cors = require("cors");
const crypto = require("crypto");
const { Server } = require("socket.io");

const PORT = Number(process.env.PORT) || 5000;

const app = express();
app.use(cors({ origin: true }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: true, methods: ["GET", "POST"] },
  transports: ["polling", "websocket"],
});

const rooms = new Map();
const MAX_ROOM_USERS = 50;
const ROOM_TTL_MS = 30 * 60 * 1000;
const USER_RECONNECT_GRACE_MS = 2 * 60 * 1000;
let isShuttingDown = false;

function normalizeRoomId(value) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 24);
}

function normalizeUsername(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 30);
}

function createRoomState() {
  return { videoId: "e2tZ-u9dWsk", currentTime: 0, isPlaying: false, updatedAt: Date.now(), sourceUserId: null, sourceAction: null };
}

function createRoom() {
  return {
    users: new Map(),
    revokedSessions: new Set(),
    expiredSessions: new Set(),
    hostAssigned: false,
    playback: createRoomState(),
    chatHistory: [],
    actionRequests: new Map(),
    deleteTimer: null,
  };
}

function scheduleRoomDelete(roomId) {
  const room = rooms.get(roomId);
  if (!room || room.deleteTimer) return;
  room.deleteTimer = setTimeout(() => {
    const current = rooms.get(roomId);
    if (current && [...current.users.values()].every((u) => !u.connected)) rooms.delete(roomId);
  }, ROOM_TTL_MS);
}

function cancelRoomDelete(room) {
  if (room?.deleteTimer) clearTimeout(room.deleteTimer);
  if (room) room.deleteTimer = null;
}

function publicUsers(room) {
  return [...room.users.values()].map(({ id, name, role, connected }) => ({ id, name, role, connected }));
}

function emitRoomUsers(roomId) {
  const room = rooms.get(roomId);
  if (room) io.to(roomId).emit("participants", publicUsers(room));
}

function emitRoomState(roomId) {
  const room = rooms.get(roomId);
  if (room) io.to(roomId).emit("room-state", getPlaybackSnapshot(room.playback));
}

function getPlaybackSnapshot(playback, serverTime = Date.now()) {
  const currentTime = playback.isPlaying
    ? playback.currentTime + Math.max(0, serverTime - playback.updatedAt) / 1000
    : playback.currentTime;
  return {
    ...playback,
    currentTime: Math.max(0, currentTime),
    serverTime,
  };
}

function getUser(room, sessionId) {
  return room?.users.get(sessionId) || null;
}

function canControl(role) {
  return role === "host" || role === "moderator";
}

function canChangeVideo(role) {
  return role === "host" || role === "moderator";
}

function extractYouTubeVideoId(value) {
  const input = String(value || "").trim();
  if (!input) return null;
  if (/^[A-Za-z0-9_-]{11}$/.test(input)) return input;

  try {
    const url = new URL(input);
    const hostname = url.hostname.toLowerCase();

    if (hostname.includes("youtu.be")) {
      const id = url.pathname.replace(/^\/+/, "").split("/")[0];
      return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
    }

    if (hostname.includes("youtube.com")) {
      const videoId = url.searchParams.get("v");
      if (videoId && /^[A-Za-z0-9_-]{11}$/.test(videoId)) return videoId;
      const segments = url.pathname.split("/").filter(Boolean);
      const last = segments[segments.length - 1];
      return /^[A-Za-z0-9_-]{11}$/.test(last) ? last : null;
    }
  } catch {
    return null;
  }

  return null;
}

function emitRoomError(socket, message) {
  socket.emit("room-error", message);
}

function applyPlaybackAction(roomId, action, payload = {}, sourceUserId = null, approvedByUserId = null) {
  const room = rooms.get(roomId);
  if (!room || !["play", "pause", "seek"].includes(action)) return null;

  const now = Date.now();
  const effectiveTime = getPlaybackSnapshot(room.playback, now).currentTime;
  const requestedSeekTime = Number(payload.time);
  const time = action === "seek" && Number.isFinite(requestedSeekTime)
    ? Math.max(0, requestedSeekTime)
    : effectiveTime;
  room.playback.currentTime = time;
  if (action === "play") room.playback.isPlaying = true;
  if (action === "pause") room.playback.isPlaying = false;
  if (action === "seek" && payload.isPlaying !== undefined) room.playback.isPlaying = Boolean(payload.isPlaying);
  room.playback.updatedAt = now;
  room.playback.sourceUserId = sourceUserId;
  room.playback.sourceAction = action;

  const update = {
    ...room.playback,
    action,
    ...getPlaybackSnapshot(room.playback, now),
  };

  io.to(roomId).emit("playback", update);
  io.to(roomId).emit("room-state", getPlaybackSnapshot(room.playback, now));

  if (approvedByUserId) {
    const approver = [...room.users.values()].find((user) => user.id === approvedByUserId);
    if (approver?.connected) {
      io.to(approver.id).emit("approved-playback", update);
    }
  }

  return room.playback;
}

function applyVideoChange(roomId, videoId, sourceUserId = null) {
  const room = rooms.get(roomId);
  if (!room) return null;

  room.playback = {
    videoId,
    currentTime: 0,
    isPlaying: false,
    updatedAt: Date.now(),
    sourceUserId,
    sourceAction: "change-video",
  };

  io.to(roomId).emit("video-changed", { videoId });
  emitRoomState(roomId);
  return room.playback;
}

function updateAndBroadcastRole(roomId, targetUser, role) {
  const room = rooms.get(roomId);
  if (!room || !targetUser) return null;
  targetUser.role = role;

  const participants = publicUsers(room);
  io.to(roomId).emit("participants", participants);
  io.to(roomId).emit("role_assigned", {
    userId: targetUser.id,
    username: targetUser.name,
    role,
    participants,
  });

  return { userId: targetUser.id, username: targetUser.name, role, participants };
}

function removeParticipantFromRoom(roomId, actorUser, targetUserId) {
  const room = rooms.get(roomId);
  if (!room || !actorUser) return false;

  const entry = [...room.users.entries()].find(([, u]) => u.id === targetUserId);
  if (!entry) return false;

  const [sessionId, target] = entry;
  const targetSocket = io.sockets.sockets.get(target.socketId);

  if (target.disconnectTimer) clearTimeout(target.disconnectTimer);
  room.revokedSessions.add(sessionId);
  room.users.delete(sessionId);

  if (targetSocket) {
    targetSocket.leave(roomId);
    targetSocket.data.roomId = null;
    targetSocket.data.sessionId = null;
    targetSocket.emit("removed-from-room", "The host removed you from the room.");
  }

  const participants = publicUsers(room);
  io.to(roomId).emit("participants", participants);
  io.to(roomId).emit("participant_removed", {
    userId: target.id,
    username: target.name,
    participants,
  });

  return true;
}

io.on("connection", (socket) => {
  socket.on("join-room", ({ roomId: rawRoomId, username: rawUsername, create = false, sessionId: rawSessionId } = {}) => {
    const roomId = normalizeRoomId(rawRoomId);
    const username = normalizeUsername(rawUsername);
    const sessionId = String(rawSessionId || crypto.randomUUID()).slice(0, 100);

    if (!roomId || !username) {
      return socket.emit("room-error", "Room ID and username are required.");
    }

    let room = rooms.get(roomId);
    if (create) {
      if (room) return socket.emit("room-error", "That room already exists. Join it instead.");
      room = createRoom();
      rooms.set(roomId, room);
    } else if (!room) {
      return socket.emit("room-error", "Room not found. Ask the host for the correct room ID.");
    }

    if (room.revokedSessions.has(sessionId)) {
      return socket.emit("room-error", "Your access to this room was removed. Join with a new session or ask the host for an invitation.");
    }
    if (room.expiredSessions.has(sessionId)) {
      return socket.emit("room-error", "Your saved room session expired. Join the room again to continue.");
    }

    cancelRoomDelete(room);

    const existing = room.users.get(sessionId);
    if (existing) {
      if (existing.disconnectTimer) clearTimeout(existing.disconnectTimer);
      existing.id = socket.id;
      existing.name = username;
      existing.connected = true;
      existing.socketId = socket.id;
      socket.join(roomId);
      socket.data.roomId = roomId;
      socket.data.sessionId = sessionId;
      socket.emit("joined-room", { roomId, userId: socket.id, role: existing.role, sessionId });
      socket.emit("room-state", getPlaybackSnapshot(room.playback));
      socket.emit("chat-history", room.chatHistory);
      emitRoomUsers(roomId);
      return;
    }

    if (room.users.size >= MAX_ROOM_USERS) {
      return socket.emit("room-error", "This room is full.");
    }

    if ([...room.users.values()].some((u) => u.name.toLowerCase() === username.toLowerCase())) {
      return socket.emit("room-error", "That username is already in this room.");
    }

    const role = room.hostAssigned ? "participant" : "host";
    if (role === "host") room.hostAssigned = true;
    room.users.set(sessionId, { id: socket.id, socketId: socket.id, sessionId, name: username, role, connected: true });
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.sessionId = sessionId;

    socket.emit("joined-room", { roomId, userId: socket.id, role, sessionId });
    socket.emit("room-state", getPlaybackSnapshot(room.playback));
    socket.emit("chat-history", room.chatHistory);
    emitRoomUsers(roomId);
  });

  socket.on("sync-request", () => {
    const room = rooms.get(socket.data.roomId);
    if (room) socket.emit("room-state", getPlaybackSnapshot(room.playback));
  });

  socket.on("time-sync", ({ clientSentAt } = {}) => {
    socket.emit("time-sync-response", {
      clientSentAt: Number.isFinite(Number(clientSentAt)) ? Number(clientSentAt) : null,
      serverTime: Date.now(),
    });
  });

  socket.on("send-chat-message", ({ message: rawMessage } = {}) => {
    const room = rooms.get(socket.data.roomId);
    const user = getUser(room, socket.data.sessionId);
    if (!room || !user || !user.connected) {
      return emitRoomError(socket, "You are not connected to a valid room.");
    }

    const message = String(rawMessage || "").replace(/[\u0000-\u001F\u007F]/g, "").trim();
    if (!message || message.length > 1000) {
      return emitRoomError(socket, "Chat messages must contain 1 to 1000 characters.");
    }

    const chatMessage = {
      id: crypto.randomUUID(),
      userId: user.id,
      username: user.name,
      message,
      timestamp: Date.now(),
    };
    room.chatHistory.push(chatMessage);
    if (room.chatHistory.length > 200) room.chatHistory.shift();
    io.to(socket.data.roomId).emit("chat-message", chatMessage);
  });

  socket.on("request_action", ({ action, payload = {} } = {}) => {
    const room = rooms.get(socket.data.roomId);
    const user = getUser(room, socket.data.sessionId);

    if (!room || !user || !user.connected) {
      return emitRoomError(socket, "You are not connected to a valid room.");
    }

    if (user.role !== "participant") {
      return emitRoomError(socket, "Only participants can request actions.");
    }

    if (!["play", "pause", "seek", "change_video"].includes(action)) {
      return emitRoomError(socket, "That request is not supported.");
    }

    let verifiedPayload = {};
    if (action === "seek") {
      const time = Number(payload.time);
      if (!Number.isFinite(time) || time < 0) {
        return emitRoomError(socket, "A valid seek time is required.");
      }
      verifiedPayload = { time: Math.max(0, time) };
    }

    if (action === "change_video") {
      const videoId = extractYouTubeVideoId(payload.videoId || payload.url);
      if (!videoId) {
        return emitRoomError(socket, "Enter a valid YouTube URL or video ID.");
      }
      verifiedPayload = { videoId };
    }

    const request = {
      id: crypto.randomUUID(),
      roomId: socket.data.roomId,
      requesterUserId: user.id,
      requesterUsername: user.name,
      action,
      payload: verifiedPayload,
      createdAt: Date.now(),
      status: "pending",
    };

    room.actionRequests.set(request.id, request);
    io.to(socket.data.roomId).emit("action_request_created", request);
    socket.emit("request_status", request);
  });

  socket.on("approve_action", ({ requestId } = {}) => {
    const room = rooms.get(socket.data.roomId);
    const approver = getUser(room, socket.data.sessionId);

    if (!room || !approver || !approver.connected) {
      return emitRoomError(socket, "You are not connected to this room.");
    }

    if (!canControl(approver.role)) {
      return emitRoomError(socket, "Only a host or moderator can approve requests.");
    }

    const request = room.actionRequests.get(requestId);
    if (!request || request.roomId !== socket.data.roomId) {
      return emitRoomError(socket, "That request is no longer pending.");
    }

    if (request.status !== "pending") {
      return emitRoomError(socket, "That request is no longer pending.");
    }

    if (request.requesterUserId === approver.id) {
      return emitRoomError(socket, "You cannot approve your own request.");
    }

    request.status = "approved";
    request.approvedByUserId = approver.id;
    request.approvedAt = Date.now();

    if (["play", "pause", "seek"].includes(request.action)) {
      const payload = request.action === "seek"
        ? { time: request.payload.time, isPlaying: room.playback.isPlaying }
        : {};
      applyPlaybackAction(socket.data.roomId, request.action, payload, null, approver.id);
    }
    if (request.action === "change_video") {
      const videoId = extractYouTubeVideoId(request.payload.videoId);
      if (!videoId) {
        request.status = "rejected";
        io.to(socket.data.roomId).emit("action_request_updated", request);
        return emitRoomError(socket, "This request contains an invalid video ID.");
      }
      applyVideoChange(socket.data.roomId, videoId);
    }

    io.to(socket.data.roomId).emit("action_request_updated", request);
  });

  socket.on("reject_action", ({ requestId } = {}) => {
    const room = rooms.get(socket.data.roomId);
    const approver = getUser(room, socket.data.sessionId);

    if (!room || !approver || !approver.connected) {
      return emitRoomError(socket, "You are not connected to this room.");
    }

    if (!canControl(approver.role)) {
      return emitRoomError(socket, "Only a host or moderator can reject requests.");
    }

    const request = room.actionRequests.get(requestId);
    if (!request || request.roomId !== socket.data.roomId) {
      return emitRoomError(socket, "That request is no longer pending.");
    }

    if (request.status !== "pending") {
      return emitRoomError(socket, "That request is no longer pending.");
    }

    request.status = "rejected";
    request.rejectedByUserId = approver.id;
    request.rejectedAt = Date.now();
    io.to(socket.data.roomId).emit("action_request_updated", request);
  });

  socket.on("playback", ({ action, time, isPlaying } = {}) => {
    const room = rooms.get(socket.data.roomId);
    const user = getUser(room, socket.data.sessionId);

    if (!room || !user || !user.connected) {
      return emitRoomError(socket, "You are not connected to a valid room.");
    }

    if (!canControl(user.role)) {
      return emitRoomError(socket, "You do not have permission to control playback.");
    }

    if (!["play", "pause", "seek"].includes(action)) {
      return emitRoomError(socket, "Invalid playback action.");
    }

    applyPlaybackAction(socket.data.roomId, action, { time, isPlaying }, socket.id);
  });

  socket.on("change-video", ({ videoId } = {}) => {
    const room = rooms.get(socket.data.roomId);
    const user = getUser(room, socket.data.sessionId);

    if (!room || !user || !user.connected) {
      return emitRoomError(socket, "You are not connected to this room.");
    }

    if (!canChangeVideo(user.role)) {
      return emitRoomError(socket, "You do not have permission to change the video.");
    }

    const normalized = extractYouTubeVideoId(videoId);
    if (!normalized) {
      return emitRoomError(socket, "Invalid YouTube video ID.");
    }

    applyVideoChange(socket.data.roomId, normalized, socket.id);
  });

  socket.on("set-role", ({ userId, role } = {}) => {
    const room = rooms.get(socket.data.roomId);
    const me = getUser(room, socket.data.sessionId);

    if (!room || !me || me.role !== "host") {
      return emitRoomError(socket, "Only the host can assign roles.");
    }

    if (role === "host") {
      const target = [...room.users.values()].find((u) => u.id === userId && u.connected);
      if (!target || target === me || target.role === "host") {
        return emitRoomError(socket, "Invalid host transfer target.");
      }
      me.role = "moderator";
      target.role = "host";
      const participants = publicUsers(room);
      io.to(socket.data.roomId).emit("participants", participants);
      io.to(socket.data.roomId).emit("role_assigned", { userId: target.id, username: target.name, role: "host", participants });
      return;
    }

    if (!["moderator", "participant"].includes(role)) {
      return emitRoomError(socket, "Invalid role.");
    }

    const target = [...room.users.values()].find((u) => u.id === userId && u.connected);
    if (!target || target.role === "host") {
      return emitRoomError(socket, "You cannot change the host's role.");
    }

    updateAndBroadcastRole(socket.data.roomId, target, role);
  });

  socket.on("assign_role", ({ userId, role } = {}) => {
    const room = rooms.get(socket.data.roomId);
    const me = getUser(room, socket.data.sessionId);

    if (!room || !me || me.role !== "host") {
      return emitRoomError(socket, "Only the host can assign roles.");
    }

    if (role === "host") {
      const target = [...room.users.values()].find((u) => u.id === userId && u.connected);
      if (!target || target === me || target.role === "host") {
        return emitRoomError(socket, "Invalid host transfer target.");
      }
      me.role = "moderator";
      target.role = "host";
      const participants = publicUsers(room);
      io.to(socket.data.roomId).emit("participants", participants);
      io.to(socket.data.roomId).emit("role_assigned", { userId: target.id, username: target.name, role: "host", participants });
      return;
    }

    if (!["moderator", "participant"].includes(role)) {
      return emitRoomError(socket, "Invalid role.");
    }

    const target = [...room.users.values()].find((u) => u.id === userId && u.connected);
    if (!target || target.role === "host") {
      return emitRoomError(socket, "You cannot change the host's role.");
    }

    updateAndBroadcastRole(socket.data.roomId, target, role);
  });

  socket.on("remove-user", ({ userId } = {}) => {
    const room = rooms.get(socket.data.roomId);
    const me = getUser(room, socket.data.sessionId);

    if (!room || !me || me.role !== "host") {
      return emitRoomError(socket, "Only the host can remove participants.");
    }

    removeParticipantFromRoom(socket.data.roomId, me, userId);
  });

  socket.on("remove_participant", ({ userId } = {}) => {
    const room = rooms.get(socket.data.roomId);
    const me = getUser(room, socket.data.sessionId);

    if (!room || !me || me.role !== "host") {
      return emitRoomError(socket, "Only the host can remove participants.");
    }

    removeParticipantFromRoom(socket.data.roomId, me, userId);
  });

  socket.on("leave-room", ({ roomId: rawRoomId, sessionId: requestedSessionId } = {}, acknowledge) => {
    const roomId = socket.data.roomId || normalizeRoomId(rawRoomId);
    const sessionId = socket.data.sessionId || String(requestedSessionId || "").slice(0, 100);
    const room = rooms.get(roomId);
    if (!room || !sessionId) {
      acknowledge?.({ ok: true });
      return;
    }

    const user = room.users.get(sessionId);
    if (!user || (socket.data.sessionId && socket.data.sessionId !== sessionId)
      || (!socket.data.sessionId && user.connected)
      || (user.connected && user.socketId !== socket.id)) {
      acknowledge?.({ ok: false });
      return;
    }
    if (user?.disconnectTimer) clearTimeout(user.disconnectTimer);
    room.users.delete(sessionId);
    if (socket.data.roomId === roomId) socket.leave(roomId);
    socket.data.roomId = null;
    socket.data.sessionId = null;
    emitRoomUsers(roomId);
    if (room.users.size === 0) scheduleRoomDelete(roomId);
    acknowledge?.({ ok: true });
  });

  socket.on("disconnect", () => {
    const roomId = socket.data.roomId;
    const sessionId = socket.data.sessionId;
    const room = rooms.get(roomId);
    const user = getUser(room, sessionId);
    if (!room || !user || user.socketId !== socket.id) return;

    user.connected = false;
    user.socketId = null;
    emitRoomUsers(roomId);
    if (isShuttingDown) return;
    user.disconnectTimer = setTimeout(() => {
      const currentRoom = rooms.get(roomId);
      const currentUser = currentRoom?.users.get(sessionId);
      if (!currentRoom || !currentUser || currentUser.connected) return;
      currentRoom.users.delete(sessionId);
      currentRoom.expiredSessions.add(sessionId);
      emitRoomUsers(roomId);
      if (currentRoom.users.size === 0) scheduleRoomDelete(roomId);
    }, USER_RECONNECT_GRACE_MS);
    if ([...room.users.values()].every((u) => !u.connected)) scheduleRoomDelete(roomId);
  });
});

app.get("/", (_req, res) => res.json({ name: "YouTube Watch Party API", status: "ok" }));
app.get("/health", (_req, res) => res.json({ status: "healthy", rooms: rooms.size }));

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. Stop the existing backend before starting another instance.`);
  } else {
    console.error("Backend server failed:", error);
  }
  process.exitCode = 1;
});

function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`${signal} received; closing Watch Party server.`);
  for (const room of rooms.values()) {
    if (room.deleteTimer) clearTimeout(room.deleteTimer);
    for (const user of room.users.values()) {
      if (user.disconnectTimer) clearTimeout(user.disconnectTimer);
    }
  }
  io.close(() => {
    console.log("Watch Party server closed.");
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Watch Party server running on port ${PORT}`);
  console.log(`LAN server: http://<YOUR-PC-IP>:${PORT}`);
});
