# YouTube Watch Party

## Overview

This project is a real-time YouTube watch-party application that allows a host to create a room, invite others, and keep everyone synchronized on the same video playback state. The application uses React on the frontend and Socket.IO with Node.js/Express on the backend.

The backend is authoritative for room membership, role permissions, playback state, and video changes. The frontend is responsible for rendering the room UI and applying server-driven playback updates to the YouTube player.

## Features

- Create and join room-based watch parties
- Real-time participant list
- Host / moderator / participant role model
- Host can assign moderator role and remove participants
- Moderator can play, pause, seek, and change video
- Participant can request playback and video changes rather than directly controlling the shared player
- Server-authoritative playback state and room synchronization
- Late-join synchronization using a server-timed playback position
- YouTube iframe player updates are server-driven for every client
- Copyable invite link with a name-only join flow for room links
- Real-time room chat with timestamps and recent message history
- Dark themed responsive UI

## Tech stack

- Frontend: React, Vite, Tailwind CSS
- Backend: Node.js, Express, Socket.IO
- Video rendering: YouTube IFrame API

## Folder structure

```text
youtube-watch-party-fixed-v3/
├── backend/
│   ├── .env.example
│   ├── package-lock.json
│   ├── package.json
│   └── server.js
├── frontend/
│   ├── .env.example
│   ├── index.html
│   ├── package-lock.json
│   ├── package.json
│   ├── postcss.config.js
│   ├── tailwind.config.js
│   ├── vite.config.js
│   └── src/
│       ├── App.jsx
│       ├── index.css
│       ├── main.jsx
│       ├── socket.js
│       └── components/
│           ├── Chat.jsx
│           ├── Participants.jsx
│           ├── RoomControls.jsx
│           ├── RoomLobby.jsx
│           └── YouTubePlayer.jsx
├── README.md
├── REQUIREMENTS_CHECKLIST.md
└── .gitignore
```

## Local setup

### 1. Backend

```bash
cd backend
npm install
npm run dev
```

The development command checks the configured port before starting the single
`node --watch server.js` watcher. If a Watch Party backend already responds on
that port, it reuses the running instance instead of starting a duplicate.
Stop that instance if you need the watcher to serve code changes. The backend
closes its HTTP and Socket.IO listeners on SIGINT/SIGTERM.

Default backend URL:

```text
http://localhost:3000
```

### 2. Frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Default frontend URL:

```text
http://localhost:5173
```

## Environment variables

### Backend

The server reads `PORT` if set. If not set, it defaults to `3000`.

Example:

```bash
PORT=3000
```

### Frontend

If the frontend is connected to a remotely hosted backend, set:

```env
VITE_SOCKET_URL=http://your-backend-host:3000
```

If the frontend and backend run on the same local machine, the default socket URL is derived automatically from the browser host and the backend port.

## Frontend run command

```bash
cd frontend
npm install
npm run dev
```

## Backend run command

```bash
cd backend
npm install
npm run dev
```

## WebSocket architecture

The application uses Socket.IO for room membership, role updates, request approval, and playback synchronization.

Core events include:

- `join-room`
- `room-state`
- `participants`
- `request_action`
- `approve_action`
- `reject_action`
- `action_request_created`
- `action_request_updated`
- `playback`
- `change-video`
- `set-role`
- `remove_participant`
- `send-chat-message`
- `chat-history`
- `chat-message`
- `time-sync`
- `sync-request`

## Room state architecture

Each room keeps an in-memory authoritative state object containing:

```js
{
  videoId: "...",
  currentTime: 0,
  isPlaying: false,
  updatedAt: Date.now()
}
```

`updatedAt` is the server timestamp anchoring `currentTime`. While playing, the
backend computes the effective position from `currentTime` plus elapsed server
time whenever it sends a snapshot. Clients estimate server-clock offset with
`time-sync` and compensate for snapshot transit time. Actual room-state changes
are applied once; regular checks measure drift without reapplying the whole
state. A receiver is corrected only after drift exceeds 1.5 seconds, with a
five-second correction cooldown. Small differences are left alone, and an
authoritative seek is applied once per room-state update. Buffering is ignored
as a control action. A host or moderator's directly applied playback action is
not reapplied to its own player; approved participant requests are broadcast as
room-wide commands, including to the approver. New and reconnecting participants
receive a current snapshot as soon as they join, including the video ID and
playing/paused state.

The YouTube IFrame API is configured with the current page origin. Its player
errors are logged with the IFrame API error code, video ID, and current origin,
then handled with concise messages for invalid IDs, unavailable/private videos,
embed restrictions, origin errors, HTML5 errors, and other failures. The small
status and YouTube link leave the player visible; retry is offered only where
appropriate. A video that YouTube disallows for embedding cannot play inside
the room; the app does not bypass that restriction.

Disconnected membership is retained for a two-minute reconnect grace period.
Reconnecting sessions keep their assigned role; expired sessions must join
again, and removed sessions are revoked. The first host role is not silently
transferred when its member disconnects or leaves. An explicit leave made
while offline is completed on the next connection instead of being lost.

Chat messages are stored in memory per room and the latest 200 are sent to
joining participants. New messages are broadcast immediately to everyone in
the room; message bodies are limited to 1,000 characters.

Room links use the `room` (or `roomId`) query parameter. Links that also carry
a `password`, `roomPassword`, `token`, `access_token`, `invite`, or `key`
parameter retain that parameter and open directly to the display-name join
screen. The current backend does not enforce room passwords; room access
continues to use the existing room-ID behavior.

This is a Node.js-only project, so Python-specific files such as
`requirements.txt` do not apply. Separate `package.json` and `.env.example`
files are maintained for the backend and frontend services.

## Role permissions

### Host
- Can play, pause, seek, and change video
- Can assign moderator role
- Can remove participants

### Moderator
- Can play, pause, seek, and change video
- Cannot assign roles
- Cannot remove participants

### Participant
- Cannot directly play, pause, seek, or change the shared video
- Can request playback/video changes that require host or moderator approval

## Participant request / approval workflow

Participants do not directly control the shared YouTube player. Instead, they submit a request such as:

- Request Play
- Request Pause
- Request Seek
- Request Change

These requests are created on the backend with a pending status and broadcast to the host/moderator.

When the host or moderator approves a request, the backend validates the approver and request, performs the same authoritative playback/video update used by normal host or moderator controls, and broadcasts the resulting room state to all clients.

For approved Play and Pause requests, the backend anchors the action at the effective server-timed playback position, not the last stored position. Approved commands are broadcast as room-wide state changes, including to the moderator who approved them.

A rejected request changes the request status only and leaves the room state untouched.

## Synchronization flow

### Host / moderator action

```text
React UI
    ↓
Socket.IO
    ↓
Node/Express backend
    ↓
permission validation
    ↓
authoritative room state
    ↓
Socket.IO broadcast
    ↓
all connected clients
    ↓
YouTube IFrame API
```

### Participant request approval

```text
Participant
    ↓
request_action
    ↓
backend request creation
    ↓
Host/Moderator approval
    ↓
backend authoritative action
    ↓
room state update
    ↓
Socket.IO broadcast
    ↓
all clients
    ↓
YouTube player synchronization
```

The backend remains authoritative for permissions and room playback state.

## Deployment instructions

This project is ready to be deployed as separate services:

- Backend: Node.js service on Render, Railway, Fly.io, or another Node host
- Frontend: static Vite app on Vercel, Netlify, Cloudflare Pages, or similar

Set the frontend socket URL to the deployed backend host when needed.

Example:

```env
VITE_SOCKET_URL=https://your-backend-domain.example
```

## Live deployment URL

Live URL:
https://youtube-watch-party-1-w156.onrender.com/

## Notes

- Host transfer on disconnect is not implemented, and this is not described as a current feature.
- The project intentionally blocks direct participant player interaction while still allowing server-driven synchronization.
- The request UI remains available to participants as a request-only workflow and is not a direct playback control surface.
