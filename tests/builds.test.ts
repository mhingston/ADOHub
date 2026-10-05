import { describe, expect, it } from "vitest";
import { countLogLines } from "@/lib/ado/builds";

describe("pipeline log polling", () => {
  it("does not count a trailing newline as another log line", () => {
    expect(countLogLines("first\nsecond\n")).toBe(2);
    expect(countLogLines("first\nsecond")).toBe(2);
    expect(countLogLines("")).toBe(0);
  });
});
