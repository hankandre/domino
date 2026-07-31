import { describe, expect, test } from "bun:test";
import {
  cleanClaimInstructions,
  cleanRequiredEvidence,
  submissionMethodLabel,
} from "./claim-guidance";
import { warrantyInput } from "./server/api/schemas";

describe("claim guidance", () => {
  test("normalizes evidence and checklist entries without flattening details", () => {
    expect(
      cleanRequiredEvidence([
        { label: "  Proof of purchase  ", required: true },
        { label: "  ", required: false },
      ]),
    ).toEqual([{ label: "Proof of purchase", required: true }]);
    expect(
      cleanClaimInstructions([
        {
          title: "  Open the support page ",
          detail: "  Use the serial number from the back. ",
          required: true,
        },
        { title: "", detail: "discarded", required: false },
      ]),
    ).toEqual([
      {
        title: "Open the support page",
        detail: "Use the serial number from the back.",
        required: true,
      },
    ]);
  });

  test("validates the complete structured warranty guidance contract", () => {
    const parsed = warrantyInput.parse({
      submissionMethods: ["web", "phone"],
      requiredEvidence: [
        { label: "Receipt", required: true },
        { label: "Damage photo", required: false },
      ],
      claimInstructions: [
        {
          title: "Submit the web form",
          detail: "Keep the confirmation number.",
          required: true,
        },
      ],
    });

    expect(parsed.submissionMethods).toEqual(["web", "phone"]);
    expect(parsed.requiredEvidence).toHaveLength(2);
    expect(parsed.claimInstructions[0].detail).toBe(
      "Keep the confirmation number.",
    );
    expect(submissionMethodLabel("in_person")).toBe("In person");
  });

  test("rejects unknown submission methods and empty evidence labels", () => {
    expect(() =>
      warrantyInput.parse({ submissionMethods: ["carrier_pigeon"] }),
    ).toThrow();
    expect(() =>
      warrantyInput.parse({
        requiredEvidence: [{ label: "  ", required: true }],
      }),
    ).toThrow();
  });
});
