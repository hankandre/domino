import { error, fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { inspectPasswordReset, resetPassword } from "$lib/server/auth/local";
import { readBoundedFormData } from "$lib/server/auth/request";
import { consumeRateLimit } from "$lib/server/rate-limit";

export const load: PageServerLoad = async ({ params }) => {
  const reset = await inspectPasswordReset(params.token);
  if (!reset)
    throw error(404, "This reset link is invalid, expired, or already used.");
  return { email: reset.email };
};

export const actions: Actions = {
  default: async ({ getClientAddress, params, request }) => {
    if (
      !consumeRateLimit(
        "password-reset-complete",
        getClientAddress(),
        20,
        60 * 60_000,
      ).allowed
    ) {
      return fail(429, { error: "Too many attempts. Try again later." });
    }
    const form = await readBoundedFormData(request);
    if (!form) return fail(413, { error: "The request is too large." });
    const password = String(form.get("password") ?? "");
    const confirmation = String(form.get("confirmation") ?? "");
    if (password.length < 12 || password.length > 256)
      return fail(400, { error: "Use between 12 and 256 characters." });
    if (password !== confirmation)
      return fail(400, { error: "The passwords do not match." });
    if (!(await resetPassword(params.token, password))) {
      return fail(400, {
        error: "This reset link is invalid, expired, or already used.",
      });
    }
    throw redirect(303, "/login?reset=complete");
  },
};
