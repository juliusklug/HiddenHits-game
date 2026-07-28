import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Library,
  Plus,
  Grid3x3,
  Rows3,
  Search,
  Printer,
  Trash2,
  Copy,
  Download,
  Layers,
  Loader2,
  Pencil,
} from "lucide-react";
import { CardCreatorDialog } from "@/components/CardCreatorDialog";
import { CardPrintDialog } from "@/components/CardPrintDialog";
import { CardEditDialog } from "@/components/CardEditDialog";
import { DeckManager } from "@/components/DeckManager";
import { CardQr } from "@/components/CardQr";
import { useAuth } from "@/hooks/use-auth";
import { useIsAdmin } from "@/hooks/use-is-admin";
import {
  listCards,
  listDecks,
  deleteCard,
  duplicateCard,
  canManageCard,
  type Card,
  type Deck,
} from "@/lib/cards-api";
import { qrToDataUrl, downloadDataUrl } from "@/lib/qr";


export const Route = createFileRoute("/_shell/cards")({
  head: () => ({
    meta: [
      { title: "My cards — HiddenHits" },
      {
        name: "description",
        content: "Create, manage and print your own HiddenHits QR music cards.",
      },
    ],
  }),
  component: CardsPage,
});

type View = "grid" | "list";
type Tab = "cards" | "decks";

function CardsPage() {
  const { user, loading } = useAuth();
  const { isAdmin } = useIsAdmin(user?.id);
  const [tab, setTab] = useState<Tab>("cards");
  const [view, setView] = useState<View>("grid");
  const [cards, setCards] = useState<Card[]>([]);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [loadingCards, setLoadingCards] = useState(true);
  const [query, setQuery] = useState("");
  const [decade, setDecade] = useState<string>("all");
  const [library, setLibrary] = useState<"all" | "official" | "mine">("all");
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [printing, setPrinting] = useState<Card[] | null>(null);
  const [editing, setEditing] = useState<Card | null>(null);

  useEffect(() => {
    if (!user) {
      setLoadingCards(false);
      return;
    }
    setLoadingCards(true);
    Promise.all([listCards(), listDecks()])
      .then(([c, d]) => {
        setCards(c);
        setDecks(d);
      })
      .finally(() => setLoadingCards(false));
  }, [user]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cards.filter((c) => {
      if (q) {
        const hay = `${c.title} ${c.artist} ${c.release_year ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (library === "official" && !c.is_official) return false;
      if (library === "mine" && c.is_official) return false;
      if (decade !== "all" && c.release_year != null) {
        const d = Math.floor(c.release_year / 10) * 10;
        if (String(d) !== decade) return false;
      }
      return true;
    });
  }, [cards, query, decade, library]);

  const officialCount = useMemo(() => cards.filter((c) => c.is_official).length, [cards]);
  const privateCount = cards.length - officialCount;

  const decades = useMemo(() => {
    const set = new Set<number>();
    for (const c of cards) {
      if (c.release_year != null) set.add(Math.floor(c.release_year / 10) * 10);
    }
    return Array.from(set).sort();
  }, [cards]);

  async function handleDelete(card: Card) {
    if (!confirm(`Delete "${card.title}"?`)) return;
    await deleteCard(card.id);
    setCards((prev) => prev.filter((c) => c.id !== card.id));
  }

  async function handleDuplicate(card: Card) {
    if (!user) return;
    const c = await duplicateCard(user.id, card, { isOfficial: isAdmin && card.is_official });
    setCards((prev) => [c, ...prev]);
  }

  async function handleDownloadQr(card: Card) {
    const data = await qrToDataUrl(card.qr_payload, 1024);
    downloadDataUrl(data, `hiddenhits-${slug(card.title)}.png`);
  }

  if (loading) {
    return (
        <div className="flex h-[50vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
    );
  }

  if (!user) {
    return (
        <div className="px-5 pt-12">
          <h1 className="text-3xl font-bold">Your cards</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in to build a custom deck synced across all your devices.
          </p>
          <Link
            to="/auth"
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl gradient-neon px-5 py-4 text-base font-semibold text-[oklch(0.15_0_0)]"
          >
            Sign in to start
          </Link>
          <div className="mt-8 rounded-2xl glass p-8 text-center">
            <Library className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">
              Your cards, QR codes and decks live in the cloud once you're signed in.
            </p>
          </div>
        </div>
    );
  }

  return (
      <div className="px-5 pt-10">
        <h1 className="text-3xl font-bold">Your cards</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {officialCount} official · {privateCount} private · {decks.length} deck
          {decks.length === 1 ? "" : "s"}
        </p>

        <div className="mt-4 grid grid-cols-2 gap-1 rounded-2xl bg-[var(--surface)] p-1 text-sm">
          <TabBtn active={tab === "cards"} onClick={() => setTab("cards")} icon={<Library className="h-4 w-4" />} label="Cards" />
          <TabBtn active={tab === "decks"} onClick={() => setTab("decks")} icon={<Layers className="h-4 w-4" />} label="Decks" />
        </div>

        {tab === "cards" ? (
          <>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setCreatorOpen(true)}
                className="flex flex-1 items-center justify-center gap-2 rounded-2xl gradient-neon px-4 py-3 font-semibold text-[oklch(0.15_0_0)]"
              >
                <Plus className="h-5 w-5" /> New card
              </button>
              <button
                disabled={filtered.length === 0}
                onClick={() => setPrinting(filtered)}
                className="flex items-center justify-center rounded-2xl glass-strong px-4 py-3 disabled:opacity-50"
                aria-label="Print all"
              >
                <Printer className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-1 rounded-2xl bg-[var(--surface)] p-1 text-xs">
              {(["all", "official", "mine"] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setLibrary(k)}
                  className={
                    "rounded-xl px-2 py-2 font-medium transition-colors " +
                    (library === k
                      ? "gradient-neon text-[oklch(0.15_0_0)]"
                      : "text-muted-foreground")
                  }
                >
                  {k === "all" ? "All songs" : k === "official" ? "Official" : "My songs"}
                </button>
              ))}
            </div>

            <div className="mt-3 flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search title, artist, year…"
                  className="w-full rounded-xl border border-border bg-[var(--surface)] py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-[var(--neon-green)]"
                />
              </div>
              <select
                value={decade}
                onChange={(e) => setDecade(e.target.value)}
                className="rounded-xl border border-border bg-[var(--surface)] py-2.5 px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--neon-green)]"
              >
                <option value="all">All</option>
                {decades.map((d) => (
                  <option key={d} value={d}>
                    {d}s
                  </option>
                ))}
              </select>
              <button
                onClick={() => setView(view === "grid" ? "list" : "grid")}
                className="rounded-xl glass-strong p-2.5"
                aria-label="Toggle view"
              >
                {view === "grid" ? <Rows3 className="h-4 w-4" /> : <Grid3x3 className="h-4 w-4" />}
              </button>
            </div>

            {loadingCards ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="mt-8 rounded-2xl glass p-8 text-center">
                <Library className="mx-auto h-10 w-10 text-muted-foreground" />
                <p className="mt-3 text-sm text-muted-foreground">
                  {cards.length === 0
                    ? "No cards yet. Tap “New card” to add your first."
                    : "No matches for those filters."}
                </p>
              </div>
            ) : view === "grid" ? (
              <div className="mt-4 grid grid-cols-2 gap-3">
                {filtered.map((c) => (
                  <CardGridTile
                    key={c.id}
                    card={c}
                    onPrint={() => setPrinting([c])}
                    onDelete={() => handleDelete(c)}
                    onDuplicate={() => handleDuplicate(c)}
                    onDownloadQr={() => handleDownloadQr(c)}
                    onEdit={() => setEditing(c)}
                    canManage={canManageCard(c, user.id, isAdmin)}
                  />
                ))}
              </div>
            ) : (
              <ul className="mt-4 space-y-2">
                {filtered.map((c) => (
                  <CardListRow
                    key={c.id}
                    card={c}
                    onPrint={() => setPrinting([c])}
                    onDelete={() => handleDelete(c)}
                    onDuplicate={() => handleDuplicate(c)}
                    onDownloadQr={() => handleDownloadQr(c)}
                    onEdit={() => setEditing(c)}
                    canManage={canManageCard(c, user.id, isAdmin)}
                  />
                ))}
              </ul>
            )}
          </>
        ) : (
          <div className="mt-4">
            <DeckManager userId={user.id} decks={decks} cards={cards} onDecksChange={setDecks} />
          </div>
        )}
      </div>

      {creatorOpen && (
        <CardCreatorDialog
          userId={user.id}
          isAdmin={isAdmin}
          onClose={() => setCreatorOpen(false)}
          onCreated={(newCards) => {
            setCards((prev) => [...newCards, ...prev]);
            setCreatorOpen(false);
          }}
        />
      )}
      {printing && (
        <CardPrintDialog
          cards={printing}
          allCards={cards}
          decks={decks}
          onClose={() => setPrinting(null)}
        />
      )}
      {editing && (
        <CardEditDialog
          card={editing}
          isAdmin={isAdmin}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            setCards((prev) =>
              prev.map((c) => (c.id === updated.id ? updated : c)),
            );
            setEditing(null);
          }}
        />
      )}
  );
}

function TabBtn({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 font-medium transition-colors " +
        (active ? "gradient-neon text-[oklch(0.15_0_0)]" : "text-muted-foreground")
      }
    >
      {icon}
      {label}
    </button>
  );
}

function CardGridTile({
  card,
  onPrint,
  onDelete,
  onDuplicate,
  onDownloadQr,
  onEdit,
  canManage,
}: {
  card: Card;
  canManage: boolean;
  onPrint: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onDownloadQr: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl glass">
      <div className="relative aspect-square bg-[var(--surface-elevated)]">
        {card.cover_url ? (
          <img src={card.cover_url} alt={card.title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <Library className="h-8 w-8" />
          </div>
        )}
        <div className="absolute right-2 top-2 rounded-md bg-white p-1">
          <CardQr payload={card.qr_payload} size={44} lazy />
        </div>
      </div>
      <div className="p-3">
        <p className="truncate text-sm font-semibold">{card.title}</p>
        <p className="truncate text-xs text-muted-foreground">
          {card.artist}{card.release_year ? ` · ${card.release_year}` : ""}
        </p>
        {card.is_official && (
          <span className="mt-1 inline-block rounded-full bg-[var(--surface-elevated)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Official
          </span>
        )}
        <div className="mt-2 flex items-center justify-between gap-1">
          {canManage && (
          <button onClick={onEdit} className="rounded-md p-1.5 text-muted-foreground hover:text-foreground" aria-label="Edit">
            <Pencil className="h-4 w-4" />
          </button>
          )}
          <button onClick={onPrint} className="rounded-md p-1.5 text-muted-foreground hover:text-foreground" aria-label="Print">
            <Printer className="h-4 w-4" />
          </button>
          <button onClick={onDownloadQr} className="rounded-md p-1.5 text-muted-foreground hover:text-foreground" aria-label="Download QR">
            <Download className="h-4 w-4" />
          </button>
          <button onClick={onDuplicate} className="rounded-md p-1.5 text-muted-foreground hover:text-foreground" aria-label="Duplicate">
            <Copy className="h-4 w-4" />
          </button>
          {canManage && (
            <button onClick={onDelete} className="rounded-md p-1.5 text-destructive" aria-label="Delete">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}


function CardListRow({
  card,
  onPrint,
  onDelete,
  onDuplicate,
  onDownloadQr,
  onEdit,
  canManage,
}: {
  card: Card;
  canManage: boolean;
  onPrint: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onDownloadQr: () => void;
  onEdit: () => void;
}) {
  return (
    <li className="flex items-center gap-3 rounded-xl glass p-3">
      {card.cover_url ? (
        <img src={card.cover_url} alt="" className="h-12 w-12 rounded-md object-cover" />
      ) : (
        <div className="h-12 w-12 rounded-md bg-muted" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{card.title}</p>
        <p className="truncate text-xs text-muted-foreground">
          {card.artist}{card.release_year ? ` · ${card.release_year}` : ""}
          {card.is_official ? " · Official" : ""}
        </p>
      </div>
      {canManage && (
        <button onClick={onEdit} className="p-2 text-muted-foreground" aria-label="Edit"><Pencil className="h-4 w-4" /></button>
      )}
      <button onClick={onPrint} className="p-2 text-muted-foreground" aria-label="Print"><Printer className="h-4 w-4" /></button>
      <button onClick={onDownloadQr} className="p-2 text-muted-foreground" aria-label="QR"><Download className="h-4 w-4" /></button>
      <button onClick={onDuplicate} className="p-2 text-muted-foreground" aria-label="Duplicate"><Copy className="h-4 w-4" /></button>
      {canManage && (
        <button onClick={onDelete} className="p-2 text-destructive" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
      )}

    </li>
  );
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32);
}
