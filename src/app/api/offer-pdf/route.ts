import { createClient } from "@supabase/supabase-js";
import { buildOfferPdf } from "@/lib/pdf";

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

    const { data: offer, error: offerErr } = await supabase
      .from("offers")
      .select(`
        id,
        offer_number,
        offer_date,
        status,
        subject,
        salutation,
        sections,
        customers (
          name,
          street,
          zip,
          city
        )
      `)
      .eq("id", offerId)
      .single();

    if (offerErr) return Response.json({ error: offerErr.message }, { status: 400 });
    if (!offer) return Response.json({ error: "Angebot nicht gefunden" }, { status: 404 });

    // customers kann je nach Relation als Array kommen
    const customerRaw = (offer as any).customers;
    const customer = Array.isArray(customerRaw) ? customerRaw[0] : customerRaw;

    const sections = Array.isArray((offer as any).sections) ? (offer as any).sections : [];

    const pdfBytes = await buildOfferPdf({
      offerNumber: String((offer as any).offer_number ?? ""),
      offerDate: (offer as any).offer_date ?? null,
      customer: customer
        ? {
            name: customer.name ?? null,
            street: customer.street ?? null,
            zip: customer.zip ?? null,
            city: customer.city ?? null,
          }
        : null,
      summary: String((offer as any).subject ?? "").trim(),
      salutation: String((offer as any).salutation ?? "").trim(),
      sections, // ✅ hier kommen deine gespeicherten Abschnitte rein
    });

    const body = pdfBytes instanceof Uint8Array ? pdfBytes : new Uint8Array(pdfBytes as any);

    return new Response(body.buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="angebot.pdf"`,
      },
    });
  } catch (err: any) {
    return Response.json({ error: err.message ?? "PDF Fehler" }, { status: 500 });
  }
}
