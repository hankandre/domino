import type { JWTPayload } from "jose";
import type { ActorAuthority } from "../authorization";

export type IdentityClaims = JWTPayload & {
  email: string;
  email_verified?: boolean;
  name?: string;
  preferred_username?: string;
  groups?: string[];
};

export type AuthenticatedActor = ActorAuthority & {
  id: string;
  householdId: string;
  kind: "user" | "service";
  user?: {
    id: string;
    email: string;
    displayName: string;
  };
};
