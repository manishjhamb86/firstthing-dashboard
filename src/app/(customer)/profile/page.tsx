import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import EmptyState from "@/components/shell/EmptyState";

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const society = session.user.societyId
    ? await db.society.findUnique({ where: { id: session.user.societyId } })
    : null;

  if (!society) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-ink mb-8">
          Society Profile
        </h1>

        <EmptyState
          title="No society linked"
          description="Your account isn't linked to a society yet. Contact your admin."
        />
      </div>
    );
  }

  return (
    <div>

      <h1 className="text-2xl font-bold text-ink mb-8">
        Society Profile
      </h1>

      <div className="bg-card rounded-2xl p-8 border border-border max-w-5xl">

        <div className="grid grid-cols-2 gap-8">

          <div>
            <p className="text-m2 mb-2">
              Society Name
            </p>

            <h2 className="text-2xl font-bold text-ink">
              {society.name}
            </h2>
          </div>

          <div>
            <p className="text-m2 mb-2">
              City
            </p>

            <h2 className="text-2xl font-bold text-ink">
              {society.city || "-"}
            </h2>
          </div>

          <div>
            <p className="text-m2 mb-2">
              Total Lights
            </p>

            <h2 className="text-2xl font-bold text-ink">
              {society.totalLights}
            </h2>
          </div>

          <div>
            <p className="text-m2 mb-2">
              Savings Percentage
            </p>

            <h2 className="text-2xl font-bold text-ac">
              {society.savingsPercentage.toNumber()}%
            </h2>
          </div>

          <div>
            <p className="text-m2 mb-2">
              Registered On
            </p>

            <h2 className="text-2xl font-bold text-ink">
              {society.createdAt.toLocaleDateString()}
            </h2>
          </div>

          <div>
            <p className="text-m2 mb-2">
              System Status
            </p>

            <h2 className="text-2xl font-bold text-ac">
              Active
            </h2>
          </div>

        </div>

      </div>

    </div>
  );
}
