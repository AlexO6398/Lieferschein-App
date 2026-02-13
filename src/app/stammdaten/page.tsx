"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type TabKey = "workers" | "machines" | "materials" | "customers";

const TAB_META: Record<TabKey, { title: string; table: string; singular: string }> = {
  workers: { title: "Mitarbeiter", table: "workers", singular: "Mitarbeiter" },
  machines: { title: "Geräte", table: "machines", singular: "Gerät" },
  materials: { title: "Material", table: "materials", singular: "Material" },
  customers: { title: "Kunden", table: "customers", singular: "Kunde" },
};

type BaseRow = { id: string; name: string | null; is_archived: boolean };
type CustomerRow = BaseRow & {
  street: string | null;
  zip: string | null;
  city: string | null;
  email: string | null;
  created_at?: string | null;
};

export default function StammdatenPage() {
  const [role, setRole] = useState<"office" | "field" | null>(null);
  const [loading, setLoading] = useState(true);

  const [tab, setTab] = useState<TabKey>("workers");
  const [showArchived, setShowArchived] = useState(false);

  const [rows, setRows] = useState<Array<BaseRow | CustomerRow>>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Add form (shared)
  const [newName, setNewName] = useState("");

  // Add form (customers)
  const [newStreet, setNewStreet] = useState("");
  const [newZip, setNewZip] = useState("");
  const [newCity, setNewCity] = useState("");
  const [newEmail, setNewEmail] = useState("");

  const meta = useMemo(() => TAB_META[tab], [tab]);

  useEffect(() => {
    const run = async () => {
      setError(null);

      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        window.location.href = "/login?next=/stammdaten";
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
  setLoading(false); // optional, aber verhindert "ewiges Laden" falls Redirect hängt
  return;
}

setLoading(false);

    };

    run();
  }, []);

  const loadRows = async () => {
    setError(null);

    const selectCols =
      tab === "customers"
        ? "id,name,street,zip,city,email,created_at,is_archived"
        : "id,name,is_archived";

    let q = supabase.from(meta.table).select(selectCols).order("name", { ascending: true });

    if (!showArchived) q = q.eq("is_archived", false);

    const { data, error } = await q;

    if (error) {
      setError(error.message);
      setRows([]);
      return;
    }

    setRows(((data as any) ?? []) as Array<BaseRow | CustomerRow>);
  };

  useEffect(() => {
    if (role === "office") loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, tab, showArchived]);

  const resetAddForm = () => {
    setNewName("");
    setNewStreet("");
    setNewZip("");
    setNewCity("");
    setNewEmail("");
  };

  const addRow = async () => {
    const name = newName.trim();
    if (!name) return;

    setSaving(true);

    const payload =
      tab === "customers"
        ? {
            name,
            street: newStreet.trim() || null,
            zip: newZip.trim() || null,
            city: newCity.trim() || null,
            email: newEmail.trim() || null,
            is_archived: false,
          }
        : { name, is_archived: false };

    const { error } = await supabase.from(meta.table).insert([payload]);

    setSaving(false);

    if (error) {
      alert(error.message);
      return;
    }

    resetAddForm();
    await loadRows();
  };

  const updateSimpleName = async (id: string, name: string) => {
    setSaving(true);
    const { error } = await supabase.from(meta.table).update({ name }).eq("id", id);
    setSaving(false);

    if (error) {
      alert(error.message);
      return;
    }
    await loadRows();
  };

  const updateCustomer = async (id: string, patch: Partial<CustomerRow>) => {
    setSaving(true);
    const { error } = await supabase.from("customers").update(patch).eq("id", id);
    setSaving(false);

    if (error) {
      alert(error.message);
      return;
    }
    await loadRows();
  };

  const setArchived = async (id: string, is_archived: boolean) => {
    const ok = confirm(is_archived ? "Eintrag archivieren?" : "Eintrag reaktivieren?");
    if (!ok) return;

    setSaving(true);
    const { error } = await supabase.from(meta.table).update({ is_archived }).eq("id", id);
    setSaving(false);

    if (error) {
      alert(error.message);
      return;
    }

    await loadRows();
  };

  if (loading) {
    return (
      <main className="min-h-screen p-6 bg-gray-900 text-gray-100">
        <div className="max-w-5xl mx-auto">
          <p>Lade…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-6 bg-gray-900 text-gray-100">
      <div className="max-w-5xl mx-auto">
        <div className="bg-gray-800/80 border border-gray-700 rounded-xl shadow-lg p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold">Stammdaten bearbeiten</h1>
              <p className="mt-1 text-sm text-gray-300/80">
                Hier können Mitarbeiter, Geräte, Material und Kunden gepflegt werden. Es wird{" "}
                <strong>nicht gelöscht</strong>, sondern nur{" "}
                <strong>archiviert</strong>, damit alte Lieferscheine/PDFs unverändert bleiben.
              </p>
            </div>

            <button
              type="button"
              onClick={() => (window.location.href = "/")}
              className="px-3 py-2 rounded border text-sm bg-gray-900 text-gray-100 border-gray-700 hover:bg-gray-800 transition-colors"
            >
              Zur Übersicht
            </button>
          </div>

          {error && (
            <div className="mt-4 p-3 bg-red-50 text-red-700 rounded">{error}</div>
          )}

          {/* Tabs */}
          <div className="mt-6 flex flex-wrap gap-2">
            {(Object.keys(TAB_META) as TabKey[]).map((k) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={[
                  "px-3 py-2 rounded border text-sm",
                  tab === k
                    ? "bg-gray-100 text-gray-900 border-gray-100"
                    : "bg-gray-900 text-gray-100 border-gray-700 hover:bg-gray-800",
                ].join(" ")}
              >
                {TAB_META[k].title}
              </button>
            ))}
          </div>

          {/* Add + Archived toggle */}
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4 items-start">
            <div className="bg-gray-900/50 border border-gray-700 rounded-xl p-4">
              <h2 className="text-sm font-semibold text-gray-100">
                {meta.singular} hinzufügen
              </h2>

              <div className="mt-3">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={`${meta.singular} Name…`}
                  className="w-full rounded px-3 py-3 text-sm bg-gray-900 border border-gray-700 text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500"
                />

                {tab === "customers" && (
                  <div className="mt-3 grid gap-2">
                    <input
                      value={newStreet}
                      onChange={(e) => setNewStreet(e.target.value)}
                      placeholder="Straße"
                      className="w-full rounded px-3 py-2 text-sm bg-gray-900 border border-gray-700 text-gray-100 placeholder:text-gray-400"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        value={newZip}
                        onChange={(e) => setNewZip(e.target.value)}
                        placeholder="PLZ"
                        className="w-full rounded px-3 py-2 text-sm bg-gray-900 border border-gray-700 text-gray-100 placeholder:text-gray-400"
                      />
                      <input
                        value={newCity}
                        onChange={(e) => setNewCity(e.target.value)}
                        placeholder="Ort"
                        className="w-full rounded px-3 py-2 text-sm bg-gray-900 border border-gray-700 text-gray-100 placeholder:text-gray-400"
                      />
                    </div>
                    <input
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="E-Mail"
                      className="w-full rounded px-3 py-2 text-sm bg-gray-900 border border-gray-700 text-gray-100 placeholder:text-gray-400"
                    />
                  </div>
                )}

                <div className="mt-3 flex gap-2">
                  <button
                    onClick={addRow}
                    disabled={saving || !newName.trim()}
                    className={[
                      "px-4 py-3 rounded text-sm border w-full",
                      saving || !newName.trim()
                        ? "bg-gray-700 text-gray-300 border-gray-700 cursor-not-allowed"
                        : "bg-gray-100 text-gray-900 border-gray-100 hover:bg-white",
                    ].join(" ")}
                  >
                    Hinzufügen
                  </button>

                  <button
                    type="button"
                    onClick={resetAddForm}
                    className="px-4 py-3 rounded text-sm border border-gray-700 bg-gray-900 hover:bg-gray-800"
                  >
                    Leeren
                  </button>
                </div>
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-200 select-none mt-2 lg:mt-0">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
              />
              Archivierte anzeigen
            </label>
          </div>

          {/* List */}
          <div className="mt-6 overflow-x-auto">
            {tab === "customers" ? (
              <CustomersTable
                rows={rows as CustomerRow[]}
                saving={saving}
                onUpdate={updateCustomer}
                onToggleArchived={setArchived}
              />
            ) : (
              <SimpleTable
                rows={rows as BaseRow[]}
                saving={saving}
                onUpdateName={updateSimpleName}
                onToggleArchived={setArchived}
              />
            )}

            {rows.length === 0 && (
              <p className="mt-4 text-gray-300/80">Keine Einträge.</p>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function Badge({ archived }: { archived: boolean }) {
  return (
    <span
      className={[
        "inline-block px-2 py-1 rounded text-xs font-medium",
        archived ? "bg-gray-200 text-gray-800" : "bg-green-100 text-green-800",
      ].join(" ")}
    >
      {archived ? "Archiv" : "Aktiv"}
    </span>
  );
}

function SimpleTable({
  rows,
  saving,
  onUpdateName,
  onToggleArchived,
}: {
  rows: BaseRow[];
  saving: boolean;
  onUpdateName: (id: string, name: string) => Promise<void>;
  onToggleArchived: (id: string, is_archived: boolean) => Promise<void>;
}) {
  return (
    <table className="w-full text-sm table-fixed">
      <thead>
        <tr className="text-left border-b border-gray-700 text-gray-200">
          <th className="py-3 w-[420px]">Name</th>
          <th className="py-3 w-[110px]">Status</th>
          <th className="py-3 w-[200px] text-right">Aktionen</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <SimpleRow
            key={r.id}
            row={r}
            zebra={i % 2 === 1}
            saving={saving}
            onSaveName={onUpdateName}
            onToggleArchived={onToggleArchived}
          />
        ))}
      </tbody>
    </table>
  );
}

function SimpleRow({
  row,
  zebra,
  saving,
  onSaveName,
  onToggleArchived,
}: {
  row: BaseRow;
  zebra: boolean;
  saving: boolean;
  onSaveName: (id: string, name: string) => Promise<void>;
  onToggleArchived: (id: string, is_archived: boolean) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(row.name ?? "");

  useEffect(() => {
    setName(row.name ?? "");
  }, [row.id, row.name]);

  return (
    <>
      <tr
        className={[
          "border-b border-gray-700 align-top hover:bg-gray-700/40",
          zebra ? "bg-gray-800/40" : "bg-transparent",
        ].join(" ")}
      >
        <td className="py-3">
          <span className={row.is_archived ? "text-gray-400" : ""}>
            {row.name ?? <span className="text-gray-400 italic">—</span>}
          </span>
        </td>

        <td className="py-3">
          <Badge archived={row.is_archived} />
        </td>

        <td className="py-3 text-right">
          <div className="flex gap-2 justify-end">
            <button
              disabled={saving}
              onClick={() => setOpen((v) => !v)}
              className="px-3 py-2 rounded border border-gray-700 bg-gray-900 hover:bg-gray-800"
            >
              Bearbeiten
            </button>

            {row.is_archived ? (
              <button
                disabled={saving}
                onClick={() => onToggleArchived(row.id, false)}
                className="px-3 py-2 rounded border border-gray-700 bg-gray-900 hover:bg-gray-800"
              >
                Reaktivieren
              </button>
            ) : (
              <button
                disabled={saving}
                onClick={() => onToggleArchived(row.id, true)}
                className="px-3 py-2 rounded border border-gray-700 bg-gray-900 hover:bg-gray-800"
              >
                Archivieren
              </button>
            )}
          </div>
        </td>
      </tr>

      {open && (
        <tr className={zebra ? "bg-gray-800/40" : "bg-transparent"}>
          <td colSpan={3} className="py-3">
            <div className="border border-gray-700 rounded-lg p-4 bg-gray-900/50">
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
                <label className="text-xs text-gray-300/80">
                  Name
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1 w-full rounded px-3 py-2 text-sm bg-gray-900 border border-gray-700 text-gray-100"
                  />
                </label>

                <div className="flex gap-2 justify-end">
                  <button
                    disabled={saving}
                    onClick={async () => {
                      const v = name.trim();
                      if (!v) return alert("Name darf nicht leer sein");
                      await onSaveName(row.id, v);
                      setOpen(false);
                    }}
                    className="px-4 py-2 rounded border border-gray-700 bg-gray-100 text-gray-900 hover:bg-white"
                  >
                    Speichern
                  </button>
                  <button
                    onClick={() => {
                      setName(row.name ?? "");
                      setOpen(false);
                    }}
                    className="px-4 py-2 rounded border border-gray-700 bg-gray-900 hover:bg-gray-800"
                  >
                    Abbrechen
                  </button>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function CustomersTable({
  rows,
  saving,
  onUpdate,
  onToggleArchived,
}: {
  rows: CustomerRow[];
  saving: boolean;
  onUpdate: (id: string, patch: Partial<CustomerRow>) => Promise<void>;
  onToggleArchived: (id: string, is_archived: boolean) => Promise<void>;
}) {
  return (
    <table className="w-full text-sm table-fixed">
      <thead>
        <tr className="text-left border-b border-gray-700 text-gray-200">
          <th className="py-3 w-[220px]">Name</th>
          <th className="py-3 w-[210px]">Adresse</th>
          <th className="py-3 w-[200px]">E-Mail</th>
          <th className="py-3 w-[110px]">Status</th>
          <th className="py-3 w-[200px] text-right">Aktionen</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <CustomerRowItem
            key={r.id}
            row={r}
            zebra={i % 2 === 1}
            saving={saving}
            onUpdate={onUpdate}
            onToggleArchived={onToggleArchived}
          />
        ))}
      </tbody>
    </table>
  );
}

function CustomerRowItem({
  row,
  zebra,
  saving,
  onUpdate,
  onToggleArchived,
}: {
  row: CustomerRow;
  zebra: boolean;
  saving: boolean;
  onUpdate: (id: string, patch: Partial<CustomerRow>) => Promise<void>;
  onToggleArchived: (id: string, is_archived: boolean) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);

  const [name, setName] = useState(row.name ?? "");
  const [street, setStreet] = useState(row.street ?? "");
  const [zip, setZip] = useState(row.zip ?? "");
  const [city, setCity] = useState(row.city ?? "");
  const [email, setEmail] = useState(row.email ?? "");

  useEffect(() => {
    setName(row.name ?? "");
    setStreet(row.street ?? "");
    setZip(row.zip ?? "");
    setCity(row.city ?? "");
    setEmail(row.email ?? "");
  }, [row.id, row.name, row.street, row.zip, row.city, row.email]);

  const addressLine = [
    row.street?.trim(),
    [row.zip?.trim(), row.city?.trim()].filter(Boolean).join(" ").trim(),
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <>
      <tr
        className={[
          "border-b border-gray-700 align-top hover:bg-gray-700/40",
          zebra ? "bg-gray-800/40" : "bg-transparent",
        ].join(" ")}
      >
        <td className="py-3">
          <span className={row.is_archived ? "text-gray-400" : ""}>
            {row.name ?? <span className="text-gray-400 italic">—</span>}
          </span>
        </td>

        <td className="py-3">
          <span className={row.is_archived ? "text-gray-400" : ""}>
            {addressLine || <span className="text-gray-400 italic">—</span>}
          </span>
        </td>

        <td className="py-3">
          <span className={row.is_archived ? "text-gray-400" : ""}>
            {row.email ?? <span className="text-gray-400 italic">—</span>}
          </span>
        </td>

        <td className="py-3">
          <Badge archived={row.is_archived} />
        </td>

        <td className="py-3 text-right">
          <div className="flex gap-2 justify-end">
            <button
              disabled={saving}
              onClick={() => setOpen((v) => !v)}
              className="px-3 py-2 rounded border border-gray-700 bg-gray-900 hover:bg-gray-800"
            >
              Bearbeiten
            </button>

            {row.is_archived ? (
              <button
                disabled={saving}
                onClick={() => onToggleArchived(row.id, false)}
                className="px-3 py-2 rounded border border-gray-700 bg-gray-900 hover:bg-gray-800"
              >
                Reaktivieren
              </button>
            ) : (
              <button
                disabled={saving}
                onClick={() => onToggleArchived(row.id, true)}
                className="px-3 py-2 rounded border border-gray-700 bg-gray-900 hover:bg-gray-800"
              >
                Archivieren
              </button>
            )}
          </div>
        </td>
      </tr>

      {open && (
        <tr className={zebra ? "bg-gray-800/40" : "bg-transparent"}>
          <td colSpan={5} className="py-3">
            <div className="border border-gray-700 rounded-lg p-4 bg-gray-900/50">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="text-xs text-gray-300/80">
                  Name
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1 w-full rounded px-3 py-2 text-sm bg-gray-900 border border-gray-700 text-gray-100"
                  />
                </label>

                <label className="text-xs text-gray-300/80">
                  E-Mail
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-1 w-full rounded px-3 py-2 text-sm bg-gray-900 border border-gray-700 text-gray-100"
                  />
                </label>

                <label className="text-xs text-gray-300/80 md:col-span-2">
                  Straße
                  <input
                    value={street}
                    onChange={(e) => setStreet(e.target.value)}
                    className="mt-1 w-full rounded px-3 py-2 text-sm bg-gray-900 border border-gray-700 text-gray-100"
                  />
                </label>

                <label className="text-xs text-gray-300/80">
                  PLZ
                  <input
                    value={zip}
                    onChange={(e) => setZip(e.target.value)}
                    className="mt-1 w-full rounded px-3 py-2 text-sm bg-gray-900 border border-gray-700 text-gray-100"
                  />
                </label>

                <label className="text-xs text-gray-300/80">
                  Ort
                  <input
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="mt-1 w-full rounded px-3 py-2 text-sm bg-gray-900 border border-gray-700 text-gray-100"
                  />
                </label>
              </div>

              <div className="mt-4 flex gap-2 justify-end">
                <button
                  disabled={saving}
                  onClick={async () => {
                    const v = name.trim();
                    if (!v) return alert("Name darf nicht leer sein");

                    await onUpdate(row.id, {
                      name: v,
                      email: email.trim() || null,
                      street: street.trim() || null,
                      zip: zip.trim() || null,
                      city: city.trim() || null,
                    });

                    setOpen(false);
                  }}
                  className="px-4 py-2 rounded border border-gray-700 bg-gray-100 text-gray-900 hover:bg-white"
                >
                  Speichern
                </button>

                <button
                  onClick={() => {
                    setName(row.name ?? "");
                    setStreet(row.street ?? "");
                    setZip(row.zip ?? "");
                    setCity(row.city ?? "");
                    setEmail(row.email ?? "");
                    setOpen(false);
                  }}
                  className="px-4 py-2 rounded border border-gray-700 bg-gray-900 hover:bg-gray-800"
                >
                  Abbrechen
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
