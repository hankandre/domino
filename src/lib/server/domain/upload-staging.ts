import { randomBytes, createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

export type UploadSource = {
  name: string;
  type: string;
  size?: number;
  stream: () => ReadableStream<Uint8Array>;
};

function storageRoot() {
  return resolve(process.env.DOMINO_UPLOAD_DIR ?? "/data/uploads");
}

export async function stageUpload(
  source: UploadSource,
  maximumBytes: number,
  sizeError: () => Error,
) {
  const stagingDirectory = resolve(storageRoot(), ".staging");
  await mkdir(stagingDirectory, { recursive: true, mode: 0o700 });
  const path = resolve(
    stagingDirectory,
    `${randomBytes(24).toString("hex")}.upload`,
  );
  const hash = createHash("sha256");
  let size = 0;
  const limiter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      size += chunk.length;
      if (size > maximumBytes) {
        callback(sizeError());
        return;
      }
      hash.update(chunk);
      callback(null, chunk);
    },
  });
  try {
    await pipeline(
      Readable.fromWeb(
        source.stream() as unknown as import("node:stream/web").ReadableStream,
      ),
      limiter,
      createWriteStream(path, { flags: "wx", mode: 0o600 }),
    );
    if (size === 0) throw sizeError();
    return { path, size, sha256: hash.digest("hex") };
  } catch (cause) {
    await unlink(path).catch(() => undefined);
    throw cause;
  }
}
