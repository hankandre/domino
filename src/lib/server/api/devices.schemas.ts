import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { permissions } from "../auth/permissions";

export const deviceStartInput = z.object({
  name: z.string().min(1).max(100),
  serverOrigin: z.string().max(2_048).url().optional(),
});

export const deviceApproveInput = z.object({
  userCode: z.string().min(4).max(20),
  permissions: z.array(z.enum(permissions)).max(permissions.length).optional(),
  claimAccessScope: z.enum(["all", "selected"]).optional(),
  claimIds: z.array(z.string().uuid()).max(1_000).optional(),
});

export const deviceTokenInput = z.object({
  deviceCode: z.string().min(24).max(256),
});

export const smallJsonBody = bodyLimit({
  maxSize: 8 * 1024,
  onError: (c) => c.json({ error: "Request body is too large" }, 413),
});
