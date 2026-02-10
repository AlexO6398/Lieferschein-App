import { createClient } from "@supabase/supabase-js";
import { buildDeliveryNotePdf } from "@/lib/pdf";

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

    // Lieferschein + Kunde laden
    const { data: note, error: noteError } = await supabase
      .from("delivery_notes")
      .select(
        `
        id,
        note_number,
        note_date,
        signature,
        customers (
          name,
          street,
          zip,
          city,
          email
        )
      `
      )
      .eq("id", deliveryNoteId)
      .single();

    if (noteError) {
      return Response.json({ error: noteError.message }, { status: 400 });
    }
    if (!note) {
      return Response.json({ error: "Lieferschein nicht gefunden" }, { status: 404 });
    }

    // Positionen laden
    const { data: workers } = await supabase
      .from("delivery_worker_entries")
      .select("hours, workers(name)")
      .eq("delivery_note_id", deliveryNoteId);

    const { data: machines } = await supabase
      .from("delivery_machine_entries")
      .select("qty,unit, machines(name)")
      .eq("delivery_note_id", deliveryNoteId);

    const { data: materials } = await supabase
      .from("delivery_material_entries")
      .select("qty,unit, materials(name)")
      .eq("delivery_note_id", deliveryNoteId);

    // Nummer im PDF anzeigen (wenn noch keine da ist -> Hinweistext)
    const noteNumber =
      note.note_number ? String(note.note_number) : "wird beim Abschließen vergeben";

    const pdfBytes = await buildDeliveryNotePdf({
      noteNumber,
      noteDate: note.note_date ?? null,
      customer: note.customers ?? null,
      signatureDataUrl: note.signature ?? null,
      workers: (workers ?? []).map((w: any) => ({
        name: w.workers?.name ?? "",
        hours: w.hours ?? null,
      })),
      machines: (machines ?? []).map((m: any) => ({
        name: m.machines?.name ?? "",
        qty: m.qty ?? null,
        unit: m.unit ?? null,
      })),
      materials: (materials ?? []).map((m: any) => ({
        name: m.materials?.name ?? "",
        qty: m.qty ?? null,
        unit: m.unit ?? null,
      })),
    });

    return new Response(pdfBytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="lieferschein.pdf"`,
      },
    });
  } catch (err: any) {
    return Response.json(
      { error: err.message ?? "PDF Fehler" },
      { status: 500 }
    );
  }
}
