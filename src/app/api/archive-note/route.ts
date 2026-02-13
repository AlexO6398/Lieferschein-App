import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function POST(req: Request) {
  const res = NextResponse.json({ ok: true }); // wird nicht direkt verwendet, aber Cookies setAll braucht ein Response-Objekt

  try {
    const body = await req.json().catch(() => ({}));
    const deliveryNoteId = body?.deliveryNoteId as string | undefined;

    if (!deliveryNoteId) {
      return NextResponse.json({ error: "deliveryNoteId fehlt" }, { status: 400 });
    }

    // Server-Supabase (wie in middleware, nur für Route Handler)
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            // Route Handler: Cookies aus dem Request Header lesen
            const cookie = req.headers.get("cookie") ?? "";
            // supabase/ssr erwartet [{ name, value }]
            return cookie
              .split(";")
              .map((c) => c.trim())
              .filter(Boolean)
              .map((c) => {
                const idx = c.indexOf("=");
                return {
                  name: idx >= 0 ? c.slice(0, idx) : c,
                  value: idx >= 0 ? c.slice(idx + 1) : "",
                };
              });
          },
          setAll(cookiesToSet) {
            // Optional: falls Supabase Cookies refreshen will
            cookiesToSet.forEach(({ name, value, options }) => {
              res.cookies.set(name, value, options);
            });
          },
        },
      }
    );

    // User aus Session
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: "Nicht eingeloggt" }, { status: 401 });
    }

    // Rolle prüfen
    const { data: roleRow, error: roleErr } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (roleErr || !roleRow?.role) {
      return NextResponse.json({ error: "Rolle konnte nicht geprüft werden" }, { status: 403 });
    }
    if (roleRow.role !== "office") {
      return NextResponse.json({ error: "Nicht erlaubt" }, { status: 403 });
    }

    // Note laden + Status prüfen
    const { data: note, error: loadErr } = await supabase
      .from("delivery_notes")
      .select("id,status")
      .eq("id", deliveryNoteId)
      .single();

    if (loadErr) {
      return NextResponse.json({ error: loadErr.message }, { status: 400 });
    }
    if (!note) {
      return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
    }
    if (note.status !== "final") {
      return NextResponse.json({ error: "Nur 'final' kann archiviert werden" }, { status: 400 });
    }

    // Update
    const { error: updErr } = await supabase
      .from("delivery_notes")
      .update({ status: "archive" })
      .eq("id", deliveryNoteId);

    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 400 });
    }

    // Wichtig: res ist ein Response-Objekt (wegen Cookie setAll); wir geben aber unsere JSON-Antwort zurück
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Archivieren Fehler" },
      { status: 500 }
    );
  }
}
