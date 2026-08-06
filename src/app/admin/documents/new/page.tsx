import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import DocumentsUploadClient from "./documents-upload-client";

export default async function NewDocumentPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") redirect("/login");

  const societies = await db.society.findMany({ orderBy: { name: "asc" } });

  return <DocumentsUploadClient societies={societies.map((s) => ({ id: s.id, name: s.name }))} />;
}
