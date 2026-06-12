"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Le mot de passe doit faire au moins 8 caractères.");
      return;
    }
    if (password !== confirm) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }

    setLoading(true);

    const { data, error: authError } = await supabase.auth.signUp({ email, password });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    // Créer le profil avec solde Blackjack
    if (data.user) {
      await supabase.from("profiles").insert({
        id: data.user.id,
        email: data.user.email,
        balance_blackjack: 1000,
      });
    }

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
          <h1 className="text-3xl text-[#f0e0b0] mb-2" style={{ fontFamily: "Georgia, serif", fontWeight: 400 }}>
            Inscription
          </h1>
          <p className="text-sm text-[#6a5838]">Rejoins La Taverne — 1 000 jetons offerts 🎰</p>
        </div>

        <form onSubmit={handleRegister} className="flex flex-col gap-4">
          <div>
            <label className="block text-xs tracking-[0.2em] uppercase text-[#4a3820] mb-2">Email</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="ton@email.com" required
              className="w-full px-4 py-3 rounded-sm text-sm text-[#e8dcc8] placeholder-[#3a2810] outline-none"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
              onFocus={e => e.target.style.borderColor = "rgba(200,160,48,0.4)"}
              onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.08)"}
            />
          </div>

          <div>
            <label className="block text-xs tracking-[0.2em] uppercase text-[#4a3820] mb-2">Mot de passe</label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Min. 8 caractères" required
              className="w-full px-4 py-3 rounded-sm text-sm text-[#e8dcc8] placeholder-[#3a2810] outline-none"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
              onFocus={e => e.target.style.borderColor = "rgba(200,160,48,0.4)"}
              onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.08)"}
            />
          </div>

          <div>
            <label className="block text-xs tracking-[0.2em] uppercase text-[#4a3820] mb-2">Confirmer le mot de passe</label>
            <input
              type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
              placeholder="••••••••" required
              className="w-full px-4 py-3 rounded-sm text-sm text-[#e8dcc8] placeholder-[#3a2810] outline-none"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
              onFocus={e => e.target.style.borderColor = "rgba(200,160,48,0.4)"}
              onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.08)"}
            />
          </div>

          {error && <p className="text-xs text-[#c87050] text-center">{error}</p>}

          <button type="submit" disabled={loading}
            className="w-full py-4 rounded-sm text-sm font-medium tracking-wide mt-2"
            style={{ background: loading ? "#3a2810" : "#c8a030", color: loading ? "#4a3820" : "#1a1208" }}>
            {loading ? "Inscription..." : "Créer mon compte"}
          </button>
        </form>

        <p className="text-center text-xs text-[#4a3820] mt-6">
          Déjà un compte ?{" "}
          <a href="/login" className="text-[#c8a030] hover:underline">Se connecter</a>
        </p>
      </div>
    </main>
  );
}
