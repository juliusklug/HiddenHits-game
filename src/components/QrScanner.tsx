import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Flashlight, FlashlightOff, X, RefreshCcw } from "lucide-react";

type Props = {
  onDetected: (text: string) => void;
  onClose?: () => void;
  initialStream?: MediaStream | null;
};

type CameraError = {
  title: string;
  message: string;
  canRetry: boolean;
};

function classifyError(err: unknown): CameraError {
  const name = (err as { name?: string })?.name ?? "";
  const msg = err instanceof Error ? err.message : String(err ?? "");
  if (name === "NotAllowedError" || /permission/i.test(msg)) {
    return {
      title: "Camera access denied",
      message: "Please allow camera permission in your browser settings and try again.",
      canRetry: true,
    };
  }
  if (name === "NotFoundError" || /not\s*found/i.test(msg)) {
    return { title: "No camera found", message: "We couldn't find a camera on this device.", canRetry: false };
  }
  if (name === "NotReadableError" || /in use|busy|readable/i.test(msg)) {
    return {
      title: "Camera in use",
      message: "Another app is using the camera. Close it and try again.",
      canRetry: true,
    };
  }
  if (name === "SecurityError" || /secure context|https/i.test(msg)) {
    return {
      title: "Secure connection required",
      message: "The camera only works over HTTPS. Open this site with https:// and retry.",
      canRetry: true,
    };
  }
  return {
    title: "Unable to initialize camera",
    message: msg || "Something went wrong starting the camera.",
    canRetry: true,
  };
}

export function QrScanner({ onDetected, onClose, initialStream = null }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const handledRef = useRef(false);
  const [status, setStatus] = useState<"starting" | "running" | "error">("starting");
  const [error, setError] = useState<CameraError | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const stopCamera = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.srcObject = null;
    }
    streamRef.current?.getTracks().forEach((track: MediaStreamTrack) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const start = async () => {
      setStatus("starting");
      setError(null);
      try {
        if (typeof window === "undefined" || !navigator?.mediaDevices?.getUserMedia) {
          throw new Error("Camera API not available in this browser.");
        }

        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) throw new Error("Scanner video element was not mounted.");

        let stream = initialStream ?? null;
        if (!stream || stream.getVideoTracks().every((track) => track.readyState === "ended")) {
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
              audio: false,
            });
          } catch (err) {
            console.warn("[qr scanner] rear camera request failed, falling back to any camera", err);
            stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          }
        }

        if (cancelled) return;

        streamRef.current = stream;
        video.muted = true;
        video.playsInline = true;
        video.setAttribute("muted", "true");
        video.setAttribute("playsinline", "true");
        video.srcObject = stream;

        await video.play();
        if (cancelled) return;

        setStatus("running");

        try {
          const track = stream.getVideoTracks()[0];
          const caps = track?.getCapabilities?.() as MediaTrackCapabilities & { torch?: boolean };
          setTorchSupported(Boolean(caps?.torch));
        } catch {
          setTorchSupported(false);
        }

        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) throw new Error("Could not create QR scanner canvas context.");

        let lastScan = 0;
        const scan = (time: number) => {
          if (cancelled || handledRef.current) return;
          rafRef.current = requestAnimationFrame(scan);
          if (time - lastScan < 120 || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
          lastScan = time;

          const width = video.videoWidth;
          const height = video.videoHeight;
          if (!width || !height) return;

          const maxSide = 900;
          const scale = Math.min(1, maxSide / Math.max(width, height));
          canvas.width = Math.max(1, Math.floor(width * scale));
          canvas.height = Math.max(1, Math.floor(height * scale));
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const result = jsQR(image.data, image.width, image.height, { inversionAttempts: "attemptBoth" });
          if (result?.data) onScan(result.data);
        };
        rafRef.current = requestAnimationFrame(scan);
      } catch (err) {
        console.error("[qr scanner] exact runtime startup error", err);
        stopCamera();
        if (cancelled) return;
        setError(classifyError(err));
        setStatus("error");
      }
    };

    const onScan = (decodedText: string) => {
      if (handledRef.current) return;
      handledRef.current = true;
      try {
        if (navigator.vibrate) navigator.vibrate(60);
      } catch {
        /* no-op */
      }
      onDetected(decodedText);
    };

    void start();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [initialStream, onDetected, attempt, stopCamera]);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn } as MediaTrackConstraintSet] });
      setTorchOn((v) => !v);
    } catch (err) {
      console.warn("[torch]", err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black">
      <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" autoPlay muted playsInline />
      <canvas ref={canvasRef} className="hidden" aria-hidden />

      {status !== "error" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="relative h-[72vmin] w-[72vmin] max-h-[420px] max-w-[420px]">
            {[
              "top-0 left-0 border-t-4 border-l-4 rounded-tl-2xl",
              "top-0 right-0 border-t-4 border-r-4 rounded-tr-2xl",
              "bottom-0 left-0 border-b-4 border-l-4 rounded-bl-2xl",
              "bottom-0 right-0 border-b-4 border-r-4 rounded-br-2xl",
            ].map((cls) => (
              <span
                key={cls}
                className={`absolute h-12 w-12 border-[var(--neon-green)] ${cls}`}
                style={{ filter: "drop-shadow(0 0 12px var(--neon-green))" }}
              />
            ))}
            <span className="absolute inset-x-4 top-1/2 h-[2px] -translate-y-1/2 gradient-neon opacity-80 animate-pulse" />
          </div>
        </div>
      )}

      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <button
          onClick={onClose}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur"
          aria-label="Close scanner"
        >
          <X className="h-5 w-5" />
        </button>
        {torchSupported && status === "running" && (
          <button
            onClick={toggleTorch}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur"
            aria-label="Toggle flashlight"
          >
            {torchOn ? <FlashlightOff className="h-5 w-5" /> : <Flashlight className="h-5 w-5" />}
          </button>
        )}
      </div>

      <div className="absolute inset-x-0 bottom-0 z-10 px-6 pb-[max(2rem,env(safe-area-inset-bottom))] text-center">
        {status === "starting" && <p className="text-sm text-white/80">Starting camera…</p>}
        {status === "running" && (
          <p className="text-sm text-white/80">Point the camera at a card</p>
        )}
        {status === "error" && error && (
          <div className="mx-auto max-w-sm rounded-2xl bg-black/80 p-5 text-left text-sm text-white shadow-2xl">
            <p className="text-base font-semibold text-[var(--neon-green)]">{error.title}</p>
            <p className="mt-1 text-white/80">{error.message}</p>
            <div className="mt-4 flex gap-2">
              {error.canRetry && (
                <button
                  onClick={() => setAttempt((n) => n + 1)}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl gradient-neon px-4 py-2.5 text-sm font-semibold text-[oklch(0.15_0_0)]"
                >
                  <RefreshCcw className="h-4 w-4" />
                  Try again
                </button>
              )}
              <button
                onClick={onClose}
                className="inline-flex flex-1 items-center justify-center rounded-xl border border-white/20 px-4 py-2.5 text-sm font-medium text-white"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
