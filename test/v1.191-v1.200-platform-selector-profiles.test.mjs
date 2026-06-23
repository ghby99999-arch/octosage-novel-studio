import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { createLocalServer } from "../src/server.mjs";
import {
  createVisiblePublishBrowserDriver,
  getPublishPlatformProfile,
  listPublishPlatformProfiles,
} from "../src/core/browser/publish-browser-driver.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

async function startTestServer(options = {}) {
  const app = createLocalServer(options);
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const { port } = app.server.address();
  return {
    ...app,
    baseUrl: `http://127.0.0.1:${port}`,
    async close() {
      await new Promise((resolve, reject) => {
        app.server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

function fakePlaywrightFactory(events) {
  return {
    chromium: {
      async launch(options) {
        events.push({ type: "launch", options });
        return {
          async newContext(contextOptions) {
            events.push({ type: "newContext", contextOptions });
            return {
              async newPage() {
                return {
                  async goto(url, options) {
                    events.push({ type: "goto", url, options });
                  },
                  locator(selector) {
                    return {
                      async fill(value) {
                        events.push({ type: "fill", selector, value });
                      },
                      async setInputFiles(file) {
                        events.push({ type: "setInputFiles", selector, file });
                      },
                    };
                  },
                  async waitForTimeout(ms) {
                    events.push({ type: "waitForTimeout", ms });
                  },
                };
              },
            };
          },
        };
      },
    },
  };
}

test("v1.191 publish platform profiles list platform-specific candidate selectors", () => {
  const profiles = listPublishPlatformProfiles();
  const ids = profiles.map((profile) => profile.id);

  assert.deepEqual(ids, ["fanqie", "qidian", "17k", "manual-browser"]);
  for (const profile of profiles) {
    assert.ok(profile.author_console_url);
    assert.equal(profile.safety.stop_before_final_submit, true);
    assert.ok(profile.selectors.title.length >= 2);
    assert.ok(profile.selectors.synopsis.length >= 2);
    assert.ok(profile.selectors.chapters.length >= 1);
    assert.equal(profile.verification.current_dom_verified, false);
  }
});

test("v1.192 getPublishPlatformProfile falls back to manual-browser for unknown platforms", () => {
  const unknown = getPublishPlatformProfile("unknown-platform");
  const manual = getPublishPlatformProfile("manual-browser");

  assert.equal(unknown.id, "manual-browser");
  assert.deepEqual(unknown.selectors.title, manual.selectors.title);
});

test("v1.193 visible browser driver applies the selected platform profile", async () => {
  const events = [];
  const created = await createVisiblePublishBrowserDriver({
    allowBrowserLaunch: true,
    driverType: "playwright",
    platform: "qidian",
    playwrightFactory: fakePlaywrightFactory(events),
  });

  assert.equal(created.status, "ready");
  assert.equal(created.profile.id, "qidian");

  await created.driver.open();
  await created.driver.fillField("title", "Profile Title");
  await created.driver.fillField("synopsis", "Profile Synopsis");
  await created.driver.uploadChapters("E:\\tmp\\chapters.txt");

  assert.ok(events.some((event) => event.type === "goto" && event.url === created.profile.author_console_url));
  const titleFill = events.find((event) => event.type === "fill" && event.value === "Profile Title");
  assert.ok(titleFill.selector.includes("bookName") || titleFill.selector.includes("作品") || titleFill.selector.includes("title"));
  const upload = events.find((event) => event.type === "setInputFiles");
  assert.ok(upload.selector.includes('input[type="file"]'));
});

test("v1.194 profile selectors can be overridden for field calibration", async () => {
  const events = [];
  const created = await createVisiblePublishBrowserDriver({
    allowBrowserLaunch: true,
    driverType: "playwright",
    platform: "fanqie",
    selectors: {
      title: ["#calibrated-title"],
      synopsis: ["#calibrated-synopsis"],
      genre: ["#calibrated-genre"],
      tags: ["#calibrated-tags"],
      chapters: ["#calibrated-file"],
    },
    playwrightFactory: fakePlaywrightFactory(events),
  });

  await created.driver.fillField("title", "Calibrated");
  await created.driver.uploadChapters("E:\\tmp\\chapters.txt");

  assert.ok(events.some((event) => event.type === "fill" && event.selector === "#calibrated-title"));
  assert.ok(events.some((event) => event.type === "setInputFiles" && event.selector === "#calibrated-file"));
});

test("v1.195 CLI and server expose publish platform selector profiles", async () => {
  const app = await startTestServer();
  try {
    const cli = spawnSync("node", ["src/cli.mjs", "publish-profiles"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    assert.equal(cli.status, 0, cli.stderr);
    assert.match(cli.stdout, /fanqie/);
    assert.match(cli.stdout, /qidian/);
    assert.match(cli.stdout, /17k/);

    const response = await fetch(`${app.baseUrl}/api/publish/platform-profiles`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.ok(body.profiles.some((profile) => profile.id === "fanqie"));
    assert.ok(body.profiles.some((profile) => profile.id === "manual-browser"));
  } finally {
    await app.close();
  }
});

test("v1.196 Web workbench exposes selector profile discovery", async () => {
  const app = await startTestServer();
  try {
    const html = await fetch(`${app.baseUrl}/`).then((response) => response.text());

    assert.match(html, /publishProfilesAction/);
    assert.match(html, /\/api\/publish\/platform-profiles/);
    assert.match(html, /selector|profiles/i);
  } finally {
    await app.close();
  }
});
