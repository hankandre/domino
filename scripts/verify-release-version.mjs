import { readFile } from "node:fs/promises";

const tag = process.env.GITHUB_REF_NAME ?? process.argv[2] ?? "";
const match = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(tag);
if (!match)
  throw new Error(
    `Release tag "${tag}" must be stable semver (vMAJOR.MINOR.PATCH).`,
  );
const version = tag.slice(1);
const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const cargoToml = await readFile("crates/domino-cli/Cargo.toml", "utf8");
const api = await readFile("src/lib/server/api.ts", "utf8");
const openapi = await readFile("src/lib/server/openapi.ts", "utf8");

const checks = [
  ["package.json", packageJson.version === version],
  [
    "crates/domino-cli/Cargo.toml",
    new RegExp(`^version = "${version.replaceAll(".", "\\.")}"$`, "m").test(
      cargoToml,
    ),
  ],
  ["API health response", api.includes(`version: "${version}"`)],
  ["OpenAPI document", openapi.includes(`version: "${version}"`)],
];
const failures = checks.filter(([, valid]) => !valid).map(([name]) => name);
if (failures.length)
  throw new Error(`Release ${tag} does not match: ${failures.join(", ")}.`);
console.log(`Verified release identity ${tag}.`);
