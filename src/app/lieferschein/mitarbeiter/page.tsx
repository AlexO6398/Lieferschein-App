"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { WizardSteps, WizardButtons } from "@/components/WizardNav";

type Worker = {
  id: string;
  name: string;
  role: string | null;
};

type WorkerEntryRow = {
  id: string;
  hours: number;
  workers: Worker[] | Worker | null;
};

type WorkerEntry = {
  id: string;
  hours: number;
  workers: Worker | null;
};

export default function MitarbeiterPage() {
  const [deliveryNoteId, setDeliveryNoteId] = useState<string | null>(null);

  const [workers, setWorkers] = useState<Worker[]>([]);
  const [selectedWorkerId, setSelectedWorkerId] = useState("");
  const [hours, setHours] = useState("");
  const [showNewWorker, setShowNewWorker] = useState(false);

  const [entries, setEntries] = useState<WorkerEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("");

  useEffect(() => {
    const id = localStorage.getItem("deliveryNoteId");
    if (!id) {
      setError("Kein aktiver Lieferschein gefunden.");
      return;
    }
    setDeliveryNoteId(id);
    loadWorkers();
    loadEntries(id);
  }, []);

  const loadWorkers = async () => {
    const { data, error } = await supabase
      .from("workers")
      .select("id,name,role")
      .eq("is_archived", false)
      .order("name");

    if (error) setError(error.message);
    else setWorkers(data ?? []);
  };

  const loadEntries = async (noteId: string) => {
    const { data, error } = await supabase
      .from("delivery_worker_entries")
      .select("id,hours,workers(id,name,role)")
      .eq("delivery_note_id", noteId);

    if (error) {
      setError(error.message);
      return;
    }

    const rows = (data ?? []) as WorkerEntryRow[];

    const normalized: WorkerEntry[] = rows.map((r) => ({
      id: r.id,
      hours: r.hours,
      workers: Array.isArray(r.workers) ? r.workers[0] ?? null : r.workers,
    }));

    setEntries(normalized);
  };

  const addEntry = async () => {
    if (!deliveryNoteId || !selectedWorkerId || !hours) return;

    const { error } = await supabase.from("delivery_worker_entries").insert([
      {
        delivery_note_id: deliveryNoteId,
        worker_id: selectedWorkerId,
        hours: Number(hours),
      },
    ]);

    if (error) {
      setError(error.message);
      return;
    }

    setSelectedWorkerId("");
    setHours("");
    loadEntries(deliveryNoteId);
  };

  const addWorker = async () => {
    if (!newName.trim()) return;

    const { error } = await supabase.from("workers").insert([
      {
        name: newName.trim(),
        role: newRole.trim() || null,
      },
    ]);

    if (error) {
      setError(error.message);
      return;
    }

    setNewName("");
    setNewRole("");
    loadWorkers();
  };

  const removeEntry = async (id: string) => {
    if (!deliveryNoteId) return;

    await supabase.from("delivery_worker_entries").delete().eq("id", id);
    loadEntries(deliveryNoteId);
  };

  return (
    <main className="min-h-screen p-6 bg-gray-900 text-gray-100">
      <div className="max-w-xl mx-auto bg-gray-800/80 border border-gray-700 p-6 rounded-xl shadow-lg flex flex-col min-h-[80vh]">
        <h1 className="text-2xl font-bold">Lieferschein – Mitarbeiter</h1>

        <WizardSteps currentKey="mitarbeiter" />

        {error && (
          <div className="mt-4 p-3 bg-red-900/40 border border-red-700 text-red-200 rounded">
            {error}
          </div>
        )}

        {/* Mitarbeiter hinzufügen */}
        <div className="mt-6">
          <label className="block font-medium text-gray-200">
            Mitarbeiter auswählen
          </label>
          <select
            className="w-full mt-1 rounded bg-gray-900 border border-gray-700 p-2 text-gray-100"
            value={selectedWorkerId}
            onChange={(e) => setSelectedWorkerId(e.target.value)}
          >
            <option value="">— bitte auswählen —</option>
            {workers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} {w.role ? `(${w.role})` : ""}
              </option>
            ))}
          </select>

          <input
            type="number"
            step="0.25"
            placeholder="Stunden"
            className="w-full border border-gray-700 bg-gray-900 p-2 rounded mt-2 text-gray-100 placeholder:text-gray-400"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
          />

          <button
            onClick={addEntry}
            className="mt-2 bg-gray-100 text-gray-900 py-2 px-4 rounded hover:bg-white"
          >
            Hinzufügen
          </button>
        </div>

        {/* Liste */}
        <div className="mt-6">
          <h2 className="font-semibold mb-2">Erfasste Mitarbeiter</h2>
          {entries.length === 0 && (
            <p className="text-sm text-gray-300">
              Noch keine Einträge.
            </p>
          )}
          <ul className="space-y-2">
            {entries.map((e) => (
              <li
                key={e.id}
                className="flex justify-between items-center border border-gray-700 bg-gray-900/60 p-2 rounded"
              >
                <span>
                  {e.workers?.name ?? "—"} – {e.hours} Std.
                </span>
                <button
                  onClick={() => removeEntry(e.id)}
                  className="text-red-400 text-sm hover:text-red-300"
                >
                  entfernen
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Neuer Mitarbeiter */}
        <hr className="my-6 border-gray-700" />

        <button
          type="button"
          onClick={() => setShowNewWorker((v) => !v)}
          className="mt-6 flex items-center gap-2 text-sm font-medium text-gray-200"
        >
          {showNewWorker ? "▼" : "▶"} Neuen Mitarbeiter anlegen
        </button>

        {showNewWorker && (
          <div className="mt-4 border border-gray-700 rounded p-4 bg-gray-900/60">
            <input
              className="w-full border border-gray-700 bg-gray-900 p-2 rounded mt-2 text-gray-100 placeholder:text-gray-400"
              placeholder="Name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <input
              className="w-full border border-gray-700 bg-gray-900 p-2 rounded mt-2 text-gray-100 placeholder:text-gray-400"
              placeholder="Rolle (z.B. Vorarbeiter)"
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
            />

            <button
              onClick={addWorker}
              className="mt-2 bg-gray-700 hover:bg-gray-600 text-white py-2 px-4 rounded"
            >
              Mitarbeiter speichern
            </button>
          </div>
        )}

        <WizardButtons
          canGoNext={true}
          onBack={() => (window.location.href = "/lieferschein/kunde")}
          onNext={() => (window.location.href = "/lieferschein/taetigkeiten")}
        />
      </div>
    </main>
  );
}
