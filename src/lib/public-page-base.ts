import { headers } from "next/headers";

/**
 * Where a society's public page is shown as living: firsthing.earth in
 * production, and this server's own address anywhere else (stage, dev), so
 * a link the back office copies always opens.
 */
export async function publicPageBase(): Promise<string> {
  const host = (await headers()).get("host") ?? "";
  const bare = host.split(":")[0];
  if (/(^|\.)firsthing\.earth$/.test(bare) && !bare.startsWith("stage.")) return "https://firsthing.earth";
  return `${bare === "localhost" ? "http" : "https"}://${host}`;
}
