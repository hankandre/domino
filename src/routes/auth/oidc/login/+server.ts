import { error, redirect, type RequestHandler } from "@sveltejs/kit";
import { beginOidcLogin } from "$lib/server/auth/oidc";

export const GET: RequestHandler = async ({ cookies, url }) => {
  try {
    const authorizationUrl = await beginOidcLogin(
      cookies,
      url.searchParams.get("returnTo"),
    );
    throw redirect(303, authorizationUrl.toString());
  } catch (cause) {
    if (
      cause &&
      typeof cause === "object" &&
      "status" in cause &&
      "location" in cause
    )
      throw cause;
    throw error(
      503,
      cause instanceof Error ? cause.message : "OIDC sign-in is unavailable.",
    );
  }
};
