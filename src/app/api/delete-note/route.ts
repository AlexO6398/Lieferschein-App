import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const { deliveryNoteId } = await req.json();

    if (!deliveryNoteId) {
      return Response.json({ error: "deliveryNoteId fehlt" }, { status: 400 });
    }

    // Nur Drafts löschen (Sicherheitsgurt)
    const { data: note, error: loadErr } = await supabase
      .from("delivery_notes")
      .select("id,status")
      .eq("id", deliveryNoteId)
      .single();

    if (loadErr) {
      return Response.json({ error: loadErr.message }, { status: 400 });
    }

    if (!note) {
      return Response.json({ error: "Nicht gefunden" }, { status: 404 });
    }

    if (note.status !== "draft") {
      return Response.json(
        { error: "Nur Entwürfe können gelöscht werden" },
        { status: 400 }
      );
    }

    // Kind-Tabellen zuerst (falls FK ohne cascade)
    await supabase.from("delivery_worker_entries").delete().eq("delivery_note_id", deliveryNoteId);
    await supabase.from("delivery_machine_entries").delete().eq("delivery_note_id", deliveryNoteId);
    await supabase.from("delivery_material_entries").delete().eq("delivery_note_id", deliveryNoteId);

    const { error: delErr } = await supabase
      .from("delivery_notes")
      .delete()
      .eq("id", deliveryNoteId);

    if (delErr) throw delErr;

    return Response.json({ success: true });
  } catch (err: any) {
    return Response.json(
      { error: err.message ?? "Delete Fehler" },
      { status: 500 }
    );
  }
}
