import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { toPng } from "html-to-image";
import { X, Loader2, Download, QrCode as QrIcon } from "lucide-react";
import jsPDF from "jspdf";
import { qrToDataUrl } from "@/lib/qr";
import { listDeckCardIds, type Card, type Deck } from "@/lib/cards-api";


type Mode = "front" | "back" | "double";
type PerPage = 4 | 6 | 8 | 9 | 12;
type CardSize = "auto" | "poker" | "bridge" | "mini";

// physical card sizes in mm
const CARD_SIZES: Record<Exclude<CardSize, "auto">, { w: number; h: number; label: string }> = {
  poker: { w: 63, h: 88, label: "Poker 63×88" },
  bridge: { w: 57, h: 89, label: "Bridge 57×89" },
  mini: { w: 44, h: 63, label: "Mini 44×63" },
};

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 8;
const GAP = 2;
/** Large decks are split into several smaller PDFs so mobile browsers can handle them. */
const MAX_CARDS_PER_PDF = 50;

export function CardPrintDialog({
  cards: initialCards,
  allCards,
  decks,
  onClose,
}: {
  cards: Card[];
  allCards?: Card[];
  decks?: Deck[];
  onClose: () => void;
}) {
  const pool = allCards && allCards.length > 0 ? allCards : initialCards;
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(initialCards.map((c) => c.id)),
  );
  const [deckId, setDeckId] = useState<string>("");
  const [perPage, setPerPage] = useState<PerPage>(9);
  const [size, setSize] = useState<CardSize>("auto");
  const [mode, setMode] = useState<Mode>("double");
  const [busy, setBusy] = useState(false);

  const selectedCards = useMemo(
    () => pool.filter((c) => selectedIds.has(c.id)),
    [pool, selectedIds],
  );

  const layout = useMemo(() => layoutFor(perPage, size), [perPage, size]);

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function selectAll() {
    setSelectedIds(new Set(pool.map((c) => c.id)));
  }
  function selectNone() {
    setSelectedIds(new Set());
  }
  async function selectDeck(id: string) {
    setDeckId(id);
    if (!id) return;
    try {
      const ids = await listDeckCardIds(id);
      setSelectedIds(new Set(ids));
    } catch (e) {
      console.error(e);
    }
  }

  const [notice, setNotice] = useState<string | null>(null);
  const [splitMode, setSplitMode] = useState<"split" | "single">("split");
  const [progress, setProgress] = useState<string | null>(null);
  const [parts, setParts] = useState<
    Array<{ blob: Blob; filename: string; label: string; count: number }>
  >([]);

  const chunks = useMemo(() => {
    if (splitMode === "single" || selectedCards.length <= MAX_CARDS_PER_PDF) {
      return selectedCards.length ? [selectedCards] : [];
    }
    const out: Card[][] = [];
    for (let i = 0; i < selectedCards.length; i += MAX_CARDS_PER_PDF) {
      out.push(selectedCards.slice(i, i + MAX_CARDS_PER_PDF));
    }
    return out;
  }, [selectedCards, splitMode]);

  async function handleExport() {
    setBusy(true);
    setNotice(null);
    setParts([]);
    const stamp = Date.now();
    try {
      const made: Array<{ blob: Blob; filename: string; label: string; count: number }> = [];
      for (let i = 0; i < chunks.length; i++) {
        setProgress(
          chunks.length > 1
            ? `Generating part ${i + 1} of ${chunks.length}…`
            : "Generating PDF…",
        );
        const blob = await exportPdf({ cards: chunks[i], mode, layout });
        made.push({
          blob,
          filename:
            chunks.length > 1
              ? `hiddenhits-deck-part-${i + 1}-${stamp}.pdf`
              : `hiddenhits-cards-${stamp}.pdf`,
          label: chunks.length > 1 ? `Download PDF · Part ${i + 1}` : "Download PDF",
          count: chunks[i].length,
        });
        setParts([...made]);
      }
      setProgress(null);
      if (made.length === 1) {
        const result = await savePdf(made[0].blob, made[0].filename);
        if (result === "opened") {
          setNotice("Unable to download PDF. Opening preview instead — tap Share to save to Files.");
        } else if (result === "failed") {
          setNotice("Unable to download PDF. Please try again or use a different browser.");
        }
      } else {
        setNotice("PDFs ready. Tap each part to download it separately.");
      }
    } catch (e) {
      console.error(e);
      setProgress(null);
      setNotice("Failed to generate PDF. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function downloadPart(part: { blob: Blob; filename: string }) {
    const result = await savePdf(part.blob, part.filename);
    if (result === "opened") {
      setNotice("Opening preview instead — tap Share to save to Files.");
    } else if (result === "failed") {
      setNotice("Unable to download that part. Please try again.");
    }
  }




  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center">
      <div className="glass-strong relative w-full max-w-md max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-5">
        <button
          onClick={onClose}
          className="absolute right-3 top-3 rounded-full p-2 text-muted-foreground hover:text-foreground"
        >
          <X className="h-5 w-5" />
        </button>
        <h2 className="text-xl font-bold">Print cards</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {selectedCards.length} of {pool.length} selected · A4, ready to cut.
        </p>

        <div className="mt-4 space-y-3">
          {/* Deck picker */}
          {decks && decks.length > 0 && (
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Print a deck</p>
              <select
                value={deckId}
                onChange={(e) => selectDeck(e.target.value)}
                className="w-full rounded-xl border border-border bg-[var(--surface)] py-2.5 px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--neon-green)]"
              >
                <option value="">— none —</option>
                {decks.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Selection list */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Cards</p>
              <div className="flex gap-2 text-xs">
                <button onClick={selectAll} className="text-[var(--neon-green)]">Select all</button>
                <span className="text-muted-foreground">·</span>
                <button onClick={selectNone} className="text-muted-foreground">Clear</button>
              </div>
            </div>
            <ul className="max-h-40 space-y-1 overflow-y-auto rounded-xl bg-[var(--surface)] p-2">
              {pool.map((c) => {
                const checked = selectedIds.has(c.id);
                return (
                  <li key={c.id}>
                    <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-white/5">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(c.id)}
                        className="h-4 w-4 accent-[var(--neon-green)]"
                      />
                      {c.cover_url ? (
                        <img src={c.cover_url} alt="" className="h-7 w-7 rounded object-cover" />
                      ) : (
                        <div className="h-7 w-7 rounded bg-muted" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">{c.title}</p>
                        <p className="truncate text-[10px] text-muted-foreground">
                          {c.artist}{c.release_year ? ` · ${c.release_year}` : ""}
                        </p>
                      </div>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>

          <div>
            <p className="mb-1 text-xs text-muted-foreground">Card size</p>
            <div className="grid grid-cols-4 gap-1 rounded-2xl bg-[var(--surface)] p-1 text-xs">
              {(["auto", "poker", "bridge", "mini"] as CardSize[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setSize(s)}
                  className={
                    "rounded-xl px-2 py-2 font-medium capitalize transition-colors " +
                    (size === s ? "gradient-neon text-[oklch(0.15_0_0)]" : "text-muted-foreground")
                  }
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {size === "auto" && (
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Cards per page</p>
              <div className="grid grid-cols-5 gap-1 rounded-2xl bg-[var(--surface)] p-1 text-sm">
                {([4, 6, 8, 9, 12] as PerPage[]).map((n) => (
                  <button
                    key={n}
                    onClick={() => setPerPage(n)}
                    className={
                      "rounded-xl px-2 py-2 font-medium transition-colors " +
                      (perPage === n ? "gradient-neon text-[oklch(0.15_0_0)]" : "text-muted-foreground")
                    }
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="mb-1 text-xs text-muted-foreground">Print mode</p>
            <div className="grid grid-cols-3 gap-1 rounded-2xl bg-[var(--surface)] p-1 text-sm">
              {(["front", "back", "double"] as Mode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={
                    "rounded-xl px-2 py-2 font-medium capitalize transition-colors " +
                    (mode === m ? "gradient-neon text-[oklch(0.15_0_0)]" : "text-muted-foreground")
                  }
                >
                  {m === "double" ? "Both" : m}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Both = front sheet + back sheet, mirrored for duplex printing.
            </p>
          </div>

          {/* Live preview */}
          <PreviewSheets cards={selectedCards} mode={mode} layout={layout} />

          {/* Export mode */}
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Export mode</p>
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-[var(--surface)] p-1 text-xs">
              {(["split", "single"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    setSplitMode(m);
                    setParts([]);
                  }}
                  className={
                    "rounded-lg px-2 py-2 font-medium transition-colors " +
                    (splitMode === m
                      ? "gradient-neon text-[oklch(0.15_0_0)]"
                      : "text-muted-foreground")
                  }
                >
                  {m === "split" ? "Split (recommended)" : "Single PDF"}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Split mode creates one PDF per {MAX_CARDS_PER_PDF} cards so large decks download
              reliably on phones.
            </p>
          </div>

          {notice && (
            <p className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-200">
              {notice}
            </p>
          )}

          <button
            disabled={busy || selectedCards.length === 0}
            onClick={handleExport}
            className="flex w-full items-center justify-center gap-2 rounded-xl gradient-neon px-4 py-3 font-semibold text-[oklch(0.15_0_0)] disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
            {busy
              ? (progress ?? "Generating…")
              : chunks.length > 1
                ? `Generate ${chunks.length} PDFs (${selectedCards.length})`
                : `Download PDF (${selectedCards.length})`}
          </button>

          {parts.length > 1 && (
            <div className="space-y-2">
              {parts.map((p, i) => (
                <button
                  key={p.filename}
                  onClick={() => downloadPart(p)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl glass-strong px-4 py-3 text-sm font-semibold"
                >
                  <Download className="h-4 w-4" />
                  Download PDF · Part {i + 1} ({p.count})
                </button>
              ))}
            </div>
          )}


        </div>
      </div>
    </div>
  );
}

// ————————————————————————————————————————————————————————————————
// Layout
// ————————————————————————————————————————————————————————————————

type Layout = {
  cols: number;
  rows: number;
  cellW: number; // mm
  cellH: number; // mm
  perPage: number;
};

function layoutFor(perPage: PerPage, size: CardSize): Layout {
  if (size === "auto") {
    const grid = gridFor(perPage);
    const cellW = (PAGE_W - MARGIN * 2 - GAP * (grid.cols - 1)) / grid.cols;
    const cellH = (PAGE_H - MARGIN * 2 - GAP * (grid.rows - 1)) / grid.rows;
    return { ...grid, cellW, cellH, perPage };
  }
  const dim = CARD_SIZES[size];
  const cols = Math.max(1, Math.floor((PAGE_W - MARGIN * 2 + GAP) / (dim.w + GAP)));
  const rows = Math.max(1, Math.floor((PAGE_H - MARGIN * 2 + GAP) / (dim.h + GAP)));
  return { cols, rows, cellW: dim.w, cellH: dim.h, perPage: cols * rows };
}

function gridFor(n: PerPage): { cols: number; rows: number } {
  switch (n) {
    case 4: return { cols: 2, rows: 2 };
    case 6: return { cols: 2, rows: 3 };
    case 8: return { cols: 2, rows: 4 };
    case 9: return { cols: 3, rows: 3 };
    case 12: return { cols: 3, rows: 4 };
  }
}

// ————————————————————————————————————————————————————————————————
// Shared card face — used by BOTH preview and PDF export.
// Sized in explicit pixels; typography scales with height so the
// preview and printed output are visually identical.
// ————————————————————————————————————————————————————————————————

function CardFront({
  card,
  qr,
  w,
  h,
}: {
  card: Card;
  qr: string;
  w: number;
  h: number;
}) {
  const s = (v: number) => `${v * h}px`;
  return (
    <div
      style={{
        width: `${w}px`,
        height: `${h}px`,
        position: "relative",
        background: "#050505",
        borderRadius: s(0.035),
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "space-between",
        padding: s(0.035),
        textAlign: "center",
        overflow: "hidden",
        boxSizing: "border-box",
        color: "white",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      }}
    >
      {/* Neon rainbow ring */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%,-50%)",
          width: "78%",
          height: "78%",
          borderRadius: "50%",
          background:
            "conic-gradient(from 210deg, #ff2fb0, #ff7a1f, #ffe93b, #2fb0ff, #ff2fb0)",
          filter: "blur(0.5px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%,-50%)",
          width: "64%",
          height: "64%",
          borderRadius: "50%",
          background: "#050505",
        }}
      />
      <span
        style={{
          position: "relative",
          zIndex: 2,
          fontSize: s(0.055),
          fontWeight: 700,
          letterSpacing: "0.15em",
          color: "rgba(255,255,255,0.82)",
        }}
      >
        HIDDEN
      </span>
      <div
        style={{
          position: "relative",
          zIndex: 2,
          width: "56%",
          height: "56%",
          background: "white",
          padding: s(0.008),
          borderRadius: s(0.014),
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxSizing: "border-box",
        }}
      >
        {qr ? (
          <img
            src={qr}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
          />
        ) : (
          <QrIcon style={{ width: "40%", height: "40%", color: "#9ca3af" }} />
        )}
      </div>
      <span
        style={{
          position: "relative",
          zIndex: 2,
          fontSize: s(0.05),
          fontWeight: 500,
          color: "rgba(255,255,255,0.62)",
          letterSpacing: "0.06em",
        }}
      >
        HITS
      </span>
    </div>
  );
}

function CardBack({
  card,
  cover,
  w,
  h,
}: {
  card: Card;
  cover: string | null;
  w: number;
  h: number;
}) {
  const s = (v: number) => `${v * h}px`;
  return (
    <div
      style={{
        width: `${w}px`,
        height: `${h}px`,
        background: "#050505",
        borderRadius: s(0.035),
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "space-between",
        padding: s(0.05),
        textAlign: "center",
        color: "white",
        overflow: "hidden",
        boxSizing: "border-box",
        position: "relative",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      }}
    >
      {cover ? (
        <img
          src={cover}
          alt=""
          crossOrigin="anonymous"
          style={{
            width: "58%",
            height: "48%",
            objectFit: "cover",
            borderRadius: s(0.014),
            boxShadow: `0 0 0 ${s(0.006)} rgba(255,47,176,0.45)`,
          }}
        />
      ) : (
        <div
          style={{
            width: "58%",
            height: "48%",
            background: "#1f2030",
            borderRadius: s(0.014),
          }}
        />
      )}
      <div style={{ width: "100%" }}>
        <p
          style={{
            margin: 0,
            fontSize: s(0.075),
            fontWeight: 700,
            lineHeight: 1.1,
            color: "white",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {card.title}
        </p>
        <p
          style={{
            margin: 0,
            marginTop: s(0.01),
            fontSize: s(0.055),
            lineHeight: 1.1,
            color: "rgba(255,255,255,0.55)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {card.artist}
        </p>
        <p
          style={{
            margin: 0,
            marginTop: s(0.02),
            fontSize: s(0.16),
            fontWeight: 900,
            lineHeight: 1,
            backgroundImage: "linear-gradient(135deg, #ff2fb0, #ff7a1f)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
            WebkitTextFillColor: "transparent",
          }}
        >
          {card.release_year ?? "—"}
        </p>
      </div>
    </div>
  );
}

// ————————————————————————————————————————————————————————————————
// Live preview — uses the shared CardFront/CardBack at a preview scale.
// ————————————————————————————————————————————————————————————————

const PREVIEW_PAGE_W_PX = 170; // page thumbnail width in px
const PREVIEW_SCALE = PREVIEW_PAGE_W_PX / PAGE_W; // px per mm

function PreviewSheets({
  cards,
  mode,
  layout,
}: {
  cards: Card[];
  mode: Mode;
  layout: Layout;
}) {
  const firstPage = cards.slice(0, layout.perPage);
  const showFront = mode === "front" || mode === "double";
  const showBack = mode === "back" || mode === "double";
  const totalPages =
    Math.max(1, Math.ceil(cards.length / layout.perPage)) *
    (mode === "double" ? 2 : 1);

  return (
    <div className="rounded-xl bg-[var(--surface)] p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Preview</p>
        <p className="text-[10px] text-muted-foreground">
          {cards.length} card{cards.length === 1 ? "" : "s"} · {totalPages} page
          {totalPages === 1 ? "" : "s"}
        </p>
      </div>
      <div
        className={`mt-2 grid gap-2 ${showFront && showBack ? "grid-cols-2" : "grid-cols-1 place-items-center"}`}
      >
        {showFront && (
          <PreviewPage cards={firstPage} layout={layout} kind="front" />
        )}
        {showBack && (
          <PreviewPage
            cards={firstPage}
            layout={layout}
            kind="back"
            mirrored={mode === "double"}
          />
        )}
      </div>
      {cards.length === 0 && (
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Select at least one card to preview.
        </p>
      )}
    </div>
  );
}

function PreviewPage({
  cards,
  layout,
  kind,
  mirrored = false,
}: {
  cards: Card[];
  layout: Layout;
  kind: "front" | "back";
  mirrored?: boolean;
}) {
  const cells: Array<Card | null> = Array.from(
    { length: layout.perPage },
    (_, i) => cards[i] ?? null,
  );
  const arranged = mirrored
    ? cells.map((_, i) => {
        const row = Math.floor(i / layout.cols);
        const col = i % layout.cols;
        const mirroredCol = layout.cols - 1 - col;
        return cells[row * layout.cols + mirroredCol];
      })
    : cells;

  const pageWpx = PAGE_W * PREVIEW_SCALE;
  const pageHpx = PAGE_H * PREVIEW_SCALE;
  const cellWpx = layout.cellW * PREVIEW_SCALE;
  const cellHpx = layout.cellH * PREVIEW_SCALE;
  const gapPx = GAP * PREVIEW_SCALE;
  const gridWpx = layout.cols * cellWpx + (layout.cols - 1) * gapPx;
  const gridHpx = layout.rows * cellHpx + (layout.rows - 1) * gapPx;

  return (
    <div
      className="relative overflow-hidden rounded-md bg-white text-black shadow-inner"
      style={{ width: `${pageWpx}px`, height: `${pageHpx}px` }}
    >
      <div
        style={{
          position: "absolute",
          left: `${(pageWpx - gridWpx) / 2}px`,
          top: `${(pageHpx - gridHpx) / 2}px`,
          display: "grid",
          gridTemplateColumns: `repeat(${layout.cols}, ${cellWpx}px)`,
          gridTemplateRows: `repeat(${layout.rows}, ${cellHpx}px)`,
          gap: `${gapPx}px`,
        }}
      >
        {arranged.map((c, i) => (
          <div key={i} style={{ width: cellWpx, height: cellHpx }}>
            {c ? (
              kind === "front" ? (
                <PreviewFrontCell card={c} w={cellWpx} h={cellHpx} />
              ) : (
                <CardBack card={c} cover={c.cover_url} w={cellWpx} h={cellHpx} />
              )
            ) : null}
          </div>
        ))}
      </div>
      <span className="absolute right-1 top-1 rounded bg-black/50 px-1 text-[8px] font-medium text-white">
        {kind}
      </span>
    </div>
  );
}

function PreviewFrontCell({
  card,
  w,
  h,
}: {
  card: Card;
  w: number;
  h: number;
}) {
  const [qr, setQr] = useState<string>("");
  useEffect(() => {
    let cancel = false;
    qrToDataUrl(card.qr_payload, 256).then((d) => !cancel && setQr(d));
    return () => {
      cancel = true;
    };
  }, [card.qr_payload]);
  return <CardFront card={card} qr={qr} w={w} h={h} />;
}

// ————————————————————————————————————————————————————————————————
// PDF export — rasterizes the SAME CardFront/CardBack components
// so the printed output matches the on-screen preview exactly.
// ————————————————————————————————————————————————————————————————

/** Desktop ~305 DPI; mobile ~203 DPI to keep raster memory / time manageable. */
const PRINT_DPI_MM_DESKTOP = 12;
const PRINT_DPI_MM_MOBILE = 8;

function printDpiMm(): number {
  if (typeof window === "undefined") return PRINT_DPI_MM_DESKTOP;
  const ua = navigator.userAgent || "";
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (ua.includes("Mac") && "ontouchend" in document);
  const isNarrow = window.matchMedia("(max-width: 768px)").matches;
  return isIOS || isNarrow ? PRINT_DPI_MM_MOBILE : PRINT_DPI_MM_DESKTOP;
}

async function blobToPngDataUrl(blob: Blob): Promise<string> {
  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Cover image could not be decoded"));
      image.src = objectUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Cover image conversion is unavailable");
    ctx.drawImage(image, 0, 0);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function fetchCoverDataUrl(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const proxiedUrl = `/api/image-proxy?url=${encodeURIComponent(url)}`;
    const r = await fetch(proxiedUrl);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const blob = await r.blob();
    return await blobToPngDataUrl(blob);
  } catch (error) {
    console.warn("[PDF export] Cover image could not be prefetched", { url, error });
    return null;
  }
}

type CaptureDebug = {
  label: string;
  cardId: string;
  title: string;
};

type CaptureAnalysis = {
  width: number;
  height: number;
  bytes: number;
  nonBlackRatio: number;
  uniqueColorBuckets: number;
  looksBlank: boolean;
};

function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  if (comma === -1) return dataUrl.length;
  const base64 = dataUrl.slice(comma + 1);
  return Math.floor((base64.length * 3) / 4);
}

async function analyzeCapturedPng(dataUrl: string): Promise<CaptureAnalysis> {
  const image = new Image();
  image.decoding = "async";
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Captured PNG could not be decoded"));
    image.src = dataUrl;
  });

  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas inspection is unavailable");
  ctx.drawImage(image, 0, 0);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const stride = Math.max(4, Math.floor(data.length / 20_000 / 4) * 4);
  let sampled = 0;
  let nonBlack = 0;
  const buckets = new Set<string>();
  for (let i = 0; i < data.length; i += stride) {
    const alpha = data[i + 3];
    if (alpha < 8) continue;
    sampled += 1;
    const red = data[i];
    const green = data[i + 1];
    const blue = data[i + 2];
    if (red > 24 || green > 24 || blue > 24) nonBlack += 1;
    buckets.add(`${red >> 4}-${green >> 4}-${blue >> 4}-${alpha >> 5}`);
  }
  const nonBlackRatio = sampled > 0 ? nonBlack / sampled : 0;
  return {
    width: image.naturalWidth,
    height: image.naturalHeight,
    bytes: dataUrlBytes(dataUrl),
    nonBlackRatio,
    uniqueColorBuckets: buckets.size,
    looksBlank: nonBlackRatio < 0.005 || buckets.size < 3,
  };
}

async function renderNodeToPng(
  node: React.ReactElement,
  w: number,
  h: number,
  debug: CaptureDebug,
): Promise<string> {
  const host = document.createElement("div");
  // Keep the node mounted in the viewport so layout/paint happens, but do not
  // hide it with opacity/visibility/display. html-to-image captures computed
  // opacity from ancestors; opacity:0 was the source of the black rectangles.
  host.style.cssText = [
    "position:fixed",
    "left:0",
    "top:0",
    "pointer-events:none",
    "z-index:-2147483647",
    `width:${w}px`,
    `height:${h}px`,
    "background:transparent",
    "overflow:hidden",
    "contain:layout paint",
  ].join(";");
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    // Force a synchronous commit so the DOM is populated before we snapshot.
    flushSync(() => {
      root.render(node);
    });

    // Wait for fonts + two paints so gradients/text are ready.
    if (document.fonts && document.fonts.ready) {
      try {
        await document.fonts.ready;
      } catch {
        /* noop */
      }
    }
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );

    const captureNode = host.firstElementChild;
    if (!(captureNode instanceof HTMLElement)) {
      console.error("[PDF export] Card component did not mount before capture", debug);
      throw new Error("Card component did not mount before PDF capture");
    }

    const hostStyle = window.getComputedStyle(host);
    const nodeStyle = window.getComputedStyle(captureNode);
    const rect = captureNode.getBoundingClientRect();
    const domDebug = {
      ...debug,
      componentExistsInDom: document.body.contains(captureNode),
      requestedSize: { width: w, height: h },
      mountedSize: { width: rect.width, height: rect.height },
      hostCss: {
        display: hostStyle.display,
        visibility: hostStyle.visibility,
        opacity: hostStyle.opacity,
        overflow: hostStyle.overflow,
        transform: hostStyle.transform,
        position: hostStyle.position,
        zIndex: hostStyle.zIndex,
      },
      cardCss: {
        display: nodeStyle.display,
        visibility: nodeStyle.visibility,
        opacity: nodeStyle.opacity,
        overflow: nodeStyle.overflow,
        transform: nodeStyle.transform,
        position: nodeStyle.position,
        zIndex: nodeStyle.zIndex,
      },
      images: Array.from(captureNode.querySelectorAll("img")).map((img) => ({
        complete: img.complete,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        srcPreview: img.currentSrc.slice(0, 120),
      })),
    };

    // Wait for every img inside to be ready.
    const imgs = Array.from(captureNode.querySelectorAll("img"));
    await Promise.all(
      imgs.map((img) =>
        img.complete && img.naturalWidth > 0
          ? Promise.resolve()
          : new Promise<void>((res) => {
              const done = () => res();
              img.addEventListener("load", done, { once: true });
              img.addEventListener("error", done, { once: true });
              // Safety timeout so a stuck image never blocks the export.
              setTimeout(done, 4000);
            }),
      ),
    );

    const png = await toPng(captureNode, {
      pixelRatio: 1,
      width: w,
      height: h,
      cacheBust: false,
      backgroundColor: "#050505",
      skipFonts: true,
    });
    const analysis = await analyzeCapturedPng(png);
    if (analysis.looksBlank) {
      console.error("[PDF export] Captured PNG appears blank/black before PDF creation", {
        ...domDebug,
        analysis,
      });
      throw new Error("Card PNG capture failed before PDF creation");
    }
    return png;
  } catch (error) {
    console.error("[PDF export] html-to-image rendering error", { ...debug, error });
    throw error;
  } finally {
    root.unmount();
    host.remove();
  }
}

async function exportPdf(opts: {
  cards: Card[];
  mode: Mode;
  layout: Layout;
}): Promise<Blob> {
  const { cards, mode, layout } = opts;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const { cellW, cellH, cols, rows, perPage } = layout;

  const dpi = printDpiMm();
  const pxW = Math.round(cellW * dpi);
  const pxH = Math.round(cellH * dpi);

  // Pre-compute QR data URLs (unique payloads in parallel)
  const qrCache = new Map<string, string>();
  const uniquePayloads = [...new Set(cards.map((c) => c.qr_payload))];
  await Promise.all(
    uniquePayloads.map(async (payload) => {
      qrCache.set(payload, await qrToDataUrl(payload, 512));
    }),
  );
  // Pre-fetch cover images as data URLs (avoids CORS taint during rasterization)
  const coverCache = new Map<string | null, string | null>();
  const uniqueCovers = [...new Set(cards.map((c) => c.cover_url))];
  await Promise.all(
    uniqueCovers.map(async (url) => {
      coverCache.set(url, await fetchCoverDataUrl(url));
    }),
  );
  // Render each face once and cache the PNG
  const frontPngCache = new Map<string, string>();
  const backPngCache = new Map<string, string>();
  async function frontPng(c: Card): Promise<string> {
    const key = c.id;
    const cached = frontPngCache.get(key);
    if (cached) return cached;
    const qr = qrCache.get(c.qr_payload);
    if (!qr) throw new Error(`QR data missing for card ${c.id}`);
    const png = await renderNodeToPng(
      <CardFront card={c} qr={qr} w={pxW} h={pxH} />,
      pxW,
      pxH,
      { label: "front", cardId: c.id, title: c.title },
    );
    frontPngCache.set(key, png);
    return png;
  }
  async function backPng(c: Card): Promise<string> {
    const key = c.id;
    const cached = backPngCache.get(key);
    if (cached) return cached;
    const cover = coverCache.get(c.cover_url) ?? null;
    const png = await renderNodeToPng(
      <CardBack card={c} cover={cover} w={pxW} h={pxH} />,
      pxW,
      pxH,
      { label: "back", cardId: c.id, title: c.title },
    );
    backPngCache.set(key, png);
    return png;
  }

  const firstCard = cards[0];
  if (firstCard) {
    if (mode === "back") await backPng(firstCard);
    else await frontPng(firstCard);
  }

  const gridW = cols * cellW + (cols - 1) * GAP;
  const gridH = rows * cellH + (rows - 1) * GAP;
  const offsetX = (PAGE_W - gridW) / 2;
  const offsetY = (PAGE_H - gridH) / 2;

  function positions() {
    const list: Array<{ x: number; y: number }> = [];
    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols; col++) {
        list.push({
          x: offsetX + col * (cellW + GAP),
          y: offsetY + r * (cellH + GAP),
        });
      }
    }
    return list;
  }

  // Faces already include QR/cover from CardFront/CardBack rasterization —
  // do not overlay them again (that doubled images and bloated the PDF).
  async function drawFront(c: Card, x: number, y: number) {
    doc.addImage(await frontPng(c), "PNG", x, y, cellW, cellH);
  }
  async function drawBack(c: Card, x: number, y: number) {
    doc.addImage(await backPng(c), "PNG", x, y, cellW, cellH);
  }

  async function paginate(kind: "front" | "back") {
    const pos = positions();
    let i = 0;
    let first = true;
    while (i < cards.length) {
      const slice = cards.slice(i, i + perPage);
      if (!first) doc.addPage();
      for (let j = 0; j < slice.length; j++) {
        const c = slice[j];
        const { x, y } = pos[j];
        if (kind === "front") await drawFront(c, x, y);
        else await drawBack(c, x, y);
      }
      i += perPage;
      first = false;
    }
  }

  if (mode === "front") await paginate("front");
  else if (mode === "back") await paginate("back");
  else {
    const pos = positions();
    let i = 0;
    let first = true;
    while (i < cards.length) {
      const slice = cards.slice(i, i + perPage);
      if (!first) doc.addPage();
      for (let j = 0; j < slice.length; j++) {
        const { x, y } = pos[j];
        await drawFront(slice[j], x, y);
      }
      doc.addPage();
      for (let j = 0; j < slice.length; j++) {
        const row = Math.floor(j / cols);
        const col = j % cols;
        const mirroredCol = cols - 1 - col;
        const mirroredIndex = row * cols + mirroredCol;
        const { x, y } = pos[mirroredIndex];
        await drawBack(slice[j], x, y);
      }
      i += perPage;
      first = false;
    }
  }

  const blob = doc.output("blob");
  return blob;
}

type SaveResult = "downloaded" | "opened" | "failed";

async function savePdf(blob: Blob, filename: string): Promise<SaveResult> {
  const ua = navigator.userAgent || "";
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (ua.includes("Mac") && "ontouchend" in document);

  try {
    const file = new File([blob], filename, { type: "application/pdf" });
    const nav = navigator as Navigator & {
      canShare?: (d: { files: File[] }) => boolean;
    };
    if (
      isIOS &&
      typeof navigator.share === "function" &&
      nav.canShare?.({ files: [file] })
    ) {
      await navigator.share({ files: [file], title: filename });
      return "downloaded";
    }
  } catch (e) {
    console.warn("share failed", e);
  }

  const url = URL.createObjectURL(blob);

  if (!isIOS) {
    try {
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      return "downloaded";
    } catch (e) {
      console.warn("anchor download failed", e);
    }
  }

  try {
    const win = window.open(url, "_blank");
    if (win) {
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      return "opened";
    }
  } catch (e) {
    console.warn("window.open failed", e);
  }

  try {
    window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return "opened";
  } catch (e) {
    console.error("all save methods failed", e);
    URL.revokeObjectURL(url);
    return "failed";
  }
}

