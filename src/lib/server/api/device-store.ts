import type { ApiActor } from "./context";

export const deviceCodes = new Map<
  string,
  {
    userCode: string;
    requestedName: string;
    expiresAt: number;
    token?: string;
  }
>();
export const issuedTokens = new Map<
  string,
  { actor: ApiActor; expiresAt: number }
>();

export function pruneDemoCredentials(now = Date.now()) {
  for (const [hash, value] of deviceCodes) {
    if (value.expiresAt <= now) deviceCodes.delete(hash);
  }
  for (const [hash, value] of issuedTokens) {
    if (value.expiresAt <= now) issuedTokens.delete(hash);
  }
}
