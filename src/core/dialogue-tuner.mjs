function cleanText(value = "") {
  return String(value || "").trim();
}

function characterName(anchor = {}) {
  return cleanText(anchor.name || anchor.character || anchor.id);
}

function samplesForCharacter(name, samples = [], maxSamples = 2) {
  const seen = new Set();
  const result = [];
  for (const sample of samples || []) {
    if (cleanText(sample?.name) !== name) continue;
    const line = cleanText(sample.line);
    if (!line || seen.has(line)) continue;
    seen.add(line);
    result.push(line);
    if (result.length >= maxSamples) break;
  }
  return result;
}

function voiceNotesForCharacter(name, samples = []) {
  const notes = new Set();
  for (const sample of samples || []) {
    if (cleanText(sample?.name) !== name) continue;
    const note = cleanText(sample.voice_note);
    if (note) notes.add(note);
  }
  return [...notes].slice(0, 3);
}

export function buildDialogueTuningGuide({
  characterAnchors = [],
  voiceSamples = [],
  maxCharacters = 6,
  maxSamplesPerCharacter = 2,
} = {}) {
  const characters = [];
  const seen = new Set();
  const pushCharacter = ({ name, anchor = "", signature_action = "", signature_line = "" } = {}) => {
    const cleanName = cleanText(name);
    if (!cleanName || seen.has(cleanName)) return;
    seen.add(cleanName);
    const reuseSamples = samplesForCharacter(cleanName, voiceSamples, maxSamplesPerCharacter);
    characters.push({
      name: cleanName,
      anchor: cleanText(anchor),
      signature_action: cleanText(signature_action),
      signature_line: cleanText(signature_line),
      voice_notes: voiceNotesForCharacter(cleanName, voiceSamples),
      reuse_samples: reuseSamples,
    });
  };
  for (const anchor of characterAnchors || []) {
    const name = characterName(anchor);
    pushCharacter({
      name,
      anchor: cleanText(anchor.anchor || `${anchor.surface || ""} ${anchor.core || ""}`),
      signature_action: cleanText(anchor.signature_action),
      signature_line: cleanText(anchor.signature_line),
    });
    if (characters.length >= maxCharacters) break;
  }
  for (const sample of voiceSamples || []) {
    pushCharacter({ name: sample?.name });
    if (characters.length >= maxCharacters) break;
  }

  const promptLines = [
    "对话打磨：只改台词、动作穿插和说话节奏，不改主线事件、章尾钩子和关键设定。",
    "全局规则：每句台词尽量不超过20个中文字符；每3句对话至少穿插1个可见动作；禁止解释性对白。",
    ...characters.map((item) => [
      `${item.name}: ${item.anchor}`,
      item.signature_action ? `标志动作：${item.signature_action}` : "",
      item.signature_line ? `标志口吻：${item.signature_line}` : "",
      item.voice_notes.length ? `口吻笔记：${item.voice_notes.join("；")}` : "",
      item.reuse_samples.length ? `可参考台词样本：${item.reuse_samples.join(" / ")}` : "",
    ].filter(Boolean).join("；")),
  ];

  return {
    preset_id: "dialogue-polish",
    label: "打磨对话",
    intent: "make_character_dialogue_distinct_and_scene_driven",
    global_rules: [
      "每句台词尽量不超过20个中文字符，长信息拆成动作加短句。",
      "每3句对话至少穿插1个可见动作、表情、物件或现场反馈。",
      "角色先按利益和身份说话，再透露情绪；不要让所有人用同一个口吻。",
      "台词必须推动冲突、订单、关系或信息差，不能只复述旁白。",
    ],
    forbidden: [
      "解释性对白",
      "作者替角色总结动机",
      "连续三句以上无动作对白",
      "把角色锚点写成标签说明",
    ],
    characters,
    prompt_brief: promptLines.filter(Boolean).join("\n"),
  };
}

export function dialogueTuningGuideForRewrite({ layer = {}, taskPackage = {}, context } = {}) {
  const sourceContext = context || taskPackage.context || {};
  const guide = buildDialogueTuningGuide({
    characterAnchors: sourceContext.character_anchors || [],
    voiceSamples: sourceContext.character_voice_samples || [],
  });
  return {
    ...layer,
    instruction: [
      layer.instruction || "只处理配角台词和标志行为。",
      "对话打磨：使用 dialogue_tuning 中的角色锚点、代表台词和全局规则；不要改主线事件。",
    ].join("\n"),
    dialogue_tuning: guide,
  };
}
