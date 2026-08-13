"use client";

import { useState } from "react";
import { signIn, getSession } from "next-auth/react";
import { ROLE_HOME, isRole } from "../../lib/roles";

export default function LoginPage() {

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleLogin() {
    setSubmitting(true);

    const result = await signIn("credentials", { email, password, redirect: false });

    if (!result || result.error) {
      alert("Invalid email or password.");
      setSubmitting(false);
      return;
    }

    const session = await getSession();
    const role = session?.user?.role;
    window.location.href = isRole(role) ? ROLE_HOME[role] : "/login";
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">

      <div className="bg-white p-10 rounded-2xl shadow-sm w-full max-w-md">

        <h1 className="text-3xl font-bold mb-2">
          FirsThing Dashboard
        </h1>

        <p className="text-gray-500 mb-8">
          Login to continue
        </p>

        <div className="space-y-5">

          <input
            type="email"
            placeholder="Email"
            className="w-full border rounded-xl p-4"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            type="password"
            placeholder="Password"
            className="w-full border rounded-xl p-4"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <button
            onClick={handleLogin}
            disabled={submitting}
            className="w-full bg-green-700 hover:bg-green-800 text-white rounded-xl p-4 font-semibold disabled:opacity-60"
          >
            {submitting ? "Signing in..." : "Login"}
          </button>

        </div>

      </div>

    </div>
  );
}
