"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";

type Player = {
  id: string;
  user_id: string;
  name: string;
  avatar: string;
  score: number;
  has_guessed: boolean;
  guess_rank: number | null;
  status: string;
};

type Room = {
  id: string;
  host_id: string;
  host_name: string;
  status: string;
  current_word: string | null;
  current_drawer_index: number;
  turn_started_at: string | null;
  round_duration: number;
  total_rounds: number;
  current_round: number;
  round_history: any[];
};

type DrawEvent = {
  type: "draw" | "clear";
  x?: number;
  y?: number;
  px?: number;
  py?: number;
  color?: string;
  size?: number;
};

const WORDS = [
  "Chat", "Chien", "Maison", "Voiture", "Arbre", "Soleil", "Lune", "Étoile",
  "Pizza", "Gâteau", "Bateau", "Avion", "Train", "Vélo", "Téléphone", "Ordinateur",
  "Guitare", "Piano", "Ballon", "Chapeau", "Lunettes", "Parapluie", "Cactus", "Flamant",
  "Requin", "Éléphant", "Girafe", "Pingouin", "Dragon", "Licorne", "Robot", "Fantôme",
  "Château", "Phare", "Igloo", "Pyramide", "Volcan", "Arc-en-ciel", "Tornade", "Tsunami",
  "Superman", "Pirate", "Ninja", "Astronaute", "Sorcière", "Vampire", "Zombie", "Fée",
  "Hamburger", "Sushi", "Croissant", "Baguette", "Fondue", "Tacos", "Ramen", "Crêpe",
  "Skateboard", "Surf", "Ski", "Parachute", "Plongée", "Escalade", "Boxe", "Yoga",
  "Bibliothèque", "Cinéma", "Cirque", "Zoo", "Musée", "Stade", "Hôpital", "Prison",
  "Ciseaux", "Marteau", "Clé", "Serrure", "Bougie", "Lampe", "Miroir", "Réveil",
  "Nuage", "Orage", "Neige", "Désert", "Jungle", "Grotte", "Cascade", "Iceberg",
  "Trampoline", "Toboggan", "Balançoire", "Manège", "Feu d'artifice", "Confettis",
  "Jumelles", "Télescope", "Microscope", "Boussole", "Sablier", "Thermomètre",
  "Fusée", "Sous-marin", "Montgolfière", "Hélicoptère", "Tracteur", "Ambulance",
];

const COLORS = ["#e8dcc8", "#c87050", "#6abf6a", "#c8a030", "#6090c8", "#c860c8", "#60c8c8", "#1a1208"];
const SIZES = [3, 6, 12, 20];

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

export default function GarticGame() {
  const params = useParams();
  const router = useRouter();
  const code = (params.code as string).toUpperCase();

  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [myPlayer, setMyPlayer] = useState<Player | null>(null);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [guessInput, setGuessInput] = useState("");
  const [messages, setMessages] = useState<{ name: string; text: string; correct?: boolean }[]>([]);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [selectedColor, setSelectedColor] = useState("#e8dcc8");
  const [selectedSize, setSelectedSize] = useState(6);
  const [isEraser, setIsEraser] = useState(false);
  const [wordChoices, setWordChoices] = useState<string[]>([]);
  const [settings, setSettings] = useState({ total_rounds: 3, round_duration: 80 });
  const [wasKicked, setWasKicked] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<any>(null);

  const fetchRoom = useCallback(async () => {
    const { data } = await supabase.from("gartic_rooms").select("*").eq("id", code).single();
    if (data) {
      setRoom(data);
      setSettings({ total_rounds: data.total_rounds, round_duration: data.round_duration });
    }
  }, [code]);

  const fetchPlayers = useCallback(async () => {
    const { data } = await supabase.from("gartic_players").select("*").eq("room_id", code).order("created_at");
    if (data) setPlayers(data);
  }, [code]);

  // Init
  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }
      const u = session.user;
      setUser(u);

      const { data: roomData } = await supabase.from("gartic_rooms").select("*").eq("id", code).single();
      if (!roomData) { setError("Salle introuvable."); setLoading(false); return; }

      const { data: existing } = await supabase.from("gartic_players")
        .select("*").eq("room_id", code).eq("user_id", u.id).single();

      if (existing) {
        setMyPlayer(existing);
      } else {
        const { data: profile } = await supabase.from("profiles").select("username").eq("id", u.id).single();
        const name = profile?.username ?? u.user_metadata?.full_name ?? u.user_metadata?.name ?? "Joueur";
        const { data: newP } = await supabase.from("gartic_players")
          .insert({ room_id: code, user_id: u.id, name, status: "waiting" })
          .select().single();
        if (newP) setMyPlayer(newP);
      }

      await fetchRoom();
      await fetchPlayers();
      setLoading(false);
    }
    init();
  }, [code, router, fetchRoom, fetchPlayers]);

  // Realtime
  useEffect(() => {
    const ch = supabase.channel(`gartic-${code}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "gartic_rooms", filter: `id=eq.${code}` }, fetchRoom)
      .on("postgres_changes", { event: "*", schema: "public", table: "gartic_players", filter: `room_id=eq.${code}` }, fetchPlayers)
      .on("broadcast", { event: "draw" }, ({ payload }) => {
        if (payload.userId === user?.id) return;
        applyDrawEvent(payload as DrawEvent);
      })
      .on("broadcast", { event: "chat" }, ({ payload }) => {
        setMessages(prev => [...prev, payload]);
      })
      .subscribe();

    channelRef.current = ch;
    return () => { supabase.removeChannel(ch); };
  }, [code, fetchRoom, fetchPlayers, user?.id]);

  // Sync myPlayer
  useEffect(() => {
    if (myPlayer && players.length > 0) {
      const updated = players.find(p => p.id === myPlayer.id);
      if (updated) setMyPlayer(updated);
      else if (room?.status === "waiting") {
        setWasKicked(true);
        setTimeout(() => router.push("/gartic"), 3000);
      }
    }
  }, [players]);

  // Timer
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!room?.turn_started_at || room?.status !== "playing") return;

    const update = () => {
      const elapsed = (Date.now() - new Date(room.turn_started_at! + "Z").getTime()) / 1000;
      const remaining = Math.max(0, (room.round_duration ?? 80) - elapsed);
      setTimeLeft(Math.ceil(remaining));
      if (remaining <= 0 && isHost && room.status === "playing") {
        clearInterval(timerRef.current!);
        endTurn();
      }
    };
    update();
    timerRef.current = setInterval(update, 500);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [room?.turn_started_at, room?.status]);

  // Clear canvas on new turn
  useEffect(() => {
    if (room?.status === "playing") {
      clearCanvas();
    }
  }, [room?.current_drawer_index, room?.current_round]);

  // Scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Cleanup on leave
  useEffect(() => {
    const handleUnload = () => {
      if (myPlayer && room?.status === "waiting") {
        supabase.from("gartic_players").delete().eq("id", myPlayer.id);
      }
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => {
      window.removeEventListener("beforeunload", handleUnload);
      if (myPlayer && room?.status === "waiting") {
        supabase.from("gartic_players").delete().eq("id", myPlayer.id);
      }
    };
  }, [myPlayer?.id, room?.status]);

  // ---- CANVAS ----
  function getPos(e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ("touches" in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  function applyDrawEvent(ev: DrawEvent) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (ev.type === "clear") {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    if (ev.type === "draw" && ev.x !== undefined && ev.y !== undefined) {
      ctx.beginPath();
      ctx.strokeStyle = ev.color ?? "#e8dcc8";
      ctx.lineWidth = ev.size ?? 6;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      if (ev.px !== undefined && ev.py !== undefined) {
        ctx.moveTo(ev.px, ev.py);
        ctx.lineTo(ev.x, ev.y);
      } else {
        ctx.arc(ev.x, ev.y, (ev.size ?? 6) / 2, 0, Math.PI * 2);
        ctx.fillStyle = ev.color ?? "#e8dcc8";
        ctx.fill();
      }
      ctx.stroke();
    }
  }

  function broadcastDraw(ev: DrawEvent) {
    channelRef.current?.send({
      type: "broadcast",
      event: "draw",
      payload: { ...ev, userId: user?.id },
    });
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
  }

  function handleClear() {
    clearCanvas();
    broadcastDraw({ type: "clear" });
  }

  function onPointerDown(e: React.MouseEvent | React.TouchEvent) {
    if (!isDrawer) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    isDrawing.current = true;
    const pos = getPos(e, canvas);
    lastPos.current = pos;
    const color = isEraser ? "#0c3a16" : selectedColor;
    applyDrawEvent({ type: "draw", x: pos.x, y: pos.y, color, size: selectedSize });
    broadcastDraw({ type: "draw", x: pos.x, y: pos.y, color, size: selectedSize });
  }

  function onPointerMove(e: React.MouseEvent | React.TouchEvent) {
    if (!isDrawer || !isDrawing.current || !lastPos.current) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pos = getPos(e, canvas);
    const color = isEraser ? "#0c3a16" : selectedColor;
    applyDrawEvent({ type: "draw", x: pos.x, y: pos.y, px: lastPos.current.x, py: lastPos.current.y, color, size: selectedSize });
    broadcastDraw({ type: "draw", x: pos.x, y: pos.y, px: lastPos.current.x, py: lastPos.current.y, color, size: selectedSize });
    lastPos.current = pos;
  }

  function onPointerUp() {
    isDrawing.current = false;
    lastPos.current = null;
  }

  // ---- GAME LOGIC ----
  const isHost = user?.id === room?.host_id;
  const drawer = players[room?.current_drawer_index ?? 0];
  const isDrawer = drawer?.user_id === user?.id;
  const isWaiting = room?.status === "waiting";
  const isPlaying = room?.status === "playing";
  const isChoosingWord = room?.status === "choosing_word";
  const isRoundEnd = room?.status === "round_end";
  const isGameOver = room?.status === "game_over";
  const sortedByScore = [...players].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  async function updateSettings(key: string, value: number) {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    await supabase.from("gartic_rooms").update(updated).eq("id", code);
  }

  async function startGame() {
    if (players.length < 2) { setError("Il faut au moins 2 joueurs."); return; }
    setError("");
    // Reset scores
    await supabase.from("gartic_players").update({ score: 0, has_guessed: false, guess_rank: null }).eq("room_id", code);
    await pickWordChoices(0, 0);
  }

  async function pickWordChoices(drawerIndex: number, round: number) {
    const shuffled = [...WORDS].sort(() => Math.random() - 0.5).slice(0, 3);
    setWordChoices(shuffled);
    await supabase.from("gartic_rooms").update({
      status: "choosing_word",
      current_drawer_index: drawerIndex,
      current_round: round,
      current_word: null,
      turn_started_at: null,
    }).eq("id", code);
  }

  async function chooseWord(word: string) {
    setWordChoices([]);
    await supabase.from("gartic_players").update({ has_guessed: false, guess_rank: null }).eq("room_id", code);
    await supabase.from("gartic_rooms").update({
      status: "playing",
      current_word: word,
      turn_started_at: new Date().toISOString(),
    }).eq("id", code);
  }

  async function endTurn() {
    const currentRoom = room;
    if (!currentRoom) return;

    // Sauvegarder dans l'historique
    const historyEntry = {
      round: currentRoom.current_round + 1,
      word: currentRoom.current_word,
      drawer: drawer?.name,
    };

    const nextDrawerIndex = (currentRoom.current_drawer_index + 1) % players.length;
    const isLastDrawer = nextDrawerIndex === 0;
    const nextRound = isLastDrawer ? currentRoom.current_round + 1 : currentRoom.current_round;
    const isGameDone = isLastDrawer && nextRound >= currentRoom.total_rounds;

    await supabase.from("gartic_rooms").update({
      status: isGameDone ? "game_over" : "round_end",
      round_history: [...(currentRoom.round_history ?? []), historyEntry],
    }).eq("id", code);

    if (!isGameDone) {
      setTimeout(async () => {
        await supabase.from("gartic_players").update({ has_guessed: false, guess_rank: null }).eq("room_id", code);
        await pickWordChoices(nextDrawerIndex, nextRound);
      }, 4000);
    }
  }

  async function handleGuess() {
    const guess = guessInput.trim();
    if (!guess || !room?.current_word || myPlayer?.has_guessed || isDrawer) return;
    setGuessInput("");

    const isCorrect = guess.toLowerCase() === room.current_word.toLowerCase();

    // Broadcast le message
    channelRef.current?.send({
      type: "broadcast",
      event: "chat",
      payload: { name: myPlayer?.name, text: isCorrect ? `✓ ${guess}` : guess, correct: isCorrect },
    });
    setMessages(prev => [...prev, { name: myPlayer?.name ?? "?", text: isCorrect ? `✓ ${guess}` : guess, correct: isCorrect }]);

    if (isCorrect) {
      const guessedCount = players.filter(p => p.has_guessed && p.user_id !== user?.id).length;
      const rank = guessedCount + 1;
      const pointsMap: Record<number, number> = { 1: 100, 2: 80, 3: 60, 4: 50 };
      const points = pointsMap[rank] ?? 40;

      await supabase.from("gartic_players").update({
        has_guessed: true,
        guess_rank: rank,
        score: (myPlayer?.score ?? 0) + points,
      }).eq("id", myPlayer?.id);

      // Bonus dessinateur
      const drawerPlayer = players.find(p => p.user_id === (drawer?.user_id));
      if (drawerPlayer) {
        await supabase.from("gartic_players").update({
          score: (drawerPlayer.score ?? 0) + 20,
        }).eq("id", drawerPlayer.id);
      }

      // Si tout le monde a deviné
      const allGuessed = players.filter(p => p.user_id !== drawer?.user_id).every(p => p.has_guessed || p.id === myPlayer?.id);
      if (allGuessed && isHost) {
        setTimeout(() => endTurn(), 1500);
      }
    }
  }

  async function handleNewGame() {
    await supabase.from("gartic_players").update({ score: 0, has_guessed: false, guess_rank: null }).eq("room_id", code);
    await supabase.from("gartic_rooms").update({
      status: "waiting", current_word: null, current_drawer_index: 0,
      current_round: 0, turn_started_at: null, round_history: [],
    }).eq("id", code);
  }

  // Masquer le mot pour les non-dessinateurs
  function maskedWord(word: string) {
    return word.split("").map(c => c === " " ? "  " : "_").join(" ");
  }

  if (loading) return (
    <div className="min-h-screen bg-[#1a1208] flex items-center justify-center">
      <p className="text-[#4a3820] text-sm tracking-widest animate-pulse">Connexion...</p>
    </div>
  );

  if (error && !room) return (
    <div className="min-h-screen bg-[#1a1208] flex flex-col items-center justify-center gap-4">
      <p className="text-[#c87050] text-sm">{error}</p>
      <button onClick={() => router.push("/gartic")} className="text-xs text-[#4a3820] hover:text-[#c8a030]">← Retour</button>
    </div>
  );

  return (
    <main className="min-h-screen bg-[#1a1208] text-[#e8dcc8] font-sans">
      {wasKicked && (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 px-6">
          <div className="w-full max-w-sm p-6 rounded-sm text-center" style={{ background: "#1a1208", border: "1px solid rgba(200,80,40,0.4)" }}>
            <div className="text-4xl mb-4">🚪</div>
            <h2 className="text-xl text-[#f0e0b0] mb-2" style={{ fontFamily: "Georgia, serif", fontWeight: 400 }}>Tu as été exclu·e</h2>
            <p className="text-sm text-[#6a5838]">L'hôte t'a retiré de la salle.</p>
            <p className="text-xs text-[#4a3820] mt-3">Redirection dans 3 secondes...</p>
          </div>
        </div>
      )}

      <div className="max-w-lg mx-auto px-4 py-6">

        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <button onClick={async () => {
            if (myPlayer && room?.status === "waiting") {
              await supabase.from("gartic_players").delete().eq("id", myPlayer.id);
            }
            router.push("/gartic");
          }} className="text-xs text-[#4a3820] hover:text-[#c8a030] tracking-widest uppercase transition-colors">← Quitter</button>
          <p className="text-sm font-mono text-[#c8a030] tracking-[0.3em]">{code}</p>
          {isPlaying ? (
            <div className="text-right">
              <p className="text-xs text-[#4a3820]">Manche</p>
              <p className="text-sm text-[#c8b888] font-mono">{(room?.current_round ?? 0) + 1}/{room?.total_rounds}</p>
            </div>
          ) : <div className="w-16" />}
        </div>

        {/* GAME OVER */}
        {isGameOver && (
          <div>
            <div className="text-center mb-8">
              <div className="text-5xl mb-4">🏆</div>
              <h2 className="text-2xl text-[#f0e0b0] mb-2" style={{ fontFamily: "Georgia, serif", fontWeight: 400 }}>Fin de partie !</h2>
            </div>

            <p className="text-xs tracking-[0.2em] uppercase text-[#4a3820] mb-6 text-center">Classement final</p>

            {sortedByScore.length >= 3 && (
              <div className="flex items-end justify-center gap-3 mb-8">
                <div className="flex flex-col items-center flex-1">
                  <span className="text-2xl mb-1">🎨</span>
                  <p className="text-xs text-[#c8b888] mb-1 text-center truncate w-full px-1">{sortedByScore[1]?.name}</p>
                  <p className="text-xs text-[#c8a030] mb-2">{sortedByScore[1]?.score} pts</p>
                  <div className="w-full rounded-t-sm flex items-center justify-center py-4" style={{ background: "rgba(180,180,180,0.15)", border: "1px solid rgba(180,180,180,0.3)", minHeight: "60px" }}>
                    <span className="text-2xl">🥈</span>
                  </div>
                </div>
                <div className="flex flex-col items-center flex-1">
                  <span className="text-3xl mb-1">🎨</span>
                  <p className="text-xs text-[#c8b888] mb-1 text-center truncate w-full px-1 font-medium">{sortedByScore[0]?.name}</p>
                  <p className="text-xs text-[#c8a030] mb-2 font-medium">{sortedByScore[0]?.score} pts</p>
                  <div className="w-full rounded-t-sm flex items-center justify-center py-6" style={{ background: "rgba(200,160,48,0.2)", border: "1px solid rgba(200,160,48,0.4)", minHeight: "80px" }}>
                    <span className="text-2xl">🥇</span>
                  </div>
                </div>
                <div className="flex flex-col items-center flex-1">
                  <span className="text-2xl mb-1">🎨</span>
                  <p className="text-xs text-[#c8b888] mb-1 text-center truncate w-full px-1">{sortedByScore[2]?.name}</p>
                  <p className="text-xs text-[#c8a030] mb-2">{sortedByScore[2]?.score} pts</p>
                  <div className="w-full rounded-t-sm flex items-center justify-center py-3" style={{ background: "rgba(150,100,50,0.15)", border: "1px solid rgba(150,100,50,0.3)", minHeight: "45px" }}>
                    <span className="text-2xl">🥉</span>
                  </div>
                </div>
              </div>
            )}

            {sortedByScore.length > 3 && (
              <div className="flex flex-col gap-2 mb-8">
                {sortedByScore.slice(3).map((p, i) => (
                  <div key={p.id} className="flex items-center gap-3 px-4 py-3 rounded-sm" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                    <span className="text-sm w-4 text-[#4a3820]">{i + 4}.</span>
                    <span className="text-sm text-[#c8b888] flex-1">{p.name}</span>
                    <span className="text-sm font-mono text-[#c8a030]">{p.score} pts</span>
                  </div>
                ))}
              </div>
            )}

            {isHost && (
              <button onClick={handleNewGame} className="w-full py-4 rounded-sm text-sm font-medium" style={{ background: "#c8a030", color: "#1a1208" }}>
                Nouvelle partie
              </button>
            )}
            {!isHost && <p className="text-center text-xs text-[#4a3820] animate-pulse">En attente de l'hôte...</p>}
          </div>
        )}

        {/* RÉSULTAT DE TOUR */}
        {isRoundEnd && (
          <div className="text-center py-12">
            <div className="text-4xl mb-4">🎨</div>
            <p className="text-sm text-[#6a5838] mb-2">Le mot était</p>
            <p className="text-2xl text-[#f0e0b0] mb-6" style={{ fontFamily: "Georgia, serif" }}>{room?.current_word}</p>
            <div className="flex flex-col gap-2 mb-6">
              {sortedByScore.map((p, i) => (
                <div key={p.id} className="flex items-center gap-3 px-4 py-3 rounded-sm" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                  <span className="text-sm w-4 text-[#4a3820]">{i + 1}.</span>
                  <span className="text-sm text-[#c8b888] flex-1">{p.name}</span>
                  <span className="text-sm font-mono text-[#c8a030]">{p.score} pts</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-[#4a3820] animate-pulse">Prochain tour dans quelques secondes...</p>
          </div>
        )}

        {/* CHOIX DU MOT */}
        {isChoosingWord && (
          <div className="text-center py-12">
            {isDrawer ? (
              <>
                <div className="text-4xl mb-4">✏️</div>
                <p className="text-sm text-[#c8b888] mb-6">Choisis un mot à dessiner</p>
                <div className="flex flex-col gap-3">
                  {wordChoices.map(w => (
                    <button key={w} onClick={() => chooseWord(w)}
                      className="w-full py-4 rounded-sm text-sm font-medium tracking-wide transition-all"
                      style={{ background: "rgba(200,160,48,0.08)", color: "#f0e0b0", border: "1px solid rgba(200,160,48,0.2)" }}>
                      {w}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="text-4xl mb-4 animate-pulse">✏️</div>
                <p className="text-sm text-[#6a5838]">{drawer?.name} choisit un mot...</p>
              </>
            )}
          </div>
        )}

        {/* JEU EN COURS */}
        {isPlaying && (
          <div>
            {/* Mot / timer */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex-1 text-center">
                {isDrawer ? (
                  <p className="text-lg text-[#f0e0b0] font-medium" style={{ fontFamily: "Georgia, serif" }}>{room?.current_word}</p>
                ) : myPlayer?.has_guessed ? (
                  <p className="text-lg text-[#6abf6a] font-medium" style={{ fontFamily: "Georgia, serif" }}>✓ {room?.current_word}</p>
                ) : (
                  <p className="text-lg text-[#c8b888] tracking-widest font-mono">{room?.current_word ? maskedWord(room.current_word) : ""}</p>
                )}
                <p className="text-xs text-[#4a3820] mt-1">
                  {isDrawer ? "Tu dessines" : `${drawer?.name} dessine`}
                </p>
              </div>
              {timeLeft !== null && (
                <div className="text-right ml-4">
                  <p className={`text-2xl font-mono font-bold ${timeLeft <= 10 ? "text-[#c87050]" : "text-[#c8a030]"}`}>{timeLeft}s</p>
                </div>
              )}
            </div>

            {/* Barre timer */}
            {timeLeft !== null && room?.round_duration && (
              <div className="h-1 rounded-full overflow-hidden mb-4" style={{ background: "rgba(255,255,255,0.06)" }}>
                <div className="h-full rounded-full transition-all" style={{
                  width: `${(timeLeft / room.round_duration) * 100}%`,
                  background: timeLeft <= 10 ? "#c87050" : "#c8a030",
                }} />
              </div>
            )}

            {/* Canvas */}
            <div className="relative mb-3 rounded-sm overflow-hidden" style={{ border: "1px solid rgba(200,160,48,0.2)" }}>
              <canvas
                ref={canvasRef}
                width={600}
                height={400}
                className="w-full block"
                style={{ background: "#0c3a16", cursor: isDrawer ? (isEraser ? "cell" : "crosshair") : "default", touchAction: "none" }}
                onMouseDown={onPointerDown}
                onMouseMove={onPointerMove}
                onMouseUp={onPointerUp}
                onMouseLeave={onPointerUp}
                onTouchStart={onPointerDown}
                onTouchMove={onPointerMove}
                onTouchEnd={onPointerUp}
              />
            </div>

            {/* Outils dessinateur */}
            {isDrawer && (
              <div className="mb-3 p-3 rounded-sm" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                {/* Couleurs */}
                <div className="flex gap-2 flex-wrap mb-3">
                  {COLORS.map(c => (
                    <button key={c} onClick={() => { setSelectedColor(c); setIsEraser(false); }}
                      className="w-7 h-7 rounded-sm transition-all"
                      style={{
                        background: c,
                        border: selectedColor === c && !isEraser ? "2px solid #c8a030" : "2px solid transparent",
                        transform: selectedColor === c && !isEraser ? "scale(1.2)" : "scale(1)",
                      }} />
                  ))}
                  <button onClick={() => setIsEraser(!isEraser)}
                    className="px-2 h-7 rounded-sm text-xs transition-all"
                    style={{
                      background: isEraser ? "rgba(200,160,48,0.2)" : "rgba(255,255,255,0.06)",
                      border: isEraser ? "2px solid #c8a030" : "2px solid transparent",
                      color: "#c8b888",
                    }}>
                    ✏️ Gomme
                  </button>
                </div>
                {/* Tailles */}
                <div className="flex gap-2 items-center">
                  {SIZES.map(s => (
                    <button key={s} onClick={() => setSelectedSize(s)}
                      className="flex items-center justify-center rounded-full transition-all"
                      style={{
                        width: 28, height: 28,
                        background: selectedSize === s ? "rgba(200,160,48,0.15)" : "rgba(255,255,255,0.04)",
                        border: selectedSize === s ? "1px solid rgba(200,160,48,0.4)" : "1px solid rgba(255,255,255,0.08)",
                      }}>
                      <div className="rounded-full" style={{ width: Math.min(s, 16), height: Math.min(s, 16), background: "#c8b888" }} />
                    </button>
                  ))}
                  <button onClick={handleClear}
                    className="ml-auto px-3 py-1 rounded-sm text-xs"
                    style={{ background: "rgba(200,80,40,0.15)", color: "#c87050", border: "1px solid rgba(200,80,40,0.2)" }}>
                    Tout effacer
                  </button>
                </div>
              </div>
            )}

            {/* Joueurs + scores */}
            <div className="flex gap-2 flex-wrap mb-3">
              {players.map(p => (
                <div key={p.id} className="flex items-center gap-1.5 px-2 py-1 rounded-sm"
                  style={{
                    background: p.has_guessed ? "rgba(100,200,100,0.08)" : "rgba(255,255,255,0.02)",
                    border: `1px solid ${p.has_guessed ? "rgba(100,200,100,0.2)" : drawer?.id === p.id ? "rgba(200,160,48,0.2)" : "rgba(255,255,255,0.05)"}`,
                  }}>
                  <span className="text-xs text-[#c8b888]">{p.name.split(" ")[0]}</span>
                  {drawer?.id === p.id && <span className="text-xs">✏️</span>}
                  {p.has_guessed && <span className="text-xs text-[#6abf6a]">✓</span>}
                  <span className="text-xs font-mono text-[#c8a030]">{p.score}</span>
                </div>
              ))}
            </div>

            {/* Chat / devinettes */}
            <div className="rounded-sm overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.05)" }}>
              <div className="p-3 flex flex-col gap-1.5 overflow-y-auto" style={{ height: 140, background: "rgba(255,255,255,0.01)" }}>
                {messages.length === 0 && (
                  <p className="text-xs text-[#3a2810] text-center mt-4">Les propositions apparaissent ici...</p>
                )}
                {messages.map((m, i) => (
                  <div key={i} className="flex gap-2 items-baseline">
                    <span className="text-xs font-medium flex-shrink-0" style={{ color: m.correct ? "#6abf6a" : "#c8a030" }}>{m.name}</span>
                    <span className="text-xs" style={{ color: m.correct ? "#6abf6a" : "#c8b888" }}>{m.text}</span>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
              {!isDrawer && !myPlayer?.has_guessed && (
                <div className="flex gap-2 p-2" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                  <input
                    type="text"
                    value={guessInput}
                    onChange={e => setGuessInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleGuess()}
                    placeholder="Ta réponse..."
                    maxLength={50}
                    className="flex-1 px-3 py-2 rounded-sm text-xs text-[#e8dcc8] placeholder-[#3a2810] outline-none"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                    autoComplete="off"
                  />
                  <button onClick={handleGuess} disabled={!guessInput.trim()}
                    className="px-3 py-2 rounded-sm text-xs font-medium"
                    style={{ background: guessInput.trim() ? "#c8a030" : "#2a1e0e", color: guessInput.trim() ? "#1a1208" : "#4a3820" }}>
                    →
                  </button>
                </div>
              )}
              {myPlayer?.has_guessed && (
                <p className="text-center text-xs text-[#6abf6a] p-2">✓ Bien deviné ! En attente des autres...</p>
              )}
              {isDrawer && (
                <p className="text-center text-xs text-[#4a3820] p-2">Tu dessines — les propositions apparaissent ici</p>
              )}
            </div>
          </div>
        )}

        {/* SALLE D'ATTENTE */}
        {isWaiting && (
          <div>
            {isHost && (
              <div className="mb-6 p-4 rounded-sm" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                <p className="text-xs tracking-[0.2em] uppercase text-[#4a3820] mb-3">⚙️ Paramètres</p>
                <SettingRow label="Manches" desc="Tours de dessin par joueur">
                  <NumericInput value={settings.total_rounds} min={1} max={10} onChange={v => updateSettings("total_rounds", v)} />
                </SettingRow>
                <SettingRow label="Durée" desc="Secondes pour deviner">
                  <NumericInput value={settings.round_duration} min={30} max={180} onChange={v => updateSettings("round_duration", v)} />
                </SettingRow>
              </div>
            )}

            {!isHost && room && (
              <div className="mb-6 flex gap-2 flex-wrap">
                {[`${room.total_rounds} manches`, `${room.round_duration}s/tour`].map((tag, i) => (
                  <span key={i} className="text-xs text-[#4a3820] px-2 py-1 rounded-sm" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>{tag}</span>
                ))}
              </div>
            )}

            <div className="flex justify-between items-center mb-3">
              <p className="text-xs tracking-[0.2em] uppercase text-[#4a3820]">Joueurs ({players.length}/8)</p>
            </div>

            <div className="flex flex-col gap-2 mb-6">
              {players.map(p => (
                <div key={p.id} className="flex items-center gap-3 px-4 py-3 rounded-sm"
                  style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                  <span className="text-sm text-[#c8b888] flex-1">{p.name}</span>
                  {p.user_id === room?.host_id && <span className="text-xs text-[#4a3820]">hôte</span>}
                  {isHost && p.user_id !== room?.host_id && (
                    <button onClick={async () => { await supabase.from("gartic_players").delete().eq("id", p.id); }}
                      className="text-xs text-[#4a3820] hover:text-[#c87050] transition-colors">✕</button>
                  )}
                </div>
              ))}
            </div>

            {error && <p className="text-xs text-[#c87050] mb-4 text-center">{error}</p>}

            {isHost ? (
              <button onClick={startGame}
                className="w-full py-4 rounded-sm text-sm font-medium tracking-wide"
                style={{
                  background: players.length >= 2 ? "#c8a030" : "#2a1e0e",
                  color: players.length >= 2 ? "#1a1208" : "#4a3820",
                  cursor: players.length >= 2 ? "pointer" : "not-allowed",
                }}>
                {players.length < 2 ? `Attente des joueurs... (${players.length}/2)` : "Lancer la partie 🎨"}
              </button>
            ) : (
              <p className="text-center text-xs text-[#4a3820] animate-pulse">En attente que l'hôte lance...</p>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
