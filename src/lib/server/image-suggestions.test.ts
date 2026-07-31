import { createServer, type RequestListener } from "node:http";
import { EventEmitter } from "node:events";
import { afterEach, describe, expect, test } from "bun:test";
import {
  assertPublicUrl,
  fetchPinnedHtml,
  suggestProductImage,
  type PinnedRequestTransport,
} from "./image-suggestions";

const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          if (!server.listening) {
            resolve();
            return;
          }
          server.close((cause) => (cause ? reject(cause) : resolve()));
          server.closeAllConnections();
        }),
    ),
  );
});

async function localTarget(handler: RequestListener) {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  return {
    url: new URL(
      `http://example-${servers.length}.test:${address.port}/product`,
    ),
    address: "127.0.0.1",
    family: 4 as const,
  };
}

describe("product image URL safety", () => {
  test("rejects IPv4 loopback targets", async () => {
    await expect(
      suggestProductImage("http://127.0.0.1/product"),
    ).rejects.toThrow("Private addresses are not allowed");
  });

  test("rejects IPv6 unique-local targets", async () => {
    await expect(
      suggestProductImage("http://[fc00::1]/product"),
    ).rejects.toThrow("Private addresses are not allowed");
  });

  test("rejects a hostname when any DNS answer is private", async () => {
    await expect(
      assertPublicUrl("https://product.example.test/item", async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "127.0.0.1", family: 4 },
      ]),
    ).rejects.toThrow("does not resolve to a public address");
  });

  test("does not follow redirects", async () => {
    const redirectTarget = await localTarget((_request, response) => {
      response.writeHead(302, { location: "http://127.0.0.1/private" });
      response.end();
    });
    await expect(fetchPinnedHtml(redirectTarget)).rejects.toThrow(
      "redirects are not followed",
    );
  });

  test("limits a response even without a declared length", async () => {
    const oversizedTarget = await localTarget((_request, response) => {
      response.writeHead(200, { "content-type": "text/html" });
      response.end("x".repeat(1_025));
    });
    await expect(
      fetchPinnedHtml(oversizedTarget, { maximumBytes: 1_024 }),
    ).rejects.toThrow("too large");
  });

  test("aborts a response that exceeds its deadline", async () => {
    const request = new EventEmitter() as EventEmitter & {
      destroy: (cause: Error) => void;
      end: () => void;
    };
    request.destroy = (cause) => request.emit("error", cause);
    request.end = () => undefined;
    const transport = (() => request) as unknown as PinnedRequestTransport;
    await expect(
      fetchPinnedHtml(
        {
          url: new URL("http://example.test/product"),
          address: "93.184.216.34",
          family: 4,
        },
        { timeoutMs: 20, transport },
      ),
    ).rejects.toThrow("timed out");
  });
});
