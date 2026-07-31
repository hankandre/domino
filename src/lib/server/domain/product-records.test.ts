import { describe, expect, test } from "bun:test";
import {
  productRecordRequestHash,
  type ProductRecordInput,
} from "./product-records";

const record: ProductRecordInput = {
  product: {
    name: "Stand Mixer",
    brand: "KitchenAid",
    serialNumbers: ["MIXER-101"],
  },
  warranties: [
    {
      provider: "KitchenAid",
      submissionMethods: ["web"],
      requiredEvidence: [{ label: "Receipt", required: true }],
    },
  ],
  notes: ["Receipt is stored in Paperless."],
  sources: [
    {
      kind: "external",
      externalSystem: "hermes",
      externalId: "ORDER-101",
    },
  ],
};

describe("product record serialization", () => {
  test("produces a stable request digest and includes nested guidance", () => {
    const first = productRecordRequestHash(record);
    const second = productRecordRequestHash(structuredClone(record));
    const changed = productRecordRequestHash({
      ...record,
      warranties: [
        {
          ...record.warranties[0],
          requiredEvidence: [{ label: "Receipt and serial", required: true }],
        },
      ],
    });

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(second).toBe(first);
    expect(changed).not.toBe(first);
  });
});
