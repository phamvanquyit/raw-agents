import { describe, expect, test } from "bun:test";
import { isRaSiteFormSubmitMessage, shouldReloadAfterAction } from "./siteFormSubmit";

describe("siteFormSubmit helpers", () => {
  test("isRaSiteFormSubmitMessage validates entries shape", () => {
    expect(isRaSiteFormSubmitMessage({ type: "ra-site-form-submit", entries: [["a", "1"]] })).toBe(true);
    expect(isRaSiteFormSubmitMessage({ type: "ra-site-form-submit", entries: [["a", "1"]], path: "/p" })).toBe(true);
    expect(isRaSiteFormSubmitMessage({ type: "ra-site-form-submit", entries: [["a", 1]] })).toBe(false);
    expect(isRaSiteFormSubmitMessage({ type: "ra-site-form-submit", entries: "x" })).toBe(false);
    expect(isRaSiteFormSubmitMessage({ type: "other", entries: [] })).toBe(false);
  });

  test("shouldReloadAfterAction defaults to true", () => {
    expect(shouldReloadAfterAction(undefined)).toBe(true);
    expect(shouldReloadAfterAction({ ok: true })).toBe(true);
    expect(shouldReloadAfterAction({ ok: false, reload: false })).toBe(false);
  });
});
