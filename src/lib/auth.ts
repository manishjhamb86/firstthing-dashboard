import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "./db";

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

        const profile = await db.profile.findUnique({ where: { email } });
        if (!profile) return null;

        const valid = await bcrypt.compare(password, profile.passwordHash);
        if (!valid) return null;

        return {
          id: profile.id,
          email: profile.email,
          role: profile.role,
          societyId: profile.societyId,
          societyName: profile.societyName,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.societyId = user.societyId;
        token.societyName = user.societyName;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub!;
        session.user.role = token.role!;
        session.user.societyId = token.societyId ?? null;
        session.user.societyName = token.societyName ?? null;
      }
      return session;
    },
  },
});
