const fields = {
  rootPath: document.querySelector("#rootPath"),
  projectPath: document.querySelector("#projectPath"),
  chapterNo: document.querySelector("#chapterNo"),
  outcome: document.querySelector("#outcome"),
  referenceName: document.querySelector("#referenceName"),
  referenceChapterNo: document.querySelector("#referenceChapterNo"),
};
const statusBox = document.querySelector("#status");

function showStatus(value) {
  statusBox.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

async function loadConfig() {
  chrome.storage.local.get({
    rootPath: "",
    projectPath: "",
    chapterNo: 1,
    outcome: "high_retention",
    referenceName: "benchmark-book",
    referenceChapterNo: 1,
  }, (config) => {
    fields.rootPath.value = config.rootPath || "";
    fields.projectPath.value = config.projectPath || "";
    fields.chapterNo.value = config.chapterNo || 1;
    fields.outcome.value = config.outcome || "high_retention";
    fields.referenceName.value = config.referenceName || "benchmark-book";
    fields.referenceChapterNo.value = config.referenceChapterNo || 1;
  });
}

async function saveConfig() {
  const config = {
    rootPath: fields.rootPath.value,
    projectPath: fields.projectPath.value,
    chapterNo: Number(fields.chapterNo.value || 1),
    outcome: fields.outcome.value || "high_retention",
    referenceName: fields.referenceName.value || "benchmark-book",
    referenceChapterNo: Number(fields.referenceChapterNo.value || 1),
  };
  chrome.storage.local.set(config, () => showStatus("saved"));
}

async function syncNow() {
  await saveConfig();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    showStatus("No active tab");
    return;
  }
  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => window.novelStudioSyncVisibleMetrics && window.novelStudioSyncVisibleMetrics(),
  });
  showStatus(result?.result || { status: "sync_failed" });
}

async function syncReferenceNow() {
  await saveConfig();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    showStatus("No active tab");
    return;
  }
  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => window.novelStudioSyncVisibleReferenceStructure && window.novelStudioSyncVisibleReferenceStructure(),
  });
  showStatus(result?.result || { status: "reference_sync_failed" });
}

document.querySelector("#saveConfig").addEventListener("click", saveConfig);
document.querySelector("#syncNow").addEventListener("click", syncNow);
document.querySelector("#syncReferenceNow").addEventListener("click", syncReferenceNow);
loadConfig();
