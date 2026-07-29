import { error, fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { inspectPasswordReset, resetPassword } from "$lib/server/auth/local";

export const load: PageServerLoad = async ({ params }) => {
  const reset = await inspectPasswordReset(params.token);
  if (!reset)
    throw error(404, "This reset link is invalid, expired, or already used.");
  return { email: reset.email };
};

export const actions: Actions = {
  default: async ({ params, request }) => {
    const form = await request.formData();
    const password = String(form.get("password") ?? "");
    const confirmation = String(form.get("confirmation") ?? "");
    if (password.length < 12)
      return fail(400, { error: "Use at least 12 characters." });
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
