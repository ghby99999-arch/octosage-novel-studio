import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("app chrome uses soft glass instead of hard rails and block buttons", async () => {
  const css = await readFile("pixso-react-ui/src/styles/OctoWorkspace.css", "utf8");
  const block = (selector) => {
    const match = css.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\{([\\s\\S]*?)\\n\\}`));
    assert.ok(match, `missing ${selector}`);
    return match[1];
  };
  const sidebar = block('.scroll-container[class*="octo-surface-"] .octo-sidebar');
  const statusbar = block('.scroll-container[class*="octo-surface-"] .octo-statusbar');
  const activeNav = block(".octo-nav-item.active");

  assert.match(sidebar, /background:[\s\S]*linear-gradient/);
  assert.doesNotMatch(sidebar, /1px 0 0 rgba/);
  assert.match(css, /\.scroll-container\[class\*="octo-surface-"\] \.octo-sidebar::after \{/);
  assert.match(statusbar, /position:\s*absolute/);
  assert.match(statusbar, /border-top:\s*0/);
  assert.match(statusbar, /border-radius:\s*999px/);
  assert.match(activeNav, /linear-gradient/);
  assert.match(css, /\.octo-nav-item\.active::before \{/);
});
