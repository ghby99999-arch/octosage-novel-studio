import test from "node:test";
import assert from "node:assert/strict";

import { createModelRouter } from "../src/core/model-router.mjs";

const writeTask = {
  task_type: "write_chapter",
  chapter_card: {
    chapter_no: 1,
    display_title: "Hook title",
  },
  task_package: {
    output: { target_words: 300 },
  },
};

test("openai provider retries transient 429 and 5xx failures", async () => {
  const statuses = [429, 500, 200];
  const router = createModelRouter({
    provider: "openai",
    model: "gpt-test",
    allowNetwork: true,
    maxRetries: 2,
    retryDelayMs: 0,
    env: { OPENAI_API_KEY: "sk-test" },
    fetch: async () => {
      const status = statuses.shift();
      if (status !== 200) {
        return {
          ok: false,
          status,
          async text() {
            return `temporary ${status}`;
          },
        };
      }
      return {
        ok: true,
        status: 200,
        async json() {
          return { output_text: "generated after retry" };
        },
      };
    },
  });

  const result = await router.invoke(writeTask);

  assert.equal(result.text, "generated after retry");
  assert.equal(statuses.length, 0);
});

test("openai provider includes response body for non-retryable API failures", async () => {
  let calls = 0;
  const router = createModelRouter({
    provider: "openai",
    model: "gpt-test",
    allowNetwork: true,
    env: { OPENAI_API_KEY: "sk-test" },
    fetch: async () => {
      calls += 1;
      return {
        ok: false,
        status: 400,
        async text() {
          return JSON.stringify({ error: { message: "bad request detail" } });
        },
      };
    },
  });

  await assert.rejects(() => router.invoke(writeTask), /400.*bad request detail/s);
  assert.equal(calls, 1);
});

test("openai provider aborts requests when timeout is reached", async () => {
  let sawSignal = false;
  const router = createModelRouter({
    provider: "openai",
    model: "gpt-test",
    allowNetwork: true,
    timeoutMs: 1,
    maxRetries: 0,
    env: { OPENAI_API_KEY: "sk-test" },
    fetch: async (url, options) => {
      sawSignal = Boolean(options.signal);
      await new Promise((resolve, reject) => {
        options.signal.addEventListener("abort", () => reject(new Error("aborted by signal")));
      });
    },
  });

  await assert.rejects(() => router.invoke(writeTask), /timeout|aborted/i);
  assert.equal(sawSignal, true);
});
