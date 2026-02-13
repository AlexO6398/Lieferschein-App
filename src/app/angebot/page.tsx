"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";



type Offer = {
  id: string;
  status: string;
  offer_date: string | null;
  offer_number: string | null;
  customers?: { name: string | null } | null;
};

export default function OfferHomePage() {
  const [loading, setLoading] = useState(true);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [role, setRole] = useState<"office" | "field" | null>(null);

  const [filter, setFilter] = useState<"all" | "draft" | "final" | "archive">("all");
  const [search, setSearch] = useState("");

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

    if (roleValue !== "office") {
      router.replace("/");
      setOffers([]);
      setLoading(false);
      return;
    }

    let q = supabase
      .from("offers")
      .select("id,status,offer_date,offer_number,customers(name)")
      .order("created_at", { ascending: false })
      .limit(50);

    const { data, error } = await q;

    if (error) {
      setError(error.message);
      setOffers([]);
    } else {
      setOffers((data as any) ?? []);
    }

    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startNew = async () => {
    // optional: localStorage, falls du ähnlich wie beim Lieferschein "weiter" willst
    localStorage.removeItem("offerId");

    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) {
      alert("Nicht eingeloggt");
      return;
    }

    const { data, error } = await supabase
      .from("offers")
      .insert([{ status: "draft" }])
      .select("id")
      .single();

    if (error) {
      alert(error.message);
      return;
    }

    localStorage.setItem("offerId", data.id);
    router.push("/angebot/neu");
    router.refresh();
  };

  const openOffer = (id: string) => {
    localStorage.setItem("offerId", id);
    router.push("/angebot/neu"); // später: /angebot/[id] wenn du readonly willst
  };

const finalizeOffer = async (id: string) => {
  const ok = confirm("Angebot wirklich finalisieren? (Nummer wird vergeben)");
  if (!ok) return;

  const res = await fetch("/api/offer-finalize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ offerId: id }),
  });

  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert(j.error ?? "Fehler beim Finalisieren");
    return;
  }

  // UI refresh: am einfachsten reload
  load();
};

const archiveOffer = async (id: string) => {
  const ok = confirm("Angebot wirklich archivieren?");
  if (!ok) return;

  const res = await fetch("/api/offer-archive", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ offerId: id }),
  });

  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert(j.error ?? "Fehler beim Archivieren");
    return;
  }

  // UI: status lokal updaten (so wie bei dir)
  setOffers((prev) => prev.map((o) => (o.id === id ? { ...o, status: "archive" } : o)));
};

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

const openOfferPdf = async (id: string) => {
  // 1) Metadaten holen (Nummer, Kunde, Datum)
  const { data: meta, error: metaErr } = await supabase
    .from("offers")
    .select("offer_number,offer_date,customers(name)")
    .eq("id", id)
    .single();

  if (metaErr) {
    alert(metaErr.message);
    return;
  }

  const nr = String((meta as any)?.offer_number ?? "AN_XXX");
  const customerObj =
    Array.isArray((meta as any)?.customers) ? (meta as any).customers[0] : (meta as any)?.customers;

  const kunde = sanitize(String(customerObj?.name ?? "Unbekannt"));
  const date = sanitize(formatDateAT((meta as any)?.offer_date).replace(/\./g, "_"));
  const filename = `${nr}_${kunde}_${date}.pdf`;

  // 2) PDF laden (Angebot PDF Endpoint)
  const res = await fetch("/api/offer-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ offerId: id }),
  });

if (!res.ok) {
  const txt = await res.text();
  alert(txt || "PDF Fehler");
  return;
}


  const blob = await res.blob();

  // 3) Download mit Dateiname
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};


  const toDateOnly = (iso: string | null) => {
    if (!iso) return null;
    const d = new Date(iso);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  };

  const parseYmd = (ymd: string) => {
    const [y, m, d] = ymd.split("-").map((x) => parseInt(x, 10));
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
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
      <div className="min-h-screen flex items-center justify-center bg-gray-900 text-gray-100">
        <p>Lade...</p>
      </div>
    );
  }

  const filteredOffers = offers.filter((o) => {
    // 1) Status-Filter
    if (filter === "all") {
      if (!(o.status === "draft" || o.status === "final")) return false;
    } else {
      if (o.status !== filter) return false;
    }

    // 2) Datum von/bis
    const od = toDateOnly(o.offer_date);
    if ((dateFrom || dateTo) && !od) return false;

    if (dateFrom) {
      const df = parseYmd(dateFrom);
      if (df && od && od < df) return false;
    }
    if (dateTo) {
      const dt = parseYmd(dateTo);
      if (dt && od && od > dt) return false;
    }

    // 3) Textsuche
    const s = search.trim().toLowerCase();
    if (!s) return true;

    const num = o.offer_number ? String(o.offer_number) : "";
    const cust = o.customers?.name ?? "";

    return num.toLowerCase().includes(s) || cust.toLowerCase().includes(s);
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
                <h1 className="text-3xl font-bold">Angebote</h1>
                <p className="text-sm text-gray-300/80">Angebotsverwaltung · {role}</p>
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

          <p className="mt-2 text-gray-300">Neues Angebot anlegen oder bestehendes öffnen.</p>

          <div className="mt-6 grid gap-3">
            <button onClick={startNew} className="w-full bg-black text-white py-3 rounded">
              Neues Angebot anlegen
            </button>
          </div>
        </div>

        <div className="mt-6 bg-gray-800/80 border border-gray-700 rounded-xl shadow-lg p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Letzte Angebote</h2>
          </div>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-[320px_1fr] gap-6 items-start">
            {/* LINKS: Suche + Datum */}
            <div>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Suchen (Kunde, Nummer)…"
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

            {/* MITTE: Filter 2x2 */}
            <div className="grid grid-cols-2 gap-3 max-w-xs">
              {(["all", "draft", "final", "archive"] as const).map((k) => (
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
          </div>

          {error && (
            <div className="mt-4 p-3 bg-red-50 text-red-700 rounded">{error}</div>
          )}

          {filteredOffers.length === 0 ? (
            <p className="mt-4 text-gray-300/80">Noch keine Einträge.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm table-fixed">
                <thead>
                  <tr className="text-left border-b border-gray-700 text-gray-200">
                    <th className="py-3 w-[110px]">Nummer</th>
                    <th className="py-3 w-[80px]">Datum</th>
                    <th className="py-3 w-[220px]">Kunde</th>
                    <th className="py-3 w-[110px]">Status</th>
                    <th className="py-3 w-[140px] text-right">Aktionen</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOffers.map((o, i) => (
                    <tr
                      key={o.id}
                      className={[
                        "border-b border-gray-700 align-top hover:bg-gray-700/40",
                        i % 2 === 1 ? "bg-gray-800/40" : "bg-transparent",
                      ].join(" ")}
                    >
                      <td className="py-3">
                        {o.offer_number ?? <span className="text-gray-400 italic">—</span>}
                      </td>
                      <td className="py-3">{formatDate(o.offer_date)}</td>
                      <td className="py-3">
                        {o.customers?.name ?? <span className="text-gray-400 italic">—</span>}
                      </td>
                      <td className="py-3">
                        <span
                          className={[
                            "inline-block px-2 py-1 rounded text-xs font-medium",
                            o.status === "draft"
                              ? "bg-yellow-100 text-yellow-800"
                              : o.status === "final"
                              ? "bg-green-100 text-green-800"
                              : "bg-gray-200 text-gray-800",
                          ].join(" ")}
                        >
                          {o.status === "draft"
                            ? "Entwurf"
                            : o.status === "final"
                            ? "Final"
                            : "Archiv"}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex flex-col gap-2 items-end">
                         
			 <button
                            onClick={() => openOffer(o.id)}
                            className="px-3 py-3 w-[140px] rounded bg-black text-white"
                          >
                            Öffnen
                          </button>



{o.status !== "draft" && (
  <button
    onClick={() => openOfferPdf(o.id)}
    className="px-3 py-3 w-[140px] rounded border border-gray-700 bg-gray-900 hover:bg-gray-800 text-gray-100"
  >
    PDF öffnen
  </button>
)}

{o.status === "final" && (
  <button
    onClick={() => archiveOffer(o.id)}
    className="px-3 py-3 w-[140px] rounded border border-gray-700 bg-gray-900 hover:bg-gray-800 text-gray-100"
  >
    Angebot archivieren
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
