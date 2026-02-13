"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";

/* =========================
   TYPES
========================= */

type Customer = {
  id: string;
  name: string;
};

type SectionRow = {
  qty: number;
  unit: string;
  article: string;
  articleText?: string; 
  price: number;
};


type Section = {
  number: string;
  title: string;
  descriptionHtml: string;
  rows: SectionRow[];
};

/* =========================
   RICH EDITOR
========================= */

function RichEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (html: string) => void;
}) {
  const editor = useEditor({
    extensions: [StarterKit, Underline],
    content: value || "",
    // wichtig für Next/SSR Hydration:
    immediatelyRender: false,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  if (!editor) return null;

  return (
    <div className="border border-gray-700 rounded bg-gray-900">
      <div className="flex gap-2 border-b border-gray-700 p-2">
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`px-2 py-1 text-xs rounded border ${
            editor.isActive("bold")
              ? "bg-gray-100 text-gray-900"
              : "bg-gray-900 text-gray-100 border-gray-700"
          }`}
        >
          Fett
        </button>

        <button
          type="button"
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={`px-2 py-1 text-xs rounded border ${
            editor.isActive("underline")
              ? "bg-gray-100 text-gray-900"
              : "bg-gray-900 text-gray-100 border-gray-700"
          }`}
        >
          Unterstrichen
        </button>

        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={`px-2 py-1 text-xs rounded border ${
            editor.isActive("bulletList")
              ? "bg-gray-100 text-gray-900"
              : "bg-gray-900 text-gray-100 border-gray-700"
          }`}
        >
          Liste
        </button>
      </div>

      <div className="p-2">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

/* =========================
   PAGE
========================= */

export default function OfferNewPage() {
  const router = useRouter();

  const [offerId, setOfferId] = useState<string | null>(null);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState("");

  const [summary, setSummary] = useState("");
  const [salutation, setSalutation] = useState("");

  const [sections, setSections] = useState<Section[]>([]);

  /* =========================
     INIT
  ========================= */

  useEffect(() => {
    const id = localStorage.getItem("offerId");
    if (!id) {
      router.push("/angebot");
      return;
    }
    setOfferId(id);

    loadCustomers();
    loadOffer(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadCustomers = async () => {
    const { data, error } = await supabase
      .from("customers")
      .select("id,name")
      .eq("is_archived", false)
      .order("name");

    if (error) {
      console.error(error);
      return;
    }
    setCustomers((data as any) ?? []);
  };

  const loadOffer = async (id: string) => {
    // WICHTIG: wir lesen direkt sections (nicht "content")
    const { data, error } = await supabase
      .from("offers")
      .select("customer_id,subject,salutation,sections,status")
      .eq("id", id)
      .single();

    if (error) {
      console.error(error);
      return;
    }
    if (!data) return;

    setCustomerId((data as any).customer_id ?? "");
    setSummary((data as any).subject ?? "");
    setSalutation((data as any).salutation ?? "");

    const secs = (data as any).sections;
    if (Array.isArray(secs)) {
      setSections(secs);
    } else {
      setSections([]); // leer wenn nix gespeichert
    }
  };

  /* =========================
     SAVE / FINALIZE
  ========================= */

  const saveDraft = async () => {
    const id = offerId ?? localStorage.getItem("offerId");
    if (!id) throw new Error("Kein Angebot aktiv");

    const payload = {
      subject: summary.trim() || null,
      salutation: salutation.trim() || null,
      customer_id: customerId || null,
      sections, // JSONB
      // status bleibt draft
    };

    const { error } = await supabase.from("offers").update(payload).eq("id", id);
    if (error) throw error;
  };

  const onSave = async () => {
    try {
      await saveDraft();
      alert("Entwurf gespeichert.");
    } catch (e: any) {
      alert(e.message ?? "Speichern fehlgeschlagen");
    }
  };

  const onFinalize = async () => {
    const ok = confirm("Angebot wirklich finalisieren? (Nummer wird vergeben)");
    if (!ok) return;

    try {
      await saveDraft(); // WICHTIG: erst alles speichern

      const id = offerId ?? localStorage.getItem("offerId");
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

      alert(`Finalisiert: ${j.offer_number ?? ""}`);
      window.location.href = "/angebot";
    } catch (e: any) {
      alert(e.message ?? "Finalisieren fehlgeschlagen");
    }
  };

  /* =========================
     SECTION HANDLING
  ========================= */

  const addSection = () => {
    const nextIndex = sections.length + 1;
    setSections([
      ...sections,
      {
        number: `${nextIndex}.0.0`,
        title: "",
        descriptionHtml: "",
        rows: [],
      },
    ]);
  };

  const removeSection = (index: number) => {
    const updated = [...sections];
    updated.splice(index, 1);
    setSections(updated);
  };

  const addRow = (index: number) => {
    const updated = [...sections];
    updated[index].rows.push({
      qty: 1,
      unit: "",
      article: "",
      articleText: "",
      price: 0,
    });
    setSections(updated);
  };

  const removeRow = (sectionIndex: number, rowIndex: number) => {
    const updated = [...sections];
    updated[sectionIndex].rows.splice(rowIndex, 1);
    setSections(updated);
  };

  const updateRow = (
    sectionIndex: number,
    rowIndex: number,
    field: keyof SectionRow,
    value: any
  ) => {
    const updated = [...sections];
    (updated[sectionIndex].rows[rowIndex] as any)[field] = value;
    setSections(updated);
  };

  /* =========================
     UI
  ========================= */

  return (
    <main className="min-h-screen p-6 bg-gray-900 text-gray-100">
      <div className="max-w-5xl mx-auto bg-gray-800/80 border border-gray-700 rounded-xl shadow-lg p-6">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-bold">Angebot bearbeiten</h1>

          <button
            type="button"
            onClick={() => (window.location.href = "/angebot")}
            className="px-3 py-2 rounded border text-sm bg-gray-900 text-gray-100 border-gray-700 hover:bg-gray-800 transition-colors"
          >
            Zurück zu Angebote
          </button>
        </div>

        {/* Kunde */}
        <div className="mt-6">
          <label className="block mb-1">Kunde</label>
          <select
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            className="w-full rounded bg-gray-900 border border-gray-700 p-2"
          >
            <option value="">— auswählen —</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Überschrift */}
        <div className="mt-6">
          <label>Überschrift / Kurzbeschreibung</label>
          <input
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            className="w-full mt-1 p-2 rounded bg-gray-900 border border-gray-700"
          />
        </div>

        {/* Anrede */}
        <div className="mt-6">
          <label>Anrede</label>
          <input
            value={salutation}
            onChange={(e) => setSalutation(e.target.value)}
            className="w-full mt-1 p-2 rounded bg-gray-900 border border-gray-700"
          />
        </div>

        {/* Sections */}
        <div className="mt-10">
          <h2 className="text-xl font-semibold mb-4">Positionen</h2>

          {sections.map((sec, i) => (
            <div key={i} className="border border-gray-700 p-4 rounded mb-8">
              <div className="flex justify-between mb-3">
                <input
                  value={sec.number}
                  onChange={(e) => {
                    const updated = [...sections];
                    updated[i].number = e.target.value;
                    setSections(updated);
                  }}
                  className="p-2 bg-gray-900 border border-gray-700 rounded w-32"
                />
                <button
                  type="button"
                  onClick={() => removeSection(i)}
                  className="text-red-400 text-sm"
                >
                  Abschnitt löschen
                </button>
              </div>

              <input
                placeholder="Titel"
                value={sec.title}
                onChange={(e) => {
                  const updated = [...sections];
                  updated[i].title = e.target.value;
                  setSections(updated);
                }}
                className="w-full p-2 rounded bg-gray-900 border border-gray-700 mb-3"
              />

              <RichEditor
                value={sec.descriptionHtml}
                onChange={(html) => {
                  const updated = [...sections];
                  updated[i].descriptionHtml = html;
                  setSections(updated);
                }}
              />

              <div className="mt-6">


                {/* Tabellen-Header */}
                <div className="grid grid-cols-6 gap-2 mt-3 text-xs text-gray-300/80">
                  <div>Menge</div>
                  <div>Einheit</div>
                  <div>Artikel</div>
                  <div>Einzelpreis</div>
                  <div>Gesamtpreis</div>
                  <div>Zeile löschen</div>
                </div>



                {sec.rows.map((row, rIdx) => (
  <div key={rIdx} className="mt-3">
    <div className="grid grid-cols-6 gap-2 items-center">
      <input
        type="number"
        value={row.qty}
        onChange={(e) => updateRow(i, rIdx, "qty", Number(e.target.value))}
        className="p-1 bg-gray-900 border border-gray-700 rounded"
      />

      <input
        value={row.unit}
        onChange={(e) => updateRow(i, rIdx, "unit", e.target.value)}
        className="p-1 bg-gray-900 border border-gray-700 rounded"
      />

      <input
        value={row.article}
        onChange={(e) => updateRow(i, rIdx, "article", e.target.value)}
        className="p-1 bg-gray-900 border border-gray-700 rounded"
      />

      <input
        type="number"
        value={row.price}
        onChange={(e) => updateRow(i, rIdx, "price", Number(e.target.value))}
        className="p-1 bg-gray-900 border border-gray-700 rounded"
      />

      <input
        value={(row.qty * row.price).toFixed(2)}
        disabled
        className="p-1 bg-gray-800 border border-gray-700 rounded"
      />

      <button
        type="button"
        onClick={() => removeRow(i, rIdx)}
        className="text-red-400 text-sm"
      >
        ✕
      </button>



    </div>



    <textarea
      value={row.articleText ?? ""}
      onChange={(e) => updateRow(i, rIdx, "articleText", e.target.value)}
      placeholder="Artikeltext (optional) – Zeilenumbrüche möglich"
      rows={2}
      className="mt-2 w-full rounded bg-gray-900 border border-gray-700 p-2 text-sm text-gray-100 placeholder:text-gray-500"
    />



  </div>



))}

                <button
                  type="button"
                  onClick={() => addRow(i)}
                  className="text-sm underline text-gray-300"
                >
                  + Zeile hinzufügen
                </button>

              </div>
            </div>
          ))}

          <button type="button" onClick={addSection} className="underline">
            + Abschnitt hinzufügen
          </button>
        </div>

        <div className="mt-8 flex gap-2">
          <button
            type="button"
            onClick={onSave}
            className="px-4 py-3 rounded border border-gray-700 bg-gray-900 text-gray-100 hover:bg-gray-800"
          >
            Speichern (Entwurf)
          </button>

          <button
            type="button"
            onClick={onFinalize}
            className="px-6 py-3 rounded bg-gray-100 text-gray-900 hover:bg-white"
          >
            Finalisieren
          </button>
        </div>
      </div>
    </main>
  );
}
