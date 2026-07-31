type DocumentUploadMetadata = {
  kind: string;
  productId?: string;
  claimId?: string;
  backend?: "local" | "paperless";
  name?: string;
};

export function uploadDocument(file: File, metadata: DocumentUploadMetadata) {
  const query = new URLSearchParams({
    name: metadata.name || file.name || "attachment",
    kind: metadata.kind,
  });
  if (metadata.productId) query.set("productId", metadata.productId);
  if (metadata.claimId) query.set("claimId", metadata.claimId);
  if (metadata.backend) query.set("backend", metadata.backend);
  return fetch(`/api/v1/documents/upload?${query}`, {
    method: "POST",
    headers: {
      "content-type": file.type || "application/octet-stream",
    },
    body: file,
  });
}

export function uploadProductImage(file: File, productId: string) {
  return fetch(
    `/api/v1/products/${encodeURIComponent(productId)}/images/upload`,
    {
      method: "POST",
      headers: {
        "content-type": file.type || "application/octet-stream",
      },
      body: file,
    },
  );
}
