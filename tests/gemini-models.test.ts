import { describe, expect, it } from "vitest";
import { isBusy, quotaKind, withModelFallback } from "@/lib/gemini-models";

const BUSY = "503 gemini-3.6-flash is currently experiencing high demand, spikes in demand are usually temporary. Please try again later.";

describe("isBusy", () => {
  it("reads production's 503 as busy, not a quota refusal", () => {
    expect(isBusy(BUSY)).toBe(true);
    expect(quotaKind(BUSY)).toBe("none");
  });
  it("does not read an ordinary failure as busy", () => {
    expect(isBusy("400 invalid argument")).toBe(false);
  });
});

describe("withModelFallback", () => {
  it("moves past a busy model to the next one", async () => {
    const tried: string[] = [];
    const out = await withModelFallback(async (m) => {
      tried.push(m);
      if (tried.length === 1) throw new Error(BUSY);
      return m;
    });
    expect(tried.length).toBe(2);
    expect(out).toBe(tried[1]);
  });
  it("stops on an error that is neither busy nor quota", async () => {
    let calls = 0;
    await expect(
      withModelFallback(async () => {
        calls++;
        throw new Error("400 bad request");
      }),
    ).rejects.toThrow("400");
    expect(calls).toBe(1);
  });
});
