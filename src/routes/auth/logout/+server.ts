import { redirect, type RequestHandler } from "@sveltejs/kit";
import {
  oidcLogoutUrl,
  revokeWebSession,
  sessionCookieName,
} from "$lib/server/auth/oidc";

export const POST: RequestHandler = async ({ cookies, request, url }) => {
  const requestOrigin = request.headers.get("origin");
  const expectedOrigin = new URL(process.env.ORIGIN ?? url.origin).origin;
  if (!requestOrigin || requestOrigin !== expectedOrigin) {
    return new Response("Cross-origin logout is not allowed.", { status: 403 });
  }
  const sessionToken = cookies.get(sessionCookieName);
  await revokeWebSession(sessionToken);
  cookies.delete(sessionCookieName, { path: "/" });

  try {
    const providerLogout = await oidcLogoutUrl();
    throw redirect(303, providerLogout?.toString() ?? "/login");
  } catch (cause) {
    if (
      cause &&
      typeof cause === "object" &&
      "status" in cause &&
      "location" in cause
    )
      throw cause;
    throw redirect(303, "/login");
  }
};
