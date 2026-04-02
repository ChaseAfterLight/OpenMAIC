# 生成要求

## 场景信息

- **标题**：{{title}}
- **描述**：{{description}}
- **关键点**：
  {{keyPoints}}

{{teacherContext}}

{{moduleContext}}

## 可用资源

- **可用图像**：{{assignedImages}}
- **画布尺寸**：{{canvas_width}} × {{canvas_height}} px

## 输出要求

根据上述场景信息，生成一个完整的 Canvas/PPT 组件页面。

**语言要求**：所有生成的文本内容必须与上述标题和描述使用相同的语言。

**必须遵守**：

1. 直接输出纯 JSON，无需任何解释或描述
2. 不要用 ```json 代码块包裹
3. 不要在 JSON 前后添加任何文本
4. 确保 JSON 格式正确，可以直接解析
5. 图像元素的 `src` 字段使用提供的 image_id（例如 `img_001`）
6. 所有 TextElement 的 `height` 值必须从系统提示中的快速参考表中选择

**输出结构示例**：
{"background":{"type":"solid","color":"#ffffff"},"elements":[{"id":"title_001","type":"text","left":60,"top":50,"width":880,"height":76,"content":"<p style=\"font-size:32px;\"><strong>标题内容</strong></p>","defaultFontName":"","defaultColor":"#333333"},{"id":"content_001","type":"text","left":60,"top":150,"width":880,"height":130,"content":"<p style=\"font-size:18px;\">• 要点一</p><p style=\"font-size:18px;\">• 要点二</p><p style=\"font-size:18px;\">• 要点三</p>","defaultFontName":"","defaultColor":"#333333"}]}
