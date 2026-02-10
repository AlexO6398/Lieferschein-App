"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { WizardSteps, WizardButtons } from "@/components/WizardNav";

type Material = {
  id: string;
  name: string;
};

type MaterialEntryRow = {
  id: string;
  qty: number;
  unit: string;
  materials: Material[] | Material | null;
};

type MaterialEntry = {
  id: string;
  qty: number;
  unit: string;
  materials: Material | null;
};


export default function MaterialPage() {
  const [deliveryNoteId, setDeliveryNoteId] = useState<string | null>(null);

  const [materials, setMaterials] = useState<Material[]>([]);
  const [selectedMaterialId, setSelectedMaterialId] = useState("");
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState("m³");
const [showNewMaterial, setShowNewMaterial] = useState(false);

  const [entries, setEntries] = useState<MaterialEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  // neues Material
  const [newName, setNewName] = useState("");

  useEffect(() => {
    const id = localStorage.getItem("deliveryNoteId");
    if (!id) {
      setError("Kein aktiver Lieferschein gefunden.");
      return;
    }
    setDeliveryNoteId(id);
    loadMaterials();
    loadEntries(id);
  }, []);

  const loadMaterials = async () => {
    const { data, error } = await supabase
      .from("materials")
      .select("id,name")
      .order("name");

    if (error) setError(error.message);
    else setMaterials(data ?? []);
  };

const loadEntries = async (noteId: string) => {
  const { data, error } = await supabase
    .from("delivery_material_entries")
    .select("id,qty,unit,materials(id,name)")
    .eq("delivery_note_id", noteId);

  if (error) {
    setError(error.message);
    return;
  }

  const rows = (data ?? []) as MaterialEntryRow[];

  const normalized: MaterialEntry[] = rows.map((r) => ({
    id: r.id,
    qty: r.qty,
    unit: r.unit,
    materials: Array.isArray(r.materials) ? r.materials[0] ?? null : r.materials,
  }));

  setEntries(normalized);
};


  const addEntry = async () => {
    if (!deliveryNoteId || !selectedMaterialId || !qty || !unit.trim()) return;

    const { error } = await supabase.from("delivery_material_entries").insert([
      {
        delivery_note_id: deliveryNoteId,
        material_id: selectedMaterialId,
        qty: Number(qty),
        unit: unit.trim(),
      },
    ]);

    if (error) {
      setError(error.message);
      return;
    }

    setSelectedMaterialId("");
    setQty("");
    setUnit("m³");
    loadEntries(deliveryNoteId);
  };

  const addMaterial = async () => {
    if (!newName.trim()) return;

    const { error } = await supabase.from("materials").insert([
      {
        name: newName.trim(),
      },
    ]);

    if (error) {
      setError(error.message);
      return;
    }

    setNewName("");
    loadMaterials();
  };

  const removeEntry = async (id: string) => {
    if (!deliveryNoteId) return;
    await supabase.from("delivery_material_entries").delete().eq("id", id);
    loadEntries(deliveryNoteId);
  };

  return (
    <main className="min-h-screen p-6 bg-gray-100">
<div className="max-w-xl mx-auto bg-white p-6 rounded shadow flex flex-col min-h-[80vh]">
        <h1 className="text-2xl font-bold">Lieferschein – Material</h1>

<WizardSteps currentKey="material" />

        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded">
            {error}
          </div>
        )}

        {/* Material hinzufügen */}
        <div className="mt-6">
          <label className="block font-medium">Material auswählen</label>
          <select
            className="w-full border p-2 rounded mt-1"
            value={selectedMaterialId}
            onChange={(e) => setSelectedMaterialId(e.target.value)}
          >
            <option value="">— bitte auswählen —</option>
            {materials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>

          <div className="grid grid-cols-2 gap-2 mt-2">
            <input
              type="number"
              step="0.01"
              placeholder="Menge"
              className="w-full border p-2 rounded"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
            <input
              placeholder="Einheit (z.B. m³, t, kg)"
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
          <h2 className="font-semibold mb-2">Erfasstes Material</h2>
          {entries.length === 0 && <p className="text-sm">Noch keine Einträge.</p>}
          <ul className="space-y-2">
            {entries.map((e) => (
              <li
                key={e.id}
                className="flex justify-between items-center border p-2 rounded"
              >
				<span>
					{e.materials?.name ?? "—"} – {e.qty} {e.unit}
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

        {/* Neues Material */}
        <hr className="my-6" />
<button
  type="button"
  onClick={() => setShowNewMaterial((v) => !v)}
  className="mt-6 flex items-center gap-2 text-sm font-medium"
>
  {showNewMaterial ? "▼" : "▶"} Neues Material anlegen
</button>

{showNewMaterial && (
  <div className="mt-4 border rounded p-4 bg-gray-50">

        <input
          className="w-full border p-2 rounded mt-2"
          placeholder="Materialname (z.B. Sand, Kies, Humus)"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />

        <button
          onClick={addMaterial}
          className="mt-2 bg-gray-700 text-white py-2 px-4 rounded"
        >
          Material speichern
        </button>

  </div>
)}

<WizardButtons
  canGoNext={true}
  onBack={() => (window.location.href = "/lieferschein/geraete")}
  onNext={() => (window.location.href = "/lieferschein/zusammenfassung")}
/>      

</div>


    </main>
  );
}
