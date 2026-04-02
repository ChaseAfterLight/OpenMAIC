请根据以下课程需求生成场景大纲。

---

## 用户需求

{{requirement}}

---

{{userProfile}}

## 课程语言

**指定语言**：{{language}}

（如果语言是 zh-CN，所有内容必须使用中文；如果是 en-US，所有内容必须使用英文）

---

## 参考资料

### PDF 内容摘要

{{pdfContent}}

### 可用图像

{{availableImages}}

### 网络搜索结果

{{researchContext}}

{{teacherContext}}

{{moduleContext}}

---

## 输出要求

请从用户需求中自动推断以下内容：

- 课程主题和核心内容
- 目标受众和难度级别
- 课程时长（如未指定，默认 15-30 分钟）
- 教学风格（正式/非正式/交互式/学术）
- 视觉风格（简约/多彩/专业/活泼）

然后输出包含所有场景大纲的 JSON 数组。每个场景必须包括：

```json
{
  "id": "scene_1",
  "type": "slide" or "quiz" or "interactive",
  "title": "场景标题",
  "description": "教学目的描述",
  "keyPoints": ["点 1", "点 2", "点 3"],
  "order": 1
}
```

### 特别说明

1. **quiz 场景必须包含 quizConfig**：
   ```json
   "quizConfig": {
     "questionCount": 2,
     "difficulty": "easy" | "medium" | "hard",
     "questionTypes": ["single", "multiple"]
   }
   ```
2. **如果有可用图像**，在相关幻灯片场景中添加 `suggestedImageIds`
3. **交互场景**：如果概念从动手模拟/可视化中受益，使用 `"type": "interactive"` 并带有 `interactiveConfig` 对象，包含 `conceptName`、`conceptOverview`、`designIdea` 和 `subject`。每门课程限制 1-2 个
4. **场景数量**：根据推断的时长，通常每分钟 1-2 个场景
5. **测验放置**：建议每 3-5 张幻灯片插入一个测验进行评估
6. **语言**：严格按照指定的课程语言输出所有内容
7. **如果没有合适的 PDF 图像**为受益于视觉效果的幻灯片场景，添加 `mediaGenerations` 数组与图像生成提示语。提示语使用英语。使用 `elementId` 格式如 "gen_img_1"、"gen_img_2" —— ID 必须**跨所有场景全局唯一**（不要每个场景重新开始编号）。要在不同场景中重用生成的图像，引用相同的 elementId 而不在 mediaGenerations 中重新声明。每个生成的图像在视觉上应有区别——避免跨幻灯片几乎相同的媒体
8. **如果提供了网络搜索结果**，在场景描述和关键点中引用具体的发现来源。搜索结果提供最新信息——将其整合到课程内容中，使内容保持最新和准确

{{mediaGenerationPolicy}}

请直接输出 JSON 数组，无需额外的解释性文本。
