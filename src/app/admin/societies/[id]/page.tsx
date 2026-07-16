"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../../lib/supabase";
import { useParams, useRouter } from "next/navigation";

export default function EditSocietyPage() {
  const params = useParams();
  const router = useRouter();

  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [totalLights, setTotalLights] = useState("");
  const [savingsPercentage, setSavingsPercentage] = useState("");
  const [currentEmail, setCurrentEmail] = useState("");
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingLogin, setSavingLogin] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loading, setLoading] = useState(true);

  async function loadSociety() {
    const { data, error } = await supabase
      .from("societies")
      .select("*")
      .eq("id", params.id)
      .single();

    if (error) {
      alert(error.message);
      return;
    }

    if (data) {
      setName(data.name || "");
      setCity(data.city || "");
      setTotalLights(data.total_lights?.toString() || "");
      setSavingsPercentage(
        data.savings_percentage?.toString() || ""
      );
    }

    const { data: customerProfile, error: profileError } = await supabase
      .from("profiles")
      .select("email")
      .eq("society_id", params.id)
      .eq("role", "customer")
      .maybeSingle();

    if (profileError) {
      alert(profileError.message);
      return;
    }

    const customerEmail = customerProfile?.email || "";
    setCurrentEmail(customerEmail);
    setEmail(customerEmail);

    setLoading(false);
  }

  useEffect(() => {
    loadSociety();
  }, []);

  async function updateSociety() {
    const { error } = await supabase
      .from("societies")
      .update({
        name,
        city,
        total_lights: Number(totalLights),
        savings_percentage: Number(savingsPercentage),
      })
      .eq("id", params.id);

    if (error) {
      alert(error.message);
      return;
    }

    alert("Society updated successfully");

    router.push("/admin/societies");
  }

  async function updateLoginDetails() {
    const updatedEmail = email.trim().toLowerCase();
    const emailChanged = updatedEmail !== currentEmail.toLowerCase();
    const passwordChanged = newPassword.length > 0;

    if (!emailChanged && !passwordChanged) {
      alert("Enter a new email or password before saving login details.");
      return;
    }

    if (emailChanged && !updatedEmail) {
      alert("Enter a valid email address.");
      return;
    }

    if (emailChanged && !/^\S+@\S+\.\S+$/.test(updatedEmail)) {
      alert("Enter a valid email address.");
      return;
    }

    if (passwordChanged && newPassword.length < 8) {
      alert("The new password must be at least 8 characters.");
      return;
    }

    if (passwordChanged && newPassword !== confirmPassword) {
      alert("The new password and confirmation do not match.");
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      alert("Session expired. Please login again.");
      return;
    }

    setSavingLogin(true);

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/update-society-user`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            societyId: params.id,
            ...(emailChanged ? { email: updatedEmail } : {}),
            ...(passwordChanged ? { password: newPassword } : {}),
          }),
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        alert(result.error || "Failed to update login details.");
        return;
      }

      if (emailChanged) {
        setCurrentEmail(updatedEmail);
        setEmail(updatedEmail);
      }
      setNewPassword("");
      setConfirmPassword("");
      alert("Login details updated successfully.");
    } catch {
      alert("Unable to update login details. Please try again.");
    } finally {
      setSavingLogin(false);
    }
  }

  async function deleteSociety() {
    const confirmed = confirm(
      "Are you sure you want to delete this society? All of its details and reports will also be permanently deleted."
    );

    if (!confirmed) return;

    setDeleting(true);

    try {
      const { data: tanks, error: tanksError } = await supabase
        .from("tank_configurations")
        .select("id")
        .eq("society_id", params.id);

      if (tanksError) {
        alert(`Unable to load the society's tank configurations: ${tanksError.message}`);
        return;
      }

      const tankIds = tanks?.map((tank) => tank.id) ?? [];

      if (tankIds.length > 0) {
        const { error: tankReadingsError } = await supabase
          .from("tank_readings")
          .delete()
          .in("tank_id", tankIds);

        if (tankReadingsError) {
          alert(`Unable to delete the society's tank readings: ${tankReadingsError.message}`);
          return;
        }
      }

      const relatedTables = [
        { table: "inspection_reports", label: "inspection reports" },
        { table: "inspection_forms", label: "inspection forms" },
        { table: "savings_reports", label: "savings reports" },
        { table: "invoices", label: "invoices" },
        { table: "energy_stats", label: "energy statistics" },
        { table: "tank_configurations", label: "tank configurations" },
        { table: "society_details", label: "society details" },
        { table: "profiles", label: "user profiles" },
      ];

      for (const relatedTable of relatedTables) {
        const { error } = await supabase
          .from(relatedTable.table)
          .delete()
          .eq("society_id", params.id);

        if (error) {
          alert(`Unable to delete the society's ${relatedTable.label}: ${error.message}`);
          return;
        }
      }

      const { error: societyError } = await supabase
        .from("societies")
        .delete()
        .eq("id", params.id);

      if (societyError) {
        alert(societyError.message);
        return;
      }

      alert("Society deleted");

      router.push("/admin/societies");
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="text-lg md:text-xl">
        Loading...
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto">

      <h1 className="text-2xl md:text-4xl font-bold mb-6 md:mb-8">
        Edit Society
      </h1>

      <div className="bg-white rounded-lg md:rounded-2xl shadow-sm p-4 md:p-8 space-y-4 md:space-y-5">

        <div>
          <label className="font-medium block mb-2 text-sm md:text-base">
            Society Name
          </label>

          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="border rounded-lg md:rounded-xl p-3 md:p-4 w-full text-sm md:text-base"
          />
        </div>

        <div>
          <label className="font-medium block mb-2 text-sm md:text-base">
            City
          </label>

          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="border rounded-lg md:rounded-xl p-3 md:p-4 w-full text-sm md:text-base"
          />
        </div>

        <div>
          <label className="font-medium block mb-2 text-sm md:text-base">
            Total Lights
          </label>

          <input
            type="number"
            value={totalLights}
            onChange={(e) =>
              setTotalLights(e.target.value)
            }
            className="border rounded-lg md:rounded-xl p-3 md:p-4 w-full text-sm md:text-base"
          />
        </div>

        <div>
          <label className="font-medium block mb-2 text-sm md:text-base">
            Savings %
          </label>

          <input
            type="number"
            value={savingsPercentage}
            onChange={(e) =>
              setSavingsPercentage(e.target.value)
            }
            className="border rounded-lg md:rounded-xl p-3 md:p-4 w-full text-sm md:text-base"
          />
        </div>

        <div className="flex flex-col sm:flex-row gap-3 md:gap-4 pt-4">

          <button
            onClick={updateSociety}
            className="bg-green-700 hover:bg-green-800 text-white px-4 md:px-6 py-2 md:py-3 rounded-lg md:rounded-xl font-medium text-sm md:text-base order-1"
          >
            Save Changes
          </button>

          <button
            onClick={deleteSociety}
            disabled={deleting}
            className="bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white px-4 md:px-6 py-2 md:py-3 rounded-lg md:rounded-xl font-medium text-sm md:text-base"
          >
            {deleting ? "Deleting..." : "Delete Society"}
          </button>

        </div>

      </div>

      <div className="bg-white rounded-lg md:rounded-2xl shadow-sm p-4 md:p-8 space-y-4 md:space-y-5 mt-6 md:mt-8">
        <div>
          <h2 className="text-lg md:text-2xl font-bold">Society login</h2>
          <p className="text-sm md:text-base text-gray-600 mt-1">
            Update the customer account linked to this society. The current password cannot be viewed.
          </p>
        </div>

        <div>
          <label className="font-medium block mb-2 text-sm md:text-base">
            Login email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border rounded-lg md:rounded-xl p-3 md:p-4 w-full text-sm md:text-base"
            placeholder="customer@example.com"
          />
        </div>

        <div>
          <label className="font-medium block mb-2 text-sm md:text-base">
            New password
          </label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="border rounded-lg md:rounded-xl p-3 md:p-4 w-full text-sm md:text-base"
            autoComplete="new-password"
            placeholder="Leave blank to keep the current password"
          />
        </div>

        <div>
          <label className="font-medium block mb-2 text-sm md:text-base">
            Confirm new password
          </label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="border rounded-lg md:rounded-xl p-3 md:p-4 w-full text-sm md:text-base"
            autoComplete="new-password"
            placeholder="Repeat the new password"
          />
        </div>

        <button
          onClick={updateLoginDetails}
          disabled={savingLogin}
          className="bg-blue-700 hover:bg-blue-800 disabled:bg-blue-400 text-white px-4 md:px-6 py-2 md:py-3 rounded-lg md:rounded-xl font-medium text-sm md:text-base"
        >
          {savingLogin ? "Updating login..." : "Save Login Details"}
        </button>
      </div>

    </div>
  );
}
