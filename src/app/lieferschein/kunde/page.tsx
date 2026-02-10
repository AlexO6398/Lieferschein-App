"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { WizardSteps, WizardButtons } from "@/components/WizardNav";


type Customer = {
  id: string;
  name: string;
  street: string | null;
  zip: string | null;
  city: string | null;
  email: string | null;
};

export default function KundePage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [showNewCustomer, setShowNewCustomer] = useState(false);


  const [deliveryNoteId, setDeliveryNoteId] = useState<string | null>(null);


  // Formular "neuer Kunde"
  const [name, setName] = useState("");
  const [street, setStreet] = useState("");
  const [zip, setZip] = useState("");
  const [city, setCity] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadCustomers = async () => {
    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from("customers")
      .select("id,name,street,zip,city,email")
      .order("name", { ascending: true });

    if (error) {
      setError(error.message);
    } else {
      setCustomers((data as Customer[]) ?? []);
    }

    setLoading(false);
  };

useEffect(() => {
  const init = async () => {
    await loadCustomers();

    // Draft-ID aus localStorage holen oder neu erstellen
    const existingId = localStorage.getItem("deliveryNoteId");
    if (existingId) {
      setDeliveryNoteId(existingId);
      return;
    }

    const { data, error } = await supabase
      .from("delivery_notes")
      .insert([{ status: "draft" }])
      .select("id")
      .single();

    if (error) {
      setError(error.message);
      return;
    }

    localStorage.setItem("deliveryNoteId", data.id);
    setDeliveryNoteId(data.id);
  };

  init();
}, []);


  const addCustomer = async () => {
    setSaving(true);
    setError(null);

    if (!name.trim()) {
      setError("Bitte Kundenname eingeben.");
      setSaving(false);
      return;
    }

    const { data, error } = await supabase
      .from("customers")
      .insert([
        {
          name: name.trim(),
          street: street.trim() || null,
          zip: zip.trim() || null,
          city: city.trim() || null,
          email: email.trim() || null,
        },
      ])
      .select("id,name,street,zip,city,email")
      .single();

    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }

    // Formular leeren
    setName("");
    setStreet("");
    setZip("");
    setCity("");
    setEmail("");

    // Liste neu laden + neuen Kunden auswählen
    await loadCustomers();
    setSelectedCustomerId((data as Customer).id);

    setSaving(false);
  };

  const today = new Date().toLocaleDateString("de-AT");

  return (
    <main className="min-h-screen p-6 bg-gray-100">
      <div className="max-w-xl mx-auto bg-white rounded shadow p-6 flex flex-col min-h-[80vh]">


<WizardSteps currentKey="kunde" />



        <h1 className="text-2xl font-bold">Lieferschein – Kunde</h1>
        <p className="text-sm text-gray-600 mt-1">Datum: {today}</p>

        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded">
            {error}
          </div>
        )}

        <div className="mt-6">
          <label className="block font-medium mb-1">Bestehenden Kunden auswählen</label>
          {loading ? (
            <p>Lade Kunden…</p>
          ) : (
            <select
              className="w-full border p-2 rounded"
              value={selectedCustomerId}
		onChange={async (e) => {
  		const id = e.target.value;
  		setSelectedCustomerId(id);

  		if (!deliveryNoteId || !id) return;

  		const { error } = await supabase
 		   .from("delivery_notes")
  		  .update({ customer_id: id })
  		  .eq("id", deliveryNoteId);

 		 if (error) setError(error.message);
		}}

            >
              <option value="">— bitte auswählen —</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <hr className="my-6" />

<button
  type="button"
  onClick={() => setShowNewCustomer((v) => !v)}
  className="mt-6 flex items-center gap-2 text-sm font-medium"
>
  {showNewCustomer ? "▼" : "▶"} Neuen Kunden anlegen
</button>

{showNewCustomer && (
  <div className="mt-4 border rounded p-4 bg-gray-50">

        <div className="mt-3 grid gap-2">
          <input
            className="border p-2 rounded"
            placeholder="Name *"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="border p-2 rounded"
            placeholder="Straße"
            value={street}
            onChange={(e) => setStreet(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              className="border p-2 rounded"
              placeholder="PLZ"
              value={zip}
              onChange={(e) => setZip(e.target.value)}
            />
            <input
              className="border p-2 rounded"
              placeholder="Ort"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
          </div>
          <input
            className="border p-2 rounded"
            placeholder="E-Mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <button
            onClick={addCustomer}
            disabled={saving}
            className="mt-2 bg-black text-white py-2 rounded"
          >
            {saving ? "Speichere…" : "Kunde speichern"}
          </button>
        </div>

 </div>
)}

        <div className="mt-6 text-sm text-gray-700">
          <p>
            Ausgewählter Kunde:{" "}
            <strong>
              {selectedCustomerId
                ? customers.find((c) => c.id === selectedCustomerId)?.name ?? "(unbekannt)"
                : "—"}
            </strong>
          </p>

        </div>
<WizardButtons
  canGoNext={!!selectedCustomerId}
  onBack={() => (window.location.href = "/")}
  onNext={() => (window.location.href = "/lieferschein/mitarbeiter")}
/>

      </div>
    </main>
  );
}
