import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

// Interactive transactions default to 5 s, and the demo actions re-derive a
// circuit's figures inside theirs (resyncCircuitFigures reads every demo and
// its readings). Over the dev tunnel that ran to 8 s and the removal of a
// duplicate demo failed with "expired transaction" (2026-09-26). One default
// here rather than a timeout remembered at each of dozens of call sites; a
// call that passes its own options still overrides it.
export const db =
  globalForPrisma.prisma ?? new PrismaClient({ adapter, transactionOptions: { timeout: 60_000, maxWait: 20_000 } });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
