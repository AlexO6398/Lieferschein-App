"use client";

import { useEffect, useState } from "react";
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
  const [filter, setFilter] = useState<"all" | "draft" | "final">("all");
  const [search, setSearch] = useState("");



  const load = async () => {
    setError(null);

    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) {
      window.location.href = "/login";
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
    window.location.href = "/lieferschein/kunde";
  };

  const continueDraft = () => {
    window.location.href = "/lieferschein/kunde";
  };

  const openNote = (id: string, status: string) => {
    // Draft wieder in localStorage setzen, damit der Wizard den richtigen Datensatz nimmt
    localStorage.setItem("deliveryNoteId", id);

    // Bei draft gehen wir in den Wizard rein
    if (status === "draft") {
      window.location.href = "/lieferschein/kunde";
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
  const kunde = sanitize(String(meta?.customers?.name ?? "Unbekannt"));
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

const filteredNotes = notes.filter((n) => {
  if (filter !== "all" && n.status !== filter) return false;

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
    <main className="min-h-screen p-6 bg-gray-100">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded shadow p-6">
<div className="flex items-start justify-between gap-4">
  <div className="flex items-center gap-3">
    <img
      src="/logo.png"
      alt="Logo"
      className="h-10 w-10 rounded"
      onError={(e) => ((e.currentTarget.style.display = "none"))}
    />
    <div>
      <h1 className="text-2xl font-bold">Lieferschein</h1>
      <p className="text-sm text-gray-500">Digitale Lieferscheine · {role}</p>
    </div>
  </div>

  <span className="text-xs text-gray-400">
    v0.1 Demo
  </span>
</div>



          <p className="mt-2 text-gray-700">
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
                className="w-full bg-gray-700 text-white py-3 rounded"
              >
                Mit aktuellem Entwurf weitermachen
              </button>
            )}
          </div>
        </div>

        <div className="mt-6 bg-white rounded shadow p-6">
          <div className="flex items-center justify-between">
<h2 className="text-xl font-semibold">
  {role === "office" ? "Letzte Lieferscheine" : "Meine Lieferscheine"}
</h2>


          </div>

	  <div className="mt-4 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
  <input
    value={search}
    onChange={(e) => setSearch(e.target.value)}
    placeholder="Suchen (Kunde, Nummer, E-Mail)…"
    className="w-full sm:w-80 border rounded px-3 py-3 text-sm"
  />

  <div className="flex gap-2">
    {(["all", "draft", "final"] as const).map((k) => (
      <button
        key={k}
        onClick={() => setFilter(k)}
        className={[
          "px-3 py-3 rounded text-sm border",
          filter === k ? "bg-black text-white border-black" : "bg-white",
        ].join(" ")}
      >
        {k === "all" ? "Alle" : k === "draft" ? "Entwurf" : "Abgeschlossen"}
      </button>
	  
    ))}
  </div>
  
  {role === "office" && (
  <button
    onClick={() => {
      const params = new URLSearchParams({
        filter,              // "all" | "draft" | "final"
        search,              // dein Suchstring
      });
      window.location.href = `/api/export-pdfs?${params.toString()}`;
    }}
    className="text-sm px-3 py-3 rounded border"
  >
    PDFs herunterladen (ZIP)
  </button>
)}

</div>




          {error && (
            <div className="mt-4 p-3 bg-red-50 text-red-700 rounded">
              {error}
            </div>
          )}

          {filteredNotes.length === 0 ? (
            <p className="mt-4 text-gray-600">Noch keine Einträge.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">





<table className="w-full text-sm table-fixed">



<thead>
  <tr className="text-left border-b">
    <th className="py-3 w-[90px]">Nummer</th>
    <th className="py-3 w-[110px]">Datum</th>
    <th className="py-3 w-[220px]">Kunde</th>
    {role === "office" && <th className="py-3 w-[220px]">Erstellt von</th>}
    <th className="py-3 w-[120px]">Status</th>
    <th className="py-3 w-[160px] text-right">Aktionen</th>
  </tr>
</thead>

                <tbody>
{filteredNotes.map((n, i) => (
  <tr
    key={n.id}
    className={[
      "border-b align-top hover:bg-gray-50",
      i % 2 === 1 ? "bg-gray-50/50" : "bg-white",
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
        : "bg-green-100 text-green-800",
    ].join(" ")}
  >
    {n.status === "draft" ? "Entwurf" : "Abgeschlossen"}
  </span>
</td>


  <td className="py-3 text-right">
<div className="flex flex-col gap-2 items-end">

      <button
        onClick={() => openNote(n.id, n.status)}
className="px-3 py-3 w-[140px] rounded bg-black text-white"

      >
        Einsatz Öffnen
      </button>

      <button
        onClick={() => openPdf(n.id)}
className="px-3 py-3 w-[140px] rounded border border-gray-300 bg-white"

      >
        PDF öffnen
      </button>


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
