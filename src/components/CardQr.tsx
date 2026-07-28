import { useEffect, useRef, useState } from "react";
import { qrToDataUrl } from "@/lib/qr";

export function CardQr({
  payload,
  size = 160,
  className,
  /** Defer QR encoding until the element is near the viewport (card grids). */
  lazy = false,
}: {
  payload: string;
  size?: number;
  className?: string;
  lazy?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(!lazy);
  const [src, setSrc] = useState<string>("");

  useEffect(() => {
    if (!lazy || visible) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "120px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [lazy, visible]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    qrToDataUrl(payload, size * 2).then((d) => {
      if (!cancelled) setSrc(d);
    });
    return () => {
      cancelled = true;
    };
  }, [payload, size, visible]);

  if (!src) {
    return (
      <div
        ref={ref}
        className={className}
        style={{ width: size, height: size, background: "#fff", borderRadius: 8 }}
      />
    );
  }
  return (
    <img
      src={src}
      alt="QR code"
      width={size}
      height={size}
      className={className}
      style={{ background: "#fff", padding: 6, borderRadius: 8 }}
    />
  );
}
