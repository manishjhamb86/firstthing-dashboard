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
      <div className="bg-white p-10 rounded-2xl shadow-sm w-full max-w-md border border-black/5">
        <BrandMark className="h-9 mb-6" />
        <p className="text-black/50 mb-8">Sign in to continue</p>
        <LoginForm callbackUrl={callbackUrl ?? "/"} />
      </div>
    </div>
  );
}
