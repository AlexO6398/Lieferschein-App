"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Role = "office" | "field";

type DeliveryWorkerEntryRow = {
  hours: number | null;

  delivery_notes: {
    note_date: string | null;
    status: string;
  } | null;

  workers: {
    name: string | null;
  } | null;
};

type DayEntry = {
  dateYmd: string; // YYYY-MM-DD
  weekday: string; // Montag, Dienstag, ...
  hours: number;
  isWeekend: boolean;
};

type EmployeeReport = {
  name: string;
  totalHours: number;
  days: DayEntry[];
};

const toYmd = (d: Date) => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const parseYmdLocal = (ymd: string) => {
  // "YYYY-MM-DD" -> lokales Datum ohne TZ-Probleme
  const [y, m, d] = ymd.split("-").map((x) => parseInt(x, 10));
  return new Date(y, (m || 1) - 1, d || 1);
};

const isWeekend = (d: Date) => {
  const day = d.getDay(); // 0=So, 6=Sa
  return day === 0 || day === 6;
};

const formatDateAT = (ymd: string) => {
  // erwartet "YYYY-MM-DD"
  const [y, m, d] = ymd.split("-");
  if (!y || !m || !d) return ymd;
  return `${d}.${m}.${y}`;
};

const weekdayDe = (d: Date) =>
  new Intl.DateTimeFormat("de-AT", { weekday: "long" }).format(d);

export default function AuswertungPage() {
  const router = useRouter();

  const [role, setRole] = useState<Role | null>(null);
  const [loadingRole, setLoadingRole] = useState(true);

  const [dateFrom, setDateFrom] = useState<string>(() => {
    const now = new Date();
    // Default: aktueller Monat 1. bis heute
    return toYmd(new Date(now.getFullYear(), now.getMonth(), 1));
  });
  const [dateTo, setDateTo] = useState<string>(() => toYmd(new Date()));

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [entries, setEntries] = useState<DeliveryWorkerEntryRow[]>([]);
  const [openEmployees, setOpenEmployees] = useState<Record<string, boolean>>({});

  // --- Role Guard (office-only) ---
  useEffect(() => {
    const init = async () => {
      setError(null);
      setLoadingRole(true);

      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        router.replace(`/login?next=/auswertung`);
        return;
      }

      const { data: roleData, error: roleError } = await supabase
        .from("user_roles")
        .select("role")
        .single();

      if (roleError || !roleData?.role) {
        setError("Rolle konnte nicht geladen werden");
        setLoadingRole(false);
        return;
      }

      const r = roleData.role as Role;
      setRole(r);

      // ✅ field -> sofort zurück zur Landing
      if (r !== "office") {
        router.replace("/");
        return;
      }

      setLoadingRole(false);
    };

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadData = async () => {
    setError(null);
    setLoading(true);

    try {
      // inclusive range: dateTo + 1 Tag als upper bound (supabase uses lt/gt gut)
      const from = dateFrom;
      const toNext = toYmd(new Date(parseYmdLocal(dateTo).getTime() + 24 * 60 * 60 * 1000));

      // ✅ Wir werten standardmäßig NUR final aus (typisch gewünscht).
      // Wenn du auch draft willst: .in("status", ["final","draft"])
      const { data, error } = await supabase
        .from("delivery_worker_entries")
        .select("hours,delivery_notes(note_date,status),workers(name)")
        .in("delivery_notes.status", ["final", "archive"])
        .gte("delivery_notes.note_date", from)
        .lt("delivery_notes.note_date", toNext)
        .order("created_at", { ascending: true });

      if (error) throw error;
setEntries(((data as any) ?? []) as DeliveryWorkerEntryRow[]);
    } catch (e: any) {
      setError(e?.message ?? "Fehler beim Laden");
      setEntries([]);
    } finally {
      setLoading(false);
    }
  };

  // Auto-load wenn office ready
  useEffect(() => {
    if (role === "office" && !loadingRole) {
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, loadingRole]);

  // --- Compute report ---
  const report: EmployeeReport[] = useMemo(() => {
    // Baue Datums-Liste (inkl. alle Tage im Range)
    const start = parseYmdLocal(dateFrom);
    const end = parseYmdLocal(dateTo);
    const allDates: Date[] = [];
    for (let d = new Date(start); d <= end; d = new Date(d.getTime() + 24 * 60 * 60 * 1000)) {
      allDates.push(new Date(d));
    }

    // Sammle hours pro employee pro dateYmd
    const map = new Map<string, Map<string, number>>(); // employee -> (dateYmd -> hours)


    for (const e of entries) {
  const date = e.delivery_notes?.note_date;
  const status = e.delivery_notes?.status;

  if (!date || (status !== "final" && status !== "archive")) continue;

  const dateYmd = date.slice(0, 10);

  const name = String(e.workers?.name ?? "").trim();
  if (!name) continue;

  const hours = Number(e.hours ?? 0) || 0;

  if (!map.has(name)) map.set(name, new Map());
  const perDay = map.get(name)!;
  perDay.set(dateYmd, (perDay.get(dateYmd) ?? 0) + hours);

    }

    const out: EmployeeReport[] = [];

    // Alle Mitarbeiter, die im Zeitraum vorkommen
    const employees = Array.from(map.keys()).sort((a, b) => a.localeCompare(b, "de"));

    for (const emp of employees) {
      const perDay = map.get(emp)!;

      // Tage aufbereiten:
      const days: DayEntry[] = [];

      for (const d of allDates) {
        const ymd = toYmd(d);
        const weekend = isWeekend(d);
        const h = perDay.get(ymd) ?? 0;

        // Mo–Fr: immer zeigen (auch 0)
        // Sa/So: nur zeigen, wenn h > 0
        if (!weekend) {
          days.push({
            dateYmd: ymd,
            weekday: weekdayDe(d),
            hours: h,
            isWeekend: false,
          });
        } else if (h > 0) {
          days.push({
            dateYmd: ymd,
            weekday: weekdayDe(d),
            hours: h,
            isWeekend: true,
          });
        }
      }

      const total = days.reduce((a, x) => a + (x.hours || 0), 0);

      out.push({
        name: emp,
        totalHours: total,
        days,
      });
    }

    return out;
  }, [entries, dateFrom, dateTo]);

  const downloadCsv = () => {
    // CSV: Employee, TotalHours, Date, Weekday, Hours
    const rows: string[] = [];
    rows.push(["Mitarbeiter", "Summe Stunden", "Datum", "Wochentag", "Stunden"].join(";"));

    const formatHoursAT = (n: number) =>
  n.toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    for (const emp of report) {
      // optional: 1 Summary row
      rows.push([emp.name, formatHoursAT(emp.totalHours), "", "", ""].join(";"));
      for (const d of emp.days) {
        rows.push([
          emp.name,
          formatHoursAT(emp.totalHours),
          formatDateAT(d.dateYmd),
          d.weekday,
          formatHoursAT(d.hours),
        ].join(";"));
      }
    }

    const csv = "\uFEFF" + rows.join("\n"); // BOM für Excel
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `auswertung_${dateFrom}_bis_${dateTo}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  if (loadingRole || !role) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-900 text-gray-100">
        <p>Lade…</p>
      </main>
    );
  }

  // field wird bereits weggeschickt; hier nur fallback
  if (role !== "office") return null;

  return (
    <main className="min-h-screen p-6 bg-gray-900 text-gray-100">
      <div className="max-w-5xl mx-auto">
        <div className="bg-gray-800/80 border border-gray-700 rounded-xl shadow-lg p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold">Auswertung</h1>
              <p className="mt-2 text-gray-300/80">
                Stunden je Mitarbeiter (aus finalen Lieferscheinen)
              </p>
            </div>

            <button
              type="button"
              onClick={() => router.push("/")}
              className="px-3 py-2 rounded border text-sm bg-gray-900 text-gray-100 border-gray-700 hover:bg-gray-800 transition-colors"
            >
              Zur Übersicht
            </button>
          </div>

          {error && (
            <div className="mt-4 p-3 bg-red-900/40 border border-red-700 text-red-200 rounded">
              {error}
            </div>
          )}

          {/* Filter */}
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto_auto] gap-3 items-end">
            <label className="text-sm text-gray-200">
              von
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="mt-1 w-full rounded px-3 py-2 text-sm bg-gray-900 border border-gray-700 text-gray-100"
              />
            </label>

            <label className="text-sm text-gray-200">
              bis
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="mt-1 w-full rounded px-3 py-2 text-sm bg-gray-900 border border-gray-700 text-gray-100"
              />
            </label>

            <button
              type="button"
              onClick={loadData}
              disabled={loading}
              className="px-5 py-3 rounded bg-gray-100 text-gray-900 hover:bg-white disabled:opacity-60"
            >
              {loading ? "Lade…" : "Aktualisieren"}
            </button>

            <button
              type="button"
              onClick={downloadCsv}
              disabled={loading || report.length === 0}
              className="px-5 py-3 rounded border border-gray-700 bg-gray-900 hover:bg-gray-800 disabled:opacity-60"
            >
              CSV herunterladen
            </button>
          </div>
        </div>

        {/* Results */}
        <div className="mt-6 bg-gray-800/80 border border-gray-700 rounded-xl shadow-lg p-6">
          {loading ? (
            <p className="text-gray-300/80">Lade Daten…</p>
          ) : report.length === 0 ? (
            <p className="text-gray-300/80">Keine Daten im gewählten Zeitraum.</p>
          ) : (
            <div className="space-y-3">
              {report.map((emp) => {
                const isOpen = !!openEmployees[emp.name];
                return (
                  <div key={emp.name} className="border border-gray-700 rounded">
                    <button
                      type="button"
                      onClick={() =>
                        setOpenEmployees((prev) => ({ ...prev, [emp.name]: !prev[emp.name] }))
                      }
                      className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-gray-700/30"
                    >
                      <div>
                        <div className="font-semibold">{emp.name}</div>
                        <div className="text-sm text-gray-300/80">
                          Summe: <span className="font-medium">{emp.totalHours.toFixed(2)}</span> Stunden
                        </div>
                      </div>
                      <div className="text-gray-300">{isOpen ? "▼" : "▶"}</div>
                    </button>

                    {isOpen && (
                      <div className="px-4 pb-4">
                        <div className="mt-2 overflow-x-auto">
                          <table className="w-full text-sm table-fixed">
                            <thead>
                              <tr className="text-left border-b border-gray-700 text-gray-200">
                                <th className="py-2 w-[140px]">Datum</th>
                                <th className="py-2">Wochentag</th>
                                <th className="py-2 w-[120px] text-right">Stunden</th>
                              </tr>
                            </thead>
                            <tbody>
                              {emp.days.map((d, idx) => (
                                <tr
                                  key={d.dateYmd}
                                  className={[
                                    "border-b border-gray-700",
                                    idx % 2 === 1 ? "bg-gray-800/40" : "bg-transparent",
                                  ].join(" ")}
                                >
                                  <td className="py-2">{formatDateAT(d.dateYmd)}</td>
                                  <td className="py-2">
                                    {d.weekday}
                                    {d.isWeekend ? (
                                      <span className="ml-2 text-xs text-gray-400">(Wochenende)</span>
                                    ) : null}
                                  </td>
                                  <td className="py-2 text-right">{d.hours.toFixed(2)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}