export const DEFAULT_LIST_LIMIT = 100;
export const MAX_LIST_LIMIT = 200;
export const MAX_SEARCH_CANDIDATES = 1_000;
export const BROWSER_PAGE_LIMIT = 48;

export type ListWindow = {
  limit?: number;
  offset?: number;
};

export type NormalizedListWindow = {
  limit: number;
  offset: number;
};

export function normalizeListWindow(
  window: ListWindow = {},
  maximum = MAX_LIST_LIMIT,
): NormalizedListWindow {
  const limit = Math.min(
    maximum,
    Math.max(1, Math.trunc(window.limit ?? DEFAULT_LIST_LIMIT)),
  );
  const offset = Math.max(0, Math.trunc(window.offset ?? 0));
  return { limit, offset };
}

export function browserPageWindow(
  searchParams: URLSearchParams,
  limit = BROWSER_PAGE_LIMIT,
) {
  const requested = Number(searchParams.get("page") ?? "1");
  const page =
    Number.isSafeInteger(requested) && requested > 0
      ? Math.min(requested, 20_000)
      : 1;
  return { page, limit, offset: (page - 1) * limit };
}

export function browserPageHref(url: URL, page: number) {
  const next = new URL(url);
  if (page <= 1) next.searchParams.delete("page");
  else next.searchParams.set("page", String(page));
  return `${next.pathname}${next.search}${next.hash}`;
}
