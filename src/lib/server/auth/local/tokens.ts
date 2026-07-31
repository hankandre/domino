import { createHash, randomBytes } from "node:crypto";

export const invitationTokenPattern = /^domino_invite_[A-Za-z0-9_-]{43}$/;
export const resetTokenPattern = /^domino_reset_[A-Za-z0-9_-]{43}$/;

export function createOneTimeToken(prefix: string) {
  const token = `${prefix}_${randomBytes(32).toString("base64url")}`;
  return {
    token,
    tokenHash: createHash("sha256").update(token).digest("hex"),
  };
}
