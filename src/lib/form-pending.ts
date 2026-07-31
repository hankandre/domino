/**
 * Gives native SvelteKit form submissions an immediate, visible pending state.
 * The following document navigation replaces the form, so no client-side reset
 * is needed. Tests or other handlers that cancel submission leave it unchanged.
 */
export function pendingForm(node: HTMLFormElement) {
  function handleSubmit(event: SubmitEvent) {
    if (event.defaultPrevented || !node.checkValidity()) return;
    node.setAttribute("aria-busy", "true");
    const submitter = event.submitter;
    if (!(submitter instanceof HTMLButtonElement)) return;
    submitter.disabled = true;
    submitter.textContent = submitter.dataset.pendingLabel ?? "Working…";
  }

  node.addEventListener("submit", handleSubmit);
  return {
    destroy() {
      node.removeEventListener("submit", handleSubmit);
    },
  };
}
