import type { db } from "@/lib/db";

/** A Prisma interactive-transaction client. */
export type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];
