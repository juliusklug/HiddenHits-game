// Shared audio-session helpers.
//
// Safari/iOS keeps a single per-tab audio activation state. Once a play()
// attempt is rejected (autoplay policy) or a source fails to decode, the
// pipeline can stay "stuck" and every subsequent track fails with
// "The operation is not supported" until the page is reloaded.
//
// The fix has two halves:
//  1. Re-run a silent unlock from inside a real user gesture (tap on
//     "Skip song" / "Next card") so the activation flag carries over to the
//     next source.
//  2. Throw away the media element that failed instead of reusing it.

let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx) return ctx;
  const Ctor: typeof AudioContext | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    ctx = null;
  }
  return ctx;
}

/** 1-frame silent WAV — enough to hand user activation to the media pipeline. */
const SILENCE =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";

/**
 * MUST be called synchronously from inside a user gesture (click/touch).
 * Resumes the AudioContext and plays a silent frame so the browser marks the
 * tab as user-activated for audio again.
 */
export function unlockAudio(): void {
  const c = getContext();
  if (c && c.state !== "running") {
    void c.resume().catch(() => {});
  }
  try {
    const el = new Audio(SILENCE);
    el.volume = 0;
    el.setAttribute("playsinline", "");
    const p = el.play();
    if (p && typeof p.then === "function") {
      p.then(
        () => {
          el.pause();
          el.src = "";
        },
        () => {},
      );
    }
  } catch {
    /* ignore */
  }
}

/** Best-effort resume without a gesture (used by automatic recovery). */
export async function resumeAudioContext(): Promise<boolean> {
  const c = getContext();
  if (!c) return true;
  if (c.state === "running") return true;
  try {
    await c.resume();
  } catch {
    /* ignore */
  }
  return (c.state as string) === "running";
}

/** Fully detaches a media element so Safari releases its decoder slot. */
export function teardownAudioElement(el: HTMLAudioElement | null): void {
  if (!el) return;
  try {
    el.pause();
    el.removeAttribute("src");
    el.srcObject = null;
    el.load();
  } catch {
    /* ignore */
  }
}
