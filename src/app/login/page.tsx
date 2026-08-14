import { LoginForm } from "./login-form";
import { BrandMark } from "@/components/brand-mark";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div
        className="p-10 rounded-[var(--r-lg)] shadow-sm w-full max-w-md border"
        style={{ background: "var(--surface)", borderColor: "var(--border-subtle)" }}
      >
        <BrandMark className="h-9 mb-6" />
        <p className="mb-8" style={{ color: "var(--text-muted)" }}>
          Sign in to continue
        </p>
        <LoginForm callbackUrl={callbackUrl ?? "/"} />
      </div>
    </div>
  );
}
