import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const { offerId } = await req.json();
    if (!offerId) {
      return Response.json({ error: "offerId fehlt" }, { status: 400 });
    }

    const year = new Date().getFullYear();

    // 🔎 Letzte Angebotsnummer dieses Jahres suchen
    const { data: lastOffer } = await supabase
      .from("offers")
      .select("offer_number")
      .ilike("offer_number", `AN-${year}-%`)
      .order("offer_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    let nextNumber = 1;

    if (lastOffer?.offer_number) {
      const parts = lastOffer.offer_number.split("-");
      const lastCounter = parseInt(parts[2], 10);
      nextNumber = lastCounter + 1;
    }

    const formattedCounter = String(nextNumber).padStart(5, "0");
    const newOfferNumber = `AN-${year}-${formattedCounter}`;

    // 🔥 Update Angebot
    const { error: updateErr } = await supabase
      .from("offers")
      .update({
        offer_number: newOfferNumber,
        offer_date: new Date().toISOString(),
        status: "final",
      })
      .eq("id", offerId);

    if (updateErr) {
      return Response.json({ error: updateErr.message }, { status: 500 });
    }

    return Response.json({
      success: true,
      offer_number: newOfferNumber,
    });

  } catch (err: any) {
    return Response.json(
      { error: err.message ?? "Fehler beim Finalisieren" },
      { status: 500 }
    );
  }
}
