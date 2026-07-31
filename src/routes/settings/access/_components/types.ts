import type { ActionData, PageData } from "../$types";

export type AccessData = PageData;
export type AccessForm = ActionData;
export type AccessAccount = PageData["accounts"][number];
export type AccessRole = PageData["roles"][number];
export type AccessClaim = PageData["claims"][number];
