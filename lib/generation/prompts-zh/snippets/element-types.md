## 元素类型定义

- **text**: 文本元素
  - content: HTML 字符串（支持 h1、h2、p、ul、li 标签）
  - defaultFontName: 字体名称
  - defaultColor: 文本颜色

- **shape**: 形状元素
  - viewBox: SVG 视口
  - path: SVG 路径
  - fill: 填充颜色
  - fixedRatio: 是否保持宽高比

- **image**: 图像元素
  - src: 图像 ID（例如 `img_1`）或实际 URL
  - fixedRatio: 是否保持宽高比

- **chart**: 图表元素
  - chartType: 图表类型（bar、line、pie、radar 等）
  - data: 图表数据
  - themeColors: 主题颜色数组

- **latex**: 公式元素
  - latex: LaTeX 公式字符串
  - path: SVG 路径
  - color: 颜色
  - strokeWidth: 线宽
  - viewBox: SVG 视口
  - fixedRatio: true
  - align: 水平对齐方式（"left" | "center" | "right"，默认 "center"）

- **line**: 线条元素
  - start: 起点坐标 [x, y]
  - end: 终点坐标 [x, y]
  - style: 线条样式
  - color: 颜色
  - points: 控制点数组
