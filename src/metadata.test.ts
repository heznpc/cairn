import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  HTTP_USER_AGENT,
  PROJECT_HOMEPAGE,
  PROJECT_VERSION,
  SERVER_NAME,
} from "./metadata.js";

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string; homepage: string };

describe("runtime metadata", () => {
  it("keeps runtime version and homepage aligned with package.json", () => {
    expect(PROJECT_VERSION).toBe(packageJson.version);
    expect(PROJECT_HOMEPAGE).toBe(packageJson.homepage);
  });

  it("builds a current, project-scoped HTTP User-Agent", () => {
    expect(SERVER_NAME).toBe("cairn");
    expect(HTTP_USER_AGENT).toBe(
      `cairn-mcp/${packageJson.version} (+${packageJson.homepage})`,
    );
  });
});
