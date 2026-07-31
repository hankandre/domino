import type { RequestHandler } from "./$types";
import { app } from "$lib/server/api";

const handler: RequestHandler = ({ request, getClientAddress }) => {
  const headers = new Headers(request.headers);
  headers.set("x-domino-client-address", getClientAddress());
  return app.fetch(new Request(request, { headers }));
};

export {
  handler as DELETE,
  handler as GET,
  handler as OPTIONS,
  handler as PATCH,
  handler as POST,
  handler as PUT,
};
