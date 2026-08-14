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
      <div className="w-full max-w-sm">
        <div className="card p-8">
          <BrandMark className="h-8 mb-6" />
          <h1 className="text-lg font-semibold mb-1">Sign in</h1>
          <p className="mb-6 text-sm text-[var(--text-muted)]">
            Energy savings operations for residential societies.
          </p>
          <LoginForm callbackUrl={callbackUrl ?? "/"} />
        </div>
      </div>
    </div>
  );
}
