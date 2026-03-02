import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  try {
    const { offerId } = await req.json();

    if (!offerId) {
      return NextResponse.json({ error: "offerId fehlt" }, { status: 400 });
    }

    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Sicherheitscheck: nur löschen wenn draft
    const { data: offer, error: readErr } = await supabase
      .from("offers")
      .select("status")
      .eq("id", offerId)
      .single();

    if (readErr) {
      return NextResponse.json({ error: readErr.message }, { status: 400 });
    }

    if (offer?.status !== "draft") {
      return NextResponse.json(
        { error: "Nur Entwürfe dürfen gelöscht werden" },
        { status: 403 }
      );
    }

    const { error: delErr } = await supabase
      .from("offers")
      .delete()
      .eq("id", offerId);

    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Serverfehler" },
      { status: 500 }
    );
  }
}