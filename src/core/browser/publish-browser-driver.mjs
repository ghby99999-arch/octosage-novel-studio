const DEFAULT_FIELD_SELECTORS = {
  title: [
    '[name="title"]',
    '[data-field="title"]',
    'input[placeholder*="书名"]',
    'input[placeholder*="作品名"]',
    'input[aria-label*="title" i]',
  ],
  synopsis: [
    '[name="synopsis"]',
    '[data-field="synopsis"]',
    'textarea[placeholder*="简介"]',
    'textarea[placeholder*="作品介绍"]',
    'textarea[aria-label*="synopsis" i]',
  ],
  genre: [
    '[name="genre"]',
    '[data-field="genre"]',
    'input[placeholder*="分类"]',
    'input[placeholder*="类型"]',
  ],
  tags: [
    '[name="tags"]',
    '[data-field="tags"]',
    'input[placeholder*="标签"]',
    'textarea[placeholder*="标签"]',
  ],
  chapters: [
    'input[type="file"][name="chapters"]',
    'input[type="file"]',
  ],
};

const PLATFORM_PROFILES = {
  fanqie: {
    id: "fanqie",
    label: "Fanqie writer console",
    author_console_url: "https://writer.fanqie.com/",
    selectors: {
      title: [
        '[name="title"]',
        '[name="bookName"]',
        'input[placeholder*="书名"]',
        'input[placeholder*="作品名"]',
        'input[placeholder*="小说名"]',
        '[data-field="title"] input',
      ],
      synopsis: [
        '[name="synopsis"]',
        '[name="description"]',
        'textarea[placeholder*="简介"]',
        'textarea[placeholder*="作品介绍"]',
        '[data-field="synopsis"] textarea',
      ],
      genre: [
        '[name="genre"]',
        '[name="category"]',
        'input[placeholder*="分类"]',
        'input[placeholder*="类型"]',
      ],
      tags: [
        '[name="tags"]',
        'input[placeholder*="标签"]',
        'textarea[placeholder*="标签"]',
      ],
      chapters: [
        'input[type="file"][name="chapters"]',
        'input[type="file"][accept*="text"]',
        'input[type="file"]',
      ],
    },
    verification: {
      current_dom_verified: false,
      note: "Candidate selectors only; calibrate against the visible logged-in author console before production use.",
    },
    safety: {
      no_password_bypass: true,
      no_captcha_bypass: true,
      stop_before_final_submit: true,
    },
  },
  qidian: {
    id: "qidian",
    label: "Qidian writer console",
    author_console_url: "https://write.qq.com/",
    selectors: {
      title: [
        '[name="bookName"]',
        '[name="title"]',
        'input[placeholder*="作品"]',
        'input[placeholder*="书名"]',
        '[data-field="bookName"] input',
      ],
      synopsis: [
        '[name="intro"]',
        '[name="synopsis"]',
        'textarea[placeholder*="简介"]',
        'textarea[placeholder*="介绍"]',
        '[data-field="intro"] textarea',
      ],
      genre: [
        '[name="category"]',
        '[name="genre"]',
        'input[placeholder*="分类"]',
      ],
      tags: [
        '[name="tags"]',
        'input[placeholder*="标签"]',
      ],
      chapters: [
        'input[type="file"][name="chapterFile"]',
        'input[type="file"][accept*="text"]',
        'input[type="file"]',
      ],
    },
    verification: {
      current_dom_verified: false,
      note: "Candidate selectors only; Qidian DOM must be calibrated in a visible user session.",
    },
    safety: {
      no_password_bypass: true,
      no_captcha_bypass: true,
      stop_before_final_submit: true,
    },
  },
  "17k": {
    id: "17k",
    label: "17K author console",
    author_console_url: "https://author.17k.com/",
    selectors: {
      title: [
        '[name="bookName"]',
        '[name="title"]',
        'input[placeholder*="作品"]',
        'input[placeholder*="书名"]',
      ],
      synopsis: [
        '[name="description"]',
        '[name="intro"]',
        'textarea[placeholder*="简介"]',
        'textarea[placeholder*="介绍"]',
      ],
      genre: [
        '[name="category"]',
        '[name="genre"]',
        'input[placeholder*="分类"]',
      ],
      tags: [
        '[name="tags"]',
        'input[placeholder*="标签"]',
      ],
      chapters: [
        'input[type="file"][name="chapter"]',
        'input[type="file"][accept*="text"]',
        'input[type="file"]',
      ],
    },
    verification: {
      current_dom_verified: false,
      note: "Candidate selectors only; 17K DOM must be calibrated in a visible user session.",
    },
    safety: {
      no_password_bypass: true,
      no_captcha_bypass: true,
      stop_before_final_submit: true,
    },
  },
  "manual-browser": {
    id: "manual-browser",
    label: "Manual browser handoff",
    author_console_url: "about:blank",
    selectors: DEFAULT_FIELD_SELECTORS,
    verification: {
      current_dom_verified: false,
      note: "Generic manual selectors for user-assisted copy/paste workflows.",
    },
    safety: {
      no_password_bypass: true,
      no_captcha_bypass: true,
      stop_before_final_submit: true,
    },
  },
};

function cloneProfile(profile) {
  return JSON.parse(JSON.stringify(profile));
}

export function listPublishPlatformProfiles() {
  return ["fanqie", "qidian", "17k", "manual-browser"].map((id) => cloneProfile(PLATFORM_PROFILES[id]));
}

export function getPublishPlatformProfile(platform = "manual-browser") {
  return cloneProfile(PLATFORM_PROFILES[platform] || PLATFORM_PROFILES["manual-browser"]);
}

function selectorFor(name, selectors = DEFAULT_FIELD_SELECTORS) {
  const candidates = selectors[name] || [`[name="${name}"]`];
  return candidates.join(", ");
}

function isSafeScannableControl(control = {}) {
  const type = String(control.type || "").toLowerCase();
  return control.visible !== false &&
    control.disabled !== true &&
    type !== "password" &&
    type !== "hidden" &&
    typeof control.selector === "string" &&
    control.selector.trim();
}

function sanitizeScannedControls(controls = []) {
  return controls.filter(isSafeScannableControl).map((control) => ({
    tag: String(control.tag || "").toLowerCase(),
    type: String(control.type || "").toLowerCase(),
    name: control.name || "",
    id: control.id || "",
    placeholder: control.placeholder || "",
    label: control.label || "",
    ariaLabel: control.ariaLabel || "",
    text: control.text || "",
    accept: control.accept || "",
    selector: control.selector,
    visible: true,
    disabled: false,
  }));
}

function missingRuntimeResult(error) {
  return {
    status: "playwright_not_configured",
    driver: null,
    error: error?.message || String(error || "playwright runtime is not configured"),
    next_step: "Install or configure Playwright, then rerun with an explicit visible browser launch confirmation.",
    safety: {
      requires_explicit_confirmation: true,
      headed_browser_only: true,
      no_password_bypass: true,
      no_captcha_bypass: true,
      stop_before_final_submit: true,
    },
  };
}

export async function createPlaywrightPublishDriver({
  allowBrowserLaunch = false,
  playwrightFactory,
  importPlaywright,
  platform = "manual-browser",
  selectors,
  launchOptions = {},
  contextOptions = {},
} = {}) {
  if (!allowBrowserLaunch) {
    return {
      status: "browser_launch_not_allowed",
      driver: null,
      safety: {
        requires_explicit_confirmation: true,
        headed_browser_only: true,
        no_password_bypass: true,
        no_captcha_bypass: true,
        stop_before_final_submit: true,
      },
      next_step: "Pass allowBrowserLaunch after the user confirms a visible browser session.",
    };
  }
  const profile = getPublishPlatformProfile(platform);
  const resolvedSelectors = selectors || profile.selectors || DEFAULT_FIELD_SELECTORS;

  let playwright = playwrightFactory;
  if (!playwright) {
    try {
      playwright = importPlaywright ? await importPlaywright() : await import("playwright");
    } catch (error) {
      return missingRuntimeResult(error);
    }
  }
  const browserType = playwright?.chromium;
  if (!browserType || typeof browserType.launch !== "function") {
    return missingRuntimeResult(new Error("Playwright chromium launcher is unavailable"));
  }
  const browser = await browserType.launch({
    headless: false,
    ...launchOptions,
  });
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  const driver = {
    type: "playwright",
    profile,
    async open(url = profile.author_console_url || "about:blank") {
      await page.goto(url, { waitUntil: "domcontentloaded" });
    },
    async ensureLoggedIn(checks = []) {
      return {
        logged_in: "user_visible_session_required",
        checks,
      };
    },
    async fillField(name, value) {
      await page.locator(selectorFor(name, resolvedSelectors)).fill(String(value ?? ""));
    },
    async uploadChapters(file) {
      await page.locator(selectorFor("chapters", resolvedSelectors)).setInputFiles(file);
    },
    async scanControls() {
      const controls = await page.evaluate(() => {
        function cssEscape(value) {
          if (window.CSS?.escape) return window.CSS.escape(value);
          return String(value).replace(/["\\#.;:[\]>+~*^$|=()\s]/g, "\\$&");
        }
        function labelFor(element) {
          const aria = element.getAttribute("aria-label") || "";
          if (aria) return aria;
          if (element.id) {
            const explicit = document.querySelector(`label[for="${cssEscape(element.id)}"]`);
            if (explicit?.textContent) return explicit.textContent.trim();
          }
          const wrapping = element.closest("label");
          if (wrapping?.textContent) return wrapping.textContent.trim();
          return "";
        }
        function selectorForElement(element) {
          if (element.id) return `#${cssEscape(element.id)}`;
          const name = element.getAttribute("name");
          const tag = element.tagName.toLowerCase();
          if (name) return `${tag}[name="${String(name).replace(/"/g, '\\"')}"]`;
          const placeholder = element.getAttribute("placeholder");
          if (placeholder) return `${tag}[placeholder="${String(placeholder).replace(/"/g, '\\"')}"]`;
          return tag;
        }
        return Array.from(document.querySelectorAll("input, textarea, select, [contenteditable='true']")).map((element) => {
          const style = window.getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          const tag = element.tagName.toLowerCase();
          const type = tag === "input" ? (element.getAttribute("type") || "text").toLowerCase() : tag;
          return {
            tag,
            type,
            name: element.getAttribute("name") || "",
            id: element.id || "",
            placeholder: element.getAttribute("placeholder") || "",
            label: labelFor(element),
            ariaLabel: element.getAttribute("aria-label") || "",
            text: element.textContent?.trim() || "",
            accept: element.getAttribute("accept") || "",
            selector: selectorForElement(element),
            visible: style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0,
            disabled: Boolean(element.disabled || element.getAttribute("aria-disabled") === "true"),
          };
        });
      });
      return sanitizeScannedControls(controls);
    },
    async stopBeforeSubmit(reason) {
      if (typeof page.waitForTimeout === "function") {
        await page.waitForTimeout(250);
      }
      return {
        stopped: true,
        reason,
      };
    },
  };
  return {
    status: "ready",
    driver,
    profile,
    safety: {
      requires_explicit_confirmation: true,
      headed_browser_only: true,
      no_password_bypass: true,
      no_captcha_bypass: true,
      stop_before_final_submit: true,
    },
  };
}

export async function createVisiblePublishBrowserDriver(options = {}) {
  const driverType = options.driverType || "playwright";
  if (driverType !== "playwright") {
    return {
      status: "unsupported_browser_driver",
      driver: null,
      driver_type: driverType,
      next_step: "Use the playwright driver type or add a new visible browser driver implementation.",
      safety: {
        requires_explicit_confirmation: true,
        headed_browser_only: true,
        no_password_bypass: true,
        no_captcha_bypass: true,
        stop_before_final_submit: true,
      },
    };
  }
  return createPlaywrightPublishDriver(options);
}
