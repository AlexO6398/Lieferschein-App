import { Resend } from "resend";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { createClient } from "@supabase/supabase-js";

const resend = new Resend(process.env.RESEND_API_KEY);

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

    // --- Daten laden ---
const { data: note, error: noteError } = await supabase
  .from("delivery_notes")
.select(`
  id,
  status,
  note_number,
  note_date,
  signature,
  customer_id,
  customers (
    name,
    street,
    zip,
    city,
    email
  )
`)

  .eq("id", deliveryNoteId)
  .single();

if (noteError) {
  return Response.json(
    { error: `Lieferschein konnte nicht geladen werden: ${noteError.message}` },
    { status: 400 }
  );
}

if (!note) {
  return Response.json(
    { error: "Lieferschein nicht gefunden oder keine Berechtigung." },
    { status: 404 }
  );
}


if (!note.customer_id) {
  return Response.json(
    { error: "Kein Kunde ausgewählt" },
    { status: 400 }
  );
}

if (!note.signature) {
  return Response.json(
    { error: "Keine Unterschrift vorhanden" },
    { status: 400 }
  );
}


// Nummer vergeben (nur wenn noch keine existiert)
let noteNumber = note.note_number as string | null;

if (!noteNumber) {
  const { data: num, error: numErr } = await supabase.rpc("next_delivery_note_number");
  if (numErr) throw numErr;

  noteNumber = num as string;

  const { error: updErr } = await supabase
    .from("delivery_notes")
    .update({ note_number: noteNumber })
    .eq("id", deliveryNoteId);

  if (updErr) throw updErr;
}

// Status auf final setzen (nur wenn noch nicht final)
if (note.status !== "final") {
  const { error: statusErr } = await supabase
    .from("delivery_notes")
    .update({
      status: "final",
      finalized_at: new Date().toISOString(),
    })
    .eq("id", deliveryNoteId);

  if (statusErr) throw statusErr;
}


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

const hasAny =
  (workers?.length ?? 0) > 0 ||
  (machines?.length ?? 0) > 0 ||
  (materials?.length ?? 0) > 0;

if (!hasAny) {
  return Response.json(
    { error: "Bitte mindestens eine Position erfassen (Mitarbeiter, Geräte oder Material)." },
    { status: 400 }
  );
}



    return Response.json({ success: true });
  } catch (err: any) {
    return Response.json(
      { error: err.message ?? "Finalize Fehler" },
      { status: 500 }
    );
  }
}
