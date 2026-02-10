"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { WizardSteps, WizardButtons } from "@/components/WizardNav";

type Machine = {
  id: string;
  name: string;
};

type MachineEntryRow = {
  id: string;
  qty: number;
  unit: string;
  // Supabase kann hier (je nach Relation) Array oder Objekt liefern – wir fangen beides ab
  machines: Machine[] | Machine | null;
};

type MachineEntry = {
  id: string;
  qty: number;
  unit: string;
  machines: Machine | null;
};

export default function GeraetePage() {
  const [deliveryNoteId, setDeliveryNoteId] = useState<string | null>(null);

  const [machines, setMachines] = useState<Machine[]>([]);
  const [selectedMachineId, setSelectedMachineId] = useState("");
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState("Std.");
  const [showNewMachine, setShowNewMachine] = useState(false);

  const [entries, setEntries] = useState<MachineEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [newName, setNewName] = useState("");

  useEffect(() => {
    const id = localStorage.getItem("deliveryNoteId");
    if (!id) {
      setError("Kein aktiver Lieferschein gefunden.");
      return;
    }
    setDeliveryNoteId(id);
    loadMachines();
    loadEntries(id);
  }, []);

  const loadMachines = async () => {
    const { data, error } = await supabase
      .from("machines")
      .select("id,name")
      .order("name");

    if (error) setError(error.message);
    else setMachines((data ?? []) as Machine[]);
  };

  const loadEntries = async (noteId: string) => {
    const { data, error } = await supabase
      .from("delivery_machine_entries")
      .select("id,qty,unit,machines(id,name)")
      .eq("delivery_note_id", noteId);

    if (error) {
      setError(error.message);
      return;
    }

    const rows = (data ?? []) as MachineEntryRow[];

    const normalized: MachineEntry[] = rows.map((r) => ({
      id: r.id,
      qty: r.qty,
      unit: r.unit,
      machines: Array.isArray(r.machines) ? r.machines[0] ?? null : r.machines,
    }));

    setEntries(normalized);
  };

  const addEntry = async () => {
    if (!deliveryNoteId || !selectedMachineId || !qty || !unit.trim()) return;

    const { error } = await supabase.from("delivery_machine_entries").insert([
      {
        delivery_note_id: deliveryNoteId,
        machine_id: selectedMachineId,
        qty: Number(qty),
        unit: unit.trim(),
      },
    ]);

    if (error) {
      setError(error.message);
      return;
    }

    setSelectedMachineId("");
    setQty("");
    setUnit("Std.");
    loadEntries(deliveryNoteId);
  };

  const addMachine = async () => {
    if (!newName.trim()) return;

    const { error } = await supabase.from("machines").insert([
      {
        name: newName.trim(),
      },
    ]);

    if (error) {
      setError(error.message);
      return;
    }

    setNewName("");
    loadMachines();
  };

  const removeEntry = async (id: string) => {
    if (!deliveryNoteId) return;
    await supabase.from("delivery_machine_entries").delete().eq("id", id);
    loadEntries(deliveryNoteId);
  };

  return (
    <main className="min-h-screen p-6 bg-gray-100">
      <div className="max-w-xl mx-auto bg-white p-6 rounded shadow flex flex-col min-h-[80vh]">
        <h1 className="text-2xl font-bold">Lieferschein – Geräte & Maschinen</h1>

        <WizardSteps currentKey="geraete" />

        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded">
            {error}
          </div>
        )}

        {/* Gerät hinzufügen */}
        <div className="mt-6">
          <label className="block font-medium">Gerät auswählen</label>
          <select
            className="w-full border p-2 rounded mt-1"
            value={selectedMachineId}
            onChange={(e) => setSelectedMachineId(e.target.value)}
          >
            <option value="">— bitte auswählen —</option>
            {machines.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>

          <div className="grid grid-cols-2 gap-2 mt-2">
            <input
              type="number"
              step="0.25"
              placeholder="Menge"
              className="w-full border p-2 rounded"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
            <input
              placeholder="Einheit (z.B. Std., Pauschal)"
              className="w-full border p-2 rounded"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
            />
          </div>

          <button
            onClick={addEntry}
            className="mt-2 bg-black text-white py-2 px-4 rounded"
          >
            Hinzufügen
          </button>
        </div>

        {/* Liste */}
        <div className="mt-6">
          <h2 className="font-semibold mb-2">Erfasste Geräte</h2>
          {entries.length === 0 && <p className="text-sm">Noch keine Einträge.</p>}
          <ul className="space-y-2">
            {entries.map((e) => (
              <li
                key={e.id}
                className="flex justify-between items-center border p-2 rounded"
              >
                <span>
                  {(e.machines?.name ?? "—")} – {e.qty} {e.unit}
                </span>
                <button
                  onClick={() => removeEntry(e.id)}
                  className="text-red-600 text-sm"
                >
                  entfernen
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Neues Gerät */}
        <hr className="my-6" />

        <button
          type="button"
          onClick={() => setShowNewMachine((v) => !v)}
          className="mt-6 flex items-center gap-2 text-sm font-medium"
        >
          {showNewMachine ? "▼" : "▶"} Neues Gerät anlegen
        </button>

        {showNewMachine && (
          <div className="mt-4 border rounded p-4 bg-gray-50">
            <input
              className="w-full border p-2 rounded mt-2"
              placeholder="Gerätename (z.B. Bagger, Radlader)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />

            <button
              onClick={addMachine}
              className="mt-2 bg-gray-700 text-white py-2 px-4 rounded"
            >
              Gerät speichern
            </button>
          </div>
        )}

        <WizardButtons
          canGoNext={true}
          onBack={() => (window.location.href = "/lieferschein/mitarbeiter")}
          onNext={() => (window.location.href = "/lieferschein/material")}
        />
      </div>
    </main>
  );
}
