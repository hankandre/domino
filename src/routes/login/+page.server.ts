import { fail, redirect, type Actions } from "@sveltejs/kit";
import { consumeLoginAttempt, loginWithPassword } from "$lib/server/auth/local";
import {
  safeReturnTo,
  sessionCookieName,
  sessionCookieOptions,
} from "$lib/server/auth/oidc";

export const actions: Actions = {
  default: async ({ cookies, getClientAddress, request, url }) => {
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (contentLength > 4_096) {
      return fail(413, {
        localError: "The sign-in request is too large.",
        email: "",
      });
    }
    const form = await request.formData();
    const email = String(form.get("email") ?? "")
      .trim()
      .toLowerCase();
    const password = String(form.get("password") ?? "");
    const returnTo = safeReturnTo(String(form.get("returnTo") ?? "/"));
    if (!email || !password)
      return fail(400, {
        localError: "Email and password are required.",
        email,
      });
    if (email.length > 254 || password.length > 256) {
      return fail(400, {
        localError: "Email or password is invalid.",
        email: email.slice(0, 254),
      });
    }

    if (!consumeLoginAttempt(getClientAddress(), email)) {
      return fail(429, {
        localError: "Too many sign-in attempts. Wait 15 minutes and try again.",
        email,
      });
    }

    const token = await loginWithPassword(
      email,
      password,
      request.headers.get("user-agent"),
    );
    if (!token)
      return fail(400, {
        localError: "Email or password is incorrect.",
        email,
      });
    cookies.set(sessionCookieName, token, sessionCookieOptions());
    throw redirect(303, returnTo || url.searchParams.get("returnTo") || "/");
  },
};
