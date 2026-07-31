import { createHash } from "node:crypto";
import { zValidator } from "@hono/zod-validator";
import {
  and,
  count,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
} from "drizzle-orm";
import { Hono } from "hono";
import {
  canAdministerActorAuthority,
  claimAuthority,
  loadActorAuthority,
} from "../auth/authorization";
import { can } from "../auth/permissions";
import { authenticateSessionToken, readSessionCookie } from "../auth/oidc";
import { requireDb } from "../db";
import {
  actorClaimAccess,
  actorRoles,
  actors,
  apiCredentials,
  auditEvents,
  claims,
  cliDeviceCodes,
  roles,
} from "../db/schema";
import type { ApiEnv } from "./context";
import {
  deviceCodes,
  issuedTokens,
  pruneDemoCredentials,
} from "./device-store";
import {
  deviceApproveInput,
  deviceStartInput,
  deviceTokenInput,
  smallJsonBody,
} from "./devices.schemas";
import { rateLimit } from "./guards";

export const deviceRoutes = new Hono<ApiEnv>()
  .post(
    "/device/start",
    rateLimit("device-start", 20, 15 * 60_000, "address"),
    smallJsonBody,
    zValidator("json", deviceStartInput),
    async (c) => {
      const deviceCode = `${crypto.randomUUID()}${crypto.randomUUID()}`;
      const userCode = crypto.randomUUID().slice(0, 8).toUpperCase();
      const deviceCodeHash = createHash("sha256")
        .update(deviceCode)
        .digest("hex");
      const expiresAt = Date.now() + 10 * 60_000;
      if (process.env.DOMINO_DEMO_MODE === "true") {
        pruneDemoCredentials();
        if (deviceCodes.size >= 1_000) {
          return c.json(
            { error: "Too many device authorization requests are pending." },
            429,
          );
        }
        deviceCodes.set(deviceCodeHash, {
          userCode,
          requestedName: c.req.valid("json").name,
          expiresAt,
        });
      } else {
        const accepted = await requireDb().transaction(async (tx) => {
          await tx
            .delete(cliDeviceCodes)
            .where(
              or(
                lt(cliDeviceCodes.expiresAt, new Date()),
                isNotNull(cliDeviceCodes.consumedAt),
              ),
            );
          const [{ total }] = await tx
            .select({ total: count() })
            .from(cliDeviceCodes)
            .where(
              and(
                gt(cliDeviceCodes.expiresAt, new Date()),
                isNull(cliDeviceCodes.consumedAt),
              ),
            );
          const maximum = Number(
            process.env.DOMINO_DEVICE_FLOW_MAX_OUTSTANDING ?? 1000,
          );
          if (total >= maximum) return false;
          await tx.insert(cliDeviceCodes).values({
            requestedName: c.req.valid("json").name,
            deviceCodeHash,
            userCode,
            expiresAt: new Date(expiresAt),
          });
          return true;
        });
        if (!accepted) {
          return c.json(
            {
              error:
                "Too many device authorization requests are pending. Try again later.",
            },
            429,
          );
        }
      }
      const origin = new URL(process.env.ORIGIN ?? c.req.url).origin;
      return c.json({
        deviceCode,
        userCode,
        verificationUri: `${origin}/activate?code=${userCode}`,
        expiresIn: 600,
        interval: 2,
      });
    },
  )
  .post(
    "/device/approve",
    rateLimit("device-approve", 30, 15 * 60_000, "address"),
    smallJsonBody,
    zValidator("json", deviceApproveInput),
    async (c) => {
      const demoMode = process.env.DOMINO_DEMO_MODE === "true";
      const requestOrigin = c.req.header("origin");
      const expectedOrigin = new URL(process.env.ORIGIN ?? c.req.url).origin;
      if (!demoMode && (!requestOrigin || requestOrigin !== expectedOrigin)) {
        return c.json(
          { error: "Device approval requires a same-origin browser request" },
          403,
        );
      }
      const approvingActor = demoMode
        ? {
            id: "demo-owner",
            householdId: "demo-household",
            kind: "user" as const,
            permissions: ["*"],
            ...claimAuthority("all"),
          }
        : await authenticateSessionToken(readSessionCookie(c.req.raw));
      if (!approvingActor) {
        return c.json(
          { error: "A signed-in household administrator is required" },
          401,
        );
      }
      if (
        !approvingActor.permissions.includes("*") &&
        !can(approvingActor.permissions, "service_accounts:manage")
      ) {
        return c.json(
          { error: "Missing permission: service_accounts:manage" },
          403,
        );
      }
      const requestedPermissions = c.req.valid("json").permissions ?? [
        "products:read",
        "products:create",
        "warranties:read",
        "warranties:create",
        "claims:read",
        "claims:create",
        "documents:read",
        "documents:attach",
        "images:attach",
        "notes:read",
        "notes:write",
      ];
      const requestedClaimAccessScope =
        c.req.valid("json").claimAccessScope ?? approvingActor.claimAccessScope;
      const requestedClaimIds = [
        ...new Set(
          c.req.valid("json").claimIds ?? approvingActor.claimIds ?? [],
        ),
      ];
      const exceedsGrantor = requestedPermissions.filter(
        (permission) =>
          !approvingActor.permissions.includes("*") &&
          !approvingActor.permissions.includes(permission),
      );
      if (exceedsGrantor.length) {
        return c.json(
          {
            error: `Cannot delegate permissions the approving account does not hold: ${exceedsGrantor.join(", ")}`,
          },
          403,
        );
      }
      if (
        approvingActor.claimIds !== undefined &&
        (requestedClaimAccessScope === "all" ||
          requestedClaimIds.some(
            (claimId) => !approvingActor.claimIds!.includes(claimId),
          ))
      ) {
        return c.json(
          {
            error:
              "Cannot delegate access to claims the approving account cannot access.",
          },
          403,
        );
      }

      if (!demoMode) {
        const database = requireDb();
        const result = await database.transaction(async (tx) => {
          const [device] = await tx
            .select()
            .from(cliDeviceCodes)
            .where(
              and(
                eq(
                  cliDeviceCodes.userCode,
                  c.req.valid("json").userCode.toUpperCase(),
                ),
                gt(cliDeviceCodes.expiresAt, new Date()),
                isNull(cliDeviceCodes.consumedAt),
                isNull(cliDeviceCodes.serviceActorId),
              ),
            )
            .for("update")
            .limit(1);
          if (!device) return null;

          const currentApprover = await loadActorAuthority(
            tx,
            approvingActor.id,
            approvingActor.householdId,
            { lock: true },
          );
          if (
            !currentApprover ||
            (!currentApprover.permissions.includes("*") &&
              !currentApprover.permissions.includes(
                "service_accounts:manage",
              )) ||
            !canAdministerActorAuthority(currentApprover, {
              permissions: requestedPermissions,
              ...claimAuthority(requestedClaimAccessScope, requestedClaimIds),
            })
          ) {
            return "forbidden" as const;
          }

          if (requestedClaimAccessScope === "selected") {
            const validClaims = requestedClaimIds.length
              ? await tx
                  .select({ id: claims.id })
                  .from(claims)
                  .where(
                    and(
                      eq(claims.householdId, approvingActor.householdId),
                      inArray(claims.id, requestedClaimIds),
                    ),
                  )
              : [];
            if (validClaims.length !== requestedClaimIds.length) {
              return "invalid-claims" as const;
            }
          }

          const suffix = crypto.randomUUID().slice(0, 8);
          const [serviceRole] = await tx
            .insert(roles)
            .values({
              householdId: approvingActor.householdId,
              name: `Service · ${device.requestedName} · ${suffix}`,
              description: `Permissions delegated when ${device.requestedName} was authorized.`,
              permissions: requestedPermissions,
              system: false,
            })
            .returning({ id: roles.id });
          const [serviceActor] = await tx
            .insert(actors)
            .values({
              householdId: approvingActor.householdId,
              kind: "service",
              name: device.requestedName,
              claimAccessScope: requestedClaimAccessScope,
            })
            .returning({ id: actors.id });
          await tx.insert(actorRoles).values({
            actorId: serviceActor.id,
            roleId: serviceRole.id,
            grantedByActorId: approvingActor.id,
          });
          if (
            requestedClaimAccessScope === "selected" &&
            requestedClaimIds.length
          ) {
            await tx.insert(actorClaimAccess).values(
              requestedClaimIds.map((claimId) => ({
                actorId: serviceActor.id,
                claimId,
                grantedByActorId: approvingActor.id,
              })),
            );
          }
          await tx
            .update(cliDeviceCodes)
            .set({
              householdId: approvingActor.householdId,
              approvedActorId: approvingActor.id,
              serviceActorId: serviceActor.id,
            })
            .where(eq(cliDeviceCodes.id, device.id));
          await tx.insert(auditEvents).values({
            householdId: approvingActor.householdId,
            actorId: approvingActor.id,
            action: "service_account.authorize",
            resourceType: "actor",
            resourceId: serviceActor.id,
            summary: `Authorized service account ${device.requestedName}`,
            metadata: {
              permissions: requestedPermissions,
              claimAccessScope: requestedClaimAccessScope,
              claimIds:
                requestedClaimAccessScope === "selected"
                  ? requestedClaimIds
                  : [],
            },
          });
          return { name: device.requestedName };
        });
        if (result === "invalid-claims") {
          return c.json(
            { error: "One or more selected claims are unavailable." },
            400,
          );
        }
        if (result === "forbidden") {
          return c.json(
            {
              error:
                "The approving account can no longer grant this authority.",
            },
            403,
          );
        }
        return result
          ? c.json({ approved: true, name: result.name })
          : c.json(
              { error: "Code is invalid, expired, or already approved" },
              404,
            );
      }

      const entry = [...deviceCodes.entries()].find(
        ([, value]) =>
          value.userCode === c.req.valid("json").userCode.toUpperCase(),
      );
      if (!entry || entry[1].expiresAt < Date.now()) {
        return c.json({ error: "Code is invalid or expired" }, 404);
      }
      const token = `dom_${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
      entry[1].token = token;
      const tokenHash = createHash("sha256").update(token).digest("hex");
      issuedTokens.set(tokenHash, {
        actor: {
          id: `device-${entry[1].requestedName.toLowerCase().replaceAll(/\s+/g, "-")}`,
          householdId: approvingActor.householdId,
          kind: "service",
          permissions: requestedPermissions,
          ...claimAuthority(requestedClaimAccessScope, requestedClaimIds),
        },
        expiresAt: Date.now() + 60 * 60_000,
      });
      return c.json({ approved: true, name: entry[1].requestedName });
    },
  )
  .post(
    "/device/token",
    rateLimit("device-token", 300, 15 * 60_000, "address"),
    smallJsonBody,
    zValidator("json", deviceTokenInput),
    async (c) => {
      const hash = createHash("sha256")
        .update(c.req.valid("json").deviceCode)
        .digest("hex");
      if (process.env.DOMINO_DEMO_MODE !== "true") {
        const database = requireDb();
        const result = await database.transaction(async (tx) => {
          const [device] = await tx
            .select()
            .from(cliDeviceCodes)
            .where(eq(cliDeviceCodes.deviceCodeHash, hash))
            .limit(1);
          if (!device || device.expiresAt < new Date() || device.consumedAt) {
            return { status: "expired" as const };
          }
          if (!device.serviceActorId) return { status: "pending" as const };

          const [claimed] = await tx
            .update(cliDeviceCodes)
            .set({ consumedAt: new Date() })
            .where(
              and(
                eq(cliDeviceCodes.id, device.id),
                isNull(cliDeviceCodes.consumedAt),
              ),
            )
            .returning({ id: cliDeviceCodes.id });
          if (!claimed) return { status: "expired" as const };

          const token = `dom_${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
          const [credential] = await tx
            .insert(apiCredentials)
            .values({
              actorId: device.serviceActorId,
              name: device.requestedName,
              tokenPrefix: token.slice(0, 12),
              tokenHash: createHash("sha256").update(token).digest("hex"),
            })
            .returning({ id: apiCredentials.id });
          await tx
            .update(cliDeviceCodes)
            .set({ credentialId: credential.id })
            .where(eq(cliDeviceCodes.id, device.id));
          return { status: "issued" as const, token };
        });
        if (result.status === "pending")
          return c.json({ error: "authorization_pending" }, 428);
        if (result.status === "expired")
          return c.json({ error: "expired_token" }, 400);
        return c.json({ accessToken: result.token, tokenType: "Bearer" });
      }

      const entry = deviceCodes.get(hash);
      if (!entry || entry.expiresAt < Date.now())
        return c.json({ error: "expired_token" }, 400);
      if (!entry.token) return c.json({ error: "authorization_pending" }, 428);
      deviceCodes.delete(hash);
      return c.json({ accessToken: entry.token, tokenType: "Bearer" });
    },
  );
