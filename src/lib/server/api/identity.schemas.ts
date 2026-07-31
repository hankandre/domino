import { z } from "zod";
import { listWindowQuery } from "./common.schemas";

export const auditQuery = z.object({
  ...listWindowQuery,
  limit: listWindowQuery.limit.default(50),
});
