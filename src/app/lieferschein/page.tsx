"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type DeliveryNote = {
  id: string;
  status: string;
  note_date: string | null;
  note_number: number | null;
  customers?: {
    name: string | null;
  } | null;
profiles?: { email: string | null } | null;
owner_id?: string | null;

};



export default function HomePage() {
  const [loading, setLoading] = useState(true);
  const [hasDraft, setHasDraft] = useState(false);
const [notes, setNotes] = useState<DeliveryNote[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<"office" | "field" | null>(null);
  const [filter, setFilter] = useState<"all" | "draft" | "final" | "archive">("all");
  const [search, setSearch] = useState("");

  // neu: Datum von/bis (YYYY-MM-DD aus <input type="date">)
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");


  const router = useRouter();


  const load = async () => {
    setError(null);

    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) {
      const next = encodeURIComponent(window.location.pathname);
      router.replace(`/login?next=${next}`);
      return;
    }


const { data: roleData, error: roleError } = await supabase
  .from("user_roles")
  .select("role")
  .single();

if (roleError || !roleData?.role) {
  setError("Rolle konnte nicht geladen werden");
  setLoading(false);
  return;
}

const roleValue = roleData.role as "office" | "field";
setRole(roleValue);

setHasDraft(!!localStorage.getItem("deliveryNoteId"));

let q = supabase
  .from("delivery_notes")
  .select(
    "id,status,note_date,note_number,owner_id,customers(name),profiles:profiles!delivery_notes_owner_id_fkey(email)"
  )
  .order("created_at", { ascending: false })
  .limit(20);

// FIELD: nur eigene
if (roleValue === "field") {
  const uid = sess.session.user.id; // sess hast du oben schon
  q = q.eq("owner_id", uid);
}

const { data, error } = await q;

if (error) {
  setError(error.message);
  setNotes([]);
} else {
  setNotes((data as any) ?? []);
}

setLoading(false);



  };

  useEffect(() => {
    load();
  }, []);

  const startNew = async () => {
    localStorage.removeItem("deliveryNoteId");

const { data: sess } = await supabase.auth.getSession();
const userId = sess.session?.user?.id;
if (!userId) {
  alert("Nicht eingeloggt");
  return;
}

const { data, error } = await supabase
  .from("delivery_notes")
  .insert([{ status: "draft", owner_id: userId }])
  .select("id")
  .single();


    if (error) {
      alert(error.message);
      return;
    }

    localStorage.setItem("deliveryNoteId", data.id);
    router.push("/lieferschein/kunde");
router.refresh();

  };

  const continueDraft = () => {
    router.push("/lieferschein/kunde");
router.refresh();

  };

  const openNote = (id: string, status: string) => {
    // Draft wieder in localStorage setzen, damit der Wizard den richtigen Datensatz nimmt
    localStorage.setItem("deliveryNoteId", id);

    // Bei draft gehen wir in den Wizard rein
    if (status === "draft") {
      router.push("/lieferschein/kunde");
router.refresh();

      return;
    }


    // Bei final gehen wir zur Zusammenfassung (später machen wir readonly)
    window.location.href = "/lieferschein/zusammenfassung";
  };

const deleteDraft = async (id: string) => {
  const ok = confirm("Entwurf wirklich löschen?");
  if (!ok) return;

  const res = await fetch("/api/delete-note", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deliveryNoteId: id }),
  });

  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert(j.error ?? "Fehler beim Löschen");
    return;
  }

  // falls gerade dieser Draft im localStorage liegt → entfernen
  if (localStorage.getItem("deliveryNoteId") === id) {
    localStorage.removeItem("deliveryNoteId");
    setHasDraft(false);
  }

  // UI aktualisieren
  setNotes((prev) => prev.filter((n) => n.id !== id));
};


const archiveFinal = async (id: string) => {
  const ok = confirm("Lieferschein wirklich archivieren?");
  if (!ok) return;

  const res = await fetch("/api/archive-note", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deliveryNoteId: id }),
  });

  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert(j.error ?? "Fehler beim Archivieren");
    return;
  }

  // UI: status lokal updaten
  setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, status: "archive" } : n)));
};


const sanitize = (s: string) =>
  s
    .replace(/[^\w\d]+/g, "_")
    .replace(/^_|_$/g, "");

const formatDateAT = (iso: string | null) => {
  if (!iso) return "XX_XX_XXXX";
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
};

const openPdf = async (id: string) => {
  // 1) Metadaten holen (Nummer, Kunde, Datum)
  const { data: meta, error: metaErr } = await supabase
    .from("delivery_notes")
    .select("note_number,note_date,customers(name)")
    .eq("id", id)
    .single();

  if (metaErr) {
    alert(metaErr.message);
    return;
  }

  const nr = String(meta?.note_number ?? "LS_XXX");
const customerObj =
  Array.isArray(meta?.customers) ? meta.customers[0] : meta?.customers;

const kunde = sanitize(String(customerObj?.name ?? "Unbekannt"));

  const date = sanitize(formatDateAT(meta?.note_date).replace(/\./g, "_"));
  const filename = `${nr}_${kunde}_${date}.pdf`;

  // 2) PDF laden (dein PDF-Endpoint)
  const res = await fetch("/api/pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deliveryNoteId: id }),
  });

  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    alert(j.error ?? "PDF Fehler");
    return;
  }

  const blob = await res.blob();

  // 3) Mit Dateiname öffnen (Download-Name im Browser passt dann)
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};





const formatDate = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
};


if (loading || !role) {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <p>Lade...</p>
    </div>
  );
}

const toDateOnly = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};

const parseYmd = (ymd: string) => {
  // "YYYY-MM-DD"
  const [y, m, d] = ymd.split("-").map((x) => parseInt(x, 10));
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
};

const filteredNotes = notes.filter((n) => {
  // 1) Status-Filter
  if (filter === "all") {
    // "Alle" soll nur draft + final zeigen
    if (!(n.status === "draft" || n.status === "final")) return false;
  } else {
    if (n.status !== filter) return false;
  }

  // 2) Datum von/bis
  const nd = toDateOnly(n.note_date);
  if ((dateFrom || dateTo) && !nd) return false;

  if (dateFrom) {
    const df = parseYmd(dateFrom);
    if (df && nd && nd < df) return false;
  }
  if (dateTo) {
    const dt = parseYmd(dateTo);
    if (dt && nd && nd > dt) return false;
  }

  // 3) Textsuche
  const s = search.trim().toLowerCase();
  if (!s) return true;

  const num = n.note_number ? String(n.note_number) : "";
  const cust = n.customers?.name ?? "";
  const mail = n.profiles?.email ?? "";

  return (
    num.toLowerCase().includes(s) ||
    cust.toLowerCase().includes(s) ||
    mail.toLowerCase().includes(s)
  );
});



  return (
    <main className="min-h-screen p-6 bg-gray-900 text-gray-100">
      <div className="max-w-4xl mx-auto">
        <div className="bg-gray-800/80 border border-gray-700 rounded-xl shadow-lg p-6">
<div className="flex items-start justify-between gap-4">
  <div className="flex items-center gap-3">
    <img
      src="/logo.png"
      alt="Logo"
      className="h-10 w-10 rounded"
      onError={(e) => ((e.currentTarget.style.display = "none"))}
    />
    <div>
      <h1 className="text-3xl font-bold">Lieferschein</h1>
      <p className="text-sm text-gray-300/80">Digitale Lieferscheine · {role}</p>
    </div>
  </div>





            <button
              type="button"
              onClick={() => (window.location.href = "/")}
              className="px-3 py-2 rounded border text-sm bg-gray-900 text-gray-100 border-gray-700 hover:bg-gray-800 transition-colors"
            >
              Zur Übersicht
            </button>
</div>



          <p className="mt-2 text-gray-300">
            Starte einen neuen Lieferschein oder öffne einen bestehenden.
          </p>

          <div className="mt-6 grid gap-3">
            <button
              onClick={startNew}
              className="w-full bg-black text-white py-3 rounded"
            >
              Neuen Lieferschein erstellen
            </button>

          

            {hasDraft && (
              <button
                onClick={continueDraft}
                className="w-full bg-gray-700 hover:bg-gray-600 text-white py-3 rounded"
              >
                Mit aktuellem Entwurf weitermachen
              </button>
            )}
          </div>
        </div>

        <div className="mt-6 bg-gray-800/80 border border-gray-700 rounded-xl shadow-lg p-6">
          <div className="flex items-center justify-between">
<h2 className="text-xl font-semibold">
  {role === "office" ? "Letzte Lieferscheine" : "Meine Lieferscheine"}
</h2>


          </div>

<div className="mt-4 grid grid-cols-1 sm:grid-cols-[320px_1fr_auto] gap-6 items-start">

  {/* =========================
      LINKS: Suche + Datum
     ========================= */}
  <div>
    <input
      value={search}
      onChange={(e) => setSearch(e.target.value)}
      placeholder="Suchen (Kunde, Nummer, E-Mail)…"
      className="w-full rounded px-3 py-3 text-sm bg-gray-900 border border-gray-700 text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500"
    />

    <div className="mt-3 grid grid-cols-2 gap-3">
      <label className="text-xs text-gray-300/80">
        von
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="mt-1 w-full rounded px-3 py-2 text-sm bg-gray-900 border border-gray-700 text-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-500"
        />
      </label>

      <label className="text-xs text-gray-300/80">
        bis
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="mt-1 w-full rounded px-3 py-2 text-sm bg-gray-900 border border-gray-700 text-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-500"
        />
      </label>
    </div>
  </div>

  {/* =========================
      MITTE: Filter 2x2
     ========================= */}
  <div className="grid grid-cols-2 gap-3 max-w-xs">
    {(["all", "draft", "final", "archive"] as const)
      .filter((k) => k !== "archive" || role === "office")
      .map((k) => (
        <button
          key={k}
          onClick={() => setFilter(k)}
          className={[
            "px-3 py-3 rounded text-sm border text-center",
            filter === k
              ? "bg-gray-100 text-gray-900 border-gray-100"
              : "bg-gray-900 text-gray-100 border-gray-700 hover:bg-gray-800",
          ].join(" ")}
        >
          {k === "all"
            ? "Alle"
            : k === "draft"
            ? "Entwurf"
            : k === "final"
            ? "Abgeschlossen"
            : "Archiv"}
        </button>
      ))}
  </div>

  {/* =========================
      RECHTS: ZIP Button
     ========================= */}
  {role === "office" && (
    <div className="flex items-center">
      <button
        onClick={() => {
          const params = new URLSearchParams({
            filter,
            search,
            dateFrom,
            dateTo,
          });
          window.location.href = `/api/export-pdfs?${params.toString()}`;
        }}
        className="text-sm px-5 py-3 rounded border border-gray-700 bg-gray-900 hover:bg-gray-800"
      >
        PDFs herunterladen (ZIP)
      </button>
    </div>
  )}
</div>




          {error && (
            <div className="mt-4 p-3 bg-red-50 text-red-700 rounded">
              {error}
            </div>
          )}

          {filteredNotes.length === 0 ? (
            <p className="mt-4 text-gray-300/80">Noch keine Einträge.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">





<table className="w-full text-sm table-fixed">



<thead>
  <tr className="text-left border-b border-gray-700 text-gray-200">
    <th className="py-3 w-[110px]">Nummer</th>
    <th className="py-3 w-[80px]">Datum</th>
    <th className="py-3 w-[120px]">Kunde</th>
    {role === "office" && <th className="py-3 w-[150px]">Erstellt von</th>}
    <th className="py-3 w-[110px]">Status</th>
    <th className="py-3 w-[140px] text-right">Aktionen</th>
  </tr>
</thead>

                <tbody>
{filteredNotes.map((n, i) => (
  <tr
    key={n.id}
    className={[
      "border-b border-gray-700 align-top hover:bg-gray-700/40",
i % 2 === 1 ? "bg-gray-800/40" : "bg-transparent",
    ].join(" ")}
  >




  <td className="py-3">
    {n.note_number ?? <span className="text-gray-400 italic">—</span>}
  </td>

  <td className="py-3">{formatDate(n.note_date)}</td>

  <td className="py-3">
    {n.customers?.name ?? <span className="text-gray-400 italic">—</span>}
  </td>

  {role === "office" && (
    <td className="py-3 text-gray-600">
{n.profiles?.email ? (
  n.profiles.email
) : n.owner_id ? (
  <span className="text-gray-500">{n.owner_id.slice(0, 8)}…</span>
) : (
  <span className="text-gray-400 italic">—</span>
)}

    </td>
  )}

<td className="py-3">
<span
  className={[
    "inline-block px-2 py-1 rounded text-xs font-medium",
    n.status === "draft"
      ? "bg-yellow-100 text-yellow-800"
      : n.status === "final"
      ? "bg-green-100 text-green-800"
      : "bg-gray-200 text-gray-800",
  ].join(" ")}
>
  {n.status === "draft" ? "Entwurf" : n.status === "final" ? "Abgeschlossen" : "Archiv"}
</span>

</td>


  <td className="py-3 text-right">
<div className="flex flex-col gap-2 items-end">


{n.status == "draft" && (
      <button
        onClick={() => openNote(n.id, n.status)}
className="px-3 py-3 w-[140px] rounded bg-black text-white"

      >
        Einsatz Öffnen
      </button>
)}

{n.status !== "draft" && (
      <button
        onClick={() => openPdf(n.id)}
className="px-3 py-3 w-[140px] rounded border border-gray-700 bg-gray-900 hover:bg-gray-800 text-gray-100"

      >
        PDF öffnen
      </button>
)}

{role === "office" && n.status === "final" && (
  <button
    onClick={() => archiveFinal(n.id)}
    className="px-3 py-3 w-[140px] rounded border border-gray-700 bg-gray-900 hover:bg-gray-800 text-gray-100"
  >
    Archivieren
  </button>
)}



{role === "office" && n.status === "draft" && (
  <button
    onClick={() => deleteDraft(n.id)}
    className="px-3 py-3 w-[140px] rounded border border-red-300 text-red-700 bg-white hover:bg-red-50"
  >
    Löschen
  </button>
)}




    </div>
  </td>
</tr>

                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
