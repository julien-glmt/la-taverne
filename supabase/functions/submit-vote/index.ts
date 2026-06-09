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
    const { roomId, playerId, targetId, lock } = await req.json();

    if (!roomId || !playerId) {
      return Response.json({ error: "roomId et playerId requis" }, { status: 400 });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Vérifier que le joueur ne vote pas pour lui-même
    if (targetId && targetId === playerId) {
      return Response.json({ error: "Tu ne peux pas voter pour toi-même" }, { status: 400 });
    }

    // Vérifier que le vote n'est pas déjà verrouillé
    const { data: player } = await supabase
      .from("players")
      .select("*")
      .eq("id", playerId)
      .single();

    if (player?.vote_locked) {
      return Response.json({ error: "Ton vote est déjà verrouillé" }, { status: 400 });
    }

    if (lock) {
      // Verrouiller le vote
      if (!player?.voted_for) {
        return Response.json({ error: "Tu dois voter avant de valider" }, { status: 400 });
      }
      await supabase.from("players").update({ vote_locked: true }).eq("id", playerId);

      // Vérifier si tous les joueurs vivants ont verrouillé
      const { data: alivePlayers } = await supabase
        .from("players")
        .select("*")
        .eq("room_id", roomId)
        .eq("is_alive", true);

      const allLocked = alivePlayers?.every(p => p.vote_locked || p.id === playerId);

      if (allLocked && alivePlayers) {
        // Compter les votes
        const voteCounts: Record<string, number> = {};
        for (const p of alivePlayers) {
          const voteTarget = p.id === playerId ? player.voted_for : p.voted_for;
          if (voteTarget) {
            voteCounts[voteTarget] = (voteCounts[voteTarget] || 0) + 1;
          }
        }

        // Trouver le joueur le plus voté
        let maxVotes = 0;
        let eliminated: string | null = null;
        let isTie = false;

        for (const [id, count] of Object.entries(voteCounts)) {
          if (count > maxVotes) {
            maxVotes = count;
            eliminated = id;
            isTie = false;
          } else if (count === maxVotes) {
            isTie = true;
          }
        }

        if (isTie || !eliminated) {
          // Égalité — pas d'élimination
          await supabase.from("rooms").update({ phase: "tie" }).eq("id", roomId);
        } else {
          // Éliminer le joueur
          await supabase.from("players").update({ is_alive: false }).eq("id", eliminated);

          // Récupérer le joueur éliminé
          const { data: eliminatedPlayer } = await supabase
            .from("players").select("*").eq("id", eliminated).single();

          // Vérifier fin de partie
          const { data: remaining } = await supabase
            .from("players").select("*").eq("room_id", roomId).eq("is_alive", true);

          const remainingUndercover = remaining?.find(p => p.role === "undercover");
          const remainingCivilians = remaining?.filter(p => p.role === "civilian") ?? [];

          let newStatus = "playing";
          if (!remainingUndercover) newStatus = "civilians_win";
          else if (remainingCivilians.length <= 1) newStatus = "undercover_wins";

          await supabase.from("rooms").update({
            status: newStatus,
            phase: newStatus === "playing" ? "result" : newStatus,
            last_eliminated_id: eliminated,
          }).eq("id", roomId);
        }

        // Reset votes pour la prochaine manche
        await supabase.from("players")
          .update({ voted_for: null, vote_locked: false })
          .eq("room_id", roomId);
      }

    } else {
      // Juste mettre à jour le vote (sans verrouiller)
      await supabase.from("players")
        .update({ voted_for: targetId })
        .eq("id", playerId);
    }

    return Response.json({ success: true }, {
      headers: { "Access-Control-Allow-Origin": "*" },
    });

  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
});
