import type { RequestHandler } from "./$types";
import { app } from "$lib/server/api";

const handler: RequestHandler = ({ request }) => app.fetch(request);

export {
  handler as DELETE,
  handler as GET,
  handler as OPTIONS,
  handler as PATCH,
  handler as POST,
  handler as PUT,
};
