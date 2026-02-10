"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
    } else {
      window.location.href = "/";
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 text-gray-100">
      <div className="bg-gray-800/80 border border-gray-700 p-6 rounded-xl shadow-lg w-80">
        <h1 className="text-xl font-bold mb-4 text-center">Login</h1>

        <input
          type="email"
          placeholder="E-Mail"
          className="w-full bg-gray-900 border border-gray-700 p-2 mb-2 rounded text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          type="password"
          placeholder="Passwort"
          className="w-full bg-gray-900 border border-gray-700 p-2 mb-4 rounded text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {error && (
          <p className="text-red-300 text-sm mb-2">
            {error}
          </p>
        )}

        <button
          onClick={handleLogin}
          disabled={loading}
          className="w-full bg-gray-100 text-gray-900 py-2 rounded hover:bg-white disabled:opacity-60"
        >
          {loading ? "Einloggen…" : "Login"}
        </button>
      </div>
    </div>
  );
}
