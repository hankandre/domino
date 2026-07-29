import { redirect, type RequestHandler } from "@sveltejs/kit";
import { finishOidcLogin } from "$lib/server/auth/oidc";

export const GET: RequestHandler = async ({ cookies, request, url }) => {
  const providerError =
    url.searchParams.get("error_description") || url.searchParams.get("error");
  if (providerError) {
    throw redirect(303, `/login?error=${encodeURIComponent(providerError)}`);
  }

  try {
    const returnTo = await finishOidcLogin(
      cookies,
      url,
      request.headers.get("user-agent"),
    );
    throw redirect(303, returnTo);
  } catch (cause) {
    if (
      cause &&
      typeof cause === "object" &&
      "status" in cause &&
      "location" in cause
    )
      throw cause;
    const message =
      cause instanceof Error
        ? cause.message
        : "Sign-in could not be completed.";
    throw redirect(303, `/login?error=${encodeURIComponent(message)}`);
  }
};
