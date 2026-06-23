import { PixsoPageShell } from "@/views/PixsoAppShell";
import { OctoButton, OctoPanel } from "@/components/octo-ui";

const AuthForm = ({ mode }: { mode: "login" | "register" }) => (
  <PixsoPageShell active={mode === "login" ? "/login" : "/register"} title={mode === "login" ? "账号" : "注册"} meta="本地登录状态">
    <div className="octo-auth-layout">
      <OctoPanel
        className="octo-auth-card"
        eyebrow="LOCAL PROFILE"
        title={mode === "login" ? "登录状态" : "创建本地账号"}
        description="当前版本只保存本地创作昵称，用于桌面应用显示和后续商业账号接入。不会上传作品。"
      >
        <label className="octo-field">
          <span>创作昵称</span>
          <input name={mode === "login" ? "account" : "nickname"} placeholder="例如：主编 / 作者 / 老板" />
        </label>
        <div className="octo-modal-actions">
          <OctoButton type="button" variant="ghost" data-octo-action={mode === "login" ? "goRegister" : "goLogin"}>
            {mode === "login" ? "去注册" : "返回登录"}
          </OctoButton>
          <OctoButton type="button" variant="primary" glow data-octo-action={mode === "login" ? "loginLocal" : "registerLocal"}>
            {mode === "login" ? "保存登录状态" : "创建并进入"}
          </OctoButton>
        </div>
      </OctoPanel>
    </div>
  </PixsoPageShell>
);

export const LoginPage = () => <AuthForm mode="login" />;
export const RegisterPage = () => <AuthForm mode="register" />;
