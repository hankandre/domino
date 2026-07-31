import { describe, expect, test } from "bun:test";
import { apiRouteContracts } from "./openapi-contract";

const routeDomains = [
  "claims",
  "devices",
  "documents",
  "identity",
  "images",
  "products",
  "records",
] as const;

describe("API domain co-location", () => {
  for (const domain of routeDomains) {
    test(`${domain} keeps handlers, schemas, and OpenAPI metadata adjacent`, async () => {
      const [routes, schemas, contracts] = await Promise.all([
        Bun.file(new URL(`./${domain}.ts`, import.meta.url)).text(),
        Bun.file(new URL(`./${domain}.schemas.ts`, import.meta.url)).text(),
        Bun.file(new URL(`./${domain}.contract.ts`, import.meta.url)).text(),
      ]);

      expect(routes).toContain(`from "./${domain}.schemas"`);
      expect(routes).not.toContain('from "./schemas"');
      expect(schemas).toContain("export const");
      expect(contracts).toContain("RouteContracts");
    });
  }

  test("the aggregate contract still owns every operational route", () => {
    expect(apiRouteContracts).toHaveLength(40);
    expect(
      new Set(apiRouteContracts.map(({ operationId }) => operationId)).size,
    ).toBe(apiRouteContracts.length);
  });
});
