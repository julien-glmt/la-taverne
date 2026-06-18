"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "../lib/supabase";

export default function Home() {
  const [hovered, setHovered] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    async function loadUser() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: profile } = await supabase.from("profiles").select("username").eq("id", session.user.id).single();
      setUsername(profile?.username ?? session.user.user_metadata?.full_name ?? null);
    }
    loadUser();
  }, []);

  return (
    <main className="min-h-screen bg-[#1a1208] text-[#e8dcc8] font-sans overflow-x-hidden">
      <style jsx global>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .fade-up { opacity: 0; animation: fadeInUp 0.7s cubic-bezier(0.16,1,0.3,1) forwards; }
      `}</style>

      <div className="fixed inset-0 pointer-events-none z-0 opacity-20"
        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.05'/%3E%3C/svg%3E")` }} />

      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] pointer-events-none z-0"
        style={{ background: "radial-gradient(ellipse, rgba(200,140,40,0.07) 0%, transparent 70%)" }} />

      <div className="relative z-10 max-w-xl mx-auto px-6 py-14">

        <header className="text-center mb-16 fade-up" style={{ animationDelay: "0.05s" }}>
          <img src="/logo.png" alt="La Taverne" className="w-30 h-30 mx-auto mb-5 drop-shadow-lg" />
          <h1 className="text-5xl text-[#f0e0b0] mb-3" style={{ fontFamily: "Georgia, serif", fontWeight: 400, letterSpacing: "-0.02em" }}>
            La Taverne
          </h1>
          {username ? (
            <p className="text-sm text-[#6a5838]">{new Date().getHours() < 18 ? "Bonjour" : "Bonsoir"}, <span className="text-[#c8a030]">{username}</span> 🍺</p>
          ) : (
            <p className="text-sm text-[#6a5838]">Bienvenue !</p>
          )}
        </header>

        <section className="mb-12">
          <p className="text-[10px] tracking-[0.3em] uppercase text-[#3a2810] mb-5">Jeux disponibles</p>

          <div className="flex flex-col gap-3">

            {/* Undercover */}
            <Link href="/undercover"
              onMouseEnter={() => setHovered("undercover")}
              onMouseLeave={() => setHovered(null)}
              className="block fade-up"
              style={{ animationDelay: "0.15s" }}>
              <div className="relative overflow-hidden rounded-sm p-5 transition-all duration-200"
                style={{
                  background: hovered === "undercover" ? "rgba(200,140,40,0.07)" : "rgba(255,255,255,0.025)",
                  border: hovered === "undercover" ? "1px solid rgba(200,140,40,0.25)" : "1px solid rgba(255,255,255,0.06)",
                }}>
                <div className="flex items-start gap-4">
                  <div className="text-4xl mt-0.5 flex-shrink-0">🕵️</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <h2 className="text-base text-[#f0e0b0]" style={{ fontFamily: "Georgia, serif" }}>Undercover</h2>
                      <span className="text-[9px] tracking-widest uppercase px-1.5 py-0.5 rounded-sm" style={{ background: "rgba(100,200,100,0.1)", color: "#6abf6a", border: "1px solid rgba(100,200,100,0.15)" }}>En ligne</span>
                    </div>
                    <p className="text-xs text-[#6a5838] leading-relaxed mb-3">
                      Trouve l'imposteur avant qu'il te démasque. Chaque joueur reçoit un mot secret — l'Undercover en a un légèrement différent.
                    </p>
                    <div className="flex gap-4">
                      <span className="text-[10px] text-[#4a3820]">👥 3 – 8 joueurs</span>
                      <span className="text-[10px] text-[#3a2810]">·</span>
                      <span className="text-[10px] text-[#4a3820]">⏱ 10 – 20 min</span>
                    </div>
                  </div>
                  <div className="text-[#c8a030] mt-1 transition-transform duration-200 flex-shrink-0"
                    style={{ transform: hovered === "undercover" ? "translateX(4px)" : "translateX(0)" }}>→</div>
                </div>
              </div>
            </Link>

            {/* Blackjack */}
            <Link href="/blackjack"
              onMouseEnter={() => setHovered("blackjack")}
              onMouseLeave={() => setHovered(null)}
              className="block fade-up"
              style={{ animationDelay: "0.25s" }}>
              <div className="relative overflow-hidden rounded-sm p-5 transition-all duration-200"
                style={{
                  background: hovered === "blackjack" ? "rgba(200,140,40,0.07)" : "rgba(255,255,255,0.025)",
                  border: hovered === "blackjack" ? "1px solid rgba(200,140,40,0.25)" : "1px solid rgba(255,255,255,0.06)",
                }}>
                <div className="flex items-start gap-4">
                  <div className="text-4xl mt-0.5 flex-shrink-0">🃏</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <h2 className="text-base text-[#f0e0b0]" style={{ fontFamily: "Georgia, serif" }}>Blackjack</h2>
                      <span className="text-[9px] tracking-widest uppercase px-1.5 py-0.5 rounded-sm" style={{ background: "rgba(100,200,100,0.1)", color: "#6abf6a", border: "1px solid rgba(100,200,100,0.15)" }}>En ligne</span>
                    </div>
                    <p className="text-xs text-[#6a5838] leading-relaxed mb-3">
                      Rejoins une table, mise tes jetons et bats le croupier sans dépasser 21. Split, double mise, assurance — toutes les règles casino.
                    </p>
                    <div className="flex gap-4">
                      <span className="text-[10px] text-[#4a3820]">👥 1 – 8 joueurs</span>
                      <span className="text-[10px] text-[#3a2810]">·</span>
                      <span className="text-[10px] text-[#4a3820]">🪙 Jetons virtuels</span>
                    </div>
                  </div>
                  <div className="text-[#c8a030] mt-1 transition-transform duration-200 flex-shrink-0"
                    style={{ transform: hovered === "blackjack" ? "translateX(4px)" : "translateX(0)" }}>→</div>
                </div>
              </div>
            </Link>

            {/* Gartic — bientôt */}
            <div className="fade-up" style={{ animationDelay: "0.35s" }}>
              <div className="rounded-sm p-5" style={{ background: "rgba(255,255,255,0.01)", border: "1px solid rgba(255,255,255,0.04)", opacity: 0.5 }}>
                <div className="flex items-start gap-4">
                  <div className="text-4xl mt-0.5 flex-shrink-0" style={{ filter: "grayscale(1)" }}>🎨</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <h2 className="text-base text-[#c8b888]" style={{ fontFamily: "Georgia, serif" }}>Gartic</h2>
                      <span className="text-[9px] tracking-widest uppercase px-1.5 py-0.5 rounded-sm" style={{ background: "rgba(255,255,255,0.04)", color: "#4a3820", border: "1px solid rgba(255,255,255,0.06)" }}>Bientôt</span>
                    </div>
                    <p className="text-xs text-[#4a3820] leading-relaxed mb-3">
                      Un joueur dessine, les autres devinent. En cours de développement...
                    </p>
                    <div className="flex gap-4">
                      <span className="text-[10px] text-[#3a2810]">👥 2 – 8 joueurs</span>
                      <span className="text-[10px] text-[#2a1808]">·</span>
                      <span className="text-[10px] text-[#3a2810]">🖊️ Dessin en temps réel</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </section>

        <footer className="pt-6 border-t border-[#221608] flex justify-between items-center fade-up" style={{ animationDelay: "0.5s" }}>
          <span className="text-[10px] text-[#2a1e0e] tracking-widest uppercase">La Taverne</span>
          <div className="flex gap-4">
            <Link href="/login" className="text-[10px] text-[#3a2810] hover:text-[#c8a030] transition-colors">Connexion</Link>
            <Link href="/account" className="text-[10px] text-[#3a2810] hover:text-[#c8a030] transition-colors">Mon compte</Link>
          </div>
        </footer>
      </div>
    </main>
  );
}
