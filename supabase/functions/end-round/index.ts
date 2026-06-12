import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const { roomId, mrWhiteGuess } = await req.json();

    if (!roomId) {
      return Response.json({ error: "roomId requis" }, { status: 400 });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: room } = await supabase.from("rooms").select("*").eq("id", roomId).single();
    if (!room) return Response.json({ error: "Salle introuvable" }, { status: 404 });

    const { data: players } = await supabase.from("players").select("*").eq("room_id", roomId);
    if (!players) return Response.json({ error: "Joueurs introuvables" }, { status: 404 });

    const eliminatedPlayer = players.find(p => p.id === room.last_eliminated_id);

    // Trouver le suspect principal depuis les votes cachés
    const cachedVotes = room.cached_votes ?? {};
    let maxVotes = 0;
    let mainSuspectId: string | null = room.last_eliminated_id;
    for (const [id, count] of Object.entries(cachedVotes)) {
      if ((count as number) > maxVotes) {
        maxVotes = count as number;
        mainSuspectId = id;
      }
    }

    const cachedRoles = room.cached_roles ?? {};
    const undercovers = players.filter(p => cachedRoles[p.id] === "undercover");
    const mrWhitePlayer = players.find(p => cachedRoles[p.id] === "mrwhite");
    const civilians = players.filter(p => cachedRoles[p.id] === "civilian");
    const eliminatedRole = eliminatedPlayer ? (cachedRoles[eliminatedPlayer.id] ?? null) : null;
    const undercoverEliminated = eliminatedRole === "undercover";
    const mrWhiteEliminated = eliminatedRole === "mrwhite";

    // Vérifier si Mr. White a deviné
    let mrWhiteGuessedCorrect = false;
    if (mrWhiteEliminated && mrWhiteGuess && room.word_civilian) {
      const guess = mrWhiteGuess.trim().toLowerCase();
      const word = room.word_civilian.trim().toLowerCase();
      const normalize = (s: string) => s.trim().toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      mrWhiteGuessedCorrect = normalize(guess) === normalize(word) || 
        normalize(word).includes(normalize(guess)) || 
        normalize(guess).includes(normalize(word));
    }

    // Calcul des points
    const pointsToAdd: Record<string, number> = {};
    for (const p of players) pointsToAdd[p.id] = 0;

    for (const civil of civilians) {
      if (undercoverEliminated) pointsToAdd[civil.id] = (pointsToAdd[civil.id] || 0) + 150;
      if (mrWhiteEliminated) pointsToAdd[civil.id] = (pointsToAdd[civil.id] || 0) + 100;
    }

    if (undercovers.length === 1) {
      const uc = undercovers[0];
      if (mainSuspectId !== uc.id) pointsToAdd[uc.id] = (pointsToAdd[uc.id] || 0) + 200;
      if (mrWhiteEliminated) pointsToAdd[uc.id] = (pointsToAdd[uc.id] || 0) + 150;
    } else if (undercovers.length === 2) {
      for (const uc of undercovers) {
        if (mainSuspectId === uc.id) continue;
        const otherUcEliminated = undercovers.some(u => u.id !== uc.id && u.id === mainSuspectId);
        pointsToAdd[uc.id] = (pointsToAdd[uc.id] || 0) + (otherUcEliminated ? 100 : 200);
      }
    }

    if (mrWhitePlayer) {
      if (mainSuspectId !== mrWhitePlayer.id) pointsToAdd[mrWhitePlayer.id] = (pointsToAdd[mrWhitePlayer.id] || 0) + 200;
      if (mrWhiteGuessedCorrect) pointsToAdd[mrWhitePlayer.id] = (pointsToAdd[mrWhitePlayer.id] || 0) + 150;
      if (undercoverEliminated) pointsToAdd[mrWhitePlayer.id] = (pointsToAdd[mrWhitePlayer.id] || 0) + 50;
    }

    // Mettre à jour les scores
    for (const p of players) {
      await supabase.from("players").update({ score: (p.score || 0) + (pointsToAdd[p.id] || 0) }).eq("id", p.id);
    }

    // Historique
    const currentRound = room.current_round + 1;
    const nextRound = currentRound + 1;
    const isLastRound = currentRound >= room.total_rounds;

    // Historique
  const roundData = {
    round: currentRound,
    word_civilian: room.word_civilian,
    word_undercover: room.word_undercover,
    eliminated: eliminatedPlayer ? { name: eliminatedPlayer.name, avatar: eliminatedPlayer.avatar, role: eliminatedPlayer.role } : null,
    mr_white_guess: mrWhiteGuess || null,
    mr_white_correct: mrWhiteGuessedCorrect,
    points: pointsToAdd,
    roles: room.cached_roles ?? {},
  };
    const history = [...(room.round_history || []), roundData];

  if (isLastRound) {
    await supabase.from("rooms").update({
      status: "game_over_pending",
      phase: "round_result",
      current_round: currentRound,
      round_history: history,
      word_civilian: null,
      word_undercover: null,
      current_player_index: 0,
      turn_started_at: null,
      last_eliminated_id: room.last_eliminated_id,
      mr_white_guess: mrWhiteGuess || null,
    }).eq("id", roomId);

    await supabase.from("players").update({
      role: null, word: null, is_alive: true,
      words_said: [], word_count: 0,
      voted_for: null, vote_locked: false,
    }).eq("room_id", roomId);

  } else {
    await supabase.from("rooms").update({
      status: "waiting_next_round",
      phase: "round_result",
      current_round: currentRound,
      round_history: history,
      word_civilian: null,
      word_undercover: null,
      current_player_index: 0,
      turn_started_at: null,
      last_eliminated_id: null,
      mr_white_guess: mrWhiteGuess || null,
    }).eq("id", roomId);

    await supabase.from("players").update({
      role: null, word: null, is_alive: true,
      words_said: [], word_count: 0,
      voted_for: null, vote_locked: false,
    }).eq("room_id", roomId);
  }

    return Response.json({ success: true, points: pointsToAdd, mrWhiteGuessedCorrect, roundData }, {
      headers: { "Access-Control-Allow-Origin": "*" },
    });

  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
});
