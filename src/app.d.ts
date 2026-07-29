declare global {
  namespace App {
    interface Locals {
      actor?: {
        id: string;
        householdId: string;
        kind: "user" | "service";
        permissions: string[];
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
