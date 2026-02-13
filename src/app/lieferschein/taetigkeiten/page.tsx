"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { WizardSteps, WizardButtons } from "@/components/WizardNav"; // Pfad ggf. anpassen

type NoteRow = {
  activities_text: string | null;
  photo_1: string | null;
  photo_2: string | null;
  photo_3: string | null;
  photo_4: string | null;
};

const MAX_PHOTOS = 4;

// DataURL -> komprimieren/resize (damit DB nicht explodiert)
async function fileToCompressedDataUrl(file: File, maxW = 1400, quality = 0.8): Promise<string> {
  const img = document.createElement("img");
  const objectUrl = URL.createObjectURL(file);

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Bild konnte nicht geladen werden"));
    img.src = objectUrl;
  });

  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;

  const scale = Math.min(1, maxW / w);
  const outW = Math.round(w * scale);
  const outH = Math.round(h * scale);

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas nicht verfügbar");

  ctx.drawImage(img, 0, 0, outW, outH);

  URL.revokeObjectURL(objectUrl);

  // als JPEG speichern (kleiner als PNG bei Fotos)
  return canvas.toDataURL("image/jpeg", quality);
}

export default function TaetigkeitenPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [text, setText] = useState("");
  const [photos, setPhotos] = useState<string[]>([]); // DataURLs

  const noteId =
    typeof window !== "undefined" ? localStorage.getItem("deliveryNoteId") : null;

  useEffect(() => {
    const run = async () => {
      if (!noteId) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("delivery_notes")
        .select("activities_text,photo_1,photo_2,photo_3,photo_4")
        .eq("id", noteId)
        .single();

      if (!error && data) {
        const row = data as any as NoteRow;
        setText(row.activities_text ?? "");
        setPhotos([row.photo_1, row.photo_2, row.photo_3, row.photo_4].filter(Boolean) as string[]);
      }

      setLoading(false);
    };

    run();
  }, [noteId]);

  const save = async () => {
    if (!noteId) return false;
    setSaving(true);

    const payload = {
      activities_text: text,
      photo_1: photos[0] ?? null,
      photo_2: photos[1] ?? null,
      photo_3: photos[2] ?? null,
      photo_4: photos[3] ?? null,
    };

    const { error } = await supabase
      .from("delivery_notes")
      .update(payload)
      .eq("id", noteId);

    setSaving(false);

    if (error) {
      alert(error.message);
      return false;
    }
    return true;
  };

  const onPickFiles = async (files: FileList | null) => {
    if (!files) return;

    const current = [...photos];
    const free = MAX_PHOTOS - current.length;
    if (free <= 0) {
      alert("Maximal 4 Fotos möglich.");
      return;
    }

    const take = Array.from(files).slice(0, free);

    try {
      const converted = await Promise.all(take.map((f) => fileToCompressedDataUrl(f)));
      setPhotos((p) => [...p, ...converted].slice(0, MAX_PHOTOS));
    } catch (e: any) {
      alert(e.message ?? "Fehler beim Foto verarbeiten");
    }
  };

  const removePhoto = (idx: number) => {
    setPhotos((p) => p.filter((_, i) => i !== idx));
  };

  const onBack = async () => {
    await save();
    window.location.href = "/lieferschein/mitarbeiter";
  };

  const onNext = async () => {
    const ok = await save();
    if (!ok) return;
    window.location.href = "/lieferschein/geraete";
  };

  if (loading) {
    return (
      <main className="min-h-screen p-6 bg-gray-900 text-gray-100">
        <div className="max-w-4xl mx-auto"><p>Lade…</p></div>
      </main>
    );
  }

  if (!noteId) {
    return (
      <main className="min-h-screen p-6 bg-gray-900 text-gray-100">
        <div className="max-w-4xl mx-auto">
          <p className="text-gray-300/80">Kein aktiver Entwurf gefunden.</p>
          <button className="mt-4 px-4 py-3 rounded bg-black text-white" onClick={() => (window.location.href = "/")}>
            Zur Übersicht
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-6 bg-gray-900 text-gray-100">
      <div className="max-w-4xl mx-auto">
        <div className="bg-gray-800/80 border border-gray-700 rounded-xl shadow-lg p-6">
          <h1 className="text-2xl font-bold">Tätigkeiten</h1>
          <p className="mt-2 text-gray-300">
            Tätigkeiten beschreiben und optional Fotos hinzufügen (max. 4).
          </p>

          <WizardSteps currentKey="taetigkeiten" />

          <div className="mt-6">
            <label className="text-sm text-gray-200">
              Tätigkeiten
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={7}
                placeholder="z.B. Hecken schneiden, Abtransport, Reinigung…"
                className="mt-2 w-full rounded px-3 py-3 text-sm bg-gray-900 border border-gray-700 text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500"
              />
            </label>

            <div className="mt-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-gray-100">Fotos</h2>
                  <p className="text-xs text-gray-300/80">Maximal 4 Fotos. Am Handy öffnet sich die Kamera.</p>
                </div>

                <label className="px-4 py-3 rounded border border-gray-700 bg-gray-900 hover:bg-gray-800 text-sm cursor-pointer">
                  Foto hinzufügen
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    multiple
                    className="hidden"
                    onChange={(e) => onPickFiles(e.target.files)}
                  />
                </label>
              </div>

              {photos.length === 0 ? (
                <p className="mt-3 text-sm text-gray-300/80">Noch keine Fotos.</p>
              ) : (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {photos.map((src, idx) => (
                    <div key={idx} className="relative rounded border border-gray-700 overflow-hidden bg-gray-900">
                      <img src={src} alt={`Foto ${idx + 1}`} className="w-full h-40 object-cover" />
                      <button
                        type="button"
                        onClick={() => removePhoto(idx)}
                        className="absolute top-2 right-2 text-xs px-2 py-1 rounded bg-black/70 border border-gray-600"
                      >
                        Entfernen
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-2 text-xs text-gray-400">{saving ? "Speichere…" : " "}</div>
          </div>

          <WizardButtons onBack={onBack} onNext={onNext} />
        </div>
      </div>
    </main>
  );
}
