import type { LayoutServerLoad } from "./$types";
import { getOidcConfig } from "$lib/server/auth/oidc";

export const load: LayoutServerLoad = ({ locals }) => {
  const oidc = getOidcConfig();
  return {
    actor: locals.actor ?? null,
    demoMode: process.env.DOMINO_DEMO_MODE === "true",
    documentStore:
      process.env.PAPERLESS_URL &&
      (process.env.PAPERLESS_TOKEN_FILE || process.env.PAPERLESS_TOKEN)
        ? "Paperless-ngx"
        : "Domino storage",
    oidc: oidc
      ? {
          enabled: true,
          providerName: oidc.providerName,
        }
      : {
          enabled: false,
          providerName: "OIDC",
        },
  };
};
