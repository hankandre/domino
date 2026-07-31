import tailwindcss from "@tailwindcss/vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

const launchOptions = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
  : undefined;

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  test: {
    name: "browser",
    include: ["src/**/*.browser.ts"],
    setupFiles: ["./src/test/browser.setup.ts"],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({ launchOptions }),
      instances: [{ browser: "chromium" }],
    },
  },
});
