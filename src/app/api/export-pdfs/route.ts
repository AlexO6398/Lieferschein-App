import { NextRequest } from "next/server";
import JSZip from "jszip";
import { createClient } from "@supabase/supabase-js";
import { buildDeliveryNotePdf } from "@/lib/pdf"; // deine PDF-Funktion

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const filter = (searchParams.get("filter") ?? "all") as "all" | "draft" | "final";
  const searchRaw = (searchParams.get("search") ?? "").trim();
  const search = searchRaw.toLowerCase();

  // 1) Notes holen
  let q = supabase
    .from("delivery_notes")
    .select(`
      id,
      status,
      note_number,
      note_date,
      signature,
      customers ( name, street, zip, city, email )
    `)
    .order("created_at", { ascending: false })
    .limit(200);

  if (filter !== "all") q = q.eq("status", filter);

  const { data: notes, error } = await q;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // 2) Suche nachbauen (Nummer/Kunde/Mail)
  const filtered = (notes ?? []).filter((n: any) => {
    if (!search) return true;
    const num = n.note_number ? String(n.note_number).toLowerCase() : "";
    const cust = (n.customers?.name ?? "").toLowerCase();
    const mail = (n.customers?.email ?? "").toLowerCase();
    return num.includes(search) || cust.includes(search) || mail.includes(search);
  });

  const filterLabel =
    filter === "draft" ? "Entwurf" : filter === "final" ? "Abgeschlossen" : "Alle";

  const searchLabel = search
    ? `_${search.replace(/[^\w\d]+/g, "_").replace(/^_|_$/g, "")}`
    : "";

  const zipName = `Lieferscheine_${filterLabel}${searchLabel}.zip`;

  // 3) PDFs bauen + zippen
  const zip = new JSZip();

  for (const n of filtered) {
    const [{ data: workers }, { data: machines }, { data: materials }] = await Promise.all([
      supabase
        .from("delivery_worker_entries")
        .select("hours, workers(name)")
        .eq("delivery_note_id", n.id),
      supabase
        .from("delivery_machine_entries")
        .select("qty,unit, machines(name)")
        .eq("delivery_note_id", n.id),
      supabase
        .from("delivery_material_entries")
        .select("qty,unit, materials(name)")
        .eq("delivery_note_id", n.id),
    ]);

customer: (() => {
  const c = Array.isArray(n.customers) ? n.customers[0] : n.customers;
  return c
    ? {
        name: c.name ?? null,
        street: c.street ?? null,
        zip: c.zip ?? null,
        city: c.city ?? null,
        email: c.email ?? null,
      }
    : null;
})(),

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
      signatureDataUrl: n.signature ?? null,
    });

	const formatDateAT = (iso: string | null) => {
	if (!iso) return "XX_XX_XXXX";
	const d = new Date(iso);
	const dd = String(d.getDate()).padStart(2, "0");
	const mm = String(d.getMonth() + 1).padStart(2, "0");
	const yyyy = d.getFullYear();
	return `${dd}.${mm}.${yyyy}`;
	};

    const nr = String(n.note_number ?? "XXX");
    const kunde = String(n.customers?.name ?? "Unbekannt")
      .replace(/[^\w\d]+/g, "_")
      .replace(/^_|_$/g, "");
	const noteDate = String(n.note_date ?? "XXX")
		.replace(/\./g, "_");


    zip.file(`${nr}_${kunde}_${noteDate}.pdf`, pdfBytes);
  } // ✅ for-loop zu

  const zipBytes = await zip.generateAsync({ type: "uint8array" });

  return new Response(zipBytes, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zipName}"`,
    },
  });
} // 
