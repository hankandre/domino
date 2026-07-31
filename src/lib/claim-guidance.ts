export const submissionMethodOptions = [
  { value: "web", label: "Website" },
  { value: "phone", label: "Phone" },
  { value: "email", label: "Email" },
  { value: "mail", label: "Postal mail" },
  { value: "in_person", label: "In person" },
] as const;

export type SubmissionMethod =
  (typeof submissionMethodOptions)[number]["value"];

export function submissionMethodLabel(method: SubmissionMethod) {
  return (
    submissionMethodOptions.find((option) => option.value === method)?.label ??
    method
  );
}

export type RequiredEvidence = {
  label: string;
  required: boolean;
};

export type ClaimInstruction = {
  title: string;
  detail?: string;
  required: boolean;
};

export function cleanRequiredEvidence(items: readonly RequiredEvidence[]) {
  return items
    .map((item) => ({ ...item, label: item.label.trim() }))
    .filter((item) => item.label.length > 0);
}

export function cleanClaimInstructions(items: readonly ClaimInstruction[]) {
  return items
    .map((item) => ({
      title: item.title.trim(),
      ...(item.detail?.trim() ? { detail: item.detail.trim() } : {}),
      required: item.required,
    }))
    .filter((item) => item.title.length > 0);
}
