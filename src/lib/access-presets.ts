export type ClaimAccessPresetId =
  "all" | "open" | "attention" | "none" | "manual";

export type ClaimPresetSource = {
  id: string;
  status: string;
};

const closedStatuses = new Set(["resolved", "closed"]);
const attentionStatuses = new Set(["draft", "needs_evidence", "denied"]);

export function isOpenClaimStatus(status: string) {
  return !closedStatuses.has(status);
}

export function isAttentionClaimStatus(status: string) {
  return attentionStatuses.has(status);
}

export function claimIdsForPreset(
  preset: Exclude<ClaimAccessPresetId, "all" | "manual">,
  claims: readonly ClaimPresetSource[],
) {
  if (preset === "none") return [];
  return claims
    .filter((claim) =>
      preset === "open"
        ? isOpenClaimStatus(claim.status)
        : isAttentionClaimStatus(claim.status),
    )
    .map((claim) => claim.id);
}

export function resolveClaimPreset(
  preset: Exclude<ClaimAccessPresetId, "manual">,
  claims: readonly ClaimPresetSource[],
) {
  return preset === "all"
    ? { scope: "all" as const, claimIds: claims.map((claim) => claim.id) }
    : {
        scope: "selected" as const,
        claimIds: claimIdsForPreset(preset, claims),
      };
}

export function sameSelection(
  left: readonly string[],
  right: readonly string[],
) {
  return (
    left.length === right.length && left.every((item) => right.includes(item))
  );
}
