export function captureNextFormSubmission() {
  return new Promise<{ action: string; data: FormData }>((resolve) => {
    document.addEventListener(
      "submit",
      (event) => {
        event.preventDefault();
        const form = event.target as HTMLFormElement;
        resolve({
          action: form.getAttribute("action") ?? "",
          data: new FormData(form),
        });
      },
      { capture: true, once: true },
    );
  });
}

export async function requestBody(init?: RequestInit) {
  if (!init?.body) return null;
  if (typeof init.body === "string") return JSON.parse(init.body) as unknown;
  if (init.body instanceof FormData) return init.body;
  return null;
}
