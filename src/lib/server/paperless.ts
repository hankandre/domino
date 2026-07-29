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
  ) {}

  private async request(path: string, init?: RequestInit) {
    const response = await fetch(
      new URL(path.replace(/^\/+/, ""), this.baseUrl),
      {
        ...init,
        headers: {
          Authorization: `Token ${this.token}`,
          Accept: "application/json",
          ...init?.headers,
        },
        signal: AbortSignal.timeout(15_000),
      },
    );

    if (!response.ok) {
      throw new Error(`Paperless request failed with ${response.status}`);
    }
    return response;
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
    return paperlessDocument.parse(await response.json());
  }

  async search(query: string) {
    const response = await this.request(
      `/api/documents/?query=${encodeURIComponent(query)}&page_size=25`,
    );
    return paperlessList.parse(await response.json()).results;
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
    return z.union([z.string(), z.number()]).parse(await response.json());
  }

  async getTask(taskId: string) {
    const response = await this.request(
      `/api/tasks/?task_id=${encodeURIComponent(taskId)}`,
    );
    const tasks = z.array(paperlessTask).parse(await response.json());
    return tasks[0] ?? null;
  }
}
