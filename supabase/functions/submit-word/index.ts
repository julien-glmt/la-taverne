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
    const { roomId, playerId, word } = await req.json();

    if (!roomId || !playerId) {
      return Response.json({ error: "roomId et playerId requis" }, { status: 400 });
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

    // Récupérer les joueurs vivants dans l'ordre du tour
    const { data: players } = await supabase
      .from("players")
      .select("*")
      .eq("room_id", roomId)
      .eq("is_alive", true)
      .order("created_at");

    if (!players || players.length === 0) {
      return Response.json({ error: "Aucun joueur" }, { status: 400 });
    }

    const currentIndex = room.current_player_index ?? 0;
    const currentPlayer = players[currentIndex % players.length];

    // Vérifier que c'est bien le bon joueur
    if (currentPlayer.id !== playerId) {
      return Response.json({ error: "Ce n'est pas ton tour" }, { status: 403 });
    }

    // Ajouter le mot au joueur
    const submittedWord = word?.trim() || "[Aucun mot]";
    const existingWords = currentPlayer.words_said || [];
    const newWords = [...existingWords, submittedWord];

    await supabase.from("players").update({
      words_said: newWords,
      word_count: newWords.length,
    }).eq("id", playerId);

    // Calculer le prochain joueur
    const nextIndex = currentIndex + 1;
    const totalPlayers = players.length;
    const wordsPerRound = room.words_per_round ?? 2;

    // Vérifier si tout le monde a donné assez de mots
    const updatedPlayers = players.map(p =>
      p.id === playerId ? { ...p, words_said: newWords, word_count: newWords.length } : p
    );
    const allDone = updatedPlayers.every(p => (p.word_count ?? 0) >= wordsPerRound);

    if (allDone) {
      // Passer à la phase de vote
      await supabase.from("rooms").update({
        phase: "voting",
        current_player_index: 0,
        turn_started_at: null,
      }).eq("id", roomId);
    } else {
      // Passer au joueur suivant (en sautant ceux qui ont déjà assez de mots)
      let nextPlayerIndex = nextIndex % totalPlayers;
      let loopCount = 0;
      while (
        updatedPlayers[nextPlayerIndex % totalPlayers]?.word_count >= wordsPerRound &&
        loopCount < totalPlayers
      ) {
        nextPlayerIndex = (nextPlayerIndex + 1) % totalPlayers;
        loopCount++;
      }

      await supabase.from("rooms").update({
        current_player_index: nextPlayerIndex,
        turn_started_at: new Date().toISOString(),
      }).eq("id", roomId);
    }

    return Response.json({ success: true, word: submittedWord }, {
      headers: { "Access-Control-Allow-Origin": "*" },
    });

  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
});