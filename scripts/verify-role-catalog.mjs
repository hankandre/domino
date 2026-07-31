import { readFile } from "node:fs/promises";
import { roleTemplates } from "../src/lib/server/auth/role-catalog.mjs";

const migration = await readFile(
  new URL("../drizzle/0007_peaceful_preak.sql", import.meta.url),
  "utf8",
);

for (const id of ["inventory-contributor", "household-agent"]) {
  const template = roleTemplates[id];
  const expected = [
    `'${template.name.replaceAll("'", "''")}'`,
    `'${template.description.replaceAll("'", "''")}'`,
    `'${JSON.stringify(template.permissions)}'::jsonb`,
  ];
  for (const fragment of expected) {
    if (!migration.includes(fragment)) {
      throw new Error(
        `Migration 0007 no longer matches role catalog template ${id}: ${fragment}`,
      );
    }
  }
}

console.log(
  "Bootstrap, provisioning, and migration role templates are aligned.",
);
