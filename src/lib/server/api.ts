import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import type { ApiEnv as Env } from "./api/context";
import { commonRequestHeaders } from "./api/common.schemas";
import { systemRoutes } from "./api/system";
import { deviceRoutes } from "./api/devices";
import { identityRoutes } from "./api/identity";
import { recordRoutes } from "./api/records";
import { productRoutes } from "./api/products";
import { imageRoutes } from "./api/images";
import { documentRoutes } from "./api/documents";
import { claimRoutes } from "./api/claims";
import { apiAuthentication } from "./api/authentication";

export { httpUrl } from "./api/common.schemas";

const app = new Hono<Env>().basePath("/api");
app.use("*", zValidator("header", commonRequestHeaders));
app.use("/v1/*", apiAuthentication);
app.onError((cause, c) => {
  console.error("Unhandled API error", cause);
  return c.json(
    { error: "The request could not be completed.", code: "internal_error" },
    500,
  );
});
const routes = app
  .route("/", systemRoutes)
  .route("/", deviceRoutes)
  .route("/", identityRoutes)
  .route("/", recordRoutes)
  .route("/", productRoutes)
  .route("/", imageRoutes)
  .route("/", documentRoutes)
  .route("/", claimRoutes);

export type AppType = typeof routes;
export { app };
