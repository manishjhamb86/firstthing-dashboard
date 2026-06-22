"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { Plus, X } from "lucide-react";

type Society = {
  id: number;
  name: string;
};

type ChecklistItem = {
  id: string;
  location: string;
  issue_type: string;
  remarks: string;
};

const ISSUE_TYPES = [
  "Sensor OK",
  "Full",
  "Dim",
  "OFF",
  "Flicker",
  "Physical Damage",
  "Replace Required",
];

export default function NewInspectionPage() {
  const router = useRouter();
  const [societies, setSocieties] = useState<Society[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);

  // Form state
  const [societyId, setSocietyId] = useState("");
  const [area, setArea] = useState("");
  const [inspectionDate, setInspectionDate] = useState("");
  const [inspectorName, setInspectorName] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [totalLightsChecked, setTotalLightsChecked] = useState("");
  const [faultyLights, setFaultyLights] = useState("");
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([
    { id: "1", location: "", issue_type: "", remarks: "" },
  ]);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/login");
      return;
    }

    setCurrentUser(user);

    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "inspection") {
      router.push("/login");
      return;
    }

    // Load societies
    const { data: societiesData } = await supabase
      .from("societies")
      .select("*")
      .order("name");

    if (societiesData) {
      setSocieties(societiesData);
    }

    setLoading(false);
  }

  function addChecklistRow() {
    const newId = Date.now().toString();
    setChecklistItems([
      ...checklistItems,
      { id: newId, location: "", issue_type: "", remarks: "" },
    ]);
  }

  function removeChecklistRow(id: string) {
    setChecklistItems(checklistItems.filter((item) => item.id !== id));
  }

  function updateChecklistItem(
    id: string,
    field: keyof ChecklistItem,
    value: string
  ) {
    setChecklistItems(
      checklistItems.map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      )
    );
  }

  async function submitForm() {
    if (
      !societyId ||
      !area ||
      !inspectionDate ||
      !inspectorName ||
      !contactNumber ||
      !totalLightsChecked ||
      faultyLights === ""
    ) {
      alert("Please fill all required fields");
      return;
    }

    if (checklistItems.some((item) => !item.location || !item.issue_type)) {
      alert("Please fill all checklist items");
      return;
    }

    setSubmitting(true);

    try {
      // Insert inspection form
      const { data: inspectionData, error: inspectionError } = await supabase
        .from("inspection_forms")
        .insert({
          society_id: Number(societyId),
          area,
          inspection_date: inspectionDate,
          inspector_name: inspectorName,
          contact_number: contactNumber,
          total_lights_checked: Number(totalLightsChecked),
          faulty_lights: Number(faultyLights),
          created_by: currentUser.id,
        })
        .select()
        .single();

      if (inspectionError) {
        alert(inspectionError.message);
        setSubmitting(false);
        return;
      }

      // Insert checklist items
      const checklistDataToInsert = checklistItems.map((item) => ({
        inspection_form_id: inspectionData.id,
        location: item.location,
        issue_type: item.issue_type,
        remarks: item.remarks,
      }));

      const { error: checklistError } = await supabase
        .from("inspection_form_items")
        .insert(checklistDataToInsert);

      if (checklistError) {
        alert(checklistError.message);
        setSubmitting(false);
        return;
      }

      alert("Inspection submitted successfully!");
      router.push("/inspection");
    } catch (error) {
      console.error(error);
      alert("Error submitting inspection");
    }

    setSubmitting(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-lg">Loading...</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-6xl mx-auto">
      <h1 className="text-2xl md:text-4xl font-bold mb-2">
        New Inspection
      </h1>
      <p className="text-gray-500 text-xs md:text-sm mb-8">
        Submit a new inspection form
      </p>

      <div className="space-y-6">
        {/* Header Section */}
        <div className="bg-white rounded-lg md:rounded-2xl p-4 md:p-6 shadow-sm">
          <h2 className="text-lg md:text-xl font-bold mb-4">
            Inspection Header
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs md:text-sm font-medium mb-2">
                Society *
              </label>
              <select
                value={societyId}
                onChange={(e) => setSocietyId(e.target.value)}
                className="w-full border rounded-lg p-2 md:p-3 text-xs md:text-sm"
              >
                <option value="">Select Society</option>
                {societies.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs md:text-sm font-medium mb-2">
                Area *
              </label>
              <input
                type="text"
                placeholder="e.g., Sector A, Block 1"
                value={area}
                onChange={(e) => setArea(e.target.value)}
                className="w-full border rounded-lg p-2 md:p-3 text-xs md:text-sm"
              />
            </div>

            <div>
              <label className="block text-xs md:text-sm font-medium mb-2">
                Inspection Date *
              </label>
              <input
                type="date"
                value={inspectionDate}
                onChange={(e) => setInspectionDate(e.target.value)}
                className="w-full border rounded-lg p-2 md:p-3 text-xs md:text-sm"
              />
            </div>

            <div>
              <label className="block text-xs md:text-sm font-medium mb-2">
                Inspector Name *
              </label>
              <input
                type="text"
                placeholder="Your name"
                value={inspectorName}
                onChange={(e) => setInspectorName(e.target.value)}
                className="w-full border rounded-lg p-2 md:p-3 text-xs md:text-sm"
              />
            </div>

            <div>
              <label className="block text-xs md:text-sm font-medium mb-2">
                Contact Number *
              </label>
              <input
                type="tel"
                placeholder="Phone number"
                value={contactNumber}
                onChange={(e) => setContactNumber(e.target.value)}
                className="w-full border rounded-lg p-2 md:p-3 text-xs md:text-sm"
              />
            </div>
          </div>
        </div>

        {/* Summary Section */}
        <div className="bg-white rounded-lg md:rounded-2xl p-4 md:p-6 shadow-sm">
          <h2 className="text-lg md:text-xl font-bold mb-4">
            Inspection Summary
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs md:text-sm font-medium mb-2">
                Total Lights Checked *
              </label>
              <input
                type="number"
                placeholder="0"
                value={totalLightsChecked}
                onChange={(e) => setTotalLightsChecked(e.target.value)}
                className="w-full border rounded-lg p-2 md:p-3 text-xs md:text-sm"
              />
            </div>

            <div>
              <label className="block text-xs md:text-sm font-medium mb-2">
                Faulty Lights *
              </label>
              <input
                type="number"
                placeholder="0"
                value={faultyLights}
                onChange={(e) => setFaultyLights(e.target.value)}
                className="w-full border rounded-lg p-2 md:p-3 text-xs md:text-sm"
              />
            </div>
          </div>
        </div>

        {/* Checklist Section */}
        <div className="bg-white rounded-lg md:rounded-2xl p-4 md:p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
            <h2 className="text-lg md:text-xl font-bold">
              Inspection Checklist
            </h2>
            <button
              onClick={addChecklistRow}
              className="flex items-center gap-2 bg-blue-700 hover:bg-blue-800 text-white px-3 md:px-4 py-2 rounded-lg text-xs md:text-sm font-medium w-full sm:w-auto justify-center"
            >
              <Plus size={16} />
              Add Row
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-max text-xs md:text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left p-2 md:p-3 font-semibold">
                    Location
                  </th>
                  <th className="text-left p-2 md:p-3 font-semibold">
                    Issue Type
                  </th>
                  <th className="text-left p-2 md:p-3 font-semibold hidden sm:table-cell">
                    Remarks
                  </th>
                  <th className="text-left p-2 md:p-3 font-semibold">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {checklistItems.map((item) => (
                  <tr key={item.id} className="border-b hover:bg-gray-50">
                    <td className="p-2 md:p-3">
                      <input
                        type="text"
                        placeholder="e.g., Street Pole 1"
                        value={item.location}
                        onChange={(e) =>
                          updateChecklistItem(item.id, "location", e.target.value)
                        }
                        className="w-full border rounded p-1 text-xs"
                      />
                    </td>
                    <td className="p-2 md:p-3">
                      <select
                        value={item.issue_type}
                        onChange={(e) =>
                          updateChecklistItem(item.id, "issue_type", e.target.value)
                        }
                        className="w-full border rounded p-1 text-xs"
                      >
                        <option value="">Select</option>
                        {ISSUE_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-2 md:p-3 hidden sm:table-cell">
                      <input
                        type="text"
                        placeholder="Additional notes"
                        value={item.remarks}
                        onChange={(e) =>
                          updateChecklistItem(item.id, "remarks", e.target.value)
                        }
                        className="w-full border rounded p-1 text-xs"
                      />
                    </td>
                    <td className="p-2 md:p-3">
                      <button
                        onClick={() => removeChecklistRow(item.id)}
                        className="text-red-600 hover:text-red-800 font-medium"
                        disabled={checklistItems.length === 1}
                      >
                        <X size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 md:gap-4">
          <button
            onClick={submitForm}
            disabled={submitting}
            className="flex-1 bg-blue-700 hover:bg-blue-800 disabled:bg-gray-400 text-white px-6 py-3 rounded-lg font-medium text-sm md:text-base transition-colors"
          >
            {submitting ? "Submitting..." : "Submit Inspection"}
          </button>

          <button
            onClick={() => router.back()}
            className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-800 px-6 py-3 rounded-lg font-medium text-sm md:text-base transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
