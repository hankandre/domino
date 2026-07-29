import { error, fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { acceptInvitation, inspectInvitation } from "$lib/server/auth/local";
import { sessionCookieName, sessionCookieOptions } from "$lib/server/auth/oidc";

export const load: PageServerLoad = async ({ params }) => {
  const invitation = await inspectInvitation(params.token);
  if (!invitation)
    throw error(404, "This invitation is invalid, expired, or already used.");
  return {
    email: invitation.email,
    displayName: invitation.displayName,
    householdName: invitation.householdName,
    token: params.token,
  };
};

export const actions: Actions = {
  default: async ({ cookies, params, request }) => {
    const form = await request.formData();
    const displayName = String(form.get("displayName") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const confirmation = String(form.get("confirmation") ?? "");
    if (displayName.length < 2) return fail(400, { error: "Enter your name." });
    if (password.length < 12)
      return fail(400, { error: "Use at least 12 characters." });
    if (password !== confirmation)
      return fail(400, { error: "The passwords do not match." });

    try {
      const token = await acceptInvitation(
        params.token,
        displayName,
        password,
        request.headers.get("user-agent"),
      );
      if (!token)
        return fail(400, {
          error: "This invitation is invalid, expired, or already used.",
        });
      cookies.set(sessionCookieName, token, sessionCookieOptions());
      throw redirect(303, "/");
    } catch (cause) {
      if (cause && typeof cause === "object" && "status" in cause) throw cause;
      return fail(400, {
        error:
          cause instanceof Error
            ? cause.message
            : "The invitation could not be accepted.",
      });
    }
  },
};
