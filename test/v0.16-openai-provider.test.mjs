import test from "node:test";
import assert from "node:assert/strict";
import { createModelRouter } from "../src/core/model-router.mjs";

test("openai provider is registered as an offline stub before real API calls", async () => {
  const router = createModelRouter({ provider: "openai", model: "gpt-5.1" });

  await assert.rejects(
    () =>
      router.invoke({
        task_type: "write_chapter",
        chapter_card: {},
      }),
    /OpenAI provider is configured but real API calls are disabled/,
  );
});
