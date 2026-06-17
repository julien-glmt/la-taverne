"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Room = {
  id: string;
  host_name: string;
  status: string;
  mise_min: number;
  mise_max: number;
  max_players: number;
  player_count?: number;
};

type User = {
  id: string;
  email: string;
  displayName: string;
};

function generateCode() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

export default function BlackjackLobby() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [balance, setBalance] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [miseMin, setMiseMin] = useState(5);
  const [miseMax, setMiseMax] = useState(500);
  const [maxPlayers, setMaxPlayers] = useState(6);
  const [error, setError] = useState("");

  const fetchRooms = useCallback(async () => {
    const { data } = await supabase
      .from("blackjack_rooms")
      .select("*")
      .order("created_at", { ascending: false });

    if (data) {
      // Compter les joueurs par salle
      const roomsWithCount = await Promise.all(data.map(async (room) => {
        const { count } = await supabase
          .from("blackjack_players")
          .select("*", { count: "exact", head: true })
          .eq("room_id", room.id);
        return { ...room, player_count: count ?? 0 };
      }));
      setRooms(roomsWithCount);
    }
  }, []);

    useEffect(() => {
        async function init() {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.push("/login"); return; }
        const u = session.user;

        const { data: profile } = await supabase
            .from("profiles")
            .select("username, balance_blackjack")
            .eq("id", u.id)
            .single();

        const displayName = profile?.username ?? u.user_metadata?.full_name ?? u.user_metadata?.name ?? u.email ?? "Joueur";

        setUser({ id: u.id, email: u.email ?? "", displayName });
        if (profile) setBalance(profile.balance_blackjack);

        await fetchRooms();
        setLoading(false);
        }
    init();
  }, [router, fetchRooms]);

  // Realtime
  useEffect(() => {
    const channel = supabase.channel("blackjack-lobby")
      .on("postgres_changes", { event: "*", schema: "public", table: "blackjack_rooms" }, fetchRooms)
      .on("postgres_changes", { event: "*", schema: "public", table: "blackjack_players" }, fetchRooms)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchRooms]);

    async function createRoom() {
    if (!user) return;
    const code = generateCode();
    console.log("Création table:", code, "user:", user);

    const { error, data } = await supabase.from("blackjack_rooms").insert({
        id: code,
        host_id: user.id,
        host_name: user.displayName,
        status: "waiting",
        max_players: maxPlayers,
    }).select().single();

    console.log("Résultat:", data, error);

    if (error) {
        setError("Erreur : " + error.message);
        return;
    }

    router.push(`/blackjack/${code}`);
    }

  async function joinRoom(roomId: string) {
    router.push(`/blackjack/${roomId}`);
  }

  if (loading) return (
    <div className="min-h-screen bg-[#1a1208] flex items-center justify-center">
      <p className="text-[#4a3820] text-sm tracking-widest animate-pulse">Chargement...</p>
    </div>
  );

  return (
    <main className="min-h-screen bg-[#1a1208] text-[#e8dcc8] font-sans">
      <div className="fixed inset-0 pointer-events-none z-0 opacity-30"
        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.05'/%3E%3C/svg%3E")` }} />

      <div className="relative z-10 max-w-lg mx-auto px-6 py-12">

        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <a href="/" className="text-xs text-[#4a3820] hover:text-[#c8a030] tracking-widest uppercase transition-colors">← La Taverne</a>
          <div className="text-right">
            <p className="text-xs text-[#4a3820]">{user?.displayName}</p>
            <p className="text-sm font-mono text-[#c8a030]">{balance.toLocaleString()} 🪙</p>
          </div>
        </div>

        {/* Titre */}
        <div className="text-center mb-10">
          <div className="text-4xl mb-4">🃏</div>
          <h1 className="text-3xl text-[#f0e0b0] mb-2" style={{ fontFamily: "Georgia, serif", fontWeight: 400 }}>
            Blackjack
          </h1>
          <p className="text-sm text-[#6a5838]">Rejoins une table ou crée la tienne.</p>
        </div>

        {/* Bouton créer */}
        <button onClick={() => setShowCreate(!showCreate)}
          className="w-full py-4 rounded-sm text-sm font-medium tracking-wide mb-6 transition-all"
          style={{ background: showCreate ? "rgba(200,160,48,0.1)" : "#c8a030", color: showCreate ? "#c8a030" : "#1a1208", border: showCreate ? "1px solid rgba(200,160,48,0.3)" : "none" }}>
          {showCreate ? "Annuler" : "+ Créer une table"}
        </button>

        {/* Formulaire création */}
        {showCreate && (
        <div className="mb-8 p-5 rounded-sm" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <p className="text-xs tracking-[0.2em] uppercase text-[#4a3820] mb-4">Paramètres de la table</p>

            <div className="flex items-center justify-between mb-5">
            <div>
                <p className="text-sm text-[#c8b888]">Joueurs max</p>
                <p className="text-xs text-[#4a3820]">1 à 8</p>
            </div>
            <div className="flex items-center gap-2">
                <button onClick={() => setMaxPlayers(Math.max(1, maxPlayers - 1))} className="w-7 h-7 rounded-sm text-sm" style={{ background: "rgba(255,255,255,0.06)", color: "#c8b888" }}>−</button>
                <span className="text-sm text-[#c8a030] w-6 text-center font-mono">{maxPlayers}</span>
                <button onClick={() => setMaxPlayers(Math.min(8, maxPlayers + 1))} className="w-7 h-7 rounded-sm text-sm" style={{ background: "rgba(255,255,255,0.06)", color: "#c8b888" }}>+</button>
            </div>
            </div>

            <button onClick={createRoom}
            className="w-full py-3 rounded-sm text-sm font-medium"
            style={{ background: "#c8a030", color: "#1a1208" }}>
            Créer la table
            </button>
        </div>
        )}

        {/* Liste des tables */}
        <div>
          <p className="text-xs tracking-[0.2em] uppercase text-[#4a3820] mb-4">
            Tables ouvertes ({rooms.length})
          </p>

          {rooms.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-[#4a3820]">Aucune table disponible.</p>
              <p className="text-xs text-[#3a2810] mt-2">Sois le premier à en créer une !</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {rooms.map(room => (
                <div key={room.id}
                  className="flex items-center gap-4 px-4 py-4 rounded-sm transition-all"
                  style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm text-[#c8b888] font-medium truncate">{room.host_name}</p>
                      <span className="text-xs px-2 py-0.5 rounded-sm flex-shrink-0"
                        style={{ background: room.status === "waiting" ? "rgba(100,200,100,0.1)" : "rgba(200,160,48,0.1)", color: room.status === "waiting" ? "#6abf6a" : "#c8a030" }}>
                        {room.status === "waiting" ? "En attente" : "En cours"}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => joinRoom(room.id)}
                    disabled={room.status !== "waiting" || (room.player_count ?? 0) >= room.max_players}
                    className="px-4 py-2 rounded-sm text-xs font-medium flex-shrink-0"
                    style={{
                      background: room.status === "waiting" && (room.player_count ?? 0) < room.max_players ? "#c8a030" : "#2a1e0e",
                      color: room.status === "waiting" && (room.player_count ?? 0) < room.max_players ? "#1a1208" : "#4a3820",
                    }}>
                    {room.status !== "waiting" ? "En cours" : (room.player_count ?? 0) >= room.max_players ? "Pleine" : "Rejoindre"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {/* Bouton leaderboard */}
        <button onClick={() => router.push("/blackjack/leaderboard")}
        className="fixed bottom-6 right-6 w-12 h-12 rounded-full flex items-center justify-center text-xl"
        style={{ background: "rgba(200,160,48,0.15)", border: "1px solid rgba(200,160,48,0.3)", boxShadow: "0 4px 16px rgba(0,0,0,0.4)" }}>
        🏆
        </button>
    </main>
  );
}
