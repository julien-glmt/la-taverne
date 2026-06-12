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
  score: number;
  voted_for_mrwhite: string | null;
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
  last_eliminated_id: string | null;
  round_history: any[];
  mr_white_guess: string | null;
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
  const [wordRevealed, setWordRevealed] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [votedFor, setVotedFor] = useState<string | null>(null);
  const [votedForMrWhite, setVotedForMrWhite] = useState<string | null>(null);
  const [wordInput, setWordInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [floatingEmojis, setFloatingEmojis] = useState<{ id: number; emoji: string; x: number }[]>([]);
  const [mrWhiteGuess, setMrWhiteGuess] = useState("");
  const [mrWhiteTimer, setMrWhiteTimer] = useState(15);
  const [mrWhiteSubmitted, setMrWhiteSubmitted] = useState(false);
  const [roundResult, setRoundResult] = useState<any>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mrWhiteTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoSubmitRef = useRef(false);
  const emojiCounter = useRef(0);
  const mrWhiteInGame = players.some(p => p.role === "mrwhite");

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
          round_history: [],
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

      // const { data: newPlayer } = await supabase.from("players")
      //   .insert({ room_id: code, name: playerName, avatar: playerAvatar, is_ready: isHost, score: 0 })
      //   .select().single();
      // if (newPlayer) setMyPlayer(newPlayer);

    // Vérifier si on a déjà un ID joueur en sessionStorage, passer en localStorage si besoin pour persister entre onglets
    const storageKey = `player_${code}`;
    const existingPlayerId = sessionStorage.getItem(storageKey);

    if (existingPlayerId) {
      // Essayer de récupérer le joueur existant
      const { data: existingPlayer } = await supabase
        .from("players").select("*").eq("id", existingPlayerId).single();
      if (existingPlayer) {
        setMyPlayer(existingPlayer);
      } else {
        // Joueur introuvable, en créer un nouveau
        const { data: newPlayer } = await supabase.from("players")
          .insert({ room_id: code, name: playerName, avatar: playerAvatar, is_ready: true, score: 0 })
          .select().single();
        if (newPlayer) {
          setMyPlayer(newPlayer);
          sessionStorage.setItem(storageKey, newPlayer.id);
        }
      }
    } else {
      const { data: newPlayer } = await supabase.from("players")
        .insert({ room_id: code, name: playerName, avatar: playerAvatar, is_ready: true, score: 0 })
        .select().single();
      if (newPlayer) {
        setMyPlayer(newPlayer);
        sessionStorage.setItem(storageKey, newPlayer.id);
      }
    }

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
      .on("broadcast", { event: "emoji" }, ({ payload }) => {
    const id = emojiCounter.current++;
    setFloatingEmojis(prev => [...prev, { id, emoji: payload.emoji, x: payload.x }]);
    setTimeout(() => setFloatingEmojis(prev => prev.filter(e => e.id !== id)), 2500);
  })
  .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [code, fetchPlayers, fetchRoom]);

  useEffect(() => {
    if (myPlayer && players.length > 0) {
      const updated = players.find(p => p.id === myPlayer.id);
      if (updated) setMyPlayer(updated);
    }
  }, [players, myPlayer]);

  // Timer tour de table
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    autoSubmitRef.current = false;

    if (room?.status !== "playing" || room?.phase !== "playing" || !room?.turn_started_at) return;

    const alivePlayers = players.filter(p => p.is_alive);
    const currentPlayer = alivePlayers[(room.current_player_index ?? 0) % Math.max(alivePlayers.length, 1)];
    const isMyTurn = currentPlayer?.id === myPlayer?.id;

    const updateTimer = () => {
      const elapsed = (Date.now() - new Date(room.turn_started_at!).getTime()) / 1000;
      const remaining = Math.max(0, (room.timer_seconds ?? 30) - elapsed);

      if (remaining <= 0 && isMyTurn && !autoSubmitRef.current) {
        autoSubmitRef.current = true;
        handleSubmitWord("[Aucun mot]");
      }
    };

    updateTimer();
    timerRef.current = setInterval(updateTimer, 500);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [room?.turn_started_at, room?.current_player_index, myPlayer?.id, room?.status, room?.phase]);

  // Timer Mr. White
  useEffect(() => {
    if (mrWhiteTimerRef.current) clearInterval(mrWhiteTimerRef.current);

    if (room?.phase !== "mrwhite_guess" || myPlayer?.role !== "mrwhite") return;

    setMrWhiteTimer(15);
    mrWhiteTimerRef.current = setInterval(() => {
      setMrWhiteTimer(prev => {
        if (prev <= 1) {
          clearInterval(mrWhiteTimerRef.current!);
          if (!mrWhiteSubmitted) handleEndRound("");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => { if (mrWhiteTimerRef.current) clearInterval(mrWhiteTimerRef.current); };
  }, [room?.phase, myPlayer?.role]);

  useEffect(() => {
    if (room?.phase === "round_result_pending" && isHost && !mrWhiteSubmitted) {
      supabase.functions.invoke("end-round", {
        body: { roomId: code, mrWhiteGuess: "" },
      });
    }
  }, [room?.phase]);

  useEffect(() => {
    const handleBeforeUnload = async () => {
      if (myPlayer && room?.status === "waiting") {
        await supabase.from("players").delete().eq("id", myPlayer.id);
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      // Aussi supprimer si le composant se démonte (navigation)
      if (myPlayer && room?.status === "waiting") {
        supabase.from("players").delete().eq("id", myPlayer.id);
      }
    };
  }, [myPlayer?.id, room?.status]);

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
    if (players.length < 3) { setError("Il faut au moins 3 joueurs."); return; }
    if (!players.every(p => p.is_ready)) { setError("Tous les joueurs doivent être prêts."); return; }

    const WORD_PAIRS = [
      { civilian: "Chien", undercover: "Loup" },
      { civilian: "Plage", undercover: "Piscine" },
      { civilian: "Pizza", undercover: "Tarte" },
      { civilian: "Voiture", undercover: "Moto" },
      { civilian: "Café", undercover: "Thé" },
      { civilian: "Cinéma", undercover: "Théâtre" },
      { civilian: "Football", undercover: "Rugby" },
      { civilian: "Guitare", undercover: "Violon" },
      { civilian: "Paris", undercover: "Lyon" },
      { civilian: "Été", undercover: "Printemps" },
      { civilian: "Montagne", undercover: "Volcan" },
      { civilian: "Château", undercover: "Palais" },
      { civilian: "Lion", undercover: "Tigre" },
      { civilian: "Glace", undercover: "Sorbet" },
      { civilian: "Tennis", undercover: "Badminton" },
      { civilian: "Ski", undercover: "Snowboard" },
      { civilian: "Médecin", undercover: "Chirurgien" },
      { civilian: "Pompier", undercover: "Policier" },
      { civilian: "Avocat", undercover: "Juge" },
      { civilian: "Smartphone", undercover: "Tablette" },
      { civilian: "Robot", undercover: "Androïde" },
      { civilian: "Avion", undercover: "Hélicoptère" },
      { civilian: "Métro", undercover: "Tramway" },
      { civilian: "Espion", undercover: "Détective" },
      { civilian: "Fantôme", undercover: "Vampire" },
      { civilian: "Forêt", undercover: "Jungle" },
      { civilian: "Pirate", undercover: "Viking" },
      { civilian: "Taxi", undercover: "Uber" },
      { civilian: "Crêpe", undercover: "Gaufre" },
      { civilian: "Boxe", undercover: "Karaté" },
      { civilian: "Magie", undercover: "Illusion" },
      { civilian: "Mensonge", undercover: "Secret" },
      { civilian: "Hacker", undercover: "Pirate informatique" },
      { civilian: "Mème", undercover: "Gif" },
      { civilian: "Bug", undercover: "Glitch" },
      { civilian: "Trahison", undercover: "Abandon" },
      { civilian: "Vengeance", undercover: "Représailles" },
      { civilian: "Requin", undercover: "Dauphin" },
      { civilian: "Astronaute", undercover: "Pilote" },
      { civilian: "Boulangerie", undercover: "Pâtisserie" },
      { civilian: "Grotte", undercover: "Mine" },
      { civilian: "Acteur", undercover: "Chanteur" },
      { civilian: "Sauna", undercover: "Hammam" },
      { civilian: "Camping", undercover: "Glamping" },
      { civilian: "Surf", undercover: "Wakeboard" },
      { civilian: "Tatouage", undercover: "Piercing" },
      { civilian: "Anniversaire", undercover: "Mariage" },
      { civilian: "Jumeau", undercover: "Clone" },
      { civilian: "Cimetière", undercover: "Mausolée" },
      { civilian: "Duel", undercover: "Tournoi" },
      { civilian: "Épée", undercover: "Lance" },
      { civilian: "Espionnage", undercover: "Sabotage" },
      { civilian: "Cambriolage", undercover: "Braquage" },
      { civilian: "Alibi", undercover: "Fausse piste" },
      { civilian: "Filature", undercover: "Surveillance" },
      { civilian: "Fugitif", undercover: "Évadé" },
      { civilian: "Chantage", undercover: "Extorsion" },
      { civilian: "Meurtre", undercover: "Assassinat" },
      { civilian: "Streaming", undercover: "Téléchargement" },
      { civilian: "Influenceur", undercover: "Blogueur" },
      { civilian: "Troll", undercover: "Hater" },
      { civilian: "Forum", undercover: "Chat" },
      { civilian: "Mot de passe", undercover: "Code PIN" },
      { civilian: "Serveur", undercover: "Cloud" },
      { civilian: "Burn-out", undercover: "Dépression" },
      { civilian: "Thérapie", undercover: "Coaching" },
      { civilian: "Insomnie", undercover: "Somnambulisme" },
      { civilian: "Jalousie", undercover: "Envie" },
      { civilian: "Orgueil", undercover: "Arrogance" },
      { civilian: "Empathie", undercover: "Compassion" },
      { civilian: "Manipulation", undercover: "Persuasion" },
      { civilian: "Séduction", undercover: "Charme" },
      { civilian: "Pardon", undercover: "Réconciliation" },
      { civilian: "Héritage", undercover: "Testament" },
      { civilian: "Procès", undercover: "Audience" },
      { civilian: "Rome", undercover: "Athènes" },
      { civilian: "Tokyo", undercover: "Pékin" },
      { civilian: "New York", undercover: "Los Angeles" },
      { civilian: "Désert", undercover: "Savane" },
      { civilian: "Récif", undercover: "Atoll" },
      { civilian: "Oasis", undercover: "Source" },
      { civilian: "Foudre", undercover: "Tonnerre" },
      { civilian: "Mousson", undercover: "Cyclone" },
      { civilian: "Brouillard", undercover: "Brume" },
      { civilian: "Comédie", undercover: "Sketch" },
      { civilian: "Documentaire", undercover: "Reportage" },
      { civilian: "Série", undercover: "Feuilleton" },
      { civilian: "Réalisateur", undercover: "Producteur" },
      { civilian: "Sel", undercover: "Sucre" },
      { civilian: "Judo", undercover: "Lutte" },
      { civilian: "Marathon", undercover: "Triathlon" },
      { civilian: "Golf", undercover: "Pétanque" },
      { civilian: "Médaille", undercover: "Trophée" },
      { civilian: "Arbitre", undercover: "Juge de ligne" },
      { civilian: "Dopage", undercover: "Triche" },
      { civilian: "Lapin", undercover: "Lièvre" },
      { civilian: "Crocodile", undercover: "Alligator" },
      { civilian: "Aigle", undercover: "Faucon" },
      { civilian: "Sorcière", undercover: "Fée" },
      { civilian: "Démon", undercover: "Ange" },
      { civilian: "Paradis", undercover: "Enfer" },
      { civilian: "Superstition", undercover: "Croyance" },
      { civilian: "Horoscope", undercover: "Tarot" },
      { civilian: "Trésor", undercover: "Butin" },
      { civilian: "Naufrage", undercover: "Crash" },
      { civilian: "Phare", undercover: "Tour de contrôle" },
      { civilian: "Marée", undercover: "Vague" },
    ];

    const pair = WORD_PAIRS[Math.floor(Math.random() * WORD_PAIRS.length)];
    const shuffled = [...players].sort(() => Math.random() - 0.5);
    const undercoverCount = Math.min(settings.max_undercovers, shuffled.length - 2);

    for (let i = 0; i < shuffled.length; i++) {
      let role = "civilian";
      let word = pair.civilian;
      if (i < undercoverCount) { role = "undercover"; word = pair.undercover; }
      else if (settings.mr_white_enabled && i === undercoverCount) { role = "mrwhite"; word = "***"; }
      await supabase.from("players").update({ role, word, is_alive: true }).eq("id", shuffled[i].id);
    }

    const firstPlayerIndex = Math.floor(Math.random() * shuffled.length);

    await supabase.from("rooms").update({
      status: "playing",
      phase: "playing",
      word_civilian: pair.civilian,
      word_undercover: pair.undercover,
      current_round: room?.current_round ?? 0,
      current_player_index: firstPlayerIndex,
      turn_started_at: new Date().toISOString(),
    }).eq("id", code);
  }

  async function startNextRound() {
    if (room?.status === "game_over_pending") {
      await supabase.from("rooms").update({ status: "game_over", phase: "game_over" }).eq("id", code);
      return;
    }
    setError("");
    setRoundResult(null);
    setWordRevealed(false);
    setVotedFor(null);
    setMrWhiteGuess("");
    setMrWhiteSubmitted(false);
    setVotedFor(null);
    setVotedForMrWhite(null);

    await supabase.from("players").update({
      words_said: [], word_count: 0,
      voted_for: null, vote_locked: false,
      is_alive: true,
    }).eq("room_id", code);

    await startGame();
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

  async function handleVoteMrWhite(targetId: string) {
    if (!myPlayer || myPlayer.vote_locked) return;
    setVotedForMrWhite(targetId);
    await supabase.from("players").update({ voted_for_mrwhite: targetId }).eq("id", myPlayer.id);
  }

  async function lockVote() {
    if (!myPlayer || !votedFor) return;
    if (mrWhiteInGame && !votedForMrWhite) return;
    await supabase.functions.invoke("submit-vote", {
      body: { roomId: code, playerId: myPlayer.id, targetId: votedFor, targetMrWhiteId: votedForMrWhite, lock: true },
    });
  }

  async function handleEndRound(guess: string) {
    setMrWhiteSubmitted(true);
    const { data, error: fnError } = await supabase.functions.invoke("end-round", {
      body: { roomId: code, mrWhiteGuess: guess },
    });
    if (fnError) setError("Erreur : " + fnError.message);
    else setRoundResult(data);
  }

  async function handleMrWhiteSubmit() {
    if (mrWhiteTimerRef.current) clearInterval(mrWhiteTimerRef.current);
    await handleEndRound(mrWhiteGuess);
  }

  async function sendEmoji(emoji: string) {
    const x = Math.random() * 80 + 10;
    // Afficher localement immédiatement
    const id = emojiCounter.current++;
    setFloatingEmojis(prev => [...prev, { id, emoji, x }]);
    setTimeout(() => setFloatingEmojis(prev => prev.filter(e => e.id !== id)), 2500);
    // Envoyer aux autres
    await supabase.channel(`room-${code}`).send({
      type: "broadcast",
      event: "emoji",
      payload: { emoji, x, from: playerName },
    });
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
  const currentPlayer = alivePlayers[(room?.current_player_index ?? 0) % Math.max(alivePlayers.length, 1)];
  const isMyTurn = currentPlayer?.id === myPlayer?.id;
  const isPlaying = room?.status === "playing";
  const isWaiting = room?.status === "waiting";
  const isWaitingNextRound = room?.status === "waiting_next_round";
  const isPlayingPhase = room?.phase === "playing";
  const isVotingPhase = room?.phase === "voting";
  const isTie = room?.phase === "tie";
  const isRoundResult = room?.phase === "round_result";
  const isMrWhiteGuess = room?.phase === "mrwhite_guess";
  const isGameOver = ["civilians_win", "undercover_wins", "game_over"].includes(room?.status ?? "");  const allReady = players.length >= 3;
  const maxUndercovers = players.length <= 4 ? 1 : 2;

  const eliminatedPlayer = players.find(p => p.id === room?.last_eliminated_id);
  const sortedByScore = [...players].sort((a, b) => (b.score || 0) - (a.score || 0));

  const elapsed = room?.turn_started_at ? (Date.now() - new Date(room.turn_started_at).getTime()) / 1000 : 0;
  const timeLeft = Math.max(0, Math.ceil((room?.timer_seconds ?? 30) - elapsed));
  const timerPercent = room ? (timeLeft / room.timer_seconds) * 100 : 100;

  return (
    <main className="min-h-screen bg-[#1a1208] text-[#e8dcc8] font-sans relative overflow-hidden">

      {floatingEmojis.map(e => (
        <div key={e.id} className="fixed pointer-events-none z-50 text-3xl"
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
          {room && (isPlaying || isWaitingNextRound) ? (
            <div className="text-right">
              <p className="text-xs text-[#4a3820]">Manche</p>
              <p className="text-sm text-[#c8b888] font-mono">{(room.current_round ?? 0) + 1}/{room.total_rounds}</p>
            </div>
          ) : <div className="w-16" />}
        </div>

        {/* GAME OVER */}
        {isGameOver && (
          <div>
            <div className="text-center mb-8">
              <div className="text-5xl mb-4">
                {room?.status === "civilians_win" ? "🎉" : room?.status === "undercover_wins" ? "🕵️" : "🏆"}
              </div>
              <h2 className="text-2xl text-[#f0e0b0] mb-2" style={{ fontFamily: "Georgia, serif", fontWeight: 400 }}>
                {room?.status === "civilians_win" ? "Les civils gagnent !" : room?.status === "undercover_wins" ? "L'undercover gagne !" : "Fin de partie !"}
              </h2>
            </div>

        <div className="mb-8">
          <p className="text-xs tracking-[0.2em] uppercase text-[#4a3820] mb-6 text-center">🏆 Classement final</p>

          {/* Podium visuel Top 3 */}
          {sortedByScore.length >= 3 && (
            <div className="flex items-end justify-center gap-3 mb-8">
              {/* 2ème place */}
              <div className="flex flex-col items-center flex-1">
                <span className="text-3xl mb-1">{sortedByScore[1]?.avatar}</span>
                <p className="text-xs text-[#c8b888] mb-2 text-center truncate w-full px-1">{sortedByScore[1]?.name}</p>
                <p className="text-xs text-[#c8a030] mb-2">{sortedByScore[1]?.score || 0} pts</p>
                <div className="w-full rounded-t-sm flex items-center justify-center py-4"
                  style={{ background: "rgba(180,180,180,0.15)", border: "1px solid rgba(180,180,180,0.3)", minHeight: "60px" }}>
                  <span className="text-2xl">🥈</span>
                </div>
              </div>

              {/* 1ère place */}
              <div className="flex flex-col items-center flex-1">
                <span className="text-4xl mb-1">{sortedByScore[0]?.avatar}</span>
                <p className="text-xs text-[#c8b888] mb-2 text-center truncate w-full px-1 font-medium">{sortedByScore[0]?.name}</p>
                <p className="text-xs text-[#c8a030] mb-2 font-medium">{sortedByScore[0]?.score || 0} pts</p>
                <div className="w-full rounded-t-sm flex items-center justify-center py-6"
                  style={{ background: "rgba(200,160,48,0.2)", border: "1px solid rgba(200,160,48,0.4)", minHeight: "80px" }}>
                  <span className="text-2xl">🥇</span>
                </div>
              </div>

              {/* 3ème place */}
              <div className="flex flex-col items-center flex-1">
                <span className="text-3xl mb-1">{sortedByScore[2]?.avatar}</span>
                <p className="text-xs text-[#c8b888] mb-2 text-center truncate w-full px-1">{sortedByScore[2]?.name}</p>
                <p className="text-xs text-[#c8a030] mb-2">{sortedByScore[2]?.score || 0} pts</p>
                <div className="w-full rounded-t-sm flex items-center justify-center py-3"
                  style={{ background: "rgba(150,100,50,0.15)", border: "1px solid rgba(150,100,50,0.3)", minHeight: "45px" }}>
                  <span className="text-2xl">🥉</span>
                </div>
              </div>
            </div>
          )}

          {/* Reste du classement */}
          {sortedByScore.length > 3 && (
            <div className="flex flex-col gap-2">
              {sortedByScore.slice(3).map((p, i) => (
                <div key={p.id} className="flex items-center gap-3 px-4 py-3 rounded-sm"
                  style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                  <span className="text-sm w-4 text-[#4a3820]">{i + 4}.</span>
                  <span className="text-xl">{p.avatar}</span>
                  <span className="text-sm text-[#c8b888] flex-1">{p.name}</span>
                  <span className="text-sm font-mono text-[#c8a030]">{p.score || 0} pts</span>
                </div>
              ))}
            </div>
          )}
        </div>

            {/* Historique */}
            {room?.round_history && room.round_history.length > 0 && (
              <div className="mb-6">
                <p className="text-xs tracking-[0.2em] uppercase text-[#4a3820] mb-4">📜 Historique des manches</p>
                <div className="flex flex-col gap-3">
                {room.round_history.map((r: any, i: number) => (
                  <div key={i} className="p-4 rounded-sm" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                    <p className="text-xs text-[#c8a030] mb-3 font-medium">Manche {r.round}</p>

                    {/* Civils */}
                    <div className="mb-2">
                      <span className="text-xs text-[#6abf6a]">👤 Civils</span>
                      <span className="text-xs text-[#c8b888] ml-2 font-medium">"{r.word_civilian}"</span>
                      <div className="flex flex-wrap gap-1 mt-1 ml-4">
                        {players.filter(p => r.roles?.[p.id] === "civilian").map(p => (
                          <span key={p.id} className="text-xs text-[#6a5838]">{p.avatar} {p.name}</span>
                        ))}
                      </div>
                    </div>

                    {/* Undercover */}
                    <div className="mb-2">
                      <span className="text-xs text-[#c87050]">🕵️ Undercover</span>
                      <span className="text-xs text-[#c8b888] ml-2 font-medium">"{r.word_undercover}"</span>
                      <div className="flex flex-wrap gap-1 mt-1 ml-4">
                        {players.filter(p => r.roles?.[p.id] === "undercover").map(p => (
                          <span key={p.id} className="text-xs text-[#6a5838]">{p.avatar} {p.name}</span>
                        ))}
                      </div>
                    </div>

                    {/* Mr. White */}
                    {players.some(p => r.roles?.[p.id] === "mrwhite") && (
                      <div className="mb-2">
                        <span className="text-xs text-[#c8a030]">👻 Mr. White</span>
                        <div className="flex flex-wrap gap-1 mt-1 ml-4">
                          {players.filter(p => r.roles?.[p.id] === "mrwhite").map(p => (
                            <span key={p.id} className="text-xs text-[#6a5838]">{p.avatar} {p.name}</span>
                          ))}
                        </div>
                        {r.mr_white_guess && (
                          <p className="text-xs text-[#6a5838] ml-4 mt-1">
                            A dit : <strong className="text-[#c8b888]">"{r.mr_white_guess}"</strong> {r.mr_white_correct ? "✓" : "✗"}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Éliminé */}
                    {r.eliminated && (
                      <p className="text-xs text-[#4a3820] mt-2">
                        Éliminé : {r.eliminated.avatar} <strong className="text-[#c8b888]">{r.eliminated.name}</strong>
                      </p>
                    )}
                  </div>
                ))}
                </div>
              </div>
            )}

            {isHost && (
              <button onClick={async () => {
                await supabase.from("players").update({ role: null, word: null, is_alive: true, is_ready: false, words_said: [], word_count: 0, voted_for: null, vote_locked: false, score: 0 }).eq("room_id", code);
                await supabase.from("rooms").update({ status: "waiting", phase: "waiting", word_civilian: null, word_undercover: null, current_round: 0, current_player_index: 0, turn_started_at: null, round_history: [], last_eliminated_id: null }).eq("id", code);
              }}
                className="w-full py-4 rounded-sm text-sm font-medium" style={{ background: "#c8a030", color: "#1a1208" }}>
                Nouvelle partie
              </button>
            )}
          </div>
        )}

        {/* POP-UP MR. WHITE */}
        {isMrWhiteGuess && myPlayer?.role === "mrwhite" && !mrWhiteSubmitted && (
          <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 px-6">
            <div className="w-full max-w-sm p-6 rounded-sm" style={{ background: "#1a1208", border: "1px solid rgba(200,160,48,0.3)" }}>
              <div className="text-center mb-6">
                <div className="text-4xl mb-3">👻</div>
                <h2 className="text-xl text-[#f0e0b0] mb-2" style={{ fontFamily: "Georgia, serif", fontWeight: 400 }}>Tu es le Mr. White !</h2>
                <p className="text-sm text-[#6a5838]">Tu as <strong className="text-[#c8a030]">{mrWhiteTimer}s</strong> pour deviner le mot des civils.</p>
              </div>
              <input type="text" value={mrWhiteGuess} onChange={e => setMrWhiteGuess(e.target.value)}
                onKeyDown={e => e.key === "Enter" && mrWhiteGuess.trim() && handleMrWhiteSubmit()}
                placeholder="Ton mot..."
                className="w-full px-4 py-3 rounded-sm text-sm text-[#e8dcc8] placeholder-[#3a2810] outline-none mb-4"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(200,160,48,0.3)" }}
                autoFocus />
              <div className="h-1 rounded-full overflow-hidden mb-4" style={{ background: "rgba(255,255,255,0.06)" }}>
                <div className="h-full rounded-full transition-all"
                  style={{ width: `${(mrWhiteTimer / 15) * 100}%`, background: mrWhiteTimer <= 5 ? "#c87050" : "#c8a030" }} />
              </div>
              <button onClick={handleMrWhiteSubmit} disabled={!mrWhiteGuess.trim()}
                className="w-full py-3 rounded-sm text-sm font-medium"
                style={{ background: mrWhiteGuess.trim() ? "#c8a030" : "#2a1e0e", color: mrWhiteGuess.trim() ? "#1a1208" : "#4a3820" }}>
                Valider ma réponse
              </button>
            </div>
          </div>
        )}

        {isMrWhiteGuess && myPlayer?.role !== "mrwhite" && (
          <div className="text-center py-12">
            <div className="text-4xl mb-4 animate-pulse">👻</div>
            <p className="text-sm text-[#6a5838]">Le Mr. White tente de deviner le mot...</p>
          </div>
        )}

        {/* RÉSULTAT DE MANCHE */}
        {(isRoundResult || isWaitingNextRound || room?.status === "game_over_pending") && !isGameOver && (
          <div>
            <div className="text-center mb-8">
              <div className="text-4xl mb-3">{eliminatedPlayer?.role === "undercover" ? "🎉" : eliminatedPlayer?.role === "mrwhite" ? "👻" : "🗳️"}</div>              <h2 className="text-xl text-[#f0e0b0] mb-2" style={{ fontFamily: "Georgia, serif", fontWeight: 400 }}>
                Fin de manche {room?.current_round}
              </h2>
              {room?.mr_white_guess && (
                <p className="text-xs text-[#6a5838] mt-1">
                  Mr. White a dit : <strong className="text-[#c8b888]">"{room.mr_white_guess}"</strong>
                </p>
              )}
              {(() => {
                const lastRound = room?.round_history?.[room.round_history.length - 1];
                if (!lastRound) return null;
                return (
                  <div className="mt-4 flex flex-col gap-2">
                    <p className="text-xs tracking-[0.2em] uppercase text-[#4a3820] mb-2">Rôles de la manche</p>
                    {players.map(p => (
                      <div key={p.id} className="flex items-center gap-3 px-4 py-2 rounded-sm"
                        style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                        <span className="text-lg">{p.avatar}</span>
                        <span className="text-sm text-[#c8b888] flex-1">{p.name}</span>
                        <span className="text-xs" style={{ color: lastRound?.roles?.[p.id] === "undercover" ? "#c87050" : lastRound?.roles?.[p.id] === "mrwhite" ? "#c8a030" : "#6abf6a" }}>
                          {lastRound?.roles?.[p.id] === "undercover" ? `🕵️ Undercover · ${lastRound.word_undercover}` : lastRound?.roles?.[p.id] === "mrwhite" ? "👻 Mr. White" : `👤 Civil · ${lastRound.word_civilian}`}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>

            {/* Scores */}
            <div className="mb-8">
              <p className="text-xs tracking-[0.2em] uppercase text-[#4a3820] mb-3">Scores</p>
              <div className="flex flex-col gap-2">
                {sortedByScore.map((p, i) => (
                  <div key={p.id} className="flex items-center gap-3 px-4 py-3 rounded-sm"
                    style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                    <span className="text-sm w-4 text-[#4a3820]">{i + 1}.</span>
                    <span className="text-xl">{p.avatar}</span>
                    <span className="text-sm text-[#c8b888] flex-1">{p.name}</span>
                    <span className="text-sm font-mono text-[#c8a030]">{p.score || 0} pts</span>
                  </div>
                ))}
              </div>
            </div>

            {isHost && (
              <button onClick={startNextRound}
                className="w-full py-4 rounded-sm text-sm font-medium" style={{ background: "#c8a030", color: "#1a1208" }}>
                {room?.status === "game_over_pending" ? "Voir les résultats 🏆" : "Manche suivante →"}
              </button>
            )}
            {!isHost && <p className="text-center text-xs text-[#4a3820] animate-pulse">En attente de l'hôte...</p>}
          </div>
        )}

        {/* ÉGALITÉ */}
        {isPlaying && isTie && !isGameOver && (
          <div>
            <div className="text-center mb-8">
              <div className="text-4xl mb-4">🤝</div>
              <h2 className="text-xl text-[#f0e0b0] mb-2" style={{ fontFamily: "Georgia, serif", fontWeight: 400 }}>Égalité !</h2>
              <p className="text-sm text-[#6a5838] mb-4">Personne n'est éliminé</p>
              {(() => {
                const lastRound = room?.round_history?.[room.round_history.length - 1];
                if (!lastRound) return null;
                return (
                  <>
                    <p className="text-xs text-[#4a3820] mb-4">
                      Civils : <strong className="text-[#c8b888]">{lastRound.word_civilian}</strong> · Undercover : <strong className="text-[#c8b888]">{lastRound.word_undercover}</strong>
                    </p>
                    <div className="flex flex-col gap-2 mb-6">
                      {players.map(p => (
                        <div key={p.id} className="flex items-center gap-3 px-4 py-2 rounded-sm"
                          style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                          <span className="text-lg">{p.avatar}</span>
                          <span className="text-sm text-[#c8b888] flex-1">{p.name}</span>
                          <span className="text-xs" style={{ color: lastRound?.roles?.[p.id] === "undercover" ? "#c87050" : lastRound?.roles?.[p.id] === "mrwhite" ? "#c8a030" : "#6abf6a" }}>
                            {lastRound?.roles?.[p.id] === "undercover" ? `🕵️ Undercover · ${lastRound.word_undercover}` : lastRound?.roles?.[p.id] === "mrwhite" ? "👻 Mr. White" : `👤 Civil · ${lastRound.word_civilian}`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                );
              })()}
            </div>
            {isHost && (
              <button onClick={async () => {
                await supabase.functions.invoke("end-round", { body: { roomId: code, mrWhiteGuess: "" } });
              }}
                className="w-full py-3 rounded-sm text-sm font-medium" style={{ background: "#c8a030", color: "#1a1208" }}>
                Continuer
              </button>
            )}
            {!isHost && <p className="text-xs text-[#4a3820] animate-pulse text-center">En attente de l'hôte...</p>}
          </div>
        )}

        {/* MON MOT */}
        {isPlaying && myPlayer?.word && !isGameOver && (isPlayingPhase || isVotingPhase) && (
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

        {/* TOUR DE TABLE */}
        {isPlaying && isPlayingPhase && !isGameOver && (
          <div>
            {/* Timer */}
            {room?.turn_started_at && (
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

            {currentPlayer && (
              <div className="mb-6 p-4 rounded-sm text-center"
                style={{ background: isMyTurn ? "rgba(200,160,48,0.08)" : "rgba(255,255,255,0.02)", border: `1px solid ${isMyTurn ? "rgba(200,160,48,0.3)" : "rgba(255,255,255,0.05)"}` }}>
                <p className="text-3xl mb-2">{currentPlayer.avatar}</p>
                <p className="text-sm text-[#c8b888] font-medium">{isMyTurn ? "C'est ton tour !" : `Tour de ${currentPlayer.name}`}</p>
                <p className="text-xs text-[#4a3820] mt-1">{currentPlayer.word_count ?? 0}/{room?.words_per_round} mots donnés</p>
              </div>
            )}

            {isMyTurn && (
              <div className="mb-6">
                <div className="flex gap-2">
                  <input type="text" value={wordInput} maxLength={30}
                    onChange={e => setWordInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && wordInput.trim() && handleSubmitWord()}
                    placeholder="Ton indice..."
                    className="flex-1 px-4 py-3 rounded-sm text-sm text-[#e8dcc8] placeholder-[#3a2810] outline-none"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(200,160,48,0.3)" }}
                    autoFocus />
                  <button onClick={() => handleSubmitWord()} disabled={!wordInput.trim() || submitting}
                    className="px-5 py-3 rounded-sm text-sm font-medium"
                    style={{ background: wordInput.trim() ? "#c8a030" : "#2a1e0e", color: wordInput.trim() ? "#1a1208" : "#4a3820" }}>
                    {submitting ? "..." : "→"}
                  </button>
                </div>
              </div>
            )}

            {!isMyTurn && (
              <div className="mb-6">
                <p className="text-xs text-[#4a3820] mb-2 tracking-widest uppercase">Réactions</p>
                <div className="flex gap-2 flex-wrap">
                  {["😂", "👀", "🤔", "😱", "🔥", "👏", "💀", "🫡"].map(emoji => (
                    <button key={emoji} onClick={() => sendEmoji(emoji)}
                      className="text-xl p-2 rounded-sm hover:scale-125 transition-transform"
                      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            )}

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

        {/* PHASE DE VOTE */}
        {isPlaying && isVotingPhase && !isGameOver && (
          <div>
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

            <p className="text-xs tracking-[0.2em] uppercase text-[#4a3820] mb-3">🕵️ Qui est l'Undercover ?</p>
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
                        {votingAgainstMe.map(v => <span key={v.id} className="text-sm">{v.avatar}</span>)}
                      </div>
                    )}
                    {p.vote_locked && <span className="text-xs text-[#6abf6a]">✓</span>}
                  </div>
                );
              })}
            </div>

            {mrWhiteInGame && (
              <>
                <p className="text-xs tracking-[0.2em] uppercase text-[#4a3820] mb-3">👻 Qui est le Mr. White ?</p>
                <div className="flex flex-col gap-2 mb-6">
                  {alivePlayers.map(p => {
                    const votingMrWhite = alivePlayers.filter(other => other.voted_for_mrwhite === p.id);
                    return (
                      <div key={p.id}
                        onClick={() => !myPlayer?.vote_locked && p.id !== myPlayer?.id && handleVoteMrWhite(p.id)}
                        className="flex items-center gap-3 px-4 py-3 rounded-sm transition-all"
                        style={{
                          background: votedForMrWhite === p.id ? "rgba(200,160,48,0.1)" : "rgba(255,255,255,0.02)",
                          border: votedForMrWhite === p.id ? "1px solid rgba(200,160,48,0.3)" : "1px solid rgba(255,255,255,0.05)",
                          cursor: p.id !== myPlayer?.id && !myPlayer?.vote_locked ? "pointer" : "default",
                          opacity: p.id === myPlayer?.id ? 0.5 : 1,
                        }}>
                        <span className="text-xl">{p.avatar}</span>
                        <span className="text-sm text-[#c8b888] flex-1">{p.name}</span>
                        {p.id === myPlayer?.id && <span className="text-xs text-[#4a3820]">toi</span>}
                        {votingMrWhite.length > 0 && (
                          <div className="flex gap-1">
                            {votingMrWhite.map(v => <span key={v.id} className="text-sm">{v.avatar}</span>)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {myPlayer && !myPlayer.vote_locked && (
              <button onClick={lockVote}
                disabled={!votedFor || (mrWhiteInGame && !votedForMrWhite)}
                className="w-full py-4 rounded-sm text-sm font-medium tracking-wide"
                style={{
                  background: (votedFor && (!mrWhiteInGame || votedForMrWhite)) ? "#c8a030" : "#2a1e0e",
                  color: (votedFor && (!mrWhiteInGame || votedForMrWhite)) ? "#1a1208" : "#4a3820",
                  cursor: (votedFor && (!mrWhiteInGame || votedForMrWhite)) ? "pointer" : "not-allowed",
                }}>
                ✓ Valider mes votes
              </button>
            )}
            {myPlayer?.vote_locked && (
              <p className="text-center text-xs text-[#6abf6a] mt-4">✓ Vote verrouillé — en attente des autres...</p>
            )}
          </div>
        )}

        {/* SALLE D'ATTENTE */}
        {isWaiting && !isGameOver && (
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

            {/* {myPlayer && (
              <button onClick={toggleReady}
                className="w-full py-3 rounded-sm text-sm font-medium tracking-wide mb-3 transition-all"
                style={{
                  background: myPlayer.is_ready ? "rgba(100,200,100,0.1)" : "rgba(255,255,255,0.04)",
                  border: myPlayer.is_ready ? "1px solid rgba(100,200,100,0.3)" : "1px solid rgba(255,255,255,0.08)",
                  color: myPlayer.is_ready ? "#6abf6a" : "#c8b888",
                }}>
                {myPlayer.is_ready ? "✓ Je suis prêt·e — Annuler" : "Je suis prêt·e"}
              </button>
            )} */}

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
