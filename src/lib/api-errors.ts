export async function responseError(
  response: Response,
  fallback: string,
): Promise<string> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = (await response.json().catch(() => null)) as {
      error?: unknown;
      message?: unknown;
    } | null;
    if (typeof body?.error === "string" && body.error.trim()) return body.error;
    if (typeof body?.message === "string" && body.message.trim())
      return body.message;
  }
  return fallback;
}

export function networkError(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message
    ? `${fallback} ${cause.message}`
    : fallback;
}
