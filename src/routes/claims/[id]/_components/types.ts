import type { PageData } from "../$types";

export type ClaimDetail = PageData["claim"];
export type ClaimWarranty = NonNullable<ClaimDetail["warranty"]>;
export type ClaimEvent = NonNullable<ClaimDetail["events"]>[number];
export type ClaimDocument = NonNullable<ClaimDetail["documents"]>[number];
export type ClaimNote = NonNullable<ClaimDetail["notes"]>[number];
