"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Player = {
  id: string;
  username: string;
  balance_blackjack: number;
};

export default function LeaderboardPage() {
  const router = useRouter();
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [myId, setMyId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) setMyId(session.user.id);

      const { data } = await supabase
        .from("profiles")
        .select("id, username, balance_blackjack")
        .eq("is_guest", false)
        .not("username", "is", null)
        .order("balance_blackjack", { ascending: false })
        .limit(50);

      if (data) setPlayers(data);
      setLoading(false);
    }
    load();
  }, []);

  const medals = ["🥇", "🥈", "🥉"];

  if (loading) return (
    <div className="min-h-screen bg-[#1a1208] flex items-center justify-center">
      <p className="text-[#4a3820] text-sm tracking-widest animate-pulse">Chargement...</p>
    </div>
  );

  return (
    <main className="min-h-screen bg-[#1a1208] text-[#e8dcc8] font-sans">
      <div className="max-w-lg mx-auto px-6 py-12">

        <div className="flex items-center justify-between mb-10">
          <button onClick={() => router.back()}
            className="text-xs text-[#4a3820] hover:text-[#c8a030] tracking-widest uppercase transition-colors">
            ← Retour
          </button>
        </div>

        <div className="text-center mb-10">
          <div className="text-4xl mb-4">🏆</div>
          <h1 className="text-3xl text-[#f0e0b0] mb-2" style={{ fontFamily: "Georgia, serif", fontWeight: 400 }}>
            Classement
          </h1>
          <p className="text-sm text-[#6a5838]">Les plus grands joueurs de La Taverne</p>
        </div>

        {players.length === 0 ? (
          <p className="text-center text-sm text-[#4a3820]">Aucun joueur pour l'instant.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {players.map((player, i) => {
              const isMe = player.id === myId;
              const isTop3 = i < 3;

              return (
                <div key={player.id}
                  className="flex items-center gap-4 px-4 py-4 rounded-sm transition-all"
                  style={{
                    background: isMe ? "rgba(200,160,48,0.08)" : "rgba(255,255,255,0.02)",
                    border: `1px solid ${isMe ? "rgba(200,160,48,0.3)" : "rgba(255,255,255,0.05)"}`,
                  }}>

                  {/* Rang */}
                  <div className="w-8 text-center flex-shrink-0">
                    {isTop3 ? (
                      <span className="text-xl">{medals[i]}</span>
                    ) : (
                      <span className="text-xs font-mono text-[#4a3820]">#{i + 1}</span>
                    )}
                  </div>

                  {/* Nom */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate" style={{ color: isMe ? "#c8a030" : "#c8b888", fontWeight: isMe ? "600" : "normal" }}>
                      {player.username}
                      {isMe && <span className="text-xs text-[#4a3820] ml-2">(moi)</span>}
                    </p>
                  </div>

                  {/* Solde */}
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-mono" style={{ color: isTop3 ? "#c8a030" : "#c8b888" }}>
                      {player.balance_blackjack.toLocaleString()} 🪙
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
