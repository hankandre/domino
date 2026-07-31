import type { PageData } from "../$types";
import type {
  ClaimInstruction,
  RequiredEvidence,
  SubmissionMethod,
} from "$lib/claim-guidance";

export type ProductDetail = PageData["product"] & {
  createdAt?: string;
  updatedAt?: string;
  notes?: Array<{
    id: string;
    body: string;
    createdAt: string;
    authorName?: string | null;
  }>;
  documents?: Array<{
    id: string;
    name: string;
    kind: string;
    backend: string;
    processingStatus: string;
    sizeBytes: number | null;
    paperlessUrl: string | null;
  }>;
  warranties?: Array<{
    id: string;
    provider: string | null;
    endsAt: string | null;
    lifetime: boolean;
    claimUrl: string | null;
    claimPhone: string | null;
    claimEmail: string | null;
    eligibilityNotes: string | null;
    claimDeadline: string | null;
    submissionMethods: SubmissionMethod[];
    requiredEvidence: RequiredEvidence[];
    claimInstructions: ClaimInstruction[];
  }>;
  createdBy?: { id: string; name: string } | null;
  sources?: Array<{
    id: string;
    kind: string;
    label: string | null;
    url: string | null;
    externalSystem: string | null;
    externalId: string | null;
    addedByName: string | null;
  }>;
  relatedPage?: Record<string, boolean>;
};

export type ProductWarranty = NonNullable<ProductDetail["warranties"]>[number];
export type ProductDocument = NonNullable<ProductDetail["documents"]>[number];
export type ProductNote = NonNullable<ProductDetail["notes"]>[number];
