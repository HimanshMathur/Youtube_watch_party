import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { socket } from "../socket";

let apiPromise;

function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;

  apiPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(window.YT);
    };
    if (!existing) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.onerror = () => {
        script.remove();
        reject(new Error("Unable to load the YouTube player API."));
      };
      document.body.appendChild(script);
    }
  }).catch((error) => {
    apiPromise = null;
    throw error;
  });
  return apiPromise;
}

function isSeekDiscontinuity(previous, time, performanceTime) {
  if (!previous) return false;
  const elapsed = (performanceTime - previous.performanceTime) / 1000;
  const expectedDelta = previous.isPlaying ? elapsed : 0;
  return Math.abs(time - previous.time - expectedDelta) > 1.5;
}

export default function YouTubePlayer({ role, playback }) {
  const containerRef = useRef(null);
  const playerRef = useRef(null);
  const roleRef = useRef(role);
  const playbackRef = useRef(playback);
  const serverOffsetMsRef = useRef(0);
  const clockOffsetInitializedRef = useRef(false);
  const pendingSyncRef = useRef(null);
  const pendingLocalSeekRef = useRef(null);
  const lastSampleRef = useRef(null);
  const lastAppliedPlaybackRef = useRef(null);
  const playbackRateRef = useRef(1);
  const loadedVideoIdRef = useRef(null);
  const playerErrorRef = useRef(null);
  const lastDriftCorrectionAtRef = useRef(0);
  const driftCorrectionArmedRef = useRef(true);
  const readyRef = useRef(false);
  const autoplayTimerRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [needsGesture, setNeedsGesture] = useState(false);
  const [playerError, setPlayerError] = useState(null);
  const isParticipant = role === "participant";
  const canControl = role === "host" || role === "moderator";

  roleRef.current = role;
  if (pendingLocalSeekRef.current
    && playback?.updatedAt !== pendingLocalSeekRef.current.previousUpdatedAt) {
    pendingLocalSeekRef.current = null;
  }
  if (!pendingLocalSeekRef.current) playbackRef.current = playback;

  const getTargetTime = useCallback((state) => {
    if (!state) return 0;
    const elapsed = state.isPlaying && Number.isFinite(Number(state.serverTime))
      ? Math.max(0, (Date.now() + serverOffsetMsRef.current - Number(state.serverTime)) / 1000)
      : 0;
    return Math.max(0, Number(state.currentTime || 0) + elapsed);
  }, []);

  const syncPlayer = useCallback((forceSeek = false) => {
    const player = playerRef.current;
    const state = playbackRef.current;
    if (!readyRef.current || !player || !state?.videoId) return;
    const updateKey = `${state.videoId}:${state.updatedAt ?? ""}`;
    if (!forceSeek && lastAppliedPlaybackRef.current === updateKey) return;
    if (playerErrorRef.current && playerErrorRef.current.videoId !== state.videoId) {
      playerErrorRef.current = null;
      setPlayerError(null);
      loadedVideoIdRef.current = null;
    }
    if (playerErrorRef.current) return;

    const isNewAuthoritativeUpdate = lastAppliedPlaybackRef.current !== updateKey;
    const targetTime = getTargetTime(state);
    const playerState = player.getPlayerState?.();
    const currentVideoId = loadedVideoIdRef.current;
    const videoChanged = currentVideoId !== state.videoId;
    const actualTime = Number(player.getCurrentTime?.()) || 0;
    const drift = targetTime - actualTime;
    const driftMagnitude = Math.abs(drift);
    const isExplicitSeek = isNewAuthoritativeUpdate && state.sourceAction === "seek";
    const shouldSeek = forceSeek
      || videoChanged
      || isExplicitSeek
      || (isNewAuthoritativeUpdate && driftMagnitude >= 0.75)
      || (driftMagnitude >= 0.75 && performance.now() - lastDriftCorrectionAtRef.current > 5000);

    const expectedState = state.isPlaying ? window.YT.PlayerState.PLAYING : window.YT.PlayerState.PAUSED;
    const isBuffering = playerState === window.YT.PlayerState.BUFFERING;
    const needsPlay = state.isPlaying
      && playerState !== window.YT.PlayerState.PLAYING;
    const needsPause = !state.isPlaying
      && (playerState === window.YT.PlayerState.PLAYING || isBuffering);
    if (videoChanged || shouldSeek || needsPlay || needsPause) {
      pendingSyncRef.current = { expectedState, expiresAt: Date.now() + 5000 };
      if (videoChanged) {
        const video = { videoId: state.videoId, startSeconds: targetTime };
        loadedVideoIdRef.current = state.videoId;
        if (state.isPlaying) player.loadVideoById(video);
        else player.cueVideoById(video);
        lastDriftCorrectionAtRef.current = performance.now();
      } else {
        if (shouldSeek) {
          player.setPlaybackRate?.(1);
          playbackRateRef.current = 1;
          player.seekTo(targetTime, true);
          lastDriftCorrectionAtRef.current = performance.now();
        }
        if (needsPlay) player.playVideo();
        if (needsPause) player.pauseVideo();
      }
    }

    lastAppliedPlaybackRef.current = updateKey;
    lastSampleRef.current = {
      time: videoChanged || shouldSeek ? targetTime : actualTime,
      performanceTime: performance.now(),
      isPlaying: state.isPlaying,
    };

    window.clearTimeout(autoplayTimerRef.current);
    if (state.isPlaying) {
      autoplayTimerRef.current = window.setTimeout(() => {
        if (playbackRef.current?.isPlaying
          && playerRef.current?.getPlayerState?.() !== window.YT.PlayerState.PLAYING) {
          setNeedsGesture(true);
        }
      }, 1800);
    } else {
      setNeedsGesture(false);
    }
  }, [getTargetTime]);

  const publishManualSeek = useCallback((time, isPlaying) => {
    if (!Number.isFinite(time) || !playbackRef.current?.videoId) return;
    const performanceTime = performance.now();
    const serverTime = Date.now() + serverOffsetMsRef.current;
    const authoritative = {
      ...playbackRef.current,
      currentTime: time,
      isPlaying,
      updatedAt: serverTime,
      serverTime,
      sourceUserId: socket.id,
      sourceAction: "seek",
    };

    pendingLocalSeekRef.current = {
      previousUpdatedAt: playbackRef.current.updatedAt,
    };
    playbackRef.current = authoritative;
    lastAppliedPlaybackRef.current = `${authoritative.videoId}:${serverTime}`;
    lastSampleRef.current = { time, performanceTime, isPlaying };
    lastDriftCorrectionAtRef.current = performanceTime;
    driftCorrectionArmedRef.current = false;
    pendingSyncRef.current = {
      expectedState: isPlaying ? window.YT.PlayerState.PLAYING : window.YT.PlayerState.PAUSED,
      expiresAt: Date.now() + 5000,
    };
    if (playbackRateRef.current !== 1) {
      playerRef.current?.setPlaybackRate?.(1);
      playbackRateRef.current = 1;
    }
    socket.emit("playback", { action: "seek", time, isPlaying });
  }, []);

  useEffect(() => {
    let disposed = false;
    loadYouTubeApi().then((YT) => {
      if (disposed || !containerRef.current || playerRef.current) return;
      playerRef.current = new YT.Player(containerRef.current, {
        width: "100%",
        height: "100%",
        playerVars: {
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          enablejsapi: 1,
          origin: window.location.origin,
          controls: 1,
          disablekb: 0,
          fs: 1,
        },
        events: {
          onReady: () => {
            readyRef.current = true;
            loadedVideoIdRef.current = playerRef.current?.getVideoData?.()?.video_id || null;
            playerErrorRef.current = null;
            setPlayerError(null);
            setReady(true);
            syncPlayer(true);
          },
          onStateChange: (event) => {
            if (event.data === YT.PlayerState.BUFFERING) return;
            if (event.data === YT.PlayerState.PLAYING) {
              setNeedsGesture(false);
              window.clearTimeout(autoplayTimerRef.current);
            }
            const pending = pendingSyncRef.current;
            const isCuedPause = pending?.expectedState === YT.PlayerState.PAUSED
              && event.data === YT.PlayerState.CUED;
            if (pending) {
              if (Date.now() <= pending.expiresAt
                && (event.data === pending.expectedState || isCuedPause)) {
                pendingSyncRef.current = null;
              } else if (Date.now() > pending.expiresAt) {
                pendingSyncRef.current = null;
              }
              return;
            }
            if (!roleRef.current || roleRef.current === "participant") return;
            if (event.data === YT.PlayerState.PLAYING || event.data === YT.PlayerState.PAUSED) {
              const time = Number(event.target.getCurrentTime());
              const isPlaying = event.data === YT.PlayerState.PLAYING;
              const performanceTime = performance.now();
              if (isSeekDiscontinuity(lastSampleRef.current, time, performanceTime)) {
                publishManualSeek(time, isPlaying);
                return;
              }
            }
            if (event.data === YT.PlayerState.PLAYING) {
              const time = event.target.getCurrentTime();
              socket.emit("playback", { action: "play", time });
              lastSampleRef.current = { time, performanceTime: performance.now(), isPlaying: true };
            } else if (event.data === YT.PlayerState.PAUSED) {
              const time = event.target.getCurrentTime();
              socket.emit("playback", { action: "pause", time });
              lastSampleRef.current = { time, performanceTime: performance.now(), isPlaying: false };
            } else if (event.data === YT.PlayerState.ENDED) {
              const time = event.target.getCurrentTime();
              socket.emit("playback", { action: "pause", time });
              lastSampleRef.current = { time, performanceTime: performance.now(), isPlaying: false };
            }
          },
          onError: (event) => {
            const failedVideoId = event.target.getVideoData?.()?.video_id || loadedVideoIdRef.current;
            if (failedVideoId && failedVideoId !== playbackRef.current?.videoId) return;
            console.error("[YouTube IFrame API] Playback error", {
              code: event.data,
              videoId: failedVideoId || playbackRef.current?.videoId || null,
              origin: window.location.origin,
            });
            const errors = {
              2: { message: "This YouTube video ID is invalid.", retryable: false },
              5: { message: "YouTube could not play this video in the embedded player.", retryable: true },
              100: { message: "This video is unavailable or private.", retryable: false },
              101: { message: "This video can't be played in an embedded player.", retryable: false },
              150: { message: "This video can't be played in an embedded player.", retryable: false },
              153: { message: "YouTube could not verify this player’s site origin.", retryable: true },
            };
            const error = errors[event.data] || { message: "YouTube playback failed. Try again or open the video on YouTube.", retryable: true };
            const failure = { code: event.data, videoId: failedVideoId || playbackRef.current?.videoId, ...error };
            playerErrorRef.current = failure;
            pendingSyncRef.current = null;
            window.clearTimeout(autoplayTimerRef.current);
            setNeedsGesture(false);
            setPlayerError(failure);
          },
        },
      });
    }).catch((error) => {
      if (!disposed) {
        const failure = {
          code: null,
          videoId: playbackRef.current?.videoId,
          message: "The YouTube player API could not be loaded.",
          retryable: true,
        };
        playerErrorRef.current = failure;
        setPlayerError(failure);
      }
    });

    return () => {
      disposed = true;
      readyRef.current = false;
      loadedVideoIdRef.current = null;
      window.clearTimeout(autoplayTimerRef.current);
      playerRef.current?.destroy?.();
      playerRef.current = null;
    };
  }, [publishManualSeek, syncPlayer]);

  useEffect(() => {
    const timers = new Map();
    const onTimeSync = ({ clientSentAt, serverTime }) => {
      const sent = timers.get(clientSentAt);
      if (!sent) return;
      timers.delete(clientSentAt);
      const roundTrip = performance.now() - sent.performanceTime;
      if (roundTrip > 1000) return;
      const localMidpoint = (sent.clientTime + Date.now()) / 2;
      const measuredOffset = Number(serverTime) - localMidpoint;
      serverOffsetMsRef.current = clockOffsetInitializedRef.current
        ? serverOffsetMsRef.current * 0.8 + measuredOffset * 0.2
        : measuredOffset;
      clockOffsetInitializedRef.current = true;
    };

    const requestTimeSync = () => {
      const clientSentAt = Date.now();
      timers.set(clientSentAt, { performanceTime: performance.now(), clientTime: clientSentAt });
      socket.emit("time-sync", { clientSentAt });
      if (timers.size > 8) timers.delete(timers.keys().next().value);
    };

    requestTimeSync();
    const syncTimer = window.setInterval(requestTimeSync, 10000);
    const stateTimer = window.setInterval(() => socket.emit("sync-request"), 10000);
    const restorePlaybackRate = (player) => {
      if (playbackRateRef.current !== 1) {
        player.setPlaybackRate?.(1);
        playbackRateRef.current = 1;
      }
    };
    const seekTimer = window.setInterval(() => {
      const player = playerRef.current;
      if (!readyRef.current || !player || playerErrorRef.current) return;
      const state = player.getPlayerState?.();
      if (state === window.YT?.PlayerState.BUFFERING) return;
      const currentTime = Number(player.getCurrentTime?.());
      if (!Number.isFinite(currentTime)) return;
      const performanceTime = performance.now();
      const previous = lastSampleRef.current;
      const authoritative = playbackRef.current;

      const isPlaying = state === window.YT.PlayerState.PLAYING;
      if (roleRef.current !== "participant"
        && (isPlaying || state === window.YT.PlayerState.PAUSED)
        && isSeekDiscontinuity(previous, currentTime, performanceTime)) {
        publishManualSeek(currentTime, isPlaying);
        return;
      }

      if (pendingLocalSeekRef.current) {
        lastSampleRef.current = { time: currentTime, performanceTime, isPlaying };
        return;
      }

      if (state === window.YT.PlayerState.PLAYING && authoritative?.isPlaying) {
        const drift = getTargetTime(authoritative) - currentTime;
        const driftMagnitude = Math.abs(drift);
        if (driftMagnitude < 0.25) {
          driftCorrectionArmedRef.current = true;
          restorePlaybackRate(player);
        } else if (driftMagnitude < 0.75) {
          const availableRates = player.getAvailablePlaybackRates?.() || [];
          const correctionRate = availableRates
            .filter((rate) => rate > 1 && rate <= 1.05 && drift > 0
              || rate < 1 && rate >= 0.95 && drift < 0)
            .sort((a, b) => Math.abs(a - 1) - Math.abs(b - 1))[0];
          if (correctionRate && playbackRateRef.current !== correctionRate) {
            player.setPlaybackRate?.(correctionRate);
            playbackRateRef.current = correctionRate;
          }
        } else if (driftMagnitude >= 0.75 && driftCorrectionArmedRef.current
          && performanceTime - lastDriftCorrectionAtRef.current > 5000) {
          restorePlaybackRate(player);
          const targetTime = getTargetTime(authoritative);
          player.seekTo(targetTime, true);
          driftCorrectionArmedRef.current = false;
          pendingSyncRef.current = { expectedState: window.YT.PlayerState.PLAYING, expiresAt: Date.now() + 5000 };
          lastDriftCorrectionAtRef.current = performanceTime;
          lastSampleRef.current = { time: targetTime, performanceTime, isPlaying: true };
          return;
        } else {
          restorePlaybackRate(player);
        }
      } else {
        restorePlaybackRate(player);
      }

      lastSampleRef.current = {
        time: currentTime,
        performanceTime,
        isPlaying,
      };
    }, 750);
    socket.on("time-sync-response", onTimeSync);
    return () => {
      window.clearInterval(syncTimer);
      window.clearInterval(stateTimer);
      window.clearInterval(seekTimer);
      socket.off("time-sync-response", onTimeSync);
    };
  }, [getTargetTime, publishManualSeek]);

  useEffect(() => {
    const onApprovedPlayback = (approvedPlayback) => {
      if (!approvedPlayback || !readyRef.current) return;
      playbackRef.current = approvedPlayback;
      lastAppliedPlaybackRef.current = null;
      syncPlayer();
    };

    socket.on("approved-playback", onApprovedPlayback);
    return () => socket.off("approved-playback", onApprovedPlayback);
  }, [syncPlayer]);

  useEffect(() => {
    if (playback?.sourceUserId === socket.id && playback.sourceAction !== "change-video") {
      lastAppliedPlaybackRef.current = `${playback.videoId}:${playback.updatedAt ?? ""}`;
      if (playback.sourceAction === "seek") {
        const player = playerRef.current;
        const time = Number(player?.getCurrentTime?.());
        if (Number.isFinite(time)) {
          lastSampleRef.current = {
            time,
            performanceTime: performance.now(),
            isPlaying: playback.isPlaying,
          };
        }
        lastDriftCorrectionAtRef.current = performance.now();
        driftCorrectionArmedRef.current = false;
      }
      return;
    }
    syncPlayer();
  }, [playback?.videoId, playback?.isPlaying, playback?.updatedAt, ready, syncPlayer]);

  function localToggle() {
    const player = playerRef.current;
    if (!canControl || !player || !readyRef.current) return;
    const state = player.getPlayerState();
    const time = player.getCurrentTime();
    const isPlaying = state === window.YT.PlayerState.PLAYING
      || (state === window.YT.PlayerState.BUFFERING && playbackRef.current?.isPlaying);
    const action = isPlaying ? "pause" : "play";
    pendingSyncRef.current = {
      expectedState: action === "play" ? window.YT.PlayerState.PLAYING : window.YT.PlayerState.PAUSED,
      expiresAt: Date.now() + 5000,
    };
    if (action === "pause") player.pauseVideo();
    else player.playVideo();
    lastSampleRef.current = {
      time,
      performanceTime: performance.now(),
      isPlaying: action === "play",
    };
    socket.emit("playback", { action, time });
  }

  function syncManually() {
    setNeedsGesture(false);
    syncPlayer(true);
  }

  function retryVideo() {
    const state = playbackRef.current;
    if (!state?.videoId || !playerRef.current || !readyRef.current) return;
    playerErrorRef.current = null;
    setPlayerError(null);
    loadedVideoIdRef.current = null;
    syncPlayer(true);
  }

  const youtubeUrl = playback?.videoId
    ? `https://www.youtube.com/watch?v=${encodeURIComponent(playback.videoId)}`
    : "https://www.youtube.com";

  return (
    <div className="relative">
      <div
        className="relative aspect-video overflow-hidden rounded-2xl bg-black ring-1 ring-white/[0.12] shadow-[0_20px_70px_rgba(0,0,0,0.45)]"
        onPointerDownCapture={() => { pendingSyncRef.current = null; }}
      >
        <div ref={containerRef} className="h-full w-full" />
        {isParticipant && <div className="absolute inset-0 z-10 cursor-not-allowed" aria-hidden="true" />}
        {playerError && (
          <div className="pointer-events-none absolute inset-x-3 bottom-3 z-20 flex justify-center">
            <div aria-live="polite" className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-2 rounded-xl border border-white/[0.12] bg-[#090A0F]/90 px-3 py-2.5 text-center text-xs shadow-xl backdrop-blur-xl">
              <span className="text-zinc-300">{playerError.message}</span>
              {playerError.code !== null && <span className="text-zinc-500">YouTube error {playerError.code}</span>}
              {playerError.retryable && (
                <button onClick={retryVideo} className="rounded-lg border border-white/10 px-2.5 py-1 text-zinc-300 transition-colors duration-200 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300">Retry</button>
              )}
              <a href={youtubeUrl} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-rose-300/20 bg-gradient-to-r from-rose-400/10 to-violet-400/10 px-2.5 py-1 font-medium text-rose-100 transition-all duration-200 hover:border-rose-300/35 hover:from-rose-400/15 hover:to-violet-400/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300">
                Open in YouTube
              </a>
              </div>
            </div>
        )}
      </div>
      <div className="mt-3 flex min-h-10 items-center justify-between gap-3">
        {!ready && !playerError && (
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <span className="h-2 w-2 animate-pulse rounded-full bg-rose-300" />
            Loading video...
          </div>
        )}
        {canControl && ready && !playerError && (
          <button onClick={localToggle} className="flex items-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.045] px-3.5 py-2.5 text-sm font-semibold text-zinc-100 transition-all duration-200 hover:border-rose-300/25 hover:bg-rose-300/[0.07] active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300">
            {playback?.isPlaying ? <><Pause size={15} /> Pause</> : <><Play size={15} /> Play</>}
          </button>
        )}
      </div>
      {isParticipant && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs leading-5 text-zinc-500">Playback syncs automatically. Use requests below to ask for a room-wide change.</p>
          {needsGesture && playback?.isPlaying && (
            <button onClick={syncManually} className="flex items-center gap-2 rounded-xl border border-violet-300/20 bg-violet-400/[0.08] px-3 py-2.5 text-xs font-semibold text-violet-100 transition-all duration-200 hover:bg-violet-400/[0.14] active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300">
              <RotateCcw size={13} /> Click to sync and play
            </button>
          )}
        </div>
      )}
    </div>
  );
}
