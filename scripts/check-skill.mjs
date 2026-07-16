#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const skillDir = resolve(root, "skills/create-wayfinding-map");
const skillPath = resolve(skillDir, "SKILL.md");
const agentPath = resolve(skillDir, "agents/openai.yaml");

for (const path of [skillPath, agentPath]) {
  if (!existsSync(path)) throw new Error(`missing skill file: ${path}`);
}

const skill = readFileSync(skillPath, "utf8");
const frontmatter = skill.match(/^---\n([\s\S]*?)\n---\n/);
if (!frontmatter) throw new Error("SKILL.md is missing YAML frontmatter");
const keys = [...frontmatter[1].matchAll(/^([a-z_]+):/gm)].map((match) => match[1]);
if (JSON.stringify(keys.sort()) !== JSON.stringify(["description", "name"])) {
  throw new Error(`SKILL.md frontmatter must contain only name and description: ${keys.join(", ")}`);
}
if (!frontmatter[1].includes("name: create-wayfinding-map")) {
  throw new Error("SKILL.md name must match its directory");
}
if (/\bTODO\b/.test(skill)) throw new Error("SKILL.md still contains TODO text");
for (const tool of ["generate_map", "render_document"]) {
  if (!skill.includes(`\`${tool}\``)) throw new Error(`SKILL.md must teach the ${tool} workflow`);
}

for (const match of skill.matchAll(/\]\((references\/[^)]+)\)/g)) {
  const referencePath = resolve(skillDir, match[1]);
  if (!existsSync(referencePath)) throw new Error(`missing skill reference: ${match[1]}`);
}

const agent = readFileSync(agentPath, "utf8");
if (!agent.includes("$create-wayfinding-map")) {
  throw new Error("agents/openai.yaml default_prompt must mention $create-wayfinding-map");
}

console.log("skill check passed: create-wayfinding-map");
