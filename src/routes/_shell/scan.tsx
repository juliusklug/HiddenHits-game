import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { QrScanner } from "@/components/QrScanner";
import { parseCardPayload } from "@/lib/card-payload";
import { Camera, AlertCircle, ScanLine } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";

export const Route = createFileRoute("/_shell/scan")({
  validateSearch: z.object({ auto: z.coerce.number().optional() }),
  head: () => ({
    meta: [
      { title: "Scan a card — HiddenHits" },
      { name: "description", content: "Point your camera at a HiddenHits QR card to start playback." },
    ],
  }),
  component: ScanPage,
});

function ScanPage() {
  const navigate = useNavigate();
  const { auto } = useSearch({ from: "/_shell/scan" });
  const [scanning, setScanning] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const autoTried = useRef(false);

  const closeScanner = () => {
    setScanning(false);
    setCameraStream(null);
  };

  const openScanner = async () => {
    setLastError(null);
    try {
      if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        setCameraStream(stream);
      }
      setScanning(true);
    } catch (err) {
      console.error("[scan] camera permission failed", err);
      const name = (err as { name?: string })?.name ?? "";
      if (name === "NotAllowedError") {
        setLastError("Camera access denied. Please allow camera permission and try again.");
      } else if (name === "NotFoundError") {
        setLastError("No camera found on this device.");
      } else {
        setLastError("Unable to initialize camera. Please try again.");
      }
    }
  };

  useEffect(() => {
    if (auto && !autoTried.current) {
      autoTried.current = true;
      void openScanner();
    }
  }, [auto]);

  const handleDetected = (raw: string) => {
    const parsed = parseCardPayload(raw);
    if (parsed.kind === "deezer") {
      closeScanner();
      void navigate({
        to: "/play/track/$id",
        params: { id: parsed.trackId },
      });
      return;
    }
    setLastError(`Unrecognized card: ${raw.slice(0, 40)}`);
    closeScanner();
  };

  if (scanning) {
    return <QrScanner initialStream={cameraStream} onDetected={handleDetected} onClose={closeScanner} />;
  }

  return (
    <>
      {/* Animated neon background */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div
          className="absolute -top-24 -left-16 h-72 w-72 rounded-full opacity-50 blur-3xl animate-float"
          style={{ background: "radial-gradient(circle, var(--neon-pink) 0%, transparent 65%)" }}
        />
        <div
          className="absolute bottom-24 -right-20 h-80 w-80 rounded-full opacity-40 blur-3xl animate-float"
          style={{ background: "radial-gradient(circle, var(--neon-blue) 0%, transparent 65%)", animationDelay: "2s" }}
        />
        <div
          className="absolute top-1/3 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full opacity-30 blur-3xl animate-float"
          style={{ background: "radial-gradient(circle, var(--neon-orange) 0%, transparent 65%)", animationDelay: "4s" }}
        />
      </div>

      <div className="flex min-h-[80svh] flex-col items-center justify-center px-6 text-center">
        {/* Neon scanner frame with animated scanning line */}
        <div className="relative">
          <div className="absolute inset-0 -m-8 rounded-3xl gradient-rainbow opacity-30 blur-2xl animate-neon-pulse" />
          <div className="relative flex h-44 w-44 items-center justify-center overflow-hidden rounded-3xl border border-white/10 bg-black/60 backdrop-blur">
            {/* Corner brackets */}
            <span className="absolute left-2 top-2 h-6 w-6 border-l-2 border-t-2 border-[var(--neon-pink)] rounded-tl-lg" />
            <span className="absolute right-2 top-2 h-6 w-6 border-r-2 border-t-2 border-[var(--neon-blue)] rounded-tr-lg" />
            <span className="absolute left-2 bottom-2 h-6 w-6 border-l-2 border-b-2 border-[var(--neon-orange)] rounded-bl-lg" />
            <span className="absolute right-2 bottom-2 h-6 w-6 border-r-2 border-b-2 border-[var(--neon-green)] rounded-br-lg" />
            {/* Scanning line */}
            <span
              className="absolute inset-x-4 h-[2px] rounded-full animate-scan-line"
              style={{
                background:
                  "linear-gradient(90deg, transparent, var(--neon-pink), var(--neon-blue), transparent)",
                boxShadow: "0 0 12px var(--neon-pink)",
              }}
            />
            <ScanLine className="h-16 w-16 text-white/90" strokeWidth={1.5} />
          </div>
        </div>

        <div className="mt-8 inline-flex items-center gap-2 rounded-full glass px-3 py-1 text-xs uppercase tracking-widest text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--neon-green)] animate-pulse" />
          Ready to scan
        </div>
        <h1 className="mt-4 text-3xl font-bold tracking-tight">
          Scan a <span className="text-gradient-rainbow">HiddenHits</span> card
        </h1>
        <p className="mt-3 max-w-sm text-muted-foreground">
          Point your camera at the QR on any card. The song plays instantly —
          no title, no artist, no year.
        </p>

        <button
          onClick={openScanner}
          className="mt-8 inline-flex w-full max-w-sm items-center justify-center gap-3 rounded-2xl gradient-neon px-6 py-5 text-lg font-semibold text-[oklch(0.15_0_0)] glow-green transition-transform active:scale-[0.98]"
        >
          <Camera className="h-6 w-6" />
          Open scanner
        </button>

        {lastError && (
          <div className="mt-4 flex max-w-sm items-start gap-2 rounded-xl glass p-3 text-left text-xs text-muted-foreground">
            <AlertCircle className="mt-0.5 h-4 w-4 text-[var(--neon-pink)]" />
            <span>{lastError}</span>
          </div>
        )}
      </div>
    </>
  );
}
