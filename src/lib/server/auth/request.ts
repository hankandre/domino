const defaultMaximumBytes = 4_096;

export async function readBoundedFormData(
  request: Request,
  maximumBytes = defaultMaximumBytes,
) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
    return null;
  }

  const reader = request.body?.getReader();
  if (!reader) return new FormData();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new Response(body, {
    headers: {
      "content-type":
        request.headers.get("content-type") ??
        "application/x-www-form-urlencoded",
    },
  }).formData();
}

export function hasTrustedOrigin(request: Request, fallbackOrigin: string) {
  const origin = request.headers.get("origin");
  return Boolean(origin && origin === new URL(fallbackOrigin).origin);
}
