const tag = process.env.GITHUB_REF_NAME ?? process.argv[2] ?? "";
const match = /^cli-v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(tag);
if (!match) {
  throw new Error(
    `CLI release tag "${tag}" must be stable semver (cli-vMAJOR.MINOR.PATCH).`,
  );
}

const version = tag.slice("cli-v".length);
const [cargoToml, cargoLock, readme, publishedCompose, releaseCandidate] =
  await Promise.all([
    Bun.file("crates/domino-cli/Cargo.toml").text(),
    Bun.file("Cargo.lock").text(),
    Bun.file("README.md").text(),
    Bun.file("compose.published.yaml").text(),
    Bun.file(`docs/release-candidate-${version}.md`).text(),
  ]);
const escaped = version.replaceAll(".", "\\.");
const checks = [
  [
    "crates/domino-cli/Cargo.toml",
    new RegExp(`^version = "${escaped}"$`, "m").test(cargoToml),
  ],
  [
    "Cargo.lock",
    new RegExp(`name = "domino-cli"\\nversion = "${escaped}"`, "m").test(
      cargoLock,
    ),
  ],
  ["README CLI image", readme.includes(`domino-cli:${version}`)],
  [
    "release-candidate CLI identity",
    releaseCandidate.includes(
      `CLI version: \`${version}\` (\`cli-v${version}\`)`,
    ),
  ],
  [
    "Published Compose CLI image",
    publishedCompose.includes(
      `domino-cli:\${DOMINO_CLI_IMAGE_TAG:-${version}}`,
    ),
  ],
] as const;

const failures = checks.filter(([, valid]) => !valid).map(([name]) => name);
if (failures.length) {
  throw new Error(`CLI release ${tag} does not match: ${failures.join(", ")}.`);
}
console.log(`Verified CLI release identity ${tag}.`);
