import { redirect, type Handle } from "@sveltejs/kit";
import {
  authenticateSessionToken,
  getOidcConfig,
  sessionCookieName,
} from "$lib/server/auth/oidc";

const publicRoutes = [
  "/login",
  "/auth/oidc/login",
  "/auth/oidc/callback",
  "/api/health",
];

export const handle: Handle = async ({ event, resolve }) => {
  const demoMode = process.env.DOMINO_DEMO_MODE === "true";
  if (demoMode) {
    event.locals.actor = {
      id: "demo-owner",
      householdId: "demo-household",
      kind: "user",
      permissions: ["*"],
      user: {
        id: "demo-user",
        email: "owner@demo.local",
        displayName: "Demo owner",
      },
    };
    const response = await resolve(event, {
      filterSerializedResponseHeaders: (name) =>
        name === "content-type" || name === "content-length",
    });
    return applySecurityHeaders(response);
  }

  const sessionToken = event.cookies.get(sessionCookieName);
  if (sessionToken)
    event.locals.actor =
      (await authenticateSessionToken(sessionToken)) ?? undefined;

  const pathname = event.url.pathname;
  const isPublic =
    publicRoutes.includes(pathname) ||
    pathname.startsWith("/invite/") ||
    pathname.startsWith("/reset/") ||
    pathname === "/api/device/start" ||
    pathname === "/api/device/token" ||
    pathname.startsWith("/_app/");
  const isApi = pathname.startsWith("/api/");

  if (!event.locals.actor && !isPublic && !isApi) {
    getOidcConfig();
    const returnTo = `${pathname}${event.url.search}`;
    throw redirect(303, `/login?returnTo=${encodeURIComponent(returnTo)}`);
  }

  return applySecurityHeaders(await resolve(event));
};

function applySecurityHeaders(response: Response) {
  if (!response.headers.has("X-Content-Type-Options"))
    response.headers.set("X-Content-Type-Options", "nosniff");
  if (!response.headers.has("Referrer-Policy"))
    response.headers.set("Referrer-Policy", "same-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()",
  );
  response.headers.set("X-Frame-Options", "DENY");
  if (!response.headers.has("Content-Security-Policy"))
    response.headers.set(
      "Content-Security-Policy",
      "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
    );
  return response;
}
