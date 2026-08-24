"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth";
import { logger } from "@/lib/logger";

export async function loginAction(_prevState: string | undefined, formData: FormData) {
  const callbackUrl = (formData.get("callbackUrl") as string) || "/";

  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: callbackUrl,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      // `CredentialsSignin` is authorize() returning null — a real credential
      // failure. Anything else is authorize() THROWING, which in practice
      // means the database is unreachable. Both used to answer "Invalid email
      // or password", so an outage sent the operator off to reset a password
      // that was never wrong (observed 2026-08-24 when the local Postgres
      // container stopped).
      if (error.type === "CredentialsSignin") return "Invalid email or password.";
      logger.error("auth.login_unavailable", { type: error.type });
      return "Sign-in is unavailable right now — this is not your password. Try again in a moment.";
    }
    throw error;
  }
}
