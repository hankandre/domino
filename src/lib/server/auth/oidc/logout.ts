import { discover, getOidcConfig, publicOrigin } from "./config";

export async function oidcLogoutUrl() {
  const config = getOidcConfig();
  if (!config) return null;
  const discovery = await discover(config);
  if (!discovery.end_session_endpoint) return null;
  const url = new URL(discovery.end_session_endpoint);
  url.searchParams.set(
    "post_logout_redirect_uri",
    new URL("/login", publicOrigin()).toString(),
  );
  return url;
}
