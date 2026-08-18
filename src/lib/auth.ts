import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { logger } from "./logger";

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email;
        const password = credentials?.password;
        if (typeof email !== "string" || typeof password !== "string") return null;

        // Admin logins are resolved against their own table, never a shared
        // "role" column — see PROJECT_CONTEXT.md and 00-intake.md INV-01.
        // This makes an admin session structurally impossible to obtain any
        // other way, not just role-gated.
        // A removed account must not be able to sign in. Filtering here rather
        // than after the password check means a deleted admin is indistinguishable
        // from a nonexistent one, which is also the right answer to give.
        const admin = await db.adminUser.findFirst({ where: { email, deletedAt: null } });
        if (admin) {
          if (!admin.isActive) {
            logger.warn("auth.login_failed", { email, reason: "admin_inactive" });
            return null;
          }
          const valid = await bcrypt.compare(password, admin.passwordHash);
          if (!valid) {
            logger.warn("auth.login_failed", { email, reason: "bad_password", table: "admin_users" });
            return null;
          }

          logger.info("auth.login_succeeded", { userId: admin.id, email, role: "admin" });
          return {
            id: admin.id,
            email: admin.email,
            role: "admin",
            adminPermissions: admin.permissions,
            societyId: null,
          };
        }

        // Society-portal logins (FEAT-108) — resolved from Profile, never
        // able to carry admin access since AdminUser was already checked and
        // missed. portalAuthority (office-bearer/committee/manager) becomes
        // the session role; binding acts still re-check it server-side per
        // action (GATE-04), this is only who's allowed to sign in at all.
        const profile = await db.profile.findUnique({ where: { email } });
        if (!profile || !profile.isActive || !profile.portalAuthority) {
          logger.warn("auth.login_failed", { email, reason: "no_matching_account" });
          return null;
        }

        const valid = await bcrypt.compare(password, profile.passwordHash);
        if (!valid) {
          logger.warn("auth.login_failed", { email, reason: "bad_password", table: "profiles" });
          return null;
        }

        logger.info("auth.login_succeeded", {
          userId: profile.id,
          email,
          role: profile.portalAuthority,
          societyId: profile.societyId,
        });
        return {
          id: profile.id,
          email: profile.email,
          role: profile.portalAuthority,
          adminPermissions: null,
          societyId: profile.societyId,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.adminPermissions = user.adminPermissions ?? null;
        token.societyId = user.societyId ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub!;
        session.user.role = token.role!;
        session.user.adminPermissions = token.adminPermissions ?? null;
        session.user.societyId = token.societyId ?? null;
      }
      return session;
    },
  },
});
