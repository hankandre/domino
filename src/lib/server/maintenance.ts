import { requireDb } from "./db";
import { purgeExpiredDocuments } from "./domain/documents";

const MAINTENANCE_INTERVAL_MS = 5 * 60_000;
let maintenanceStarted = false;

async function runMaintenance() {
  try {
    await purgeExpiredDocuments(requireDb(), { limit: 25 });
  } catch (cause) {
    console.error("Document maintenance failed", cause);
  }
}

/** Start one bounded, process-local maintenance loop for the self-hosted server. */
export function startDocumentMaintenance() {
  if (maintenanceStarted || process.env.DOMINO_DEMO_MODE === "true") return;
  maintenanceStarted = true;
  const timer = setInterval(
    () => void runMaintenance(),
    MAINTENANCE_INTERVAL_MS,
  );
  timer.unref();
  setTimeout(() => void runMaintenance(), 60_000).unref();
}
