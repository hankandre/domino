import { lookup } from "node:dns/promises";
import {
  request as httpRequest,
  type ClientRequest,
  type IncomingMessage,
  type RequestOptions,
} from "node:http";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP, type LookupFunction } from "node:net";
import { z } from "zod";

const suggestion = z.object({
  url: z.url(),
  sourceUrl: z.url(),
  title: z.string().optional(),
});

const blockedAddresses = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blockedAddresses.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["::ffff:0:0", 96],
  ["64:ff9b::", 96],
  ["100::", 64],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  blockedAddresses.addSubnet(network, prefix, "ipv6");
}

function isPrivateAddress(address: string, family: 4 | 6) {
  return blockedAddresses.check(address, family === 4 ? "ipv4" : "ipv6");
}

export async function assertPublicUrl(
  value: string,
  lookupHost: (
    hostname: string,
  ) => Promise<Array<{ address: string; family: number }>> = (hostname) =>
    lookup(hostname, { all: true }),
) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol))
    throw new Error("Only HTTP(S) product URLs are supported");
  if (url.username || url.password)
    throw new Error("Product URLs cannot contain credentials");
  if (url.port && !["80", "443"].includes(url.port))
    throw new Error("Non-standard ports are not allowed");

  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const literalFamily = isIP(hostname);
  if (literalFamily) {
    const family = literalFamily === 6 ? 6 : 4;
    if (isPrivateAddress(hostname, family))
      throw new Error("Private addresses are not allowed");
    return { url, address: hostname, family };
  } else {
    const addresses = await lookupHost(hostname);
    if (
      !addresses.length ||
      addresses.some(({ address, family }) =>
        isPrivateAddress(address, family === 6 ? 6 : 4),
      )
    ) {
      throw new Error("The product URL does not resolve to a public address");
    }
    return {
      url,
      address: addresses[0].address,
      family: addresses[0].family === 6 ? (6 as const) : (4 as const),
    };
  }
}

function meta(html: string, key: string) {
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["'][^>]*>`,
      "i",
    ),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return match[1].replaceAll("&amp;", "&");
  }
}

export async function suggestProductImage(productUrl: string) {
  const target = await assertPublicUrl(productUrl);
  const { status, contentType, html } = await fetchPinnedHtml(target);
  if (status < 200 || status >= 300)
    throw new Error(`Product page returned ${status}`);
  if (
    !contentType.includes("text/html") &&
    !contentType.includes("application/xhtml+xml")
  ) {
    throw new Error("Product URL did not return HTML");
  }

  const imageValue = meta(html, "og:image") ?? meta(html, "twitter:image");
  if (!imageValue) return [];

  const imageUrl = new URL(imageValue, target.url);
  if (!["http:", "https:"].includes(imageUrl.protocol)) return [];
  await assertPublicUrl(imageUrl.toString());

  return [
    suggestion.parse({
      url: imageUrl.toString(),
      sourceUrl: target.url.toString(),
      title: meta(html, "og:title"),
    }),
  ];
}

export async function downloadProductImage(imageUrl: string) {
  const target = await assertPublicUrl(imageUrl);
  return fetchPinnedImage(target);
}

export type PinnedRequestTransport = (
  url: URL,
  options: RequestOptions,
  onResponse: (response: IncomingMessage) => void,
) => ClientRequest;

function pinnedLookup(
  target: Awaited<ReturnType<typeof assertPublicUrl>>,
): LookupFunction {
  return (_hostname, options, callback) => {
    if (options.all) {
      callback(null, [{ address: target.address, family: target.family }]);
      return;
    }
    callback(null, target.address, target.family);
  };
}

export function fetchPinnedHtml(
  target: Awaited<ReturnType<typeof assertPublicUrl>>,
  options: {
    maximumBytes?: number;
    timeoutMs?: number;
    transport?: PinnedRequestTransport;
  } = {},
) {
  const maximumBytes = options.maximumBytes ?? 1_000_000;
  const timeoutMs = options.timeoutMs ?? 8_000;
  return new Promise<{ status: number; contentType: string; html: string }>(
    (resolve, reject) => {
      const transport =
        options.transport ??
        ((target.url.protocol === "https:"
          ? httpsRequest
          : httpRequest) as PinnedRequestTransport);
      let timeout: ReturnType<typeof setTimeout>;
      const request = transport(
        target.url,
        {
          headers: {
            Accept: "text/html,application/xhtml+xml",
            "User-Agent": "Domino/0.1 product-image-preview",
          },
          lookup: pinnedLookup(target),
        },
        (response) => {
          const status = response.statusCode ?? 500;
          if (status >= 300 && status < 400) {
            clearTimeout(timeout);
            response.resume();
            reject(new Error("Product page redirects are not followed"));
            return;
          }
          const declaredLength = Number(
            response.headers["content-length"] ?? 0,
          );
          if (declaredLength > maximumBytes) {
            clearTimeout(timeout);
            response.destroy();
            reject(new Error("Product page is too large to inspect safely"));
            return;
          }

          const chunks: Buffer[] = [];
          let received = 0;
          response.on("data", (chunk: Buffer) => {
            received += chunk.length;
            if (received > maximumBytes) {
              response.destroy(
                new Error("Product page is too large to inspect safely"),
              );
              return;
            }
            chunks.push(Buffer.from(chunk));
          });
          response.on("end", () => {
            clearTimeout(timeout);
            resolve({
              status,
              contentType: String(response.headers["content-type"] ?? ""),
              html: Buffer.concat(chunks).toString("utf8"),
            });
          });
          response.on("error", (cause) => {
            clearTimeout(timeout);
            reject(cause);
          });
        },
      );
      timeout = setTimeout(
        () => request.destroy(new Error("Product page request timed out")),
        timeoutMs,
      );
      request.on("error", (cause) => {
        clearTimeout(timeout);
        reject(cause);
      });
      request.end();
    },
  );
}

function fetchPinnedImage(target: Awaited<ReturnType<typeof assertPublicUrl>>) {
  return new Promise<{ bytes: Buffer; contentType: string }>(
    (resolve, reject) => {
      const transport =
        target.url.protocol === "https:" ? httpsRequest : httpRequest;
      let timeout: ReturnType<typeof setTimeout>;
      const request = transport(
        target.url,
        {
          headers: {
            Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif",
            "User-Agent": "Domino/0.1 product-image-fetch",
          },
          lookup: pinnedLookup(target),
        },
        (response) => {
          const status = response.statusCode ?? 500;
          if (status < 200 || status >= 300) {
            clearTimeout(timeout);
            response.resume();
            reject(new Error(`Product image returned ${status}`));
            return;
          }
          const contentType = String(
            response.headers["content-type"] ?? "",
          ).split(";")[0];
          if (!contentType.startsWith("image/")) {
            clearTimeout(timeout);
            response.resume();
            reject(new Error("Suggested URL did not return an image"));
            return;
          }
          const declaredLength = Number(
            response.headers["content-length"] ?? 0,
          );
          if (declaredLength > 10 * 1024 * 1024) {
            clearTimeout(timeout);
            response.destroy();
            reject(new Error("Product image is larger than 10 MiB"));
            return;
          }
          const chunks: Buffer[] = [];
          let received = 0;
          response.on("data", (chunk: Buffer) => {
            received += chunk.length;
            if (received > 10 * 1024 * 1024) {
              response.destroy(
                new Error("Product image is larger than 10 MiB"),
              );
              return;
            }
            chunks.push(Buffer.from(chunk));
          });
          response.on("end", () => {
            clearTimeout(timeout);
            resolve({ bytes: Buffer.concat(chunks), contentType });
          });
          response.on("error", (cause) => {
            clearTimeout(timeout);
            reject(cause);
          });
        },
      );
      timeout = setTimeout(
        () => request.destroy(new Error("Product image request timed out")),
        10_000,
      );
      request.on("error", (cause) => {
        clearTimeout(timeout);
        reject(cause);
      });
      request.end();
    },
  );
}
