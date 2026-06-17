"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

function generateCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

export default function GarticLobby() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [username, setUsername] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }
      const u = session.user;
      setUser(u);
      const { data: profile } = await supabase.from("profiles").select("username").eq("id", u.id).single();
      setUsername(profile?.username ?? u.user_metadata?.full_name ?? u.user_metadata?.name ?? "Joueur");
    }
    load();
  }, []);

  async function createRoom() {
    if (!user) return;
    setLoading(true);
    setError("");
    const code = generateCode();
    const { error: e } = await supabase.from("gartic_rooms").insert({
      id: code,
      host_id: user.id,
      host_name: username,
      status: "waiting",
      total_rounds: 3,
      round_duration: 80,
      current_round: 0,
      current_drawer_index: 0,
      round_history: [],
    });
    if (e) { setError("Erreur lors de la création."); setLoading(false); return; }
    router.push(`/gartic/${code}`);
  }

  async function joinRoom() {
    const code = joinCode.trim().toUpperCase();
    if (!code || code.length < 4) { setError("Code invalide."); return; }
    setLoading(true);
    setError("");
    const { data } = await supabase.from("gartic_rooms").select("id, status").eq("id", code).single();
    if (!data) { setError("Salle introuvable."); setLoading(false); return; }
    if (data.status !== "waiting") { setError("La partie a déjà commencé."); setLoading(false); return; }
    router.push(`/gartic/${code}`);
  }

  return (
    <main className="min-h-screen bg-[#1a1208] text-[#e8dcc8] font-sans flex items-center justify-center px-6">
      <div className="w-full max-w-sm">

        {/* Header */}
        <div className="text-center mb-10">
          <div className="text-5xl mb-4">🎨</div>
          <h1 className="text-3xl text-[#f0e0b0] mb-2" style={{ fontFamily: "Georgia, serif", fontWeight: 400 }}>
            Gartic
          </h1>
          <p className="text-xs text-[#4a3820]">Dessine, devine</p>
        </div>

        {error && (
          <p className="text-xs text-[#c87050] text-center mb-4">{error}</p>
        )}

        {/* Créer */}
        <button
          onClick={createRoom}
          disabled={loading || !user}
          className="w-full py-4 rounded-sm text-sm font-medium tracking-wide mb-3 transition-all"
          style={{
            background: "#c8a030",
            color: "#1a1208",
            opacity: loading || !user ? 0.5 : 1,
          }}>
          Créer une salle
        </button>

        {/* Rejoindre */}
        <div className="flex gap-2">
          <input
            type="text"
            value={joinCode}
            onChange={e => setJoinCode(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === "Enter" && joinRoom()}
            placeholder="Code salle..."
            maxLength={6}
            className="flex-1 px-4 py-3 rounded-sm text-sm text-[#e8dcc8] placeholder-[#3a2810] outline-none font-mono tracking-widest"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
          />
          <button
            onClick={joinRoom}
            disabled={loading || !joinCode.trim()}
            className="px-5 py-3 rounded-sm text-sm font-medium"
            style={{
              background: joinCode.trim() ? "rgba(200,160,48,0.15)" : "#2a1e0e",
              color: joinCode.trim() ? "#c8a030" : "#4a3820",
              border: "1px solid rgba(200,160,48,0.2)",
            }}>
            Rejoindre
          </button>
        </div>

        <button
          onClick={() => router.push("/")}
          className="w-full mt-8 text-xs text-[#4a3820] hover:text-[#c8a030] transition-colors tracking-widest uppercase">
          ← Retour
        </button>
      </div>
    </main>
  );
}
