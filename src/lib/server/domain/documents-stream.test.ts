import { mkdtemp, readdir, rm } from "node:fs/promises";
import { afterEach, describe, expect, test } from "bun:test";
import { DocumentUploadSizeError, stageDocumentUpload } from "./documents";

const originalUploadDirectory = process.env.DOMINO_UPLOAD_DIR;
const temporaryDirectories: string[] = [];

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
  if (originalUploadDirectory === undefined)
    delete process.env.DOMINO_UPLOAD_DIR;
  else process.env.DOMINO_UPLOAD_DIR = originalUploadDirectory;
});

describe("streamed document intake", () => {
  test("enforces the measured stream size and removes a partial staging file", async () => {
    const directory = await mkdtemp("/tmp/domino-stream-upload-");
    temporaryDirectories.push(directory);
    process.env.DOMINO_UPLOAD_DIR = directory;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.enqueue(new Uint8Array([4, 5, 6]));
        controller.close();
      },
    });

    await expect(
      stageDocumentUpload(
        {
          name: "deceptive.bin",
          type: "application/octet-stream",
          size: 1,
          stream: () => stream,
        },
        4,
      ),
    ).rejects.toBeInstanceOf(DocumentUploadSizeError);
    await expect(readdir(`${directory}/.staging`)).resolves.toEqual([]);
  });
});
