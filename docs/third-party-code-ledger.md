# 第三方代码吸收账册

用于记录章鱼吸收开源项目代码、结构或交互方案的来源和许可证。

## 记录规则

- 每次复制、改造、迁移第三方代码，都必须新增一条记录。
- MIT / Apache / BSD / ISC：保留 copyright 和 license notice。
- GPL / AGPL：可用于当前非盈利版本，但必须保留许可证来源；如果未来分发或提供在线服务，需要公开对应源码。
- 没有明确 LICENSE 的仓库：不复制代码，只记录产品观察。
- 写作规则、提示词、示例正文不整段复制，只记录方法论。

## 记录模板

```text
项目名：
仓库/来源：
许可证：
吸收类型：代码 / UI结构 / 数据模型 / 写作流程 / 仅观察
吸收文件或模块：
修改点：
进入章鱼的文件：
合规备注：
日期：
```

## 已记录项目

### GSAP

项目名：GSAP
仓库/来源：https://github.com/greensock/GSAP
许可证：Standard "no charge" license（详见官方许可证）
吸收类型：库依赖 / 自写封装
吸收文件或模块：未复制源码，通过 npm 依赖使用运行时库。
修改点：新增 `useGsapReveal` 和 `useGsapPulse` 两个章鱼自写 Hook，用于书籍卡片进入动效和门禁灯状态变化动效。
进入章鱼的文件：
- `pixso-react-ui/package.json`
- `pixso-react-ui/package-lock.json`
- `pixso-react-ui/src/components/ui/useGsapMotion.ts`
- `pixso-react-ui/src/views/novel/BookCard.tsx`
- `pixso-react-ui/src/views/novel/QualityPanels.tsx`
合规备注：未复制 GSAP 源码；如未来发布安装包，需保留依赖许可证信息。
日期：2026-05-28
