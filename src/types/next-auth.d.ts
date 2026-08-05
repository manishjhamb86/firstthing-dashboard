import type { DefaultSession } from "next-auth";
import type { Role } from "@/lib/roles";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      societyId: number | null;
      societyName: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    role: Role;
    societyId: number | null;
    societyName: string | null;
  }
}

// The `jwt` callback's `token: JWT` type is imported by @auth/core's own
// source from "./jwt.js" (i.e. "@auth/core/jwt") directly — augmenting
// "next-auth/jwt" (a re-export barrel) does not merge into that original
// declaration, so this must target the real module.
declare module "@auth/core/jwt" {
  interface JWT {
    role?: Role;
    societyId?: number | null;
    societyName?: string | null;
  }
}
