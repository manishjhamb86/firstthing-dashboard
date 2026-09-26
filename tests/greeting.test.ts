import { describe, expect, it } from "vitest";
import { greetingName } from "@/lib/greeting";

describe("greetingName", () => {
  it("a login named after its society greets the society in full", () => {
    expect(greetingName("The Hyde Park", "The Hyde Park")).toBe("The Hyde Park");
    expect(greetingName("Hyde Park", "The Hyde Park")).toBe("The Hyde Park");
    expect(greetingName("The Hyde Park Committee", "The Hyde Park")).toBe("The Hyde Park");
  });
  it("a person is greeted by first name", () => {
    expect(greetingName("Asha Rao", "Settlement Nexus")).toBe("Asha");
  });
  it("never greets a title or an article on its own", () => {
    expect(greetingName("The Secretary", "Ace City")).toBe("The Secretary");
    expect(greetingName("Dr. Mehta", "Ace City")).toBe("Dr. Mehta");
    expect(greetingName("A. Kumar", "Ace City")).toBe("A. Kumar");
  });
  it("no name greets the society, not an email address", () => {
    expect(greetingName(null, "Ace City")).toBe("Ace City");
    expect(greetingName("  ", "Ace City")).toBe("Ace City");
  });
});
