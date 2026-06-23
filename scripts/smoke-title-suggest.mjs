import { serveLocal } from "../src/server.mjs";

const idea = "2016年重生回大学，主角本来是被裁员的程序员，为了养家送外卖，从校园外卖站点开始做本地生活平台";

const app = await serveLocal({ host: "127.0.0.1", port: 0 });
try {
  const response = await fetch(`${app.url}/api/title-suggest`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idea, genre: "都市", platform: "fanqie" }),
  });
  const payload = await response.json();
  console.log(JSON.stringify(payload, null, 2));
  const titles = Array.isArray(payload.titles) ? payload.titles : [];
  const ok = titles.length > 0 && titles.every((title) => /外卖|校园|程序员|软件|商业|2016/.test(title));
  if (!ok) {
    throw new Error(`title suggestions are not grounded in idea: ${titles.join(" / ")}`);
  }
} finally {
  await new Promise((resolve) => app.server.close(resolve));
}
