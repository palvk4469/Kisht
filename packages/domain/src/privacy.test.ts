import { describe, expect, it } from "vitest";
import { maskPhone } from "./privacy.ts";

describe("maskPhone", () => {
  it("keeps only the last four digits", () => {
    expect(maskPhone("90000 12345")).toBe("••••••2345");
    expect(maskPhone("+91-90000-12345")).toBe("••••••2345");
  });

  it("never echoes very short input", () => {
    expect(maskPhone("123")).toBe("••••");
  });
});
