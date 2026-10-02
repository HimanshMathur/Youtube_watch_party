import { io } from "socket.io-client";

// When both devices are on the same Wi-Fi, use the computer hosting the
// frontend as the Socket.IO server. This avoids hard-coded localhost, which
// would incorrectly point the friend's phone at the phone itself.
const host = window.location.hostname;
const defaultSocketUrl = `${window.location.protocol}//${host}:5000`;
const socketUrl = import.meta.env.VITE_SOCKET_URL || defaultSocketUrl;

export const socket = io(socketUrl, {
  autoConnect: true,
  transports: ["polling", "websocket"],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 500,
});
