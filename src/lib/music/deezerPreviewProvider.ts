import type { MusicProvider, PlayerState, ResolvedTrack, TrackMeta } from "./provider";
import { resumeAudioContext, teardownAudioElement, unlockAudio } from "./audioSession";

// 30-second preview provider. Anonymous — works for everyone.
export function createDeezerPreviewProvider(): MusicProvider {
  let audio: HTMLAudioElement | null = null;
  const listeners = new Set<(s: PlayerState) => void>();
  let current: ResolvedTrack | null = null;
  let needsGesture = true;
  let unplayable = false;
  let recovering = false;
  let recoveredForUri: string | null = null;

  function emit(patch: Partial<PlayerState> = {}) {
    const el = audio;
    const s: PlayerState = {
      isPlaying: !!el && !el.paused,
      positionMs: el ? Math.floor(el.currentTime * 1000) : 0,
      durationMs: el && !Number.isNaN(el.duration) ? Math.floor(el.duration * 1000) : 30_000,
      needsUserGesture: needsGesture,
      unplayable,
      ...patch,
    };
    listeners.forEach((l) => l(s));
  }

  /** iOS/Safari surfaces undecodable sources as "The operation is not supported". */
  function isUnsupported(msg: string) {
    return /not supported|notsupported|no supported source|MEDIA_ELEMENT_ERROR|decode/i.test(msg);
  }

  function markUnplayable() {
    unplayable = true;
    // Always release the element that failed — reusing it locks the pipeline.
    destroyElement();
    emit({
      isPlaying: false,
      unplayable: true,
      error: "This song's audio can't be played here — skip to the next card.",
    });
  }

  /**
   * Automatic recovery: rebuild the media element and retry once (after ~1s)
   * before giving up and asking the player to skip.
   */
  function tryRecover(uri: string) {
    if (recovering || recoveredForUri === uri) {
      markUnplayable();
      return;
    }
    recovering = true;
    recoveredForUri = uri;
    destroyElement();
    void (async () => {
      await resumeAudioContext();
      await new Promise((r) => setTimeout(r, 1000));
      recovering = false;
      if (!current || current.uri !== uri) return;
      const el = prepare(current);
      needsGesture = true;
      emit({ isPlaying: false, needsUserGesture: true, unplayable: false, error: null });
      void el;
    })();
  }

  function destroyElement() {
    teardownAudioElement(audio);
    audio = null;
  }

  function ensureAudio() {
    if (audio) return audio;
    const el = new Audio();
    el.preload = "auto";
    el.setAttribute("playsinline", "");
    el.addEventListener("play", () => {
      needsGesture = false;
      emit();
    });
    el.addEventListener("pause", () => emit());
    el.addEventListener("ended", () => {
      emit();
      // Free the decoder slot as soon as the preview is over.
      if (audio) {
        try {
          audio.currentTime = 0;
        } catch {
          /* ignore */
        }
      }
    });
    el.addEventListener("timeupdate", () => emit());
    el.addEventListener("error", () => {
      const msg = el.error?.message ?? "Audio error";
      const uri = current?.uri ?? "";
      if (el.error?.code === 4 || isUnsupported(msg)) tryRecover(uri);
      else emit({ error: msg, isPlaying: false });
    });
    audio = el;
    return el;
  }

  function prepare(track: ResolvedTrack) {
    const switching = current?.uri !== track.uri;
    if (switching) {
      // A brand-new element per track: Safari never carries a poisoned state
      // from the previous (possibly failed) source into the next one.
      destroyElement();
      unplayable = false;
      recoveredForUri = null;
    }
    current = track;
    const el = ensureAudio();
    if (el.src !== track.uri) {
      el.pause();
      el.src = track.uri;
      // Best-effort buffering; never triggers playback.
      try {
        el.load();
      } catch {
        /* ignore */
      }
    }
    return el;
  }

  /** Start playback. Safe to call from a click handler (no await before .play()). */
  function start(): Promise<void> {
    const el = audio;
    if (!el || !current) return Promise.resolve();
    const uri = current.uri;
    let p: Promise<void> | undefined;
    try {
      p = el.play();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (isUnsupported(msg)) tryRecover(uri);
      else emit({ isPlaying: false, error: msg });
      return Promise.resolve();
    }
    if (!p || typeof p.then !== "function") return Promise.resolve();
    return p
      .then(() => {
        needsGesture = false;
        emit({ error: null });
      })
      .catch((err: unknown) => {
        // Autoplay blocked or unsupported — ask for an explicit tap instead of erroring out.
        const msg = err instanceof Error ? err.message : String(err);
        if (isUnsupported(msg)) {
          tryRecover(uri);
          return;
        }
        needsGesture = true;
        const blocked = /not allowed|user agent|gesture|interact|NotAllowed/i.test(msg);
        emit({ isPlaying: false, needsUserGesture: true, error: blocked ? null : msg });
      });
  }

  return {
    id: "deezer-preview",
    displayName: "Deezer Preview",
    async init() {
      ensureAudio();
    },
    async destroy() {
      destroyElement();
      listeners.clear();
    },
    async reset() {
      // Called from a real tap ("Skip song" / "Next card"): re-unlock audio and
      // drop the current element so the incoming track starts from scratch.
      unlockAudio();
      destroyElement();
      current = null;
      unplayable = false;
      recovering = false;
      recoveredForUri = null;
      needsGesture = true;
    },
    async resolveTrack(_trackId: string, meta: TrackMeta): Promise<ResolvedTrack | null> {
      if (!meta.previewUrl) return null;
      return {
        providerId: "deezer-preview",
        uri: meta.previewUrl,
        durationMs: 30_000,
        meta,
      };
    },
    async load(track) {
      prepare(track);
      needsGesture = true;
      emit({ isPlaying: false, needsUserGesture: true, unplayable: false, error: null });
    },
    async play(track) {
      prepare(track);
      await start();
    },
    async pause() {
      audio?.pause();
    },
    resume() {
      return start();
    },
    async seek(ms) {
      if (audio) audio.currentTime = ms / 1000;
    },
    onStateChange(cb) {
      listeners.add(cb);
      cb({
        isPlaying: !!audio && !audio.paused,
        positionMs: audio ? Math.floor(audio.currentTime * 1000) : 0,
        durationMs: 30_000,
        needsUserGesture: needsGesture,
        unplayable,
      });
      return () => listeners.delete(cb);
    },
  };
}
