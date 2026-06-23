import { ComicHome, ComicWorkbench } from "@/views/ComicPages";
import { NovelBookshelf, NovelWorkbench } from "@/views/NovelPages";
import { ReferenceCenterPage } from "@/views/ReferencePages";
import { LoginPage, RegisterPage } from "@/views/AuthPages";
import { SettingsPage } from "@/views/SystemPages";

export const routes = [
  // Primary routes
  {
    path: "/",
    component: NovelBookshelf,
    guid: "octo:home",
  },
  {
    path: "/novel/workbench",
    component: NovelWorkbench,
    guid: "octo:novel-workbench",
  },
  {
    path: "/comics",
    component: ComicHome,
    guid: "octo:comics",
  },
  {
    path: "/comic/workbench",
    component: ComicWorkbench,
    guid: "octo:comic-workbench",
  },
  {
    path: "/reference",
    component: ReferenceCenterPage,
    guid: "octo:reference",
  },
  {
    path: "/settings",
    component: SettingsPage,
    guid: "octo:settings",
  },
  {
    path: "/login",
    component: LoginPage,
    guid: "octo:login",
  },
  {
    path: "/register",
    component: RegisterPage,
    guid: "octo:register",
  },
  // Legacy redirects (keep for backward compat, remove in v2)
  { path: "/novels", component: NovelBookshelf, guid: "legacy:novels" },
  { path: "/write", component: NovelWorkbench, guid: "legacy:write" },
  { path: "/video", component: ComicWorkbench, guid: "legacy:video" },
  { path: "/dashboard", component: NovelBookshelf, guid: "legacy:dashboard" },
];

export const guidPathMap = new Map(routes.map((item) => [item.guid, item.path]));
export const pathGuidMap = new Map(routes.map((item) => [item.path, item.guid]));

export const getPathByGuid = (guid: string) => guidPathMap.get(guid) || "";
export const getGuidByPath = (path: string) => pathGuidMap.get(path) || "";
