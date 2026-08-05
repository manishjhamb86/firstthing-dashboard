"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteSociety, updateSociety, updateSocietyLogin } from "../actions";

type Props = {
  society: {
    id: number;
    name: string;
    city: string;
    totalLights: number;
    savingsPercentage: number;
  };
  currentEmail: string;
};

const inputClass =
  "w-full rounded-[10px] border border-border bg-card px-3.5 py-2.5 text-sm text-ink placeholder:text-m2 focus:outline-none";
const labelClass = "mb-1.5 block text-xs font-semibold text-ink";

export default function EditSocietyClient({ society, currentEmail: initialEmail }: Props) {
  const router = useRouter();

  const [name, setName] = useState(society.name);
  const [city, setCity] = useState(society.city);
  const [totalLights, setTotalLights] = useState(String(society.totalLights));
  const [savingsPercentage, setSavingsPercentage] = useState(String(society.savingsPercentage));

  const [currentEmail, setCurrentEmail] = useState(initialEmail);
  const [email, setEmail] = useState(initialEmail);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingLogin, setSavingLogin] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function updateSocietyDetails() {
    try {
      const result = await updateSociety({
        id: society.id,
        name,
        city,
        totalLights: Number(totalLights),
        savingsPercentage: Number(savingsPercentage),
      });

      if (!result.success) {
        alert("Failed to update society");
        return;
      }

      alert("Society updated successfully");
      router.push("/admin/societies");
    } catch {
      alert("Failed to update society");
    }
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

    setSavingLogin(true);

    try {
      const result = await updateSocietyLogin({
        societyId: society.id,
        ...(emailChanged ? { email: updatedEmail } : {}),
        ...(passwordChanged ? { password: newPassword } : {}),
      });

      if (!result.success) {
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

  async function removeSociety() {
    const confirmed = confirm(
      "Are you sure you want to delete this society? All of its details and reports will also be permanently deleted."
    );

    if (!confirmed) return;

    setDeleting(true);

    try {
      await deleteSociety(society.id);
      alert("Society deleted");
      router.push("/admin/societies");
    } catch {
      alert("Failed to delete society");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="w-full max-w-2xl space-y-6">
      <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
        <div>
          <label className={labelClass}>Society Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </div>

        <div>
          <label className={labelClass}>City</label>
          <input value={city} onChange={(e) => setCity(e.target.value)} className={inputClass} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Total Lights</label>
            <input
              type="number"
              value={totalLights}
              onChange={(e) => setTotalLights(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Savings %</label>
            <input
              type="number"
              value={savingsPercentage}
              onChange={(e) => setSavingsPercentage(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        <div className="flex flex-col gap-3 pt-2 sm:flex-row">
          <button onClick={updateSocietyDetails} className="rounded-[9px] bg-ac px-4 py-2.5 text-sm font-bold text-onac">
            Save Changes
          </button>

          <button
            onClick={removeSociety}
            disabled={deleting}
            className="rounded-[9px] px-4 py-2.5 text-sm font-bold disabled:opacity-60"
            style={{ background: "var(--bf)", color: "var(--onac)" }}
          >
            {deleting ? "Deleting..." : "Delete Society"}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
        <div>
          <h2 className="text-sm font-bold text-ink">Society login</h2>
          <p className="mt-1 text-[11px] text-m2">
            Update the customer account linked to this society. The current password cannot be viewed.
          </p>
        </div>

        <div>
          <label className={labelClass}>Login email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
            placeholder="customer@example.com"
          />
        </div>

        <div>
          <label className={labelClass}>New password</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className={inputClass}
            autoComplete="new-password"
            placeholder="Leave blank to keep the current password"
          />
        </div>

        <div>
          <label className={labelClass}>Confirm new password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className={inputClass}
            autoComplete="new-password"
            placeholder="Repeat the new password"
          />
        </div>

        <button
          onClick={updateLoginDetails}
          disabled={savingLogin}
          className="rounded-[9px] bg-ac px-4 py-2.5 text-sm font-bold text-onac disabled:opacity-60"
        >
          {savingLogin ? "Updating login..." : "Save Login Details"}
        </button>
      </div>
    </div>
  );
}
