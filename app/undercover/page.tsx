"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const AVATARS = ["🐺","🦊","🐻","🦁","🐯","🐮","🐷","🐸","🐙","🦋","🐬","🦅","🦝","🐼","🦄","🐲"];

function generateCode() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

export default function UndercoverLobby() {
  const router = useRouter();
  const [step, setStep] = useState<"avatar" | "choose" | "create" | "join">("avatar");
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState("");

  function handleAvatarNext() {
    if (!name.trim()) { setError("Entre ton prénom."); return; }
    if (!avatar) { setError("Choisis un avatar."); return; }
    setError("");
    setStep("choose");
  }

  function handleCreate() {
    const code = generateCode();
    router.push(`/undercover/${code}?name=${encodeURIComponent(name.trim())}&avatar=${encodeURIComponent(avatar)}&host=true`);
  }

  function handleJoin() {
    if (!joinCode.trim()) { setError("Entre le code de la salle."); return; }
    router.push(`/undercover/${joinCode.toUpperCase()}?name=${encodeURIComponent(name.trim())}&avatar=${encodeURIComponent(avatar)}`);
  }

  return (
    <main className="min-h-screen bg-[#1a1208] text-[#e8dcc8] font-sans flex flex-col">
      <div className="fixed inset-0 pointer-events-none z-0 opacity-30"
        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.05'/%3E%3C/svg%3E")` }} />

      <div className="relative z-10 max-w-md mx-auto w-full px-6 py-12 flex flex-col flex-1">
        <a href="/" className="text-xs text-[#4a3820] hover:text-[#c8a030] tracking-widest uppercase mb-12 inline-block transition-colors">
          ← La Taverne
        </a>

        <div className="text-center mb-10">
          <div className="text-4xl mb-4">🕵️</div>
          <h1 className="text-3xl text-[#f0e0b0] mb-2" style={{ fontFamily: "Georgia, serif", fontWeight: 400 }}>
            Undercover
          </h1>
          <p className="text-sm text-[#6a5838]">Trouve l'imposteur avant qu'il te démasque.</p>
        </div>

        {/* ÉTAPE 1 : Avatar + Prénom */}
        {step === "avatar" && (
          <div>
            <div className="mb-6">
              <label className="block text-xs tracking-[0.2em] uppercase text-[#4a3820] mb-2">Ton prénom</label>
              <input
                type="text" placeholder="Ex : Lucas" value={name} maxLength={20}
                onChange={e => { setName(e.target.value); setError(""); }}
                className="w-full px-4 py-3 rounded-sm text-sm text-[#e8dcc8] placeholder-[#3a2810] outline-none"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                onFocus={e => e.target.style.borderColor = "rgba(200,160,48,0.4)"}
                onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.08)"}
              />
            </div>

            <div className="mb-8">
              <label className="block text-xs tracking-[0.2em] uppercase text-[#4a3820] mb-3">Choisis ton avatar</label>
              <div className="grid grid-cols-8 gap-2">
                {AVATARS.map(a => (
                  <button key={a} onClick={() => { setAvatar(a); setError(""); }}
                    className="text-2xl p-2 rounded-sm transition-all"
                    style={{
                      background: avatar === a ? "rgba(200,160,48,0.15)" : "rgba(255,255,255,0.02)",
                      border: avatar === a ? "1px solid rgba(200,160,48,0.5)" : "1px solid rgba(255,255,255,0.05)",
                      transform: avatar === a ? "scale(1.15)" : "scale(1)",
                    }}>
                    {a}
                  </button>
                ))}
              </div>
            </div>

            {error && <p className="text-xs text-[#c87050] mb-4 text-center">{error}</p>}

            <button onClick={handleAvatarNext}
              className="w-full py-4 rounded-sm text-sm font-medium tracking-wide"
              style={{ background: "#c8a030", color: "#1a1208" }}>
              Continuer →
            </button>
          </div>
        )}

        {/* ÉTAPE 2 : Créer ou rejoindre */}
        {step === "choose" && (
          <div>
            <div className="flex items-center gap-3 mb-8 p-4 rounded-sm"
              style={{ background: "rgba(200,160,48,0.06)", border: "1px solid rgba(200,160,48,0.15)" }}>
              <span className="text-3xl">{avatar}</span>
              <div>
                <p className="text-sm text-[#c8b888] font-medium">{name}</p>
                <button onClick={() => setStep("avatar")} className="text-xs text-[#4a3820] hover:text-[#c8a030] transition-colors">
                  Modifier
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <button onClick={handleCreate}
                className="w-full py-4 rounded-sm text-sm font-medium tracking-wide"
                style={{ background: "#c8a030", color: "#1a1208" }}>
                Créer une salle
              </button>
              <button onClick={() => setStep("join")}
                className="w-full py-4 rounded-sm text-sm tracking-wide"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#c8b888" }}>
                Rejoindre avec un code
              </button>
            </div>
          </div>
        )}

        {/* ÉTAPE 3 : Rejoindre */}
        {step === "join" && (
          <div className="flex flex-col gap-3">
            <div>
              <label className="block text-xs tracking-[0.2em] uppercase text-[#4a3820] mb-2">Code de la salle</label>
              <input
                type="text" placeholder="Ex : AB12C" value={joinCode} maxLength={5}
                onChange={e => { setJoinCode(e.target.value.toUpperCase()); setError(""); }}
                className="w-full px-4 py-3 rounded-sm text-sm text-[#e8dcc8] placeholder-[#3a2810] outline-none tracking-widest uppercase"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                onFocus={e => e.target.style.borderColor = "rgba(200,160,48,0.4)"}
                onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.08)"}
              />
            </div>
            {error && <p className="text-xs text-[#c87050] text-center">{error}</p>}
            <button onClick={handleJoin}
              className="w-full py-4 rounded-sm text-sm font-medium tracking-wide"
              style={{ background: "#c8a030", color: "#1a1208" }}>
              Rejoindre
            </button>
            <button onClick={() => { setStep("choose"); setError(""); }}
              className="text-xs text-[#4a3820] hover:text-[#c8a030] transition-colors text-center mt-1">
              ← Retour
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
