const repositoryRoot = new URL("../", import.meta.url);
const markdownFiles = Array.fromAsync(
  new Bun.Glob("**/*.md").scan({
    cwd: repositoryRoot.pathname,
    absolute: true,
    onlyFiles: true,
  }),
);

const missing: string[] = [];
for (const filePath of await markdownFiles) {
  if (filePath.includes("/node_modules/") || filePath.includes("/target/")) {
    continue;
  }
  const source = await Bun.file(filePath).text();
  for (const match of source.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const rawTarget = match[1].trim().replace(/^<|>$/g, "");
    if (
      !rawTarget ||
      rawTarget.startsWith("#") ||
      /^[a-z][a-z0-9+.-]*:/i.test(rawTarget)
    ) {
      continue;
    }
    const pathOnly = decodeURIComponent(rawTarget.split("#", 1)[0]);
    const target = new URL(pathOnly, Bun.pathToFileURL(filePath));
    if (!(await Bun.file(target).exists())) {
      missing.push(
        `${filePath.slice(repositoryRoot.pathname.length)} -> ${rawTarget}`,
      );
    }
  }
}

if (missing.length) {
  console.error(`Broken documentation links:\n${missing.join("\n")}`);
  process.exit(1);
}

console.log("Documentation links are valid.");
