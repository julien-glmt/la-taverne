"use client";
import { useState } from "react";

const games = [
  {
    id: "undercover",
    name: "Undercover",
    emoji: "🕵️",
    description: "Trouve l'imposteur avant qu'il te démasque.",
    players: "4 – 12 joueurs",
    duration: "15 – 30 min",
    available: true,
  },
  {
    id: "quiz",
    name: "Quiz",
    emoji: "🧠",
    description: "Prouve que t'es le plus calé de la table.",
    players: "2 – 20 joueurs",
    duration: "20 – 40 min",
    available: false,
  },
  {
    id: "dessin",
    name: "Dessin rapide",
    emoji: "🎨",
    description: "Dessine, devine, et moque-toi des autres.",
    players: "3 – 10 joueurs",
    duration: "20 – 30 min",
    available: false,
  },
];

export default function Home() {
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <main className="min-h-screen bg-[#1a1208] text-[#e8dcc8] font-sans">

      {/* Bruit de fond subtil */}
      <div
        className="fixed inset-0 pointer-events-none z-0 opacity-30"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.05'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Lueur centrale */}
      <div
        className="fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] pointer-events-none z-0"
        style={{ background: "radial-gradient(ellipse, rgba(200,140,40,0.08) 0%, transparent 70%)" }}
      />

      <div className="relative z-10 max-w-2xl mx-auto px-6 py-12">

        {/* Header */}
        <header className="text-center mb-16">
          <p className="text-xs tracking-[0.3em] uppercase text-[#7a6040] mb-4">
            Jeux entre potes
          </p>
          <h1 className="text-5xl font-bold tracking-tight text-[#f0e0b0] mb-4"
            style={{ fontFamily: "Georgia, serif", fontWeight: 400 }}>
            La Taverne
          </h1>
          <div className="flex items-center justify-center gap-4 mb-6">
            <div className="h-px w-16 bg-gradient-to-r from-transparent to-[#5a4020]" />
            <span className="text-[#5a4020] text-sm">⚔</span>
            <div className="h-px w-16 bg-gradient-to-l from-transparent to-[#5a4020]" />
          </div>
          <p className="text-[#7a6848] text-sm leading-relaxed max-w-sm mx-auto">
            Choisis ton jeu, invite tes potes avec un code, et que la meilleure équipe gagne.
          </p>
        </header>

        {/* Grille de jeux */}
        <section>
          <p className="text-xs tracking-[0.25em] uppercase text-[#4a3820] mb-6">
            Choisir un jeu
          </p>

          <div className="flex flex-col gap-3">
            {games.map((game) => (
              <div
                key={game.id}
                onMouseEnter={() => setHovered(game.id)}
                onMouseLeave={() => setHovered(null)}
                className="relative group"
                style={{ cursor: game.available ? "pointer" : "default" }}
              >
                <div
                  className="flex items-center gap-5 p-5 rounded-sm transition-all duration-200"
                  style={{
                    background: hovered === game.id && game.available
                      ? "rgba(200,140,40,0.08)"
                      : "rgba(255,255,255,0.02)",
                    border: hovered === game.id && game.available
                      ? "1px solid rgba(200,140,40,0.3)"
                      : "1px solid rgba(255,255,255,0.05)",
                    opacity: game.available ? 1 : 0.4,
                  }}
                >
                  {/* Emoji */}
                  <div className="text-3xl w-12 text-center flex-shrink-0">
                    {game.emoji}
                  </div>

                  {/* Infos */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <h2
                        className="text-base text-[#e8dcc8]"
                        style={{ fontFamily: "Georgia, serif" }}
                      >
                        {game.name}
                      </h2>
                      {!game.available && (
                        <span className="text-[10px] tracking-widest uppercase text-[#4a3820] border border-[#3a2810] px-2 py-0.5 rounded-sm">
                          Bientôt
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#6a5838] leading-relaxed">
                      {game.description}
                    </p>
                    <div className="flex gap-4 mt-2">
                      <span className="text-[11px] text-[#4a3820]">{game.players}</span>
                      <span className="text-[11px] text-[#3a2810]">·</span>
                      <span className="text-[11px] text-[#4a3820]">{game.duration}</span>
                    </div>
                  </div>

                  {/* Flèche */}
                  {game.available && (
                    <div
                      className="text-[#c8a030] text-lg flex-shrink-0 transition-transform duration-200"
                      style={{ transform: hovered === game.id ? "translateX(4px)" : "translateX(0)" }}
                    >
                      →
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Footer */}
        <footer className="mt-20 pt-8 border-t border-[#2a1e0e] flex justify-between items-center">
          <span className="text-xs text-[#3a2810] tracking-widest uppercase">La Taverne</span>
          <span className="text-xs text-[#3a2810]">v0.1</span>
        </footer>

      </div>
    </main>
  );
}
