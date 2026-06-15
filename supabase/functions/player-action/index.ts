import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Card = { suit: string; value: string; numericValue: number; };

function calculateScore(hand: Card[]): number {
  let score = 0;
  let aces = 0;
  for (const card of hand) {
    if (card.value === "A") { aces++; score += 11; }
    else score += card.numericValue;
  }
  while (score > 21 && aces > 0) { score -= 10; aces--; }
  return score;
}

Deno.serve(async (req) => {
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
    const { roomId, playerId, action } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: room } = await supabase.from("blackjack_rooms").select("*").eq("id", roomId).single();
    if (!room) return Response.json({ error: "Salle introuvable" }, { status: 404 });

    const { data: player } = await supabase.from("blackjack_players").select("*").eq("id", playerId).single();
    if (!player) return Response.json({ error: "Joueur introuvable" }, { status: 404 });

    const { data: allPlayers } = await supabase.from("blackjack_players").select("*").eq("room_id", roomId).order("created_at");
    if (!allPlayers) return Response.json({ error: "Joueurs introuvables" }, { status: 404 });

    let deck = room.deck ?? [];
    let hand = player.hand ?? [];
    let splitHand = player.split_hand ?? [];
    let score = player.score ?? 0;
    let splitScore = player.split_score ?? 0;
    const currentHand = player.current_hand ?? "main";

    if (action === "split") {
      // Vérifier que le split est possible
      if (hand.length !== 2) return Response.json({ error: "Split impossible" }, { status: 400 });
      if (hand[0].value !== hand[1].value) return Response.json({ error: "Les cartes doivent être identiques" }, { status: 400 });

      // Séparer les cartes
      const card1 = hand[0];
      const card2 = hand[1];
      const newCard1 = deck.shift()!;
      const newCard2 = deck.shift()!;

      const newHand = [card1, newCard1];
      const newSplitHand = [card2, newCard2];
      const newScore = calculateScore(newHand);
      const newSplitScore = calculateScore(newSplitHand);

      await supabase.from("blackjack_players").update({
        hand: newHand,
        score: newScore,
        split_hand: newSplitHand,
        split_score: newSplitScore,
        split_bet: player.bet,
        is_split: true,
        current_hand: "main",
        status: "playing",
      }).eq("id", playerId);

      await supabase.from("blackjack_rooms").update({ deck }).eq("id", roomId);

    } else if (action === "hit") {
      const newCard = deck.shift()!;

      if (currentHand === "main") {
        hand = [...hand, newCard];
        score = calculateScore(hand);

        if (score >= 21) {
          // Passer à la main split si elle existe
          if (player.is_split) {
            await supabase.from("blackjack_players").update({
              hand, score, current_hand: "split", status: "playing"
            }).eq("id", playerId);
          } else {
            await supabase.from("blackjack_players").update({ hand, score, status: "done" }).eq("id", playerId);
            await supabase.from("blackjack_rooms").update({ deck }).eq("id", roomId);
            await moveToNextPlayer(supabase, roomId, room.current_player_index, allPlayers);
            return Response.json({ success: true }, { headers: { "Access-Control-Allow-Origin": "*" } });
          }
        } else {
          await supabase.from("blackjack_players").update({ hand, score }).eq("id", playerId);
        }
      } else {
        // Main split
        splitHand = [...splitHand, newCard];
        splitScore = calculateScore(splitHand);

        if (splitScore >= 21) {
          await supabase.from("blackjack_players").update({ split_hand: splitHand, split_score: splitScore, status: "done" }).eq("id", playerId);
          await supabase.from("blackjack_rooms").update({ deck }).eq("id", roomId);
          await moveToNextPlayer(supabase, roomId, room.current_player_index, allPlayers);
          return Response.json({ success: true }, { headers: { "Access-Control-Allow-Origin": "*" } });
        } else {
          await supabase.from("blackjack_players").update({ split_hand: splitHand, split_score: splitScore }).eq("id", playerId);
        }
      }

      await supabase.from("blackjack_rooms").update({ deck }).eq("id", roomId);

    } else if (action === "stand") {
      if (currentHand === "main" && player.is_split) {
        // Passer à la main split
        await supabase.from("blackjack_players").update({ current_hand: "split" }).eq("id", playerId);
      } else {
        await supabase.from("blackjack_players").update({ status: "done" }).eq("id", playerId);
        await moveToNextPlayer(supabase, roomId, room.current_player_index, allPlayers);
      }

    } else if (action === "double") {
      const { data: profile } = await supabase.from("profiles").select("balance_blackjack").eq("id", player.user_id).single();
        if (!profile || profile.balance_blackjack < player.bet) {
          return Response.json({ error: "Solde insuffisant pour doubler" }, { status: 400 });
        }
      const newCard = deck.shift()!;
      hand = [...hand, newCard];
      score = calculateScore(hand);
      const newBet = player.bet * 2;

      await supabase.from("blackjack_players").update({ hand, score, bet: newBet, status: "done" }).eq("id", playerId);
      await supabase.from("blackjack_rooms").update({ deck }).eq("id", roomId);
      await moveToNextPlayer(supabase, roomId, room.current_player_index, allPlayers);
    } else if (action === "insurance") {
      // Vérifier que la carte visible du croupier est un As
      const dealerVisibleCard = room.dealer_hand?.[0];
      if (!dealerVisibleCard || dealerVisibleCard.value !== "A") {
        return Response.json({ error: "Assurance impossible" }, { status: 400 });
      }

      const insuranceBet = Math.floor(player.bet / 2);
      await supabase.from("blackjack_players").update({ insurance_bet: insuranceBet }).eq("id", playerId);
    }

    return Response.json({ success: true }, {
      headers: { "Access-Control-Allow-Origin": "*" },
    });

  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
});

async function moveToNextPlayer(supabase: any, roomId: string, currentIndex: number, allPlayers: any[]) {
  const nextIndex = currentIndex + 1;
  if (nextIndex >= allPlayers.length) {
    await dealerPlay(supabase, roomId);
  } else {
    await supabase.from("blackjack_rooms").update({ 
      current_player_index: nextIndex,
      turn_started_at: new Date().toISOString(),
    }).eq("id", roomId);
  }
}

async function dealerPlay(supabase: any, roomId: string) {
  const { data: room } = await supabase.from("blackjack_rooms").select("*").eq("id", roomId).single();
  if (!room) return;

  let deck = room.deck ?? [];
  let dealerHand = room.dealer_hand ?? [];
  let dealerScore = calculateScore(dealerHand);

  while (dealerScore < 17) {
    const newCard = deck.shift();
    if (!newCard) break;
    dealerHand = [...dealerHand, newCard];
    dealerScore = calculateScore(dealerHand);
  }

  await supabase.from("blackjack_rooms").update({
    deck, dealer_hand: dealerHand, dealer_score: dealerScore,
    phase: "results", status: "results",
  }).eq("id", roomId);

  const { data: players } = await supabase.from("blackjack_players").select("*").eq("room_id", roomId);
  if (!players) return;

  for (const player of players) {
    const results = [];

    // Main principale
    const playerScore = player.score ?? 0;
    let gain = 0;
    let mainResult = "lose";

    // Assurance
    if (player.insurance_bet > 0) {
      const dealerHasBlackjack = dealerScore === 21 && room.dealer_hand?.length === 2;
      if (dealerHasBlackjack) {
        gain += player.insurance_bet * 2;
      } else {
        gain -= player.insurance_bet;
      }
    }

    if (player.status === "blackjack") {
      const dealerBlackjack = dealerScore === 21 && room.dealer_hand?.length === 2;
      if (dealerBlackjack) { mainResult = "push"; }
      else { mainResult = "blackjack"; gain += Math.floor(player.bet * 1.5); }
    } else if (playerScore > 21) { mainResult = "bust"; gain -= player.bet; }
    else if (dealerScore > 21 || playerScore > dealerScore) { mainResult = "win"; gain += player.bet; }
    else if (playerScore === dealerScore) { mainResult = "push"; }
    else { mainResult = "lose"; gain -= player.bet; }

    // Main split
    if (player.is_split && player.split_hand?.length > 0) {
      const splitScore = player.split_score ?? 0;
      if (splitScore > 21) { gain -= player.split_bet; }
      else if (dealerScore > 21 || splitScore > dealerScore) { gain += player.split_bet; }
      else if (splitScore === dealerScore) { /* push, rien */ }
      else { gain -= player.split_bet; }
    }

    await supabase.from("blackjack_players").update({ status: mainResult }).eq("id", player.id);

    if (player.user_id) {
      const { data: profile } = await supabase.from("profiles").select("balance_blackjack").eq("id", player.user_id).single();
      if (profile) {
        await supabase.from("profiles").update({
          balance_blackjack: Math.max(0, profile.balance_blackjack + gain)
        }).eq("id", player.user_id);
      }
    }
  }
}
