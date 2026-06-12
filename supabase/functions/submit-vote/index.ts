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

    if (targetId && targetId === playerId) {
      return Response.json({ error: "Tu ne peux pas voter pour toi-même" }, { status: 400 });
    }

    const { data: player } = await supabase
      .from("players").select("*").eq("id", playerId).single();



    if (player?.vote_locked) {
      return Response.json({ error: "Ton vote est déjà verrouillé" }, { status: 400 });
    }

    if (lock) {
      if (!player?.voted_for) {
        return Response.json({ error: "Tu dois voter avant de valider" }, { status: 400 });
      }

      await supabase.from("players").update({ vote_locked: true }).eq("id", playerId);

      // Vérifier si tous les joueurs vivants ont verrouillé
      const { data: alivePlayers } = await supabase
        .from("players").select("*").eq("room_id", roomId).eq("is_alive", true);

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
        let eliminatedId: string | null = null;
        let isTie = false;

        for (const [id, count] of Object.entries(voteCounts)) {
          if (count > maxVotes) {
            maxVotes = count;
            eliminatedId = id;
            isTie = false;
          } else if (count === maxVotes) {
            isTie = true;
          }
        }

          if (isTie || !eliminatedId) {
            // Sauvegarder les rôles
            const rolesSnapshot: Record<string, string> = {};
            for (const p of alivePlayers) {
              rolesSnapshot[p.id] = p.role ?? "civilian";
            }

            const votesSnapshot: Record<string, number> = {};
            for (const p of alivePlayers) {
              const voteTarget = p.id === playerId ? player.voted_for : p.voted_for;
              if (voteTarget) {
                votesSnapshot[voteTarget] = (votesSnapshot[voteTarget] || 0) + 1;
              }
            }

            // Reset votes
            await supabase.from("players")
              .update({ voted_for: null, vote_locked: false })
              .eq("room_id", roomId);

            // Vérifier si un Mr. White est dans la partie
            const mrWhiteInTie = alivePlayers.find(p => p.role === "mrwhite");

            if (mrWhiteInTie) {
              await supabase.from("rooms").update({
                phase: "mrwhite_guess",
                last_eliminated_id: null,
                cached_roles: rolesSnapshot,
              }).eq("id", roomId);
            } else {
              await supabase.from("rooms").update({
                phase: "tie",
                last_eliminated_id: null,
                cached_roles: rolesSnapshot,
              }).eq("id", roomId);
            }
          } else {

          // Récupérer le joueur éliminé pour vérifier son rôle
          const { data: eliminatedPlayer } = await supabase
            .from("players").select("*").eq("id", eliminatedId).single();

          // Mettre à jour last_eliminated_id
          await supabase.from("rooms").update({
            last_eliminated_id: eliminatedId,
          }).eq("id", roomId);

            // Vérifier si un Mr. White est dans la partie
            const { data: allPlayers } = await supabase.from("players").select("*").eq("room_id", roomId);
            const mrWhiteExists = allPlayers?.find(p => p.role === "mrwhite");

          // Sauvegarder les rôles avant reset
          const rolesSnapshot: Record<string, string> = {};
          for (const p of allPlayers!) {
            rolesSnapshot[p.id] = p.role ?? "civilian";
          }

          const votesSnapshot: Record<string, number> = {};
          for (const p of alivePlayers) {
            const voteTarget = p.id === playerId ? player.voted_for : p.voted_for;
            if (voteTarget) {
              votesSnapshot[voteTarget] = (votesSnapshot[voteTarget] || 0) + 1;
            }
          }

          if (mrWhiteExists) {
            await supabase.from("rooms").update({
              phase: "mrwhite_guess",
              cached_roles: rolesSnapshot,
              cached_votes: votesSnapshot,
            }).eq("id", roomId);
          } else {
            await supabase.from("rooms").update({
              phase: "round_result_pending",
              cached_roles: rolesSnapshot,
              cached_votes: votesSnapshot,
            }).eq("id", roomId);
          }
          // Reset votes APRÈS end-round
          await supabase.from("players")
            .update({ voted_for: null, vote_locked: false })
            .eq("room_id", roomId);
        }
      }
    } else {
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
