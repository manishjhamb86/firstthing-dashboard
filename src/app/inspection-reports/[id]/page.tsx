"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../../lib/supabase";
import { ArrowLeft } from "lucide-react";

type InspectionForm = {
  id: number;
  society_id: number;
  area: string;
  inspection_date: string;
  inspector_name: string;
  contact_number: string;
  society_name?: string;
  societies?:
    | {
        name: string;
      }
    | {
        name: string;
      }[]
    | null;
  total_lights_checked: number;
  faulty_lights: number;
  created_at: string;
  created_by: string;
};

type ChecklistItem = {
  id: number;
  location: string;
  issue_type: string;
  remarks: string;
};

export default function InspectionDetailsPage() {
  const params = useParams();
  const inspectionId = params.id as string;

  const [inspection, setInspection] = useState<InspectionForm | null>(null);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(false);
  const [isCustomer, setIsCustomer] = useState(false);
  const [userRole, setUserRole] = useState("");

  useEffect(() => {
    loadData();
  }, [inspectionId]);

  async function loadData() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    // Get user profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, society_id")
      .eq("id", user.id)
      .single();

    if (!profile) return;

    setUserRole(profile.role);

    // Load inspection form
    const { data: inspectionData } = await supabase
      .from("inspection_forms")
      .select(
        "id, society_id, area, inspection_date, inspector_name, contact_number, society_name, total_lights_checked, faulty_lights, created_at, created_by, societies(name)"
      )
      .eq("id", Number(inspectionId))
      .single();

    if (!inspectionData) {
      alert("Inspection not found");
      return;
    }

    setInspection(inspectionData as InspectionForm);

    // Check permissions
    if (profile.role === "inspection" && inspectionData.created_by === user.id) {
      setIsOwner(true);
    } else if (profile.role === "customer" && inspectionData.society_id === profile.society_id) {
      setIsCustomer(true);
    } else if (profile.role !== "admin") {
      alert("You do not have permission to view this inspection");
      return;
    }

    // Load checklist items
    const { data: checklistData } = await supabase
      .from("inspection_form_items")
      .select("*")
      .eq("inspection_form_id", Number(inspectionId))
      .order("id", { ascending: true });

    if (checklistData) {
      setChecklist(checklistData as ChecklistItem[]);
    }

    setLoading(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-lg">Loading...</p>
      </div>
    );
  }

  if (!inspection) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-lg text-red-600">Inspection not found</p>
      </div>
    );
  }

  const faultPercentage = inspection.total_lights_checked
    ? Math.round(
        (inspection.faulty_lights / inspection.total_lights_checked) * 100
      )
    : 0;

  const isCustomerView = userRole === "customer";
  const mobileHeaderClass = isCustomerView
    ? "bg-green-950 text-white"
    : "bg-blue-950 text-white";
  const mobileHeaderTitle = isCustomerView
    ? "Firsthing.earth"
    : "Inspection Portal";
  const resolvedSocietyFromRelation = Array.isArray(inspection.societies)
    ? inspection.societies[0]?.name
    : inspection.societies?.name;
  const displaySocietyName =
    resolvedSocietyFromRelation || inspection.society_name || "-";

  return (
    <div className="min-h-screen bg-gray-100">
      <div className={`md:hidden sticky top-0 z-30 px-4 py-3 ${mobileHeaderClass}`}>
        <p className="text-base font-bold">{mobileHeaderTitle}</p>
        <p className="text-xs opacity-90">Inspection Details</p>
      </div>

      <div className="w-full max-w-6xl mx-auto px-4 md:px-8 py-4 md:py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link href={isOwner ? "/inspection/history" : "/inspection-reports"}>
            <button className="flex items-center gap-2 text-blue-600 hover:text-blue-800 font-medium">
              <ArrowLeft size={20} />
              Back
            </button>
          </Link>
          <div>
            <h1 className="text-2xl md:text-4xl font-bold">
              Inspection Details
            </h1>
            <p className="text-gray-500 text-xs md:text-sm mt-1">
              {inspection.area} - {displaySocietyName}
            </p>
          </div>
        </div>

        <div className="space-y-6">
        {/* Inspection Header Info */}
        <div className="bg-white rounded-lg md:rounded-2xl p-4 md:p-6 shadow-sm">
          <h2 className="text-lg md:text-xl font-bold mb-4">
            Inspection Information
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs md:text-sm">
            <div>
              <p className="text-gray-500 font-medium">Date</p>
              <p className="text-lg font-semibold mt-1">
                {new Date(inspection.inspection_date).toLocaleDateString()}
              </p>
            </div>

            <div>
              <p className="text-gray-500 font-medium">Area</p>
              <p className="text-lg font-semibold mt-1">{inspection.area}</p>
            </div>

            <div>
              <p className="text-gray-500 font-medium">Inspector Name</p>
              <p className="text-lg font-semibold mt-1">
                {inspection.inspector_name}
              </p>
            </div>

            <div>
              <p className="text-gray-500 font-medium">Contact Number</p>
              <p className="text-lg font-semibold mt-1">
                {inspection.contact_number}
              </p>
            </div>

            <div>
              <p className="text-gray-500 font-medium">Society</p>
              <p className="text-lg font-semibold mt-1">
                {displaySocietyName}
              </p>
            </div>

            <div>
              <p className="text-gray-500 font-medium">Submitted</p>
              <p className="text-lg font-semibold mt-1">
                {new Date(inspection.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-lg md:rounded-2xl p-4 md:p-6 shadow-sm">
            <p className="text-gray-500 text-xs md:text-sm mb-2">
              Total Lights
            </p>
            <p className="text-3xl md:text-4xl font-bold text-blue-700">
              {inspection.total_lights_checked}
            </p>
          </div>

          <div className="bg-white rounded-lg md:rounded-2xl p-4 md:p-6 shadow-sm">
            <p className="text-gray-500 text-xs md:text-sm mb-2">
              Faulty Lights
            </p>
            <p className="text-3xl md:text-4xl font-bold text-red-700">
              {inspection.faulty_lights}
            </p>
          </div>

          <div className="bg-white rounded-lg md:rounded-2xl p-4 md:p-6 shadow-sm">
            <p className="text-gray-500 text-xs md:text-sm mb-2">
              Fault Rate
            </p>
            <p className="text-3xl md:text-4xl font-bold text-orange-700">
              {faultPercentage}%
            </p>
          </div>
        </div>

        {/* Checklist Items */}
        <div className="bg-white rounded-lg md:rounded-2xl p-4 md:p-6 shadow-sm">
          <h2 className="text-lg md:text-xl font-bold mb-4">
            Inspection Checklist Items
          </h2>

          {checklist.length === 0 ? (
            <p className="text-gray-500">No checklist items found</p>
          ) : (
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
                  </tr>
                </thead>
                <tbody>
                  {checklist.map((item, idx) => (
                    <tr
                      key={item.id}
                      className={`${
                        idx % 2 === 0 ? "bg-white" : "bg-gray-50"
                      } border-b`}
                    >
                      <td className="p-2 md:p-3 font-medium">
                        {item.location}
                      </td>
                      <td className="p-2 md:p-3">
                        <span
                          className={`inline-block px-2 md:px-3 py-1 rounded-full font-semibold ${
                            item.issue_type === "Sensor OK"
                              ? "bg-green-100 text-green-700"
                              : item.issue_type === "Full"
                              ? "bg-blue-100 text-blue-700"
                              : item.issue_type === "OFF" ||
                                  item.issue_type === "Dim"
                              ? "bg-yellow-100 text-yellow-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {item.issue_type}
                        </span>
                      </td>
                      <td className="p-2 md:p-3 hidden sm:table-cell text-gray-600">
                        {item.remarks || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

          {/* Footer Info */}
          <div className="bg-blue-50 rounded-lg md:rounded-2xl p-4 md:p-6">
            <p className="text-xs md:text-sm text-gray-600">
              Inspection ID: <span className="font-mono font-medium">{inspection.id}</span>
            </p>
            {isOwner && (
              <p className="text-xs md:text-sm text-blue-600 mt-2">
                💡 You can view and manage this inspection from your history
              </p>
            )}
            {isCustomer && (
              <p className="text-xs md:text-sm text-blue-600 mt-2">
                👁️ This is an inspection submitted for your society
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
