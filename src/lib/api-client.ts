import { hc } from "hono/client";
import type { AppType } from "$lib/server/api";

export function createApiClient(baseUrl = "") {
  return hc<AppType>(baseUrl, {
    init: {
      credentials: "include",
    },
  });
}

export type DominoApiClient = ReturnType<typeof createApiClient>;

export const dominoApi = createApiClient();
