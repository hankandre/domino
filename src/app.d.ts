import type { ActorAuthority } from "$lib/server/auth/authorization";

declare global {
  namespace App {
    interface Locals {
      actor?: ActorAuthority & {
        id: string;
        householdId: string;
        kind: "user" | "service";
        user?: {
          id: string;
          email: string;
          displayName: string;
        };
      };
    }
  }
}

export {};
