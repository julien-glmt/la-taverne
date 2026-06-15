"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

export default function AccountPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }

      const u = session.user;
      const discordName = u.user_metadata?.full_name ?? u.user_metadata?.name ?? u.email ?? "";

      const { data: profile } = await supabase
        .from("profiles")
        .select("username, balance_blackjack")
        .eq("id", u.id)
        .single();

      setDisplayName(profile?.username ?? discordName);
      setUsername(profile?.username ?? "");
      setBalance(profile?.balance_blackjack ?? 1000);
      setLoading(false);
    }
    load();
  }, [router]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess(false);

    if (!username.trim()) { setError("Le pseudo ne peut pas être vide."); return; }
    if (username.trim().length < 2) { setError("Minimum 2 caractères."); return; }
    if (username.trim().length > 20) { setError("Maximum 20 caractères."); return; }

    setSaving(true);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.push("/login"); return; }

    const { error: saveError } = await supabase
      .from("profiles")
      .update({ username: username.trim() })
      .eq("id", session.user.id);

    if (saveError) {
      setError("Erreur lors de la sauvegarde.");
    } else {
      setSuccess(true);
      setDisplayName(username.trim());
    }

    setSaving(false);
  }

  if (loading) return (
    <div className="min-h-screen bg-[#1a1208] flex items-center justify-center">
      <p className="text-[#4a3820] text-sm tracking-widest animate-pulse">Chargement...</p>
    </div>
  );

  return (
    <main className="min-h-screen bg-[#1a1208] text-[#e8dcc8] font-sans flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">

        <div className="text-center mb-10">
          <a href="/" className="text-xs text-[#4a3820] hover:text-[#c8a030] tracking-widest uppercase transition-colors block mb-8">
            ← La Taverne
          </a>
          <div className="text-5xl mb-4">👤</div>
          <h1 className="text-2xl text-[#f0e0b0] mb-1" style={{ fontFamily: "Georgia, serif", fontWeight: 400 }}>
            Mon compte
          </h1>
          <p className="text-sm text-[#6a5838]">{displayName}</p>
        </div>

        {/* Solde */}
        {balance !== null && (
          <div className="mb-8 p-4 rounded-sm text-center"
            style={{ background: "rgba(200,160,48,0.06)", border: "1px solid rgba(200,160,48,0.15)" }}>
            <p className="text-xs tracking-[0.2em] uppercase text-[#4a3820] mb-1">Solde Blackjack</p>
            <p className="text-2xl font-mono text-[#c8a030]">{balance.toLocaleString()} 🪙</p>
            {balance === 0 && (
              <button
                onClick={async () => {
                  const { data: { session } } = await supabase.auth.getSession();
                  if (!session) return;
                  await supabase.from("profiles").update({
                    balance_blackjack: 100,
                    last_refill: new Date().toISOString(),
                  }).eq("id", session.user.id);
                  setBalance(100);
                }}
                className="mt-3 text-xs px-4 py-2 rounded-sm"
                style={{ background: "rgba(200,160,48,0.1)", color: "#c8a030", border: "1px solid rgba(200,160,48,0.2)" }}>
                Récupérer 100 🪙
              </button>
            )}
          </div>
        )}

        {/* Modifier pseudo */}
        <form onSubmit={handleSave} className="flex flex-col gap-4">
          <div>
            <label className="block text-xs tracking-[0.2em] uppercase text-[#4a3820] mb-2">
              Pseudo
            </label>
            <input
              type="text"
              value={username}
              onChange={e => { setUsername(e.target.value); setSuccess(false); }}
              placeholder="Ton pseudo..."
              maxLength={20}
              className="w-full px-4 py-3 rounded-sm text-sm text-[#e8dcc8] placeholder-[#3a2810] outline-none"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
              onFocus={e => e.target.style.borderColor = "rgba(200,160,48,0.4)"}
              onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.08)"}
            />
            <p className="text-xs text-[#3a2810] mt-1">{username.length}/20 caractères</p>
          </div>

          {error && <p className="text-xs text-[#c87050] text-center">{error}</p>}
          {success && <p className="text-xs text-[#6abf6a] text-center">✓ Pseudo mis à jour !</p>}

          <button type="submit" disabled={saving}
            className="w-full py-4 rounded-sm text-sm font-medium tracking-wide"
            style={{ background: saving ? "#3a2810" : "#c8a030", color: saving ? "#4a3820" : "#1a1208" }}>
            {saving ? "Sauvegarde..." : "Sauvegarder"}
          </button>
        </form>
      </div>
    </main>
  );
}
