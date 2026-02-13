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

    const { data: offer, error: loadErr } = await supabase
      .from("offers")
      .select("id,status")
      .eq("id", offerId)
      .single();

    if (loadErr) return Response.json({ error: loadErr.message }, { status: 400 });
    if (!offer) return Response.json({ error: "Nicht gefunden" }, { status: 404 });

    if (offer.status !== "final") {
      return Response.json(
        { error: "Nur finale Angebote können archiviert werden" },
        { status: 400 }
      );
    }

    const { error: updErr } = await supabase
      .from("offers")
      .update({ status: "archive" })
      .eq("id", offerId);

    if (updErr) return Response.json({ error: updErr.message }, { status: 400 });

    return Response.json({ success: true });
  } catch (err: any) {
    return Response.json(
      { error: err.message ?? "Archiv Fehler" },
      { status: 500 }
    );
  }
}
