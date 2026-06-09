"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";

type Player = {
  id: string;
  name: string;
  avatar: string;
  role: string | null;
  word: string | null;
  is_alive: boolean;
  is_ready: boolean;
  words_said: string[];
  word_count: number;
  voted_for: string | null;
  vote_locked: boolean;
};

type Room = {
  id: string;
  host: string;
  status: string;
  phase: string;
  word_civilian: string | null;
  word_undercover: string | null;
  max_undercovers: number;
  mr_white_enabled: boolean;
  total_rounds: number;
  words_per_round: number;
  timer_seconds: number;
  current_round: number;
  current_player_index: number;
  turn_started_at: string | null;
};

function SettingRow({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
      <div>
        <p className="text-sm text-[#c8b888]">{label}</p>
        {desc && <p className="text-xs text-[#4a3820] mt-0.5">{desc}</p>}
      </div>
      {children}
    </div>
  );
}

function NumericInput({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <button onClick={() => onChange(Math.max(min, value - 1))} className="w-7 h-7 rounded-sm text-sm flex items-center justify-center" style={{ background: "rgba(255,255,255,0.06)", color: "#c8b888" }}>−</button>
      <span className="text-sm text-[#c8a030] w-6 text-center font-mono">{value}</span>
      <button onClick={() => onChange(Math.min(max, value + 1))} className="w-7 h-7 rounded-sm text-sm flex items-center justify-center" style={{ background: "rgba(255,255,255,0.06)", color: "#c8b888" }}>+</button>
    </div>
  );
}

export default function GameRoom() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const code = (params.code as string).toUpperCase();
  const playerName = searchParams.get("name") || "Anonyme";
  const playerAvatar = searchParams.get("avatar") || "🐺";
  const isHost = searchParams.get("host") === "true";

  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [myPlayer, setMyPlayer] = useState<Player | null>(null);
  const [wordRevealed, setWordRevealed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [votedFor, setVotedFor] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [eliminated, setEliminated] = useState<Player | null>(null);
  const [wordInput, setWordInput] = useState("");
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [floatingEmojis, setFloatingEmojis] = useState<{ id: number; emoji: string; x: number }[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoSubmitRef = useRef(false);
  const emojiCounter = useRef(0);

  const [settings, setSettings] = useState({
    max_undercovers: 1, mr_white_enabled: false,
    total_rounds: 3, words_per_round: 2, timer_seconds: 30,
  });

  const fetchPlayers = useCallback(async () => {
    const { data } = await supabase.from("players").select("*").eq("room_id", code).order("created_at");
    if (data) setPlayers(data);
  }, [code]);

  const fetchRoom = useCallback(async () => {
    const { data } = await supabase.from("rooms").select("*").eq("id", code).single();
    if (data) {
      console.log("ROOM DATA:", data.status, data.phase);
      setRoom(data);
      setSettings({
        max_undercovers: data.max_undercovers ?? 1,
        mr_white_enabled: data.mr_white_enabled ?? false,
        total_rounds: data.total_rounds ?? 3,
        words_per_round: data.words_per_round ?? 2,
        timer_seconds: data.timer_seconds ?? 30,
      });
    }
    return data;
  }, [code]);

  useEffect(() => {
    async function init() {
      setLoading(true);
      if (isHost) {
        await supabase.from("players").delete().eq("room_id", code);
        await supabase.from("rooms").delete().eq("id", code);
        await supabase.from("rooms").insert({
          id: code, host: playerName, status: "waiting", phase: "waiting",
          max_undercovers: 1, mr_white_enabled: false,
          total_rounds: 3, words_per_round: 2, timer_seconds: 30,
        });
      } else {
        let roomData = null;
        for (let i = 0; i < 5; i++) {
          const { data } = await supabase.from("rooms").select("*").eq("id", code).single();
          if (data) { roomData = data; break; }
          await new Promise(r => setTimeout(r, 1000));
        }
        if (!roomData) { setError("Salle introuvable. Vérifie le code."); setLoading(false); return; }
      }

      const { data: newPlayer } = await supabase.from("players")
        .insert({ room_id: code, name: playerName, avatar: playerAvatar, is_ready: isHost })
        .select().single();
      if (newPlayer) setMyPlayer(newPlayer);

      await fetchRoom();
      await fetchPlayers();
      setLoading(false);
    }
    init();
  }, [code, isHost, playerName, playerAvatar, fetchRoom, fetchPlayers]);

  useEffect(() => {
    const channel = supabase.channel(`room-${code}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "players", filter: `room_id=eq.${code}` }, fetchPlayers)
      .on("postgres_changes", { event: "*", schema: "public", table: "rooms", filter: `id=eq.${code}` }, fetchRoom)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [code, fetchPlayers, fetchRoom]);

  useEffect(() => {
    if (myPlayer && players.length > 0) {
      const updated = players.find(p => p.id === myPlayer.id);
      if (updated) setMyPlayer(updated);
    }
  }, [players, myPlayer]);

  // Timer
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    autoSubmitRef.current = false;

    if (room?.status !== "playing" || room?.phase !== "playing" || !room?.turn_started_at) {
      setTimeLeft(null);
      return;
    }

    const alivePlayers = players.filter(p => p.is_alive);
    const currentPlayer = alivePlayers[room.current_player_index % alivePlayers.length];
    const isMyTurn = currentPlayer?.id === myPlayer?.id;

    const updateTimer = () => {
      const elapsed = (Date.now() - new Date(room.turn_started_at!).getTime()) / 1000;
      const remaining = Math.max(0, (room.timer_seconds ?? 30) - elapsed);
      setTimeLeft(Math.ceil(remaining));

      if (remaining <= 0 && isMyTurn && !autoSubmitRef.current) {
        autoSubmitRef.current = true;
        handleSubmitWord("[Aucun mot]");
      }
    };

    updateTimer();
    timerRef.current = setInterval(updateTimer, 500);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [room?.turn_started_at, room?.current_player_index, myPlayer?.id, room?.status, room?.phase]);

  async function updateSettings(key: string, value: number | boolean) {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    await supabase.from("rooms").update(updated).eq("id", code);
  }

  async function toggleReady() {
    if (!myPlayer) return;
    await supabase.from("players").update({ is_ready: !myPlayer.is_ready }).eq("id", myPlayer.id);
  }

  async function startGame() {
    setError("");
    const { error: fnError } = await supabase.functions.invoke("start-game", {
      body: { roomId: code, hostName: playerName },
    });
    if (fnError) setError("Erreur au lancement : " + fnError.message);
  }

  async function handleSubmitWord(forcedWord?: string) {
    if (submitting) return;
    const wordToSubmit = forcedWord ?? wordInput.trim();
    setSubmitting(true);
    setWordInput("");

    const { error: fnError } = await supabase.functions.invoke("submit-word", {
      body: { roomId: code, playerId: myPlayer?.id, word: wordToSubmit },
    });

    if (fnError) setError("Erreur : " + fnError.message);
    setSubmitting(false);
  }

  async function handleVote(targetId: string) {
    if (!myPlayer || myPlayer.vote_locked) return;
    setVotedFor(targetId);
    await supabase.functions.invoke("submit-vote", {
      body: { roomId: code, playerId: myPlayer.id, targetId, lock: false },
    });
  }

  async function lockVote() {
    if (!myPlayer || !votedFor) return;
    await supabase.functions.invoke("submit-vote", {
      body: { roomId: code, playerId: myPlayer.id, targetId: votedFor, lock: true },
    });
  }

  async function resetGame() {
    await supabase.from("players").update({
      role: null, word: null, is_alive: true, is_ready: false,
      words_said: [], word_count: 0,
    }).eq("room_id", code);
    await supabase.from("rooms").update({
      status: "waiting", phase: "waiting",
      word_civilian: null, word_undercover: null,
      current_round: 0, current_player_index: 0, turn_started_at: null,
    }).eq("id", code);
    setWordRevealed(false); setVotedFor(null);
    setShowResult(false); setEliminated(null); setWordInput("");
  }

  function sendEmoji(emoji: string) {
    const id = emojiCounter.current++;
    const x = Math.random() * 80 + 10;
    setFloatingEmojis(prev => [...prev, { id, emoji, x }]);
    setTimeout(() => setFloatingEmojis(prev => prev.filter(e => e.id !== id)), 2500);
  }

  if (loading) return (
    <div className="min-h-screen bg-[#1a1208] flex items-center justify-center">
      <p className="text-[#4a3820] text-sm tracking-widest animate-pulse">Connexion...</p>
    </div>
  );

  if (error && !room) return (
    <div className="min-h-screen bg-[#1a1208] flex flex-col items-center justify-center gap-4">
      <p className="text-[#c87050] text-sm">{error}</p>
      <button onClick={() => router.push("/undercover")} className="text-xs text-[#4a3820] hover:text-[#c8a030]">← Retour</button>
    </div>
  );

  const alivePlayers = players.filter(p => p.is_alive);
  const currentPlayer = alivePlayers[( room?.current_player_index ?? 0) % Math.max(alivePlayers.length, 1)];
  const isMyTurn = currentPlayer?.id === myPlayer?.id;
  const isPlaying = room?.status === "playing";
  const isTie = room?.phase === "tie";
  const isWaiting = room?.status === "waiting";
  const isPlayingPhase = room?.phase === "playing";
  const isVotingPhase = room?.phase === "voting";
  const civiliansWin = room?.status === "civilians_win";
  const undercoverWins = room?.status === "undercover_wins";
  const gameOver = civiliansWin || undercoverWins;
  const allReady = players.length >= 3 && players.every(p => p.is_ready);
  const maxUndercovers = players.length <= 4 ? 1 : 2;
  const timerPercent = timeLeft !== null && room ? (timeLeft / room.timer_seconds) * 100 : 100;

  return (
    <main className="min-h-screen bg-[#1a1208] text-[#e8dcc8] font-sans relative overflow-hidden">

      {/* Emojis flottants */}
      {floatingEmojis.map(e => (
        <div key={e.id} className="fixed pointer-events-none z-50 text-3xl animate-bounce"
          style={{ left: `${e.x}%`, bottom: "20%", animation: "floatUp 2.5s ease-out forwards" }}>
          {e.emoji}
        </div>
      ))}

      <style>{`
        @keyframes floatUp {
          0% { transform: translateY(0) scale(1); opacity: 1; }
          100% { transform: translateY(-200px) scale(1.5); opacity: 0; }
        }
      `}</style>

      <div className="relative z-10 max-w-md mx-auto w-full px-6 py-10">

        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <a href="/undercover" className="text-xs text-[#4a3820] hover:text-[#c8a030] tracking-widest uppercase transition-colors">← Quitter</a>
          <div className="text-center">
            <p className="text-xs text-[#4a3820] tracking-[0.3em] uppercase mb-1">Code salle</p>
            <p className="text-xl font-mono text-[#c8a030] tracking-[0.4em]">{code}</p>
          </div>
          {room && isPlaying ? (
            <div className="text-right">
              <p className="text-xs text-[#4a3820]">Manche</p>
              <p className="text-sm text-[#c8b888] font-mono">{room.current_round}/{room.total_rounds}</p>
            </div>
          ) : <div className="w-16" />}
        </div>

        {/* FIN DE PARTIE */}
        {gameOver && (
          <div className="text-center mb-10">
            <div className="text-5xl mb-4">{civiliansWin ? "🎉" : "🕵️"}</div>
            <h2 className="text-2xl text-[#f0e0b0] mb-2" style={{ fontFamily: "Georgia, serif", fontWeight: 400 }}>
              {civiliansWin ? "Les civils gagnent !" : "L'undercover gagne !"}
            </h2>
            <p className="text-sm text-[#6a5838] mb-2">
              L'undercover était <span className="text-[#c8a030]">{players.find(p => p.role === "undercover")?.avatar} {players.find(p => p.role === "undercover")?.name}</span>
            </p>
            <p className="text-xs text-[#4a3820] mb-8">
              Mots : civils = <strong className="text-[#c8b888]">{room?.word_civilian}</strong> · undercover = <strong className="text-[#c8b888]">{room?.word_undercover}</strong>
            </p>
            {isHost && (
              <button onClick={resetGame} className="px-8 py-3 rounded-sm text-sm font-medium" style={{ background: "#c8a030", color: "#1a1208" }}>
                Rejouer
              </button>
            )}
          </div>
        )}

        {/* RÉSULTAT VOTE */}
        {showResult && !gameOver && eliminated && (
          <div className="mb-8 p-5 rounded-sm text-center" style={{ background: "rgba(200,80,40,0.08)", border: "1px solid rgba(200,80,40,0.2)" }}>
            <p className="text-2xl mb-2">{eliminated.avatar}</p>
            <p className="text-sm text-[#c87050] mb-1"><strong>{eliminated.name}</strong> a été éliminé·e</p>
            <p className="text-xs text-[#6a5838]">C'était un·e <span className="text-[#c8a030]">{eliminated.role === "undercover" ? "Undercover 🕵️" : eliminated.role === "mrwhite" ? "Mr. White 👻" : "Civil 👤"}</span></p>
            <button onClick={() => setShowResult(false)} className="mt-3 text-xs text-[#4a3820] hover:text-[#c8a030] transition-colors">Continuer →</button>
          </div>
        )}

        {/* MON MOT */}
        {isPlaying && myPlayer?.word && !gameOver && (
          <div className="mb-6">
            <p className="text-xs tracking-[0.2em] uppercase text-[#4a3820] mb-2">Ton mot secret</p>
            <div className="p-4 rounded-sm text-center cursor-pointer select-none"
              style={{ background: "rgba(200,160,48,0.06)", border: "1px solid rgba(200,160,48,0.15)" }}
              onClick={() => setWordRevealed(!wordRevealed)}>
              {wordRevealed
                ? <p className="text-xl text-[#f0e0b0]" style={{ fontFamily: "Georgia, serif" }}>{myPlayer.word}</p>
                : <p className="text-sm text-[#4a3820]">Appuie pour révéler ton mot</p>}
            </div>
          </div>
        )}

        {/* PHASE DE JEU : TOUR DE TABLE */}
        {isPlaying && isPlayingPhase && !gameOver && !showResult && (
          <div>
            {/* Timer */}
            {timeLeft !== null && (
              <div className="mb-6">
                <div className="flex justify-between items-center mb-2">
                  <p className="text-xs text-[#4a3820] tracking-widest uppercase">Timer</p>
                  <p className={`text-sm font-mono font-bold ${timeLeft <= 5 ? "text-[#c87050]" : "text-[#c8a030]"}`}>{timeLeft}s</p>
                </div>
                <div className="h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                  <div className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${timerPercent}%`, background: timeLeft <= 5 ? "#c87050" : "#c8a030" }} />
                </div>
              </div>
            )}

            {/* Joueur actif */}
            {currentPlayer && (
              <div className="mb-6 p-4 rounded-sm text-center"
                style={{ background: isMyTurn ? "rgba(200,160,48,0.08)" : "rgba(255,255,255,0.02)", border: `1px solid ${isMyTurn ? "rgba(200,160,48,0.3)" : "rgba(255,255,255,0.05)"}` }}>
                <p className="text-3xl mb-2">{currentPlayer.avatar}</p>
                <p className="text-sm text-[#c8b888] font-medium">{isMyTurn ? "C'est ton tour !" : `Tour de ${currentPlayer.name}`}</p>
                <p className="text-xs text-[#4a3820] mt-1">
                  {currentPlayer.word_count ?? 0}/{room?.words_per_round} mots donnés
                </p>
              </div>
            )}

            {/* Saisie mot (joueur actif) */}
            {isMyTurn && (
              <div className="mb-6">
                <div className="flex gap-2">
                  <input
                    type="text" value={wordInput} maxLength={30}
                    onChange={e => setWordInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && wordInput.trim() && handleSubmitWord()}
                    placeholder="Ton indice..."
                    className="flex-1 px-4 py-3 rounded-sm text-sm text-[#e8dcc8] placeholder-[#3a2810] outline-none"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(200,160,48,0.3)" }}
                    autoFocus
                  />
                  <button onClick={() => handleSubmitWord()} disabled={!wordInput.trim() || submitting}
                    className="px-5 py-3 rounded-sm text-sm font-medium transition-all"
                    style={{ background: wordInput.trim() ? "#c8a030" : "#2a1e0e", color: wordInput.trim() ? "#1a1208" : "#4a3820" }}>
                    {submitting ? "..." : "→"}
                  </button>
                </div>
              </div>
            )}

            {/* Réactions emoji (joueurs inactifs) */}
            {!isMyTurn && (
              <div className="mb-6">
                <p className="text-xs text-[#4a3820] mb-2 tracking-widest uppercase">Réactions</p>
                <div className="flex gap-2 flex-wrap">
                  {["😂", "👀", "🤔", "😱", "🔥", "👏", "💀", "🫡"].map(emoji => (
                    <button key={emoji} onClick={() => sendEmoji(emoji)}
                      className="text-xl p-2 rounded-sm transition-all hover:scale-125"
                      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Liste joueurs avec leurs mots */}
            <div>
              <p className="text-xs tracking-[0.2em] uppercase text-[#4a3820] mb-3">Joueurs</p>
              <div className="flex flex-col gap-2">
              {alivePlayers.map(p => (
                <div key={p.id} className="px-4 py-3 rounded-sm"
                  style={{ background: p.id === currentPlayer?.id ? "rgba(200,160,48,0.05)" : "rgba(255,255,255,0.02)", border: `1px solid ${p.id === currentPlayer?.id ? "rgba(200,160,48,0.2)" : "rgba(255,255,255,0.05)"}` }}>
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{p.avatar}</span>
                    <span className="text-sm text-[#c8b888] flex-1">{p.name}</span>
                    <span className="text-xs text-[#4a3820]">{p.word_count ?? 0}/{room?.words_per_round}</span>
                    {p.id === currentPlayer?.id && <span className="text-xs text-[#c8a030]">✍️</span>}
                  </div>
                  {(p.words_said ?? []).length > 0 && (
                    <div className="flex gap-2 flex-wrap mt-2 ml-9">
                      {(p.words_said ?? []).map((w, i) => (
                        <span key={i} className="text-xs px-2 py-1 rounded-sm"
                          style={{ background: "rgba(200,160,48,0.08)", color: "#c8b888", border: "1px solid rgba(200,160,48,0.15)" }}>
                          {w}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              </div>
            </div>
          </div>
        )}

        {/* ÉGALITÉ */}
        {isPlaying && isTie && !gameOver && (
          <div className="text-center py-8">
            <div className="text-4xl mb-4">🤝</div>
            <h2 className="text-xl text-[#f0e0b0] mb-2" style={{ fontFamily: "Georgia, serif", fontWeight: 400 }}>
              Égalité !
            </h2>
            <p className="text-sm text-[#6a5838] mb-8">Personne n'est éliminé — les imposteurs gagnent cette manche.</p>
            {isHost && (
              <button onClick={resetGame}
                className="px-8 py-3 rounded-sm text-sm font-medium"
                style={{ background: "#c8a030", color: "#1a1208" }}>
                Manche suivante
              </button>
            )}
            {!isHost && <p className="text-xs text-[#4a3820] animate-pulse">En attente de l'hôte...</p>}
          </div>
        )}

        {/* PHASE DE VOTE */}
        {isPlaying && isVotingPhase && !gameOver && !showResult && (
          <div>
            {/* Tableau récap des mots */}
            <div className="mb-8">
              <p className="text-xs tracking-[0.2em] uppercase text-[#4a3820] mb-4">📋 Récap des mots</p>
              <div className="flex flex-col gap-2">
                {alivePlayers.map(p => (
                  <div key={p.id} className="px-4 py-3 rounded-sm"
                    style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg">{p.avatar}</span>
                      <span className="text-sm text-[#c8b888] font-medium">{p.name}</span>
                    </div>
                    <div className="flex gap-2 flex-wrap ml-7">
                      {(p.words_said ?? []).map((w, i) => (
                        <span key={i} className="text-xs px-2 py-1 rounded-sm"
                          style={{ background: "rgba(200,160,48,0.08)", color: "#c8b888", border: "1px solid rgba(200,160,48,0.15)" }}>
                          {w}
                        </span>
                      ))}
                      {(!p.words_said || p.words_said.length === 0) && (
                        <span className="text-xs text-[#3a2810] italic">Aucun mot</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Vote */}
            <p className="text-xs tracking-[0.2em] uppercase text-[#4a3820] mb-3">🗳️ Vote — Qui est l'imposteur ?</p>
            <div className="flex flex-col gap-2 mb-6">
              {alivePlayers.map(p => {
                const votingAgainstMe = alivePlayers.filter(other => other.voted_for === p.id);
                return (
                  <div key={p.id}
                    onClick={() => !myPlayer?.vote_locked && p.id !== myPlayer?.id && handleVote(p.id)}
                    className="flex items-center gap-3 px-4 py-3 rounded-sm transition-all"
                    style={{
                      background: votedFor === p.id ? "rgba(200,80,40,0.1)" : "rgba(255,255,255,0.02)",
                      border: votedFor === p.id ? "1px solid rgba(200,80,40,0.3)" : "1px solid rgba(255,255,255,0.05)",
                      cursor: p.id !== myPlayer?.id && !myPlayer?.vote_locked ? "pointer" : "default",
                      opacity: p.id === myPlayer?.id ? 0.5 : 1,
                    }}>
                    <span className="text-xl">{p.avatar}</span>
                    <span className="text-sm text-[#c8b888] flex-1">{p.name}</span>
                    {p.id === myPlayer?.id && <span className="text-xs text-[#4a3820]">toi</span>}
                    {votingAgainstMe.length > 0 && (
                      <div className="flex gap-1">
                        {votingAgainstMe.map(v => (
                          <span key={v.id} className="text-sm" title={`${v.name} vote contre ${p.name}`}>{v.avatar}</span>
                        ))}
                      </div>
                    )}
                    {p.vote_locked && <span className="text-xs text-[#6abf6a]">✓</span>}
                  </div>
                );
              })}
            </div>

            {error && <p className="text-xs text-[#c87050] mb-4 text-center">{error}</p>}

            {/* Bouton valider vote */}
            {myPlayer && !myPlayer.vote_locked && (
              <button
                onClick={lockVote}
                disabled={!votedFor}
                className="w-full py-4 rounded-sm text-sm font-medium tracking-wide mt-4"
                style={{
                  background: votedFor ? "#c8a030" : "#2a1e0e",
                  color: votedFor ? "#1a1208" : "#4a3820",
                  cursor: votedFor ? "pointer" : "not-allowed",
                }}>
                ✓ Valider mon vote
              </button>
            )}
            {myPlayer?.vote_locked && (
              <p className="text-center text-xs text-[#6abf6a] mt-4">✓ Vote verrouillé — en attente des autres...</p>
            )}
          </div>
        )}

        {/* SALLE D'ATTENTE */}
        {isWaiting && !gameOver && (
          <div>
            {isHost && (
              <div className="mb-6 p-4 rounded-sm" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                <p className="text-xs tracking-[0.2em] uppercase text-[#4a3820] mb-3">⚙️ Paramètres</p>
                <SettingRow label="Undercovers" desc={`Max ${maxUndercovers} avec ${players.length} joueurs`}>
                  <NumericInput value={settings.max_undercovers} min={1} max={maxUndercovers} onChange={v => updateSettings("max_undercovers", Math.min(v, maxUndercovers))} />
                </SettingRow>
                <SettingRow label="Mr. White" desc="Un joueur sans mot">
                  <button onClick={() => updateSettings("mr_white_enabled", !settings.mr_white_enabled)}
                    className="relative w-10 h-5 rounded-full transition-colors"
                    style={{ background: settings.mr_white_enabled ? "#c8a030" : "rgba(255,255,255,0.1)" }}>
                    <span className="absolute top-0.5 transition-all w-4 h-4 rounded-full bg-white"
                      style={{ left: settings.mr_white_enabled ? "calc(100% - 18px)" : "2px" }} />
                  </button>
                </SettingRow>
                <SettingRow label="Manches" desc="Nombre de tours">
                  <NumericInput value={settings.total_rounds} min={1} max={10} onChange={v => updateSettings("total_rounds", v)} />
                </SettingRow>
                <SettingRow label="Mots par manche" desc="Indices par joueur">
                  <NumericInput value={settings.words_per_round} min={1} max={3} onChange={v => updateSettings("words_per_round", v)} />
                </SettingRow>
                <SettingRow label="Timer" desc="Secondes par tour">
                  <NumericInput value={settings.timer_seconds} min={10} max={120} onChange={v => updateSettings("timer_seconds", v)} />
                </SettingRow>
              </div>
            )}

            {!isHost && room && (
              <div className="mb-6 flex gap-2 flex-wrap">
                {[`${room.total_rounds} manches`, `${room.words_per_round} mots/manche`, `${room.timer_seconds}s/tour`, room.mr_white_enabled ? "Mr. White ✓" : null]
                  .filter(Boolean).map((tag, i) => (
                    <span key={i} className="text-xs text-[#4a3820] px-2 py-1 rounded-sm"
                      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
                      {tag}
                    </span>
                  ))}
              </div>
            )}

            <div className="flex justify-between items-center mb-3">
              <p className="text-xs tracking-[0.2em] uppercase text-[#4a3820]">Joueurs ({players.length}/8)</p>
              <p className="text-xs text-[#4a3820]">{players.filter(p => p.is_ready).length}/{players.length} prêts</p>
            </div>

            <div className="flex flex-col gap-2 mb-6">
              {players.map(p => (
                <div key={p.id} className="flex items-center gap-3 px-4 py-3 rounded-sm"
                  style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${p.is_ready ? "rgba(100,200,100,0.2)" : "rgba(255,255,255,0.05)"}` }}>
                  <span className="text-xl">{p.avatar}</span>
                  <span className="text-sm text-[#c8b888] flex-1">{p.name}</span>
                  {p.name === room?.host && <span className="text-xs text-[#4a3820]">hôte</span>}
                  <span className="text-xs" style={{ color: p.is_ready ? "#6abf6a" : "#4a3820" }}>
                    {p.is_ready ? "✓ Prêt" : "En attente"}
                  </span>
                  {isHost && p.name !== room?.host && (
                    <button onClick={async () => { await supabase.from("players").delete().eq("id", p.id); }}
                      className="text-xs text-[#4a3820] hover:text-[#c87050] transition-colors ml-1">✕</button>
                  )}
                </div>
              ))}
            </div>

            {error && <p className="text-xs text-[#c87050] mb-4 text-center">{error}</p>}

            {myPlayer && (
              <button onClick={toggleReady}
                className="w-full py-3 rounded-sm text-sm font-medium tracking-wide mb-3 transition-all"
                style={{
                  background: myPlayer.is_ready ? "rgba(100,200,100,0.1)" : "rgba(255,255,255,0.04)",
                  border: myPlayer.is_ready ? "1px solid rgba(100,200,100,0.3)" : "1px solid rgba(255,255,255,0.08)",
                  color: myPlayer.is_ready ? "#6abf6a" : "#c8b888",
                }}>
                {myPlayer.is_ready ? "✓ Je suis prêt·e — Annuler" : "Je suis prêt·e"}
              </button>
            )}

            {isHost && (
              <button onClick={startGame}
                className="w-full py-4 rounded-sm text-sm font-medium tracking-wide transition-all"
                style={{
                  background: allReady ? "#c8a030" : "#2a1e0e",
                  color: allReady ? "#1a1208" : "#4a3820",
                  cursor: allReady ? "pointer" : "not-allowed",
                }}>
                {players.length < 3 ? `Attente des joueurs... (${players.length}/3)` : !allReady ? `En attente (${players.filter(p => p.is_ready).length}/${players.length} prêts)` : "Lancer la partie 🎮"}
              </button>
            )}

            {!isHost && (
              <p className="text-center text-xs text-[#4a3820] animate-pulse mt-2">En attente que l'hôte lance...</p>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
