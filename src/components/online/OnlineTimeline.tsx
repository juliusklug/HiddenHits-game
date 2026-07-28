import { useState } from "react";
import { Plus } from "lucide-react";
import type { OnlineCard } from "@/lib/online/types";

type Props = {
  timeline: OnlineCard[];
  /** When set, slots become drop targets / tappable. */
  onPlace?: (slotIndex: number) => void;
  highlightCardId?: string | null;
  compact?: boolean;
  /** Keeps a chosen slot visibly selected (used by the steal confirm flow). */
  selectedSlot?: number | null;
};

export function OnlineTimeline({
  timeline,
  onPlace,
  highlightCardId,
  compact,
  selectedSlot,
}: Props) {
  const [over, setOver] = useState<number | null>(null);
  const interactive = Boolean(onPlace);

  const slot = (index: number) => {
    if (!interactive) return null;
    const active = over === index || selectedSlot === index;
    return (
      <button
        key={`slot-${index}`}
        onClick={() => onPlace?.(index)}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(index);
        }}
        onDragLeave={() => setOver((o) => (o === index ? null : o))}
        onDrop={(e) => {
          e.preventDefault();
          setOver(null);
          onPlace?.(index);
        }}
        className={
          "flex h-20 w-11 shrink-0 flex-col items-center justify-center rounded-xl border border-dashed text-[10px] transition-all " +
          (active
            ? "border-[var(--neon-pink)] bg-[var(--neon-pink)]/20 text-white scale-105"
            : "border-white/25 text-muted-foreground")
        }
        aria-label={`Place here, position ${index + 1}`}
      >
        <Plus className="h-4 w-4" />
        Here
      </button>
    );
  };

  return (
    <div className="-mx-1 overflow-x-auto pb-1">
      <div className="flex items-center gap-1.5 px-1">
        {timeline.length === 0 && !interactive && (
          <div className="flex h-20 w-full items-center justify-center rounded-xl border border-dashed border-white/15 text-xs text-muted-foreground">
            No cards yet
          </div>
        )}
        {slot(0)}
        {timeline.map((c, i) => (
          <div key={c.id + i} className="flex items-center gap-1.5">
            <div
              className={
                "flex shrink-0 flex-col items-center justify-center rounded-xl glass px-2 py-2 text-center " +
                (compact ? "h-20 w-16" : "h-24 w-20") +
                (highlightCardId === c.id
                  ? " ring-2 ring-[var(--neon-green)] animate-flip-in"
                  : "")
              }
            >
              {c.cover ? (
                <img src={c.cover} alt="" className="h-7 w-7 rounded object-cover" />
              ) : null}
              <div className="mt-1 text-sm font-bold text-gradient-neon">{c.year ?? "—"}</div>
              <div className="line-clamp-1 w-full text-[9px] text-muted-foreground">{c.title}</div>
            </div>
            {slot(i + 1)}
          </div>
        ))}
      </div>
    </div>
  );
}
