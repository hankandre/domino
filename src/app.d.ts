declare global {
  namespace App {
    interface Locals {
      actor?: {
        id: string;
        householdId: string;
        kind: "user" | "service";
        permissions: string[];
        claimAccessScope: "all" | "selected";
        claimIds?: string[];
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
