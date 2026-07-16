import { describe, expect, it } from "vitest";
import { wrapLandmarkLabel } from "./text.js";

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
