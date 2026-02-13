"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function LandingPage() {
  const [role, setRole] = useState<"office" | "field" | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const load = async () => {
      setError(null);

      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        router.replace(`/login?next=/`);
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

      setRole(roleData.role as "office" | "field");
      setLoading(false);
    };

    load();
  }, [router]);

  if (loading || !role) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-900 text-gray-100">
        <p>Lade…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-6 bg-gray-900 text-gray-100">
      <div className="max-w-4xl mx-auto">
        <div className="bg-gray-800/80 border border-gray-700 rounded-xl shadow-lg p-6">
          <h1 className="text-3xl font-bold">Übersicht</h1>
          <p className="mt-2 text-gray-300/80">
            Bitte wählen Sie aus, was Sie machen möchten. Rolle: <span className="font-semibold">{role}</span>
          </p>

          {error && (
            <div className="mt-4 p-3 bg-red-50 text-red-700 rounded">
              {error}
            </div>
          )}

          <div className="mt-6 grid gap-3">
            <button
              onClick={() => router.push("/lieferschein")}
              className="w-full bg-gray-900 border border-gray-700 text-gray-100 py-3 rounded hover:bg-gray-800"
            >
              Lieferscheine
            </button>

            {role === "office" && (
              <>
                <button
                  onClick={() => router.push("/angebot")}
                  className="w-full bg-gray-900 border border-gray-700 text-gray-100 py-3 rounded hover:bg-gray-800"
                >
                  Angebote
                </button>

                <button
                  onClick={() => router.push("/stammdaten")}
                  className="w-full bg-gray-900 border border-gray-700 text-gray-100 py-3 rounded hover:bg-gray-800"
                >
                  Stammdaten bearbeiten
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
