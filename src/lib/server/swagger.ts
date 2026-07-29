import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";

const require = createRequire(import.meta.url);
const assetPaths = {
  "swagger-ui.css": require.resolve("swagger-ui-dist/swagger-ui.css"),
  "swagger-ui-bundle.js":
    require.resolve("swagger-ui-dist/swagger-ui-bundle.js"),
  "swagger-ui-standalone-preset.js":
    require.resolve("swagger-ui-dist/swagger-ui-standalone-preset.js"),
} as const;

type SwaggerAssetName = keyof typeof assetPaths;

const assetCache = new Map<SwaggerAssetName, Promise<string>>();

export const swaggerDocumentHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="referrer" content="no-referrer" />
    <title>Domino API · Swagger UI</title>
    <link rel="stylesheet" href="/api/docs/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="/api/docs/swagger-ui-bundle.js"></script>
    <script src="/api/docs/swagger-ui-standalone-preset.js"></script>
    <script src="/api/docs/swagger-initializer.js"></script>
  </body>
</html>`;

export const swaggerInitializer = `window.addEventListener("load", function () {
  window.ui = SwaggerUIBundle({
    url: "/api/openapi.json",
    dom_id: "#swagger-ui",
    deepLinking: true,
    displayRequestDuration: true,
    persistAuthorization: false,
    presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
    layout: "StandaloneLayout"
  });
});`;

export async function readSwaggerAsset(name: SwaggerAssetName) {
  let asset = assetCache.get(name);
  if (!asset) {
    asset = readFile(assetPaths[name], "utf8");
    assetCache.set(name, asset);
  }
  return asset;
}

export const swaggerContentSecurityPolicy = [
  "default-src 'none'",
  "base-uri 'none'",
  "connect-src 'self'",
  "font-src 'self' data:",
  "frame-ancestors 'none'",
  "img-src 'self' data:",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
].join("; ");
