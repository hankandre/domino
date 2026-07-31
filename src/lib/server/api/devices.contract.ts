import type { ApiRouteContract } from "./contract";

export const deviceRouteContracts = [
  {
    method: "post",
    path: "/device/start",
    operationId: "startDeviceAuthorization",
    summary: "Start CLI device authorization",
    tag: "Device authorization",
    request: { schema: "DeviceStartInput" },
    auth: "public",
    rateLimit: "20 requests per client address per 15 minutes",
  },
  {
    method: "post",
    path: "/device/approve",
    operationId: "approveDeviceAuthorization",
    summary: "Approve a CLI and delegate authority",
    tag: "Device authorization",
    permissions: ["service_accounts:manage"],
    request: { schema: "DeviceApproveInput" },
    auth: "browser",
    rateLimit: "30 requests per client address per 15 minutes",
    description:
      "Requires a same-origin browser session. Delegated permissions and claim access must be a subset of the approving actor's authority.",
  },
  {
    method: "post",
    path: "/device/token",
    operationId: "exchangeDeviceCode",
    summary: "Poll for an approved CLI credential",
    tag: "Device authorization",
    request: { schema: "DeviceTokenInput" },
    auth: "public",
    rateLimit: "300 requests per client address per 15 minutes",
    description:
      "Returns an API credential exactly once after approval. The CLI stores it in an OS credential broker and agents never receive the credential value.",
  },
] satisfies ApiRouteContract[];
