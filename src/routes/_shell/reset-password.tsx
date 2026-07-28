import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Lock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_shell/reset-password")({
  head: () => ({ meta: [{ title: "Reset password — HiddenHits" }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const nav = useNavigate();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Password updated");
      nav({ to: "/profile" });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setLoading(false);
    }
  }

  return (
      <div className="px-5 pt-10">
        <h1 className="text-3xl font-bold">Choose a new password</h1>
        <p className="mt-2 text-sm text-muted-foreground">Make sure it's at least 8 characters.</p>
        <form onSubmit={onSubmit} className="mt-6 space-y-3">
          <div className="relative">
            <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="New password"
              className="w-full rounded-2xl glass px-12 py-4 text-base outline-none focus:ring-2 focus:ring-[var(--neon-green)]"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl gradient-neon px-5 py-4 text-base font-semibold text-[oklch(0.15_0_0)] glow-green disabled:opacity-60"
          >
            {loading && <Loader2 className="h-5 w-5 animate-spin" />} Save password
          </button>
        </form>
      </div>
  );
}
