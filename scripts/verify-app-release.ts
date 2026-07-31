const tag = process.env.GITHUB_REF_NAME ?? process.argv[2] ?? "";
const match = /^app-v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(tag);
if (!match) {
  throw new Error(
    `App release tag "${tag}" must be stable semver (app-vMAJOR.MINOR.PATCH).`,
  );
}

const version = tag.slice("app-v".length);
const read = (path: string) => Bun.file(path).text();
const packageJson = await Bun.file("package.json").json();
const [
  api,
  openApi,
  readme,
  deployment,
  migration,
  publishedCompose,
  releaseCandidate,
] = await Promise.all([
  read("src/lib/server/api/system.ts"),
  read("src/lib/server/openapi.ts"),
  read("README.md"),
  read("deploy/k8s/deployment.yaml"),
  read("deploy/k8s/migrate-job.yaml"),
  read("compose.published.yaml"),
  read(`docs/release-candidate-${version}.md`),
]);

const checks = [
  ["package.json", packageJson.version === version],
  ["API health response", api.includes(`version: "${version}"`)],
  ["OpenAPI document", openApi.includes(`version: "${version}"`)],
  ["README app image", readme.includes(`domino:${version}`)],
  ["README migration image", readme.includes(`domino-migrate:${version}`)],
  [
    "release-candidate app identity",
    releaseCandidate.includes(
      `Application version: \`${version}\` (\`app-v${version}\`)`,
    ),
  ],
  ["Kubernetes app image", deployment.includes(`domino:${version}`)],
  [
    "Published Compose app image",
    publishedCompose.includes(`domino:\${DOMINO_IMAGE_TAG:-${version}}`),
  ],
  [
    "Published Compose migration image",
    publishedCompose.includes(
      `domino-migrate:\${DOMINO_IMAGE_TAG:-${version}}`,
    ),
  ],
  [
    "Kubernetes migration image",
    migration.includes(`domino-migrate:${version}`),
  ],
  [
    "Kubernetes migration Job name",
    migration.includes(`domino-migrate-${version.replaceAll(".", "-")}`),
  ],
] as const;

const failures = checks.filter(([, valid]) => !valid).map(([name]) => name);
if (failures.length) {
  throw new Error(`App release ${tag} does not match: ${failures.join(", ")}.`);
}
console.log(`Verified app release identity ${tag}.`);
