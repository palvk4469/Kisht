import { describe, expect, it } from "vitest";
import { APP_TIMEZONE } from "./index.js";

describe("@kisht/shared", () => {
  it("exports the app timezone", () => {
    expect(APP_TIMEZONE).toBe("Asia/Kolkata");
  });
});
