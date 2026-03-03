import { NextRequest } from "next/server";
import JSZip from "jszip";
import { createClient } from "@supabase/supabase-js";
import { buildDeliveryNotePdf } from "@/lib/pdf";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const sanitize = (s: string) =>
  s.replace(/[^\w\d]+/g, "_").replace(/^_|_$/g, "");

const formatDateAT = (iso: string | null) => {
  if (!iso) return "XX_XX_XXXX";
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const filter = (searchParams.get("filter") ?? "all") as "all" | "draft" | "final";
  const searchRaw = (searchParams.get("search") ?? "").trim();
  const search = searchRaw.toLowerCase();

  // 1) Notes holen (so ähnlich wie /api/pdf, nur in bulk)
  let q = supabase
    .from("delivery_notes")
    .select(`
      id,
      status,
      note_number,
      note_date,
      signature,
      activities_text,
      photo_1,
      photo_2,
      photo_3,
      photo_4,
      customers:customers!delivery_notes_customer_id_fkey ( name, street, zip, city, email ),
      site_customer:customers!delivery_notes_site_customer_id_fkey ( name, street, zip, city, email )
    `)
    .order("created_at", { ascending: false })
    .limit(200);

  if (filter !== "all") q = q.eq("status", filter);

  const { data: notes, error } = await q;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // 2) Suche (Nummer/Kunde/Mail)
  const filtered = (notes ?? []).filter((n: any) => {
    if (!search) return true;
    const num = n.note_number ? String(n.note_number).toLowerCase() : "";
    const custName = (n.customers?.name ?? "").toLowerCase();
    const mail = (n.customers?.email ?? "").toLowerCase();
    return num.includes(search) || custName.includes(search) || mail.includes(search);
  });

  const filterLabel =
    filter === "draft" ? "Entwurf" : filter === "final" ? "Abgeschlossen" : "Alle";

  const searchLabel = search
    ? `_${sanitize(search)}`
    : "";

  const zipName = `Lieferscheine_${filterLabel}${searchLabel}.zip`;

  const zip = new JSZip();

  for (const n of filtered as any[]) {
    // Positionen laden
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

    const cust = Array.isArray(n.customers) ? n.customers[0] : n.customers;
    const site = Array.isArray(n.site_customer) ? n.site_customer[0] : n.site_customer;

    const pdfBytes = await buildDeliveryNotePdf({
      noteNumber: String(n.note_number ?? "XXX"),
      noteDate: n.note_date ?? null,

      customer: cust
        ? {
            name: cust.name ?? null,
            street: cust.street ?? null,
            zip: cust.zip ?? null,
            city: cust.city ?? null,
            email: cust.email ?? null,
          }
        : null,

      siteCustomer: site
        ? {
            name: site.name ?? null,
            street: site.street ?? null,
            zip: site.zip ?? null,
            city: site.city ?? null,
            email: site.email ?? null,
          }
        : null,

      signatureDataUrl: n.signature ?? null,

      photos: [n.photo_1, n.photo_2, n.photo_3, n.photo_4].filter(Boolean),
      activitiesText: n.activities_text ?? null,

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

    const kundeName = sanitize(String(cust?.name ?? "Unbekannt"));
    const nr = String(n.note_number ?? "XXX");
    const date = sanitize(formatDateAT(n.note_date ?? null).replace(/\./g, "_"));

    zip.file(`${nr}_${kundeName}_${date}.pdf`, pdfBytes);
  }

  const zipBytes = await zip.generateAsync({ type: "uint8array" });
  const buf = Buffer.from(zipBytes);

  return new Response(buf, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zipName}"`,
    },
  });
}