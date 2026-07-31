import { z } from "zod";

const paperlessDocument = z.object({
  id: z.number(),
  title: z.string(),
  created: z.string().optional(),
  document_type: z.number().nullable().optional(),
  tags: z.array(z.number()).optional(),
});

const paperlessList = z.object({
  count: z.number(),
  results: z.array(paperlessDocument),
});

const paperlessTask = z.object({
  task_id: z.string(),
  status: z.string(),
  result: z.union([z.string(), z.number()]).nullable().optional(),
});

export class PaperlessClient {
  constructor(
    private baseUrl: string,
    private token: string,
    private fetcher: typeof fetch = fetch,
  ) {}

  private async request(path: string, init?: RequestInit) {
    const response = await this.fetcher(
      new URL(path.replace(/^\/+/, ""), this.baseUrl),
      {
        ...init,
        headers: {
          Authorization: `Token ${this.token}`,
          Accept: "application/json",
          ...init?.headers,
        },
        signal: AbortSignal.timeout(15_000),
        redirect: "error",
      },
    );

    if (!response.ok) {
      throw new Error(`Paperless request failed with ${response.status}`);
    }
    return response;
  }

  private async json(response: Response, maximumBytes = 2 * 1024 * 1024) {
    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
      throw new Error("Paperless response is too large.");
    }
    const reader = response.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel();
        throw new Error("Paperless response is too large.");
      }
      chunks.push(value);
    }
    const body = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder().decode(body));
  }

  async health() {
    await this.request("/api/");
    return { ok: true };
  }

  documentUrl(id: number) {
    return new URL(`documents/${id}/details`, this.baseUrl).toString();
  }

  async getDocument(id: number) {
    const response = await this.request(`/api/documents/${id}/`);
    return paperlessDocument.parse(await this.json(response));
  }

  async search(query: string) {
    const response = await this.request(
      `/api/documents/?query=${encodeURIComponent(query)}&page_size=25`,
    );
    return paperlessList.parse(await this.json(response)).results;
  }

  async upload(file: Blob, title: string, tags: number[] = []) {
    const body = new FormData();
    body.set("document", file);
    body.set("title", title);
    for (const tag of tags) body.append("tags", String(tag));

    const response = await this.request("/api/documents/post_document/", {
      method: "POST",
      body,
    });
    return z.union([z.string(), z.number()]).parse(await this.json(response));
  }

  async getTask(taskId: string) {
    const response = await this.request(
      `/api/tasks/?task_id=${encodeURIComponent(taskId)}`,
    );
    const tasks = z.array(paperlessTask).parse(await this.json(response));
    return tasks[0] ?? null;
  }
}
