"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [guestName, setGuestName] = useState("");
  const [showGuest, setShowGuest] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleDiscordLogin() {
    await supabase.auth.signInWithOAuth({
      provider: "discord",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  async function handleGuestLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!guestName.trim()) { setError("Entre un pseudo."); return; }
    if (guestName.trim().length < 2) { setError("Minimum 2 caractères."); return; }
    if (guestName.trim().length > 20) { setError("Maximum 20 caractères."); return; }

    setLoading(true);
    setError("");

    // Créer un compte anonyme
    const { data, error: authError } = await supabase.auth.signInAnonymously();

    if (authError || !data.user) {
      setError("Erreur lors de la connexion.");
      setLoading(false);
      return;
    }

    // Créer le profil invité
    await supabase.from("profiles").upsert({
      id: data.user.id,
      username: guestName.trim(),
      balance_blackjack: 1000,
      is_guest: true,
      last_seen: new Date().toISOString(),
    });

    router.push("/");
  }

  return (
    <main className="min-h-screen bg-[#1a1208] text-[#e8dcc8] font-sans flex flex-col items-center justify-center px-6">
      <div className="fixed inset-0 pointer-events-none z-0 opacity-30"
        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.05'/%3E%3C/svg%3E")` }} />

      <div className="relative z-10 w-full max-w-sm">
        <div className="text-center mb-10">
          <a href="/" className="text-xs text-[#4a3820] hover:text-[#c8a030] tracking-widest uppercase transition-colors block mb-8">
            ← La Taverne
          </a>
          <img src="/logo.png" alt="La Taverne" className="w-16 h-16 mx-auto mb-4 drop-shadow-lg" />
          <h1 className="text-3xl text-[#f0e0b0] mb-2" style={{ fontFamily: "Georgia, serif", fontWeight: 400 }}>
            La Taverne
          </h1>
          <p className="text-sm text-[#6a5838]">Connecte-toi pour jouer</p>
        </div>

        {/* Discord */}
        <button onClick={handleDiscordLogin}
          className="w-full py-4 rounded-sm text-sm font-medium tracking-wide mb-4 flex items-center justify-center gap-3"
          style={{ background: "#5865F2", color: "#ffffff" }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>
          </svg>
          Continuer avec Discord
        </button>

        {/* Séparateur */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
          <span className="text-xs text-[#3a2810]">ou</span>
          <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
        </div>

        {/* Invité */}
        {!showGuest ? (
          <button onClick={() => setShowGuest(true)}
            className="w-full py-4 rounded-sm text-sm font-medium tracking-wide transition-all"
            style={{ background: "rgba(255,255,255,0.04)", color: "#c8b888", border: "1px solid rgba(255,255,255,0.08)" }}>
            👤 Continuer en tant qu'invité
          </button>
        ) : (
          <form onSubmit={handleGuestLogin} className="flex flex-col gap-3">
            <div>
              <label className="block text-xs tracking-[0.2em] uppercase text-[#4a3820] mb-2">Ton pseudo</label>
              <input
                type="text" value={guestName} onChange={e => setGuestName(e.target.value)}
                placeholder="Choisis un pseudo..." maxLength={20} autoFocus
                className="w-full px-4 py-3 rounded-sm text-sm text-[#e8dcc8] placeholder-[#3a2810] outline-none"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(200,160,48,0.3)" }}
              />
              <p className="text-xs text-[#3a2810] mt-1">{guestName.length}/20 · Compte temporaire — supprimé après 30min d'inactivité</p>
            </div>

            {error && <p className="text-xs text-[#c87050] text-center">{error}</p>}

            <button type="submit" disabled={loading || !guestName.trim()}
              className="w-full py-4 rounded-sm text-sm font-medium"
              style={{ background: loading || !guestName.trim() ? "#2a1e0e" : "#c8a030", color: loading || !guestName.trim() ? "#4a3820" : "#1a1208" }}>
              {loading ? "Connexion..." : "Jouer en invité →"}
            </button>

            <button type="button" onClick={() => { setShowGuest(false); setError(""); }}
              className="text-xs text-[#4a3820] hover:text-[#c8a030] transition-colors text-center">
              Annuler
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
