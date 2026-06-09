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

    // Récupérer la salle
    const { data: room } = await supabase
      .from("rooms")
      .select("*")
      .eq("id", roomId)
      .single();

    if (!room) return Response.json({ error: "Salle introuvable" }, { status: 404 });

    // Récupérer tous les joueurs
    const { data: players } = await supabase
      .from("players")
      .select("*")
      .eq("room_id", roomId);

    if (!players) return Response.json({ error: "Joueurs introuvables" }, { status: 404 });

    const alivePlayers = players.filter(p => p.is_alive);
    const eliminatedPlayer = players.find(p => p.id === room.last_eliminated_id);

    // Calculer les votes
    const voteCounts: Record<string, number> = {};
    for (const p of alivePlayers) {
      if (p.voted_for) {
        voteCounts[p.voted_for] = (voteCounts[p.voted_for] || 0) + 1;
      }
    }

    // Trouver le suspect principal (le plus voté)
    let maxVotes = 0;
    let mainSuspectId: string | null = room.last_eliminated_id;
    for (const [id, count] of Object.entries(voteCounts)) {
      if (count > maxVotes) {
        maxVotes = count;
        mainSuspectId = id;
      }
    }

    const undercovers = players.filter(p => p.role === "undercover");
    const mrWhite = players.find(p => p.role === "mrwhite");
    const civilians = players.filter(p => p.role === "civilian");

    const eliminatedRole = eliminatedPlayer?.role ?? null;
    const undercoverEliminated = eliminatedRole === "undercover";
    const mrWhiteEliminated = eliminatedRole === "mrwhite";

    // Vérifier si le Mr. White a deviné le bon mot
    let mrWhiteGuessedCorrect = false;
    if (mrWhiteEliminated && mrWhiteGuess && room.word_civilian) {
      const guess = mrWhiteGuess.trim().toLowerCase();
      const word = room.word_civilian.trim().toLowerCase();
      mrWhiteGuessedCorrect = guess === word || word.includes(guess) || guess.includes(word);
    }

    // === CALCUL DES POINTS ===
    const pointsToAdd: Record<string, number> = {};
    for (const p of players) pointsToAdd[p.id] = 0;

    // Civils
    for (const civil of civilians) {
      if (undercoverEliminated) pointsToAdd[civil.id] = (pointsToAdd[civil.id] || 0) + 100;
      if (mrWhiteEliminated) pointsToAdd[civil.id] = (pointsToAdd[civil.id] || 0) + 100;
    }

    // Undercovers
    if (undercovers.length === 1) {
      const uc = undercovers[0];
      if (mainSuspectId !== uc.id) {
        pointsToAdd[uc.id] = (pointsToAdd[uc.id] || 0) + 200;
      }
      if (mrWhiteEliminated) {
        pointsToAdd[uc.id] = (pointsToAdd[uc.id] || 0) + 100;
      }
    } else if (undercovers.length === 2) {
      for (const uc of undercovers) {
        if (mainSuspectId === uc.id) continue; // celui qui s'est fait attraper
        const otherUcEliminated = undercovers.some(u => u.id !== uc.id && u.id === mainSuspectId);
        if (!otherUcEliminated) {
          pointsToAdd[uc.id] = (pointsToAdd[uc.id] || 0) + 200;
        } else {
          pointsToAdd[uc.id] = (pointsToAdd[uc.id] || 0) + 100;
        }
      }
    }

    // Mr. White
    if (mrWhite) {
      if (mainSuspectId !== mrWhite.id) {
        pointsToAdd[mrWhite.id] = (pointsToAdd[mrWhite.id] || 0) + 250;
      }
      if (mrWhiteGuessedCorrect) {
        pointsToAdd[mrWhite.id] = (pointsToAdd[mrWhite.id] || 0) + 100;
      }
      if (undercoverEliminated) {
        pointsToAdd[mrWhite.id] = (pointsToAdd[mrWhite.id] || 0) + 100;
      }
    }

    // Mettre à jour les scores
    for (const p of players) {
      const newScore = (p.score || 0) + (pointsToAdd[p.id] || 0);
      await supabase.from("players").update({ score: newScore }).eq("id", p.id);
    }

    // Sauvegarder l'historique de la manche
    const roundData = {
      round: room.current_round,
      word_civilian: room.word_civilian,
      word_undercover: room.word_undercover,
      eliminated: eliminatedPlayer ? { name: eliminatedPlayer.name, avatar: eliminatedPlayer.avatar, role: eliminatedPlayer.role } : null,
      mr_white_guess: mrWhiteGuess || null,
      mr_white_correct: mrWhiteGuessedCorrect,
      points: pointsToAdd,
    };

    const history = [...(room.round_history || []), roundData];

    // Vérifier si la partie est terminée
    const isLastRound = room.current_round >= room.total_rounds;
    const remainingUndercover = alivePlayers.find(p => p.role === "undercover" && p.id !== eliminatedPlayer?.id);
    const remainingCivilians = alivePlayers.filter(p => p.role === "civilian" && p.id !== eliminatedPlayer?.id);

    let newStatus = "playing";
    if (!remainingUndercover) newStatus = "civilians_win";
    else if (remainingCivilians.length <= 1) newStatus = "undercover_wins";
    else if (isLastRound) newStatus = "game_over";

    if (newStatus !== "playing") {
      // Fin de partie
      await supabase.from("rooms").update({
        status: newStatus,
        phase: newStatus,
        round_history: history,
        mr_white_guess: mrWhiteGuess || null,
      }).eq("id", roomId);
    } else {
      // Préparer la manche suivante
      await supabase.from("players").update({
        role: null, word: null, is_alive: true,
        words_said: [], word_count: 0,
        voted_for: null, vote_locked: false,
      }).eq("room_id", roomId);

      await supabase.from("rooms").update({
        status: "waiting_next_round",
        phase: "round_result",
        round_history: history,
        word_civilian: null,
        word_undercover: null,
        current_player_index: 0,
        turn_started_at: null,
        last_eliminated_id: null,
        mr_white_guess: mrWhiteGuess || null,
      }).eq("id", roomId);
    }

    return Response.json({
      success: true,
      points: pointsToAdd,
      mrWhiteGuessedCorrect,
      newStatus,
      roundData,
    }, {
      headers: { "Access-Control-Allow-Origin": "*" },
    });

  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
});
