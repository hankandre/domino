import type { ActorAuthority } from "../auth/authorization";

export type ApiActor = ActorAuthority & {
  id: string;
  householdId: string;
  kind: "user" | "service";
};

export type ApiVariables = {
  actor: ApiActor;
};

export type ApiEnv = { Variables: ApiVariables };
