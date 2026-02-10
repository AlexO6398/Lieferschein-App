"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { WizardSteps, WizardButtons } from "@/components/WizardNav";

export default function ZusammenfassungPage() {
  const [deliveryNoteId, setDeliveryNoteId] = useState<string | null>(null);
  const [customer, setCustomer] = useState<any>(null);
  const [workers, setWorkers] = useState<any[]>([]);
  const [machines, setMachines] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [noteNumber, setNoteNumber] = useState<string | null>(null);
  const [hasSignature, setHasSignature] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  useEffect(() => {
    const id = localStorage.getItem("deliveryNoteId");
    if (!id) {
      setError("Kein aktiver Lieferschein.");
      return;
    }
    setDeliveryNoteId(id);
    loadAll(id);
  }, []);

  const loadAll = async (id: string) => {
    const { data: note } = await supabase
      .from("delivery_notes")
      .select("note_number, customer_id, customers(name,street,zip,city,email)")
      .eq("id", id)
      .single();

    setNoteNumber(note?.note_number ?? null);
    setCustomer(note?.customers);

    const { data: w } = await supabase
      .from("delivery_worker_entries")
      .select("hours, workers(name)")
      .eq("delivery_note_id", id);
    setWorkers(w ?? []);

    const { data: g } = await supabase
      .from("delivery_machine_entries")
      .select("qty,unit, machines(name)")
      .eq("delivery_note_id", id);
    setMachines(g ?? []);

    const { data: m } = await supabase
      .from("delivery_material_entries")
      .select("qty,unit, materials(name)")
      .eq("delivery_note_id", id);
    setMaterials(m ?? []);
  };

const startDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
  drawing.current = true;

  const canvas = canvasRef.current!;
  const ctx = canvas.getContext("2d")!;
  const rect = canvas.getBoundingClientRect();

  // Startpunkt setzen (sonst zieht er manchmal von (0,0))
  ctx.beginPath();
  ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);

  // Pointer "capturen", damit Zeichnen nicht abbricht wenn Finger raus rutscht
  (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
};

const endDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
  drawing.current = false;
  setHasSignature(true);
  try {
    (e.currentTarget as HTMLCanvasElement).releasePointerCapture(e.pointerId);
  } catch {}
};

const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
  if (!drawing.current) return;

  const canvas = canvasRef.current!;
  const ctx = canvas.getContext("2d")!;
  const rect = canvas.getBoundingClientRect();

  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.strokeStyle = "black";

  ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
};


  const clearSignature = () => {
    const canvas = canvasRef.current!;
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  const finalize = async () => {
    if (!deliveryNoteId) return;

    setError(null);
    setSaving(true);

    try {
      const canvas = canvasRef.current;
      if (!canvas) {
        setError("Unterschrift-Feld fehlt.");
        setSaving(false);
        return;
      }

      const dataUrl = canvas.toDataURL("image/png");

      if (!dataUrl || dataUrl.length < 2000) {
        setError("Keine Unterschrift vorhanden");
        setSaving(false);
        return;
      }

      const { error: sigErr } = await supabase
        .from("delivery_notes")
        .update({ signature: dataUrl })
        .eq("id", deliveryNoteId);

      if (sigErr) {
        setError("Unterschrift konnte nicht gespeichert werden: " + sigErr.message);
        setSaving(false);
        return;
      }

      const res = await fetch("/api/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deliveryNoteId }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(json.error ?? "Fehler beim Abschließen");
      } else {
        alert("Erfolgreich Abgeschlossen ✅");
        localStorage.removeItem("deliveryNoteId");
        window.location.href = "/";
      }
    } catch (e: any) {
      setError(e.message ?? "Fehler");
    }

    setSaving(false);
  };

  return (
    <main className="min-h-screen p-6 bg-gray-900 text-gray-100">
      <div className="max-w-xl mx-auto bg-gray-800/80 border border-gray-700 p-6 rounded-xl shadow-lg flex flex-col min-h-[80vh]">
        <h1 className="text-2xl font-bold">Zusammenfassung</h1>

        <WizardSteps currentKey="zusammenfassung" />

        <div className="mt-2 text-sm text-gray-300">
          <strong>Nummer:</strong>{" "}
          {noteNumber ? (
            <span>{noteNumber}</span>
          ) : (
            <span className="text-gray-400 italic">
              wird beim Abschließen vergeben
            </span>
          )}
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-900/40 border border-red-700 text-red-200 rounded">
            {error}
          </div>
        )}

        {/* Kunde */}
        <section className="mt-6">
          <h2 className="font-semibold text-gray-200">Kunde</h2>
          {customer && (
            <p className="text-gray-300">
              {customer.name}
              <br />
              {customer.street}
              <br />
              {customer.zip} {customer.city}
              <br />
              {customer.email}
            </p>
          )}
        </section>

        {/* Mitarbeiter */}
        <section className="mt-6">
          <h2 className="font-semibold text-gray-200">Mitarbeiter</h2>
          <ul className="text-gray-300">
            {workers.map((w, i) => (
              <li key={i}>
                {w.workers.name} – {w.hours} Std.
              </li>
            ))}
          </ul>
        </section>

        {/* Geräte */}
        <section className="mt-6">
          <h2 className="font-semibold text-gray-200">Geräte</h2>
          <ul className="text-gray-300">
            {machines.map((g, i) => (
              <li key={i}>
                {g.machines.name} – {g.qty} {g.unit}
              </li>
            ))}
          </ul>
        </section>

        {/* Material */}
        <section className="mt-6">
          <h2 className="font-semibold text-gray-200">Material</h2>
          <ul className="text-gray-300">
            {materials.map((m, i) => (
              <li key={i}>
                {m.materials.name} – {m.qty} {m.unit}
              </li>
            ))}
          </ul>
        </section>

        {/* Unterschrift */}
        <section className="mt-6">
          <h2 className="font-semibold text-gray-200">Unterschrift Kunde</h2>
<canvas
  ref={canvasRef}
  width={400}
  height={150}
  className="border border-gray-700 bg-gray-100 mt-2 w-full max-w-[400px] rounded touch-none select-none"
  onPointerDown={startDraw}
  onPointerUp={endDraw}
  onPointerMove={draw}
  onPointerLeave={endDraw}
/>

          <button
            onClick={clearSignature}
            className="mt-2 text-sm text-red-400 hover:text-red-300"
          >
            Unterschrift löschen
          </button>
        </section>

        {(!customer || !hasSignature) && (
          <p className="text-sm text-red-300 mt-2">
            Bitte Kunde auswählen und unterschreiben, um abzuschließen.
          </p>
        )}

        <WizardButtons
          canGoNext={!saving && customer && hasSignature}
          backLabel="Zurück"
          nextLabel="Abschließen"
          onBack={() => (window.location.href = "/lieferschein/material")}
          onNext={finalize}
        />
      </div>
    </main>
  );
}
