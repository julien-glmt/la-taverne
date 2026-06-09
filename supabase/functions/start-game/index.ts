import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  { civilian: "Boulangerie", undercover: "Pâtisserie" },
  { civilian: "Requin", undercover: "Dauphin" },
  { civilian: "Astronaute", undercover: "Pilote" },
  { civilian: "Château", undercover: "Palais" },
];

Deno.serve(async (req) => {
  // CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }

  try {
    const { roomId, hostName } = await req.json();

    if (!roomId || !hostName) {
      return Response.json({ error: "roomId et hostName requis" }, { status: 400 });
    }

    // Client admin (accès total, côté serveur uniquement)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Récupérer la salle
    const { data: room, error: roomError } = await supabase
      .from("rooms")
      .select("*")
      .eq("id", roomId)
      .single();

    if (roomError || !room) {
      return Response.json({ error: "Salle introuvable" }, { status: 404 });
    }

    // Vérifier que c'est bien l'hôte qui lance
    if (room.host !== hostName) {
      return Response.json({ error: "Seul l'hôte peut lancer la partie" }, { status: 403 });
    }

    // Récupérer les joueurs
    const { data: players, error: playersError } = await supabase
      .from("players")
      .select("*")
      .eq("room_id", roomId)
      .order("created_at");

    if (playersError || !players || players.length < 3) {
      return Response.json({ error: "Pas assez de joueurs (min 3)" }, { status: 400 });
    }

    // Vérifier que tous sont prêts
    if (!keepRound) {
      const allReady = players.every((p) => p.is_ready);
      if (!allReady) {
        return Response.json({ error: "Tous les joueurs doivent être prêts" }, { status: 400 });
      }
    }

    // Choisir une paire de mots aléatoire
    const pair = WORD_PAIRS[Math.floor(Math.random() * WORD_PAIRS.length)];

    // Mélanger les joueurs
    const shuffled = [...players].sort(() => Math.random() - 0.5);

    // Attribuer les rôles
    const undercoverCount = Math.min(room.max_undercovers, shuffled.length - 2);
    const assignments: { id: string; role: string; word: string }[] = [];

    for (let i = 0; i < shuffled.length; i++) {
      const p = shuffled[i];
      if (i < undercoverCount) {
        assignments.push({ id: p.id, role: "undercover", word: pair.undercover });
      } else if (room.mr_white_enabled && i === undercoverCount) {
        assignments.push({ id: p.id, role: "mrwhite", word: "***" });
      } else {
        assignments.push({ id: p.id, role: "civilian", word: pair.civilian });
      }
    }

    // Mettre à jour chaque joueur individuellement (sécurité : chaque joueur ne voit que sa ligne)
    for (const a of assignments) {
      await supabase
        .from("players")
        .update({ role: a.role, word: a.word, is_alive: true })
        .eq("id", a.id);
    }

    // Mettre à jour la salle
    const { roomId, hostName, keepRound } = await req.json();
    const firstPlayerIndex = Math.floor(Math.random() * shuffled.length);
    await supabase.from("rooms").update({
      status: "playing",
      phase: "playing",
      word_civilian: pair.civilian,
      word_undercover: pair.undercover,
      current_round: keepRound ? room.current_round : 1,
      current_player_index: firstPlayerIndex,
      turn_started_at: new Date().toISOString(),
    }).eq("id", roomId);

    return Response.json({ success: true, pair }, {
      headers: { "Access-Control-Allow-Origin": "*" },
    });

  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
});