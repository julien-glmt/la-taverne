"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";

type Card = { suit: string; value: string; numericValue: number; };
type Player = { id: string; user_id: string; name: string; hand: Card[]; score: number; bet: number; status: string; split_hand: Card[]; split_score: number; split_bet: number; is_split: boolean; current_hand: string; insurance_bet: number;};
type Room = { id: string; host_id: string; host_name: string; status: string; phase: string; dealer_hand: Card[]; dealer_score: number; current_player_index: number; max_players: number; betting_started_at: string | null; turn_started_at: string | null;};

function CardView({ card, hidden }: { card: Card; hidden?: boolean }) {
  const isRed = !hidden && (card.suit === "♥" || card.suit === "♦");
  return (
    <div style={{
      width: 34, height: 50, borderRadius: 4, flexShrink: 0,
      background: hidden ? "linear-gradient(135deg,#1e3a5f,#0d2040)" : "#fafaf5",
      border: hidden ? "1px solid rgba(100,150,255,0.25)" : "1px solid rgba(0,0,0,0.2)",
      boxShadow: "0 2px 6px rgba(0,0,0,0.6)",
      display: "flex", flexDirection: "column", alignItems: "flex-start",
      justifyContent: "flex-start", padding: "3px 4px",
    }}>
      {hidden ? (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 12, color: "rgba(100,150,255,0.2)" }}>◆</span>
        </div>
      ) : (
        <>
          <span style={{ fontSize: 10, fontWeight: "bold", color: isRed ? "#c0392b" : "#111", lineHeight: 1.1 }}>{card.value}</span>
          <span style={{ fontSize: 13, color: isRed ? "#c0392b" : "#111", lineHeight: 1.1 }}>{card.suit}</span>
        </>
      )}
    </div>
  );
}

// Positions fixes pour les joueurs selon leur nombre — en arc bas de table
// Coordonnées en % du conteneur (left, top)
const POSITIONS: Record<number, Array<{l: number, t: number}>> = {
  1: [{l:50, t:78}],
  2: [{l:32, t:80}, {l:68, t:80}],
  3: [{l:20, t:76}, {l:50, t:83}, {l:80, t:76}],
  4: [{l:15, t:72}, {l:37, t:82}, {l:63, t:82}, {l:85, t:72}],
  5: [{l:12, t:68}, {l:28, t:79}, {l:50, t:84}, {l:72, t:79}, {l:88, t:68}],
  6: [{l:10, t:64}, {l:24, t:75}, {l:40, t:83}, {l:60, t:83}, {l:76, t:75}, {l:90, t:64}],
  7: [{l:8,t:60},{l:20,t:71},{l:34,t:80},{l:50,t:84},{l:66,t:80},{l:80,t:71},{l:92,t:60}],
  8: [{l:6,t:58},{l:17,t:68},{l:30,t:77},{l:44,t:83},{l:56,t:83},{l:70,t:77},{l:83,t:68},{l:94,t:58}],
};

export default function BlackjackGame() {
  const params = useParams();
  const router = useRouter();
  const code = (params.code as string).toUpperCase();

    const [room, setRoom] = useState<Room | null>(null);
    const [players, setPlayers] = useState<Player[]>([]);
    const [myPlayer, setMyPlayer] = useState<Player | null>(null);
    const [user, setUser] = useState<any>(null);
    const [balance, setBalance] = useState(0);
    const [betInput, setBetInput] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [bettingTimer, setBettingTimer] = useState<number | null>(null);
    const bettingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const [resultsTimer, setResultsTimer] = useState<number | null>(null);
    const [animatingCards, setAnimatingCards] = useState<boolean>(false);
    const [visibleCards, setVisibleCards] = useState<Record<string, number>>({});
    const resultsTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const [turnTimer, setTurnTimer] = useState<number | null>(null);
    const turnTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchRoom = useCallback(async () => {
    const { data } = await supabase.from("blackjack_rooms").select("*").eq("id", code).single();
    if (data) setRoom(data);
  }, [code]);

  const fetchPlayers = useCallback(async () => {
    const { data } = await supabase.from("blackjack_players").select("*").eq("room_id", code).order("created_at");
    if (data) setPlayers(data);
  }, [code]);

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }
      const u = session.user;
      setUser(u);
      const { data: profile } = await supabase.from("profiles").select("balance_blackjack").eq("id", u.id).single();
      if (profile) setBalance(profile.balance_blackjack);
      const { data: roomData } = await supabase.from("blackjack_rooms").select("*").eq("id", code).single();
      if (!roomData) { router.push("/blackjack"); return; }
      const { data: existingPlayer } = await supabase.from("blackjack_players")
        .select("*").eq("room_id", code).eq("user_id", u.id).single();
      if (!existingPlayer) {
        const { data: profile } = await supabase.from("profiles").select("username").eq("id", u.id).single();
        const displayName = profile?.username ?? u.user_metadata?.full_name ?? u.user_metadata?.name ?? u.email ?? "Joueur";
        const { data: newPlayer } = await supabase.from("blackjack_players")
          .insert({ room_id: code, user_id: u.id, name: displayName, status: "waiting" })
          .select().single();
        if (newPlayer) setMyPlayer(newPlayer);
      } else {
        setMyPlayer(existingPlayer);
      }
      await fetchRoom();
      await fetchPlayers();
      setLoading(false);
    }
    init();
  }, [code, router, fetchRoom, fetchPlayers]);

  useEffect(() => {
    const ch = supabase.channel(`bj-${code}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "blackjack_rooms", filter: `id=eq.${code}` }, fetchRoom)
      .on("postgres_changes", { event: "*", schema: "public", table: "blackjack_players", filter: `room_id=eq.${code}` }, fetchPlayers)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [code, fetchRoom, fetchPlayers]);

  useEffect(() => {
    if (myPlayer && players.length > 0) {
      const u = players.find(p => p.id === myPlayer.id);
      if (u) setMyPlayer(u);
    }
  }, [players]);

    useEffect(() => {
        if (bettingTimerRef.current) clearInterval(bettingTimerRef.current);
        if (!room?.betting_started_at || room?.status !== "waiting") return;

        const allBet = players.every(p => p.status === "bet_placed");
        const maxTime = allBet ? 5 : 15;

        const update = () => {
            const serverTime = new Date(room.betting_started_at! + 'Z').getTime();
            const elapsed = (Date.now() - serverTime) / 1000;
            const remaining = Math.max(0, maxTime - elapsed);
            setBettingTimer(Math.ceil(remaining));
            console.log("elapsed:", elapsed, "remaining:", remaining, "betting_started_at:", room.betting_started_at);

            if (remaining <= 0 && user?.id === room?.host_id) {
                clearInterval(bettingTimerRef.current!);
                startGame();
            }
        };

            update();
            bettingTimerRef.current = setInterval(update, 500);
            return () => { if (bettingTimerRef.current) clearInterval(bettingTimerRef.current); };
            }, [room?.betting_started_at, players, user?.id, room?.host_id]);
    
    useEffect(() => {
        if (!isHost) return;
        
        const interval = setInterval(async () => {
            await supabase.from("blackjack_rooms")
            .update({ host_last_seen: new Date().toISOString() })
            .eq("id", code);
        }, 10000);

        return () => clearInterval(interval);
        }, [user?.id, room?.host_id, code]);

    useEffect(() => {
        if (resultsTimerRef.current) clearInterval(resultsTimerRef.current);
        if (room?.status !== "results") return;

        setResultsTimer(7);
        resultsTimerRef.current = setInterval(() => {
            setResultsTimer(prev => {
            if (prev === null) return null;
            if (prev <= 1) {
                clearInterval(resultsTimerRef.current!);
                if (user?.id === room?.host_id) {
                supabase.functions.invoke("reset-round", { body: { roomId: code } });
                }
                return 0;
            }
            return prev - 1;
            });
        }, 1000);

        return () => { if (resultsTimerRef.current) clearInterval(resultsTimerRef.current); };
        }, [room?.status]);
    
    useEffect(() => {
        if (room?.status !== "results" || !user) return;
        supabase.from("profiles")
            .select("balance_blackjack")
            .eq("id", user.id)
            .single()
            .then(({ data }) => {
            if (data) setBalance(data.balance_blackjack);
            });
        }, [room?.status, user?.id]);
    
    useEffect(() => {
    if (room?.phase !== "playing" || !isPlaying) return;
    
    // Première distribution uniquement
    const totalCards = players.reduce((sum, p) => sum + (p.hand?.length ?? 0), 0) + (room?.dealer_hand?.length ?? 0);
    if (totalCards > players.length * 2 + 2) return; // déjà plus de 2 cartes par joueur = pas une distribution initiale

    setAnimatingCards(true);
    const initialVisible: Record<string, number> = {};
    players.forEach(p => { initialVisible[p.id] = 0; });
    initialVisible["dealer"] = 0;
    setVisibleCards(initialVisible);

    const sequence: Array<{id: string, count: number}> = [];
    players.forEach(p => sequence.push({ id: p.id, count: 1 }));
    sequence.push({ id: "dealer", count: 1 });
    players.forEach(p => sequence.push({ id: p.id, count: 2 }));
    sequence.push({ id: "dealer", count: 2 });

    sequence.forEach((step, i) => {
        setTimeout(() => {
        setVisibleCards(prev => ({ ...prev, [step.id]: step.count }));
        if (i === sequence.length - 1) setAnimatingCards(false);
        }, i * 300);
    });
    }, [room?.phase, players.map(p => p.hand?.length).join(",")]);

    useEffect(() => {
        if (turnTimerRef.current) clearInterval(turnTimerRef.current);
        if (!room?.turn_started_at || room?.status !== "playing" || room?.phase !== "playing") return;

        const update = () => {
            const serverTime = new Date(room.turn_started_at! + 'Z').getTime();
            const elapsed = (Date.now() - serverTime) / 1000;
            const remaining = Math.max(0, 30 - elapsed);
            setTurnTimer(Math.ceil(remaining));
            const current = players[room?.current_player_index ?? 0];
            
            if (remaining <= 0 && current?.id === myPlayer?.id) {
                clearInterval(turnTimerRef.current!);
                playerAction("stand");
            }
        };

        update();
        turnTimerRef.current = setInterval(update, 500);
        return () => { if (turnTimerRef.current) clearInterval(turnTimerRef.current); };
    }, [room?.turn_started_at, room?.current_player_index, players]);

    useEffect(() => {
        if (players.length === 0 && room && user?.id === room.host_id) {
            supabase.from("blackjack_rooms").delete().eq("id", code);
        }
    }, [players.length]);
    
    async function placeBet() {
    const amount = parseInt(betInput);
    if (!amount || amount < 1 || amount > balance) { setError("Mise invalide."); return; }
    
    await supabase.from("blackjack_players").update({ bet: amount, status: "bet_placed" }).eq("id", myPlayer?.id);
    
    // Démarrer le timer si pas encore commencé
    if (!room?.betting_started_at) {
        await supabase.from("blackjack_rooms").update({ betting_started_at: new Date().toISOString() }).eq("id", code);
    }
    
    setBetInput(""); setError("");
    }

    async function startGame() {
    const nonBettors = players.filter(p => p.status === "waiting");
    for (const p of nonBettors) {
        await supabase.from("blackjack_players").update({ status: "spectator" }).eq("id", p.id);
    }
    const { error: e } = await supabase.functions.invoke("deal-cards", { body: { roomId: code } });
    if (e) setError("Erreur : " + e.message);
    }

  async function playerAction(action: string) {
    const { error: e } = await supabase.functions.invoke("player-action", {
      body: { roomId: code, playerId: myPlayer?.id, action }
    });
    if (e) setError("Erreur : " + e.message);
  }

    const isHost = user?.id === room?.host_id;
    const isWaiting = room?.status === "waiting";
    const isPlaying = room?.status === "playing";
    const isPlayingPhase = room?.phase === "playing";
    const currentPlayer = players[room?.current_player_index ?? 0];
    const isMyTurn = currentPlayer?.id === myPlayer?.id;
    const allBetsPlaced = players.length > 0 && players.every(p => ["bet_placed","playing","done"].includes(p.status));
    const maxP = Math.min(Math.max(room?.max_players ?? 5, players.length, 1), 8);
    const slots = Array.from({ length: maxP }, (_, i) => players[i] ?? null);
    const positions = POSITIONS[maxP] ?? POSITIONS[5];

  if (loading) return (
    <div className="min-h-screen bg-[#1a1208] flex items-center justify-center">
      <p className="text-[#4a3820] text-sm tracking-widest animate-pulse">Chargement...</p>
    </div>
  );

  return (
    <main className="min-h-screen bg-[#1a1208] text-[#e8dcc8] font-sans">
        <style>{`
        @keyframes dealCard {
            0% { transform: translateY(-60px) scale(0.6); opacity: 0; }
            100% { transform: translateY(0) scale(1); opacity: 1; }
        }
        `}</style>
      <div className="max-w-lg mx-auto px-4 py-6">

        {/* Header */}
        <div className="flex justify-between items-center mb-4">
        <button onClick={async () => {
        // Compter les joueurs AVANT de se supprimer
        const { count } = await supabase
            .from("blackjack_players")
            .select("*", { count: "exact", head: true })
            .eq("room_id", code);
        
        if (myPlayer) {
            await supabase.from("blackjack_players").delete().eq("id", myPlayer.id);
        }
        
        // Si j'étais le dernier, supprimer la salle
        if (count !== null && count <= 1) {
            await supabase.from("blackjack_rooms").delete().eq("id", code);
        }
        
        router.push("/blackjack");
        }}
        className="text-xs text-[#4a3820] hover:text-[#c8a030] tracking-widest uppercase transition-colors">
        ← Quitter
        </button>
          <p className="text-sm font-mono text-[#c8a030] tracking-[0.3em]">{code}</p>
          <div className="text-right">
            <p className="text-xs text-[#4a3820]">Solde</p>
            <p className="text-sm font-mono text-[#c8a030]">{balance} 🪙</p>
          </div>
        </div>

        {/* TABLE */}
        <div className="relative w-full mb-5 rounded-2xl overflow-hidden"
          style={{
            paddingBottom: "80%",
            background: "radial-gradient(ellipse at 50% 20%, #226b35 0%, #165220 50%, #0c3a16 100%)",
            border: "3px solid #6b4a10",
            boxShadow: "0 0 0 1px rgba(200,160,48,0.3), inset 0 0 80px rgba(0,0,0,0.4), 0 8px 40px rgba(0,0,0,0.8)",
          }}>
          <div className="absolute inset-0">

            {/* Lisière intérieure */}
            <div className="absolute inset-2 rounded-xl pointer-events-none"
              style={{ border: "1px solid rgba(200,160,48,0.15)" }} />

            {/* Ligne séparation croupier */}
            <div className="absolute left-[15%] right-[15%] h-px" style={{ top: "30%", background: "rgba(200,160,48,0.2)" }} />

            {/* Texte BLACKJACK */}
            <div className="absolute inset-x-0 flex flex-col items-center pointer-events-none select-none" style={{ top: "40%" }}>
              <p style={{ fontSize: 13, letterSpacing: "0.5em", color: "rgba(200,160,48,0.15)", fontWeight: "bold" }}>BLACKJACK</p>
              <p style={{ fontSize: 8, letterSpacing: "0.3em", color: "rgba(200,160,48,0.08)", marginTop: 3 }}>PAYS 3 POUR 2</p>
            </div>

            {/* CROUPIER */}
            <div className="absolute left-1/2 -translate-x-1/2" style={{ top: "3%" }}>
              <p style={{ fontSize: 9, letterSpacing: "0.3em", textAlign: "center", color: "rgba(200,160,48,0.45)", marginBottom: 6 }}>CROUPIER</p>
              <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 6 }}>
                {room?.dealer_hand?.length ? room.dealer_hand.slice(0, visibleCards["dealer"] ?? room.dealer_hand.length).map((card, i) => (
                <div key={i} style={{ animation: "dealCard 0.3s ease-out" }}>
                    <CardView card={card} hidden={i === 1 && isPlayingPhase} />
                </div>
                )) : [0,1].map(i => (
                  <div key={i} style={{ width: 34, height: 50, borderRadius: 4, border: "1px dashed rgba(200,160,48,0.2)" }} />
                ))}
              </div>
              {room?.dealer_score && !isPlayingPhase && (
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <span style={{ fontSize: 10, fontWeight: "bold", padding: "2px 8px", borderRadius: 10,
                    background: room.dealer_score > 21 ? "rgba(180,50,30,0.85)" : "rgba(0,0,0,0.6)",
                    color: room.dealer_score > 21 ? "#fff" : "#c8a030",
                    border: `1px solid ${room.dealer_score > 21 ? "#c87050" : "rgba(255,255,255,0.15)"}` }}>
                    {room.dealer_score > 21 ? "Bust" : room.dealer_score}
                  </span>
                </div>
              )}
            </div>

            {/* JOUEURS */}
            {slots.map((player, i) => {
              const pos = positions[i];
              const isActive = isPlaying && room?.current_player_index === i;
              const isMe = player?.id === myPlayer?.id;

              return (
                <div key={i} style={{
                  position: "absolute",
                  left: `${pos.l}%`, top: `${pos.t}%`,
                  transform: "translate(-50%, -50%)",
                  display: "flex", flexDirection: "column", alignItems: "center",
                }}>
                  {/* Halo actif */}
                  {isActive && (
                    <div style={{
                      position: "absolute", inset: -8, borderRadius: "50%",
                      background: "rgba(200,160,48,0.1)",
                      border: "1px solid rgba(200,160,48,0.4)",
                      animation: "pulse 1.5s infinite",
                    }} />
                  )}

                  {/* Score */}
                  {player?.score ? (
                    <span style={{ fontSize: 9, fontWeight: "bold", padding: "1px 6px", borderRadius: 8, marginBottom: 3,
                      background: player.score > 21 ? "rgba(180,50,30,0.85)" : player.score === 21 ? "rgba(180,130,20,0.85)" : "rgba(0,0,0,0.7)",
                      color: player.score > 21 ? "#fff" : player.score === 21 ? "#fff" : "#c8a030",
                      border: `1px solid ${player.score > 21 ? "#c87050" : player.score === 21 ? "#c8a030" : "rgba(255,255,255,0.15)"}` }}>
                      {(() => {
                        const hard = player.score;
                        // Calculer la valeur "soft" si un As est présent
                        const hasAce = player.hand?.some(c => c.value === "A");
                        const hardScore = player.hand?.reduce((s, c) => s + (c.value === "A" ? 1 : c.numericValue), 0) ?? 0;
                        const softScore = hasAce && hardScore + 10 <= 21 ? hardScore + 10 : null;
                        
                        if (hard > 21) return `Bust (${hard})`;
                        if (hard === 21) return "21!";
                        if (softScore && softScore !== hard) return `${hardScore}/${softScore}`;
                        return hard;
                        })()}
                    </span>
                  ) : <div style={{ height: 18 }} />}

                  {/* Cartes */}
                  <div style={{ display: "flex", gap: 3, marginBottom: 4 }}>
                    {player?.hand?.length ? player.hand.slice(0, animatingCards ? (visibleCards[player.id] ?? 0) : player.hand.length).map((card, ci) => (                    <div key={ci} style={{ animation: "dealCard 0.3s ease-out" }}>
                        <CardView card={card} />
                    </div>
                    )) : (
                      <div style={{ width: 34, height: 50, borderRadius: 4,
                        border: `1px dashed ${isMe ? "rgba(200,160,48,0.35)" : "rgba(255,255,255,0.1)"}` }} />
                    )}
                  </div>
                  {player?.is_split && player.split_hand?.length > 0 && (
                    <div style={{ display: "flex", gap: 3, marginTop: 4, opacity: player.current_hand === "split" ? 1 : 0.6 }}>
                        {player.split_hand.map((card, ci) => (
                        <CardView key={ci} card={card} />
                        ))}
                    </div>
                    )}

                    {player?.is_split && player.split_score ? (
                    <span style={{ fontSize: 9, fontWeight: "bold", padding: "1px 6px", borderRadius: 8, marginTop: 2,
                        background: player.split_score > 21 ? "rgba(180,50,30,0.85)" : player.split_score === 21 ? "rgba(180,130,20,0.85)" : "rgba(0,0,0,0.7)",
                        color: player.split_score > 21 ? "#fff" : player.split_score === 21 ? "#fff" : "#c8a030",
                        border: `1px solid ${player.split_score > 21 ? "#c87050" : player.split_score === 21 ? "#c8a030" : "rgba(255,255,255,0.15)"}` }}>
                        {player.split_score > 21 ? `Bust (${player.split_score})` : player.split_score === 21 ? "21!" : player.split_score}
                    </span>
                    ) : null}

                  {/* Jeton */}
                  <div style={{
                    width: 24, height: 24, borderRadius: "50%", marginBottom: 3,
                    background: player?.bet ? "#c8a030" : "rgba(255,255,255,0.06)",
                    border: `1.5px solid ${player?.bet ? "#8a6820" : "rgba(255,255,255,0.1)"}`,
                    boxShadow: player?.bet ? "0 2px 6px rgba(200,160,48,0.4)" : "none",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {player?.bet ? <span style={{ fontSize: 7, fontWeight: "bold", color: "#1a1208" }}>
                      {player.bet > 99 ? `${player.bet}` : player.bet}
                    </span> : null}
                  </div>

                  {/* Nom */}
                  <span style={{ fontSize: 9, maxWidth: 60, textAlign: "center",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    color: isMe ? "#c8a030" : player ? "#c8b888" : "#3a4a35",
                    fontWeight: isMe ? "bold" : "normal" }}>
                    {player ? player.name.split(" ")[0].substring(0, 9) : "·"}
                  </span>

                  {isActive && (
                    <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#c8a030", marginTop: 3,
                      animation: "pulse 0.8s infinite" }} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {error && <p className="text-xs text-[#c87050] text-center mb-4">{error}</p>}

        {/* CONTRÔLES */}
        {isWaiting && (
            
        <div>
            {Number(balance) === 0 && (
            <div className="mb-6 p-4 rounded-sm text-center"
                style={{ background: "rgba(200,160,48,0.06)", border: "1px solid rgba(200,160,48,0.15)" }}>
                <p className="text-sm text-[#c8b888] mb-3">Tu n'as plus de jetons 😢</p>
                <button onClick={async () => {
                const { data: { session } } = await supabase.auth.getSession();
                if (!session) return;
                await supabase.from("profiles").update({ balance_blackjack: 100 }).eq("id", session.user.id);
                setBalance(100);
                }}
                className="px-6 py-3 rounded-sm text-sm font-medium"
                style={{ background: "#c8a030", color: "#1a1208" }}>
                Récupérer 100 🪙
                </button>
            </div>
            )}
            {myPlayer?.status !== "bet_placed" ? (
              <div className="mb-4">
                <p className="text-xs tracking-[0.2em] uppercase text-[#4a3820] mb-3">Ta mise</p>
                <div className="flex gap-2 mb-3 flex-wrap">
                  {[100,250,500,1000,2500,5000,10000].map(a => (
                    <button key={a} onClick={() => setBetInput(String(a))}
                      className="px-3 py-2 rounded-sm text-xs font-mono transition-all"
                      style={{ background: betInput === String(a) ? "#c8a030" : "rgba(255,255,255,0.04)", color: betInput === String(a) ? "#1a1208" : "#c8b888", border: "1px solid rgba(255,255,255,0.08)" }}>
                      {a}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input type="number" value={betInput} onChange={e => setBetInput(e.target.value)}
                    placeholder="Mise libre..." min={1} max={balance}
                    className="flex-1 px-4 py-3 rounded-sm text-sm text-[#e8dcc8] placeholder-[#3a2810] outline-none"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }} />
                  <button onClick={placeBet} disabled={!betInput}
                    className="px-5 py-3 rounded-sm text-sm font-medium"
                    style={{ background: betInput ? "#c8a030" : "#2a1e0e", color: betInput ? "#1a1208" : "#4a3820" }}>
                    Miser
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-center text-xs text-[#6abf6a] mb-4">✓ Mise de {myPlayer.bet} 🪙 placée</p>
            )}
            {room?.betting_started_at && bettingTimer !== null && (
            <div className="text-center mb-3">
                <p className="text-xs text-[#4a3820]">Distribution dans</p>
                <p className={`text-2xl font-mono font-bold ${bettingTimer <= 5 ? "text-[#c87050]" : "text-[#c8a030]"}`}>
                {bettingTimer}s
                </p>
            </div>
            )}
            {!isHost && (
            <p className="text-center text-xs text-[#4a3820] animate-pulse">En attente de la distribution...</p>
            )}
          </div>
        )}
        {myPlayer?.hand?.length === 2 && 
            myPlayer.hand[0].value === myPlayer.hand[1].value && 
            !myPlayer.is_split && 
            balance >= (myPlayer?.bet ?? 0) && (
            <button onClick={() => playerAction("split")}
                className="flex-1 py-4 rounded-sm text-sm font-medium"
                style={{ background: "rgba(100,100,200,0.15)", color: "#a0a0ff", border: "1px solid rgba(100,100,200,0.3)" }}>
                Split ✂️
            </button>
            )}
        {room?.dealer_hand?.[0]?.value === "A" && 
            !myPlayer?.insurance_bet &&
            myPlayer?.hand?.length === 2 && (
            <button onClick={() => playerAction("insurance")}
                className="w-full py-3 rounded-sm text-xs font-medium mb-2"
                style={{ background: "rgba(200,100,40,0.15)", color: "#e8a060", border: "1px solid rgba(200,100,40,0.3)" }}>
                Assurance ({Math.floor((myPlayer?.bet ?? 0) / 2)} 🪙)
            </button>
            )}
        {isPlaying && isPlayingPhase && isMyTurn && turnTimer !== null && (
        <div className="text-center mb-3">
            <p className="text-xs text-[#4a3820]">Temps restant</p>
            <p className={`text-2xl font-mono font-bold ${turnTimer <= 5 ? "text-[#c87050]" : "text-[#c8a030]"}`}>
            {turnTimer}s
            </p>
        </div>
        )}
        {isPlaying && isPlayingPhase && isMyTurn && myPlayer?.status === "playing" && (
          <div className="flex gap-3">
            <button onClick={() => playerAction("hit")} className="flex-1 py-4 rounded-sm text-sm font-medium"
              style={{ background: "#c8a030", color: "#1a1208" }}>Tirer 🃏</button>
            <button onClick={() => playerAction("double")} disabled={balance - (myPlayer?.bet ?? 0) < (myPlayer?.bet ?? 0)}
              className="flex-1 py-4 rounded-sm text-sm font-medium"
              style={{ background: "rgba(100,160,100,0.15)", color: "#6abf6a", border: "1px solid rgba(100,160,100,0.3)" }}>×2</button>
            <button onClick={() => playerAction("stand")} className="flex-1 py-4 rounded-sm text-sm font-medium"
              style={{ background: "rgba(255,255,255,0.06)", color: "#c8b888", border: "1px solid rgba(255,255,255,0.1)" }}>Rester ✋</button>
          </div>
        )}
        {room?.status === "results" && (
        <div className="text-center py-4">
            <p className="text-xs tracking-[0.2em] uppercase text-[#4a3820] mb-4">Résultats</p>
            <div className="flex flex-col gap-2 mb-4">
            {players.map(p => (
                <div key={p.id} className="flex items-center justify-between px-4 py-3 rounded-sm"
                style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                <span className="text-sm text-[#c8b888]">{p.name}</span>
                <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-[#4a3820]">{p.score}</span>
                    <span className="text-sm font-medium" style={{
                    color: p.status === "win" ? "#6abf6a" : p.status === "push" ? "#c8a030" : "#c87050"
                    }}>
                    {p.status === "blackjack" ? `+${Math.floor(p.bet * 1.5)} 🪙 Blackjack! 🎉` : p.status === "win" ? `+${p.bet} 🪙` : p.status === "push" ? "Égalité" : `-${p.bet} 🪙`}
                    </span>
                </div>
                </div>
            ))}
            </div>
            <p className="text-xs text-[#4a3820]">Nouvelle mise dans <span className="text-[#c8a030] font-mono">{resultsTimer}s</span></p>
        </div>
        )}
        {isPlaying && isPlayingPhase && !isMyTurn && (
          <p className="text-center text-xs text-[#4a3820] animate-pulse mt-2">Tour de {currentPlayer?.name}...</p>
        )}
      </div>
    </main>
  );
}
