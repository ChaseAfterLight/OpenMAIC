## 动作类型定义

动作以 JSON 数组中的对象形式表示。每个对象有一个 `type` 字段。

### speech - 语音讲述

```json
{ "type": "text", "content": "讲述内容" }
```

### spotlight - 聚焦元素

```json
{
  "type": "action",
  "name": "spotlight",
  "params": { "elementId": "element_id" }
}
```

### laser - 激光笔

```json
{ "type": "action", "name": "laser", "params": { "elementId": "element_id" } }
```

### discussion - 互动讨论

```json
{
  "type": "action",
  "name": "discussion",
  "params": { "topic": "讨论话题", "prompt": "引导性提示" }
}
```
