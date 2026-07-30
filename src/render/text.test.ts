import { describe, expect, it } from "vitest";
import { charEm, textBoxWidth, textEmWidth, wrapLandmarkLabel } from "./text.js";

describe("charEm", () => {
  it("treats Hangul and CJK as full-width", () => {
    expect(charEm("역")).toBe(1);
    expect(charEm("駅")).toBe(1);
  });

  it("treats Latin and Cyrillic as the same narrow class", () => {
    // The old rule charged Cyrillic full width for being non-ASCII.
    expect(charEm("в")).toBe(charEm("v"));
    expect(charEm("Θ")).toBe(charEm("O"));
  });

  it("separates narrow and wide Latin letters", () => {
    expect(charEm("i")).toBeLessThan(charEm("n"));
    expect(charEm("m")).toBeGreaterThan(charEm("n"));
  });

  it("gives combining marks no advance, since they stack", () => {
    expect(charEm("\u0947")).toBe(0); // Devanagari vowel sign e
    expect(charEm("\u0e49")).toBe(0); // Thai tone mark
    expect(charEm("\u064b")).toBe(0); // Arabic fathatan
  });
});

describe("textEmWidth", () => {
  it("stops overestimating non-Latin alphabets", () => {
    // "Выход" is five narrow letters, not five full-width ones.
    expect(textEmWidth("Выход")).toBeCloseTo(2.8, 5);
  });

  it("measures Korean at one em per syllable", () => {
    expect(textEmWidth("역삼역")).toBeCloseTo(3, 5);
  });

  it("counts an astral character once", () => {
    expect(textEmWidth("\u{20000}")).toBe(1);
  });

  it("ignores marks when sizing a Devanagari label", () => {
    // "मे" is one base consonant plus one matra.
    expect(textEmWidth("मे")).toBeCloseTo(0.56, 5);
  });
});

describe("textBoxWidth", () => {
  it("keeps a floor so short labels stay legible", () => {
    expect(textBoxWidth("i", 11, 0)).toBe(28);
  });

  it("reserves less space for Cyrillic than the same count of Hangul", () => {
    expect(textBoxWidth("Выход", 11, 20)).toBeLessThan(
      textBoxWidth("역삼역출구", 11, 20),
    );
  });
});

describe("wrapLandmarkLabel", () => {
  it("keeps Korean station and exit words intact", () => {
    expect(wrapLandmarkLabel("역삼역 7번 출구", 8)).toEqual(["역삼역", "7번 출구"]);
  });

  it("uses balanced character wrapping for names without spaces", () => {
    expect(wrapLandmarkLabel("서울대학교병원헬스케어센터", 9)).toEqual([
      "서울대학교병원",
      "헬스케어센터",
    ]);
  });

  it("ellipsizes only an overlong second word group", () => {
    expect(wrapLandmarkLabel("CU 역삼휴게소점테스트", 7)).toEqual([
      "CU",
      "역삼휴게소점…",
    ]);
  });
});
