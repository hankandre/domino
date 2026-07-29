export type ClaimStatus =
  | "draft"
  | "needs_evidence"
  | "submitted"
  | "in_review"
  | "approved"
  | "denied"
  | "resolved"
  | "closed";
export type CoverageStatus =
  "active" | "expiring" | "expired" | "lifetime" | "unknown";

export interface ProductSummary {
  id: string;
  name: string;
  brand: string;
  model: string;
  category: string;
  purchasedAt: string;
  warrantyEndsAt: string | null;
  coverageStatus: CoverageStatus;
  imageUrl: string | null;
  documents: number;
  notes: number;
  serialNumbers: string[];
  retailer: string;
  orderNumber: string;
  archivedAt?: string | null;
  activeClaim?: {
    id: string;
    reference: string;
    status: ClaimStatus;
    summary: string;
    nextAction: string;
  };
}
