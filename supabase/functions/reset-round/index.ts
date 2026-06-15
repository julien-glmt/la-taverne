import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    await supabase.from("blackjack_players").update({
      hand: [],
      score: 0,
      bet: 0,
      split_hand: [],
      split_score: 0,
      split_bet: 0,
      is_split: false,
      current_hand: "main",
      status: "waiting",
    }).eq("room_id", roomId);

    // Remettre la room en phase de mise
    await supabase.from("blackjack_rooms").update({
      phase: "betting",
      status: "waiting",
      dealer_hand: [],
      dealer_score: 0,
      current_player_index: 0,
      betting_started_at: null,
    }).eq("id", roomId);

    return Response.json({ success: true }, {
      headers: { "Access-Control-Allow-Origin": "*" },
    });

  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
});
