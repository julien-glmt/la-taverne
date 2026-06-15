import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Card = {
  suit: string;
  value: string;
  numericValue: number;
};

function createDeck(): Card[] {
  const suits = ["♠", "♥", "♦", "♣"];
  const values = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
  const deck: Card[] = [];

  for (let d = 0; d < 6; d++) {
    for (const suit of suits) {
      for (const value of values) {
        const numericValue = ["J", "Q", "K"].includes(value) ? 10 : value === "A" ? 11 : parseInt(value);
        deck.push({ suit, value, numericValue });
      }
    }
  }
  return deck;
}

function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function calculateScore(hand: Card[]): number {
  let score = 0;
  let aces = 0;

  for (const card of hand) {
    if (card.value === "A") {
      aces++;
      score += 11;
    } else {
      score += card.numericValue;
    }
  }

  while (score > 21 && aces > 0) {
    score -= 10;
    aces--;
  }

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
    const { roomId } = await req.json();

    if (!roomId) {
      return Response.json({ error: "roomId requis" }, { status: 400 });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Récupérer la salle
    const { data: room } = await supabase
      .from("blackjack_rooms")
      .select("*")
      .eq("id", roomId)
      .single();

    if (!room) return Response.json({ error: "Salle introuvable" }, { status: 404 });

    // Récupérer les joueurs
    const { data: players } = await supabase
      .from("blackjack_players")
      .select("*")
      .eq("room_id", roomId)
      .order("created_at");

    if (!players || players.length === 0) {
      return Response.json({ error: "Aucun joueur" }, { status: 400 });
    }

    // Créer et mélanger le sabot
    let deck = room.deck && room.deck.length > 78 ? room.deck : shuffleDeck(createDeck());

    // Distribuer 2 cartes à chaque joueur et 2 au croupier
    const dealerHand: Card[] = [];

    // Détecter les Blackjacks naturels
    for (const player of players) {
      const card1 = deck.shift()!;
      const card2 = deck.shift()!;
      const hand = [card1, card2];
      const score = calculateScore(hand);
      const isBlackjack = score === 21 && hand.length === 2;

      await supabase.from("blackjack_players").update({
        hand,
        score,
        status: isBlackjack ? "blackjack" : "playing",
      }).eq("id", player.id);
    }
    
    for (const player of players) {
      const card1 = deck.shift()!;
      const card2 = deck.shift()!;
      const hand = [card1, card2];
      const score = calculateScore(hand);

      await supabase.from("blackjack_players").update({
        hand,
        score,
        status: "playing",
      }).eq("id", player.id);
    }

    // Croupier reçoit 2 cartes (1 visible, 1 cachée)
    dealerHand.push(deck.shift()!);
    dealerHand.push(deck.shift()!);
    const dealerScore = calculateScore(dealerHand);

    // Mettre à jour la salle
    await supabase.from("blackjack_rooms").update({
      deck,
      dealer_hand: dealerHand,
      dealer_score: dealerScore,
      phase: "playing",
      current_player_index: 0,
      status: "playing",
      turn_started_at: new Date().toISOString(),
    }).eq("id", roomId);

    return Response.json({ success: true, dealerHand, dealerScore }, {
      headers: { "Access-Control-Allow-Origin": "*" },
    });

  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
});
