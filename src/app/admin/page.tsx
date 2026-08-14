import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { AdminNav } from "./admin-nav";

// MS-01's own exit criterion, made literal: an admin account logs in and
// lands on a real Server Component reading a row from Postgres. Real
// portfolio KPIs, tenancy-scoped queries, and the rest of the admin shell
// arrive milestone by milestone from MS-02 onward — this page is the
// walking-skeleton proof, not the Portfolio dashboard screen spec.
export default async function AdminHomePage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") redirect("/login");

  const societyCount = await db.society.count();
  const societies = await db.society.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  return (
    <div className="min-h-screen p-10">
      <AdminNav />
      <h1 className="text-2xl font-bold mb-1">Portfolio</h1>
      <p className="text-black/50 mb-8">Signed in as {session.user.email}</p>

      <div className="bg-white border border-black/5 rounded-2xl p-6 max-w-xl">
        <p className="text-sm text-black/50 mb-1">Societies in Postgres</p>
        <p className="text-3xl font-bold mb-4">{societyCount}</p>

        {societies.length === 0 ? (
          <p className="text-black/50">No societies yet.</p>
        ) : (
          <ul className="space-y-2">
            {societies.map((s) => (
              <li key={s.id} className="flex justify-between border-t border-black/5 pt-2">
                <span>{s.name}</span>
                <span className="text-black/50">{s.location}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
