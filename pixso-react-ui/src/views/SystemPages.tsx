import {
  PixsoApiKeyState,
  PixsoModelRoute,
  PixsoPageShell,
} from "@/views/PixsoAppShell";
import { OctoButton, OctoPanel } from "@/components/octo-ui";
import { useEffect, useMemo, useState } from "react";

const providerLabels: Record<string, string> = {
  wenxin: "正文写作师",
  qwen: "严格审查员",
  deepseek: "结构规划师",
  kimi: "对话备选师",
  doubao: "对白润色师",
  openai: "创意导演",
  mock: "本地演示通道",
};

const coreApiKeys = ["DEEPSEEK_API_KEY", "QIANFAN_API_KEY", "DASHSCOPE_API_KEY"];

const providerSettings = [
  { id: "openai", title: "创意导演通道", key: "OPENAI_API_KEY", base: "OPENAI_BASE_URL", defaultBase: "默认接口地址", model: "gpt-5.1" },
  { id: "deepseek", title: "结构规划通道", key: "DEEPSEEK_API_KEY", base: "DEEPSEEK_BASE_URL", defaultBase: "默认接口地址", model: "deepseek-v4-flash" },
  { id: "doubao", title: "对白润色通道", key: "DOUBAO_API_KEY", base: "DOUBAO_BASE_URL", defaultBase: "默认接口地址", model: "doubao-seed-1-6" },
  { id: "wenxin", title: "正文写作通道", key: "QIANFAN_API_KEY", base: "QIANFAN_BASE_URL", defaultBase: "默认接口地址", model: "ernie-5.1" },
  { id: "qwen", title: "严格审查通道", key: "DASHSCOPE_API_KEY", base: "DASHSCOPE_BASE_URL", defaultBase: "默认接口地址", model: "qwen3.6-plus" },
  { id: "kimi", title: "对话备选通道", key: "MOONSHOT_API_KEY", base: "MOONSHOT_BASE_URL", defaultBase: "默认接口地址", model: "kimi-k2.6" },
];

const keyLabels: Record<string, string> = {
  DEEPSEEK_API_KEY: "结构规划通道",
  QIANFAN_API_KEY: "正文写作通道",
  DASHSCOPE_API_KEY: "严格审查通道",
};

const isBaseUrlKey = (name = "") => /BASE_URL$/.test(name);
const smokeStorageKey = "octosage:model-smoke-status";

type SmokeState = {
  state?: string;
  message?: string;
  updated_at?: string;
};

const readSmokeStatus = () => {
  try {
    return JSON.parse(localStorage.getItem(smokeStorageKey) || "{}") as Record<string, SmokeState>;
  } catch {
    return {};
  }
};

const loadKeys = async () => {
  const response = await fetch("/api/settings/api-keys");
  const payload = await response.json().catch(() => ({}));
  return (payload.keys || []) as PixsoApiKeyState[];
};

const loadRoutes = async () => {
  const response = await fetch("/api/model/routes");
  const payload = await response.json().catch(() => ({}));
  return (payload.routes || []) as PixsoModelRoute[];
};

const routeName = (route?: PixsoModelRoute["active"] | PixsoModelRoute["recommended"]) => {
  if (!route?.provider) return "未配置";
  return providerLabels[route.provider] || "智能通道";
};

const routeStatus = (route: PixsoModelRoute) => {
  if (route.configured) return "当前路由";
  if (route.degraded) return "降级可用";
  return "未配置";
};

const healthLabel = (status = "") => ({
  healthy: "已连接",
  slow: "可用但慢",
  degraded: "不稳定",
  unavailable: "不可用",
  unknown: "待验证",
}[status] || "待验证");

const healthClass = (status = "") => ({
  healthy: "ok",
  slow: "warn",
  degraded: "warn",
  unavailable: "danger",
  unknown: "muted",
}[status] || "muted");

const healthMeta = (route: PixsoModelRoute) => {
  const health = route.active_health || {};
  const latency = Number(health.last_latency_ms || 0);
  const latencyText = latency ? ` · ${Math.round(latency / 1000)}秒` : "";
  return `${healthLabel(health.status)}${latencyText}${health.reason ? ` · ${health.reason}` : ""}`;
};

const smokeLabel = (state = "") => ({
  ok: "已连接",
  checking: "连接中",
  fail: "连接失败",
  missing: "未配置",
  unknown: "待验证",
}[state] || "待验证");

export const SettingsPage = () => {
  const [keys, setKeys] = useState<PixsoApiKeyState[]>(window.__OCTOSAGE_API_KEYS__ || []);
  const [routes, setRoutes] = useState<PixsoModelRoute[]>([]);
  const [theme, setTheme] = useState(localStorage.getItem("octosage:workspace-theme") || "dark");
  const [smokeStatus, setSmokeStatus] = useState<Record<string, SmokeState>>(readSmokeStatus);

  useEffect(() => {
    let alive = true;
    const sync = () => Promise.all([loadKeys(), loadRoutes()]).then(([items, modelRoutes]) => {
      if (!alive) return;
      window.__OCTOSAGE_API_KEYS__ = items;
      setKeys(items);
      setRoutes(modelRoutes);
    }).catch(() => undefined);
    sync();
    window.addEventListener("octosage:api-keys", sync);
    const syncSmoke = () => setSmokeStatus(readSmokeStatus());
    window.addEventListener("octosage:model-smoke", syncSmoke);
    window.addEventListener("storage", syncSmoke);
    return () => {
      alive = false;
      window.removeEventListener("octosage:api-keys", sync);
      window.removeEventListener("octosage:model-smoke", syncSmoke);
      window.removeEventListener("storage", syncSmoke);
    };
  }, []);

  const keyByName = useMemo(() => Object.fromEntries(keys.map((item) => [item.name || "", item])), [keys]);
  const missingCoreKeys = useMemo(() => (
    coreApiKeys
      .map((name) => keyByName[name] || { name, configured: false })
      .filter((item) => !item.configured)
  ), [keyByName]);
  const degradedRoutes = routes.filter((route) => route.degraded);
  const visibleRoutes = routes.filter((route) => route.configured || route.degraded).slice(0, 8);
  const hiddenRouteCount = Math.max(0, routes.length - visibleRoutes.length);
  const configuredRouteCount = routes.filter((route) => route.configured).length;

  return (
    <PixsoPageShell active="/settings" title="系统配置" meta="智能通道 · 自动路由 · 外观">
      <div className="octo-settings-grid compact octo-spatial-scene">
        <OctoPanel
          className="octo-settings-block octo-settings-primary"
          eyebrow="SMART ROUTER"
          title="智能通道"
          description="保存后自动测试连接；失败会显示原因，并从写作路由里临时避开。"
        >
          {missingCoreKeys.length ? (
            <div className="octo-warning-banner compact">
              <strong>核心闭环还没配齐</strong>
              <span>缺少 {missingCoreKeys.map((item) => keyLabels[item.name || ""] || item.name).join("、")}，对应环节会自动降级。</span>
            </div>
          ) : (
            <div className="octo-success-banner compact">
              <strong>网文闭环已配齐</strong>
              <span>开书、章卡、正文、审稿、改稿和记忆会按当前健康状态自动选择合适通道。</span>
            </div>
          )}

          <div className="octo-provider-grid">
            {providerSettings.map((provider) => {
              const keyItem = keyByName[provider.key] || { name: provider.key, configured: false };
              const baseItem = keyByName[provider.base] || { name: provider.base, configured: false };
              const smoke = smokeStatus[provider.id] || {};
              const smokeState = keyItem.configured ? smoke.state || "unknown" : "missing";
              return (
                <details
                  className={`octo-provider-card ${keyItem.configured ? "ready" : ""} smoke-${smokeState}`}
                  key={provider.id}
                  data-octo-provider={provider.id}
                  data-octo-model={provider.model}
                >
                  <summary>
                    <div>
                      <strong>{provider.title}</strong>
                      <span>{keyItem.configured ? `已配置 ${keyItem.masked || ""}` : "未配置"}</span>
                    </div>
                    <em>{smokeLabel(smokeState)}</em>
                  </summary>
                  <div className="octo-provider-fields">
                    <p>{baseItem.configured ? "已使用自定义 Base URL。" : `默认地址：${provider.defaultBase}`}</p>
                    <div className={`octo-provider-status ${smokeState}`}>
                      <i aria-hidden="true" />
                      <span>
                        {smokeState === "missing"
                          ? "保存 API Key 后会自动连接。"
                          : smoke.message || "保存配置后自动连接，失败会在这里显示原因。"}
                      </span>
                    </div>
                    <div className="octo-provider-test-row">
                      <span>连接验证</span>
                      <OctoButton
                        type="button"
                        size="sm"
                        variant="ghost"
                        data-octo-action="modelSmoke"
                        data-octo-provider={provider.id}
                        data-octo-model={provider.model}
                        disabled={!keyItem.configured}
                      >
                        测试连接
                      </OctoButton>
                    </div>
                    {[keyItem, baseItem].map((item) => (
                      <div className="octo-api-row compact" key={item.name} data-api-key-name={item.name}>
                        <label>{isBaseUrlKey(item.name || "") ? "Base URL" : "API Key"}</label>
                        <input
                          data-api-key-input
                          type={isBaseUrlKey(item.name || "") ? "text" : "password"}
                          placeholder={isBaseUrlKey(item.name || "") ? "可选：自定义 Base URL" : "粘贴 API Key"}
                        />
                        <OctoButton type="button" size="sm" variant="secondary" data-octo-action="saveApiKey">{item.configured ? "保存" : "添加"}</OctoButton>
                      </div>
                    ))}
                  </div>
                </details>
              );
            })}
          </div>

          <div className="octo-route-note compact">
            章鱼会按环节自动选择已配置且健康的智能通道：开书、章卡、正文、审稿、改稿、记忆、拆书和漫剧分别路由。
          </div>

          <div className="octo-settings-summary-row">
            <span>自动路由</span>
            <strong>{configuredRouteCount}/{routes.length || 0} 个环节已有可用通道</strong>
            {degradedRoutes.length ? <em>{degradedRoutes.length} 个环节处于降级或待验证</em> : <em>无降级</em>}
          </div>

          <details className="octo-route-details">
            <summary>查看路由详情</summary>
            <div className="octo-model-route-list compact">
              {visibleRoutes.map((route) => (
                <div className={route.configured ? "octo-model-route ok" : route.degraded ? "octo-model-route warn" : "octo-model-route"} key={route.task_type || route.label}>
                  <span>{route.label || route.task_type}</span>
                  <strong>{routeName(route.active)}</strong>
                  <em className={`octo-health-chip ${healthClass(route.active_health?.status)}`}>{healthMeta(route) || routeStatus(route)}</em>
                  <small>首选：{routeName(route.recommended || undefined)}</small>
                  {route.skipped_unavailable?.length ? (
                    <small>
                      已避开：{route.skipped_unavailable.map((item) => providerLabels[item.provider || ""] || "异常通道").join("、")}
                    </small>
                  ) : null}
                </div>
              ))}
            </div>
          </details>

          {hiddenRouteCount ? <div className="octo-route-note compact">其余 {hiddenRouteCount} 个辅助路由已收起，运行时仍会自动调用。</div> : null}
          {degradedRoutes.length ? (
            <div className="octo-route-note compact warn">
            当前有 {degradedRoutes.length} 个环节降级或待验证：{degradedRoutes.slice(0, 4).map((route) => route.label || route.task_type).join("、")}。
            </div>
          ) : null}

          <div className="octo-inline-actions">
            <OctoButton type="button" size="sm" variant="secondary" data-octo-action="refreshSettings">刷新配置</OctoButton>
          </div>
        </OctoPanel>

        <aside className="octo-settings-side">
          <OctoPanel
            className="octo-settings-block octo-settings-compact-block"
            eyebrow="DISPLAY"
            title="外观"
            description="工作台显示"
          >
            <label className="octo-settings-row">
              <span>主题</span>
              <div className="octo-segment">
                {[
                  ["light", "亮色"],
                  ["warm", "暖白"],
                  ["mist", "浅灰"],
                  ["dark", "暗色"],
                ].map(([key, label]) => (
                  <OctoButton
                    type="button"
                    size="sm"
                    variant="ghost"
                    key={key}
                    className={theme === key ? "active" : ""}
                    onClick={() => {
                      setTheme(key);
                      window.OctoSageBridge?.setWorkspaceTheme?.(key);
                    }}
                  >
                    {label}
                  </OctoButton>
                ))}
              </div>
            </label>
          </OctoPanel>

          <OctoPanel
            className="octo-settings-block octo-settings-compact-block octo-diagnostics-block"
            eyebrow="DIAGNOSTICS"
            title="诊断"
            description="排查时使用"
          >
            <div className="octo-settings-mini-row">
              <span>版本</span>
              <strong>1.100.0</strong>
            </div>
            <div className="octo-settings-tool-actions">
              <OctoButton type="button" size="sm" variant="secondary" data-octo-action="exportDiagnostics">导出日志</OctoButton>
              <OctoButton type="button" size="sm" variant="ghost" data-octo-action="openChangelogDoc">更新记录</OctoButton>
            </div>
          </OctoPanel>
        </aside>
      </div>
    </PixsoPageShell>
  );
};
