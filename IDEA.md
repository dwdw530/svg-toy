# SVG 在线编辑器（纯原生，可迁移）- 思路草案

目标：先把**可用的编辑器内核**做出来（稳定的模型/渲染/交互/导入导出），后续要迁移到 TypeScript / React 也不需要推倒重来。

## 1. 核心定位（主线）

- 产品形态：浏览器里的 **SVG 在线编辑器**
- 技术约束：**纯原生**（HTML/CSS/JS），但模块边界清晰，后续可替换为 TS/框架
- 资产来源：既支持自己画（基础图形），也支持 **批量导入 SVG**

## 2. 最小可用（MVP）范围

MVP 只解决 4 件事：

1) **文档模型**：画布状态 + 资产库 + 元素列表 + 选择集  
2) **渲染**：模型 → DOM（SVG）  
3) **交互**：选中 / 拖拽 / 平移 / 缩放 / 删除  
4) **导入导出**：批量导入 SVG → 资产库；导出当前画布为 SVG 文件

> 动画、组件库、复杂对齐/吸附、撤销重做、分组/图层等，都先不做（但会在数据结构里留“能长出来”的接口）。

## 3. 架构分层（保证可迁移）

建议按下面 4 个模块拆（都是纯 JS 文件，未来迁 TS/React 时模块还能复用）：

- `model/`：纯数据 + 纯函数（不碰 DOM）
  - `document`：当前编辑文档（viewBox、nodes、assets、selection…）
  - `commands`：对文档的操作（add/move/delete/import…）
- `render/`：把模型渲染到 SVG（DOM 更新）
  - `renderScene(document, rootSvgEl)`
  - `renderDefs(assets)`：把资产渲染到 `<defs>`
- `interaction/`：事件和状态机（pointer/keyboard/wheel）
  - tool 状态：`SelectTool / PanTool / DrawTool`
  - 命中测试：从事件目标或坐标找到 node
- `ui/`：面板、工具栏、资产列表、属性编辑器

规则：**模型是真相**，DOM 只是渲染结果；交互只产生“命令”，命令改模型，模型再渲染。

## 4. 数据模型（关键设计）

### 4.1 Document

```js
{
  version: 1,
  viewBox: { x, y, w, h },
  settings: {
    placementSize: 128,        // 新放置元素默认尺寸（可改）
    snapToGrid: false,
    gridSize: 8,
  },
  assets: {
    // assetId -> Asset
  },
  nodes: [
    // Node[]
  ],
  selection: {
    nodeIds: []
  }
}
```

### 4.2 Asset（导入来的 SVG）

导入一个 SVG 文件后，解析成 Asset，渲染进 `<defs><symbol/></defs>`：

```js
{
  id,
  name,
  viewBox: "0 0 24 24",
  innerMarkup,     // 仅包含 svg 内部可渲染内容（已清洗）
  meta: { sourceFileName }
}
```

### 4.3 Node（画布上的元素）

分两类即可：

- 基础图形：`rect/circle/text/path...`
- 资产实例：`use`（引用 asset 的 symbol）

```js
{
  id,
  type: "rect" | "circle" | "text" | "use",
  transform: { x, y, scaleX, scaleY, rotate },
  style: { fill, stroke, strokeWidth, opacity },
  data: { ... } // type-specific，例如 rect 的 w/h/rx，text 的 content，use 的 assetId
}
```

## 5. 渲染策略（导入资产可复用）

### 5.1 defs + symbol + use（推荐）

- 每个导入 SVG → `<symbol id="asset-xxx" viewBox="...">...innerMarkup...</symbol>`
- 画布上放置该资产 → `<use href="#asset-xxx" ... transform="...">`

好处：
- 资产只存一份，实例只存 transform/style，导出也更干净
- 未来做“图标库/组件库导出”非常自然（直接导出 symbol sprite）

## 6. 批量导入（安全 + 可控）

### 6.1 解析流程

1) 多文件选择（`<input type="file" multiple accept=".svg">`）  
2) 读取文本  
3) `DOMParser` 解析为 SVG DOM  
4) **清洗**（强制做，避免脚本注入）
5) 提取 `viewBox` / 内容节点，生成 Asset

### 6.2 清洗规则（MVP 级别）

- 移除：`<script>`、`<foreignObject>`、以及任何 `on*` 事件属性
- 禁止外链：移除 `href/xlink:href` 指向 `http/https/javascript:` 的情况
- 保留绘制相关：`path/rect/circle/line/polyline/polygon/g/defs/clipPath/mask/linearGradient/radialGradient/stop` 等

> MVP 不追求覆盖所有 SVG 特性，但要保证“导入不炸、导出可用、不会带脚本”。

## 7. 颜色策略（你的选择）

默认：**保留原色**。

同时提供按钮（两种粒度都行）：
- **当前资产**：一键把可替换的 `fill/stroke` 规范成 `currentColor`
- **全资产**：批量规范成 `currentColor`

注意点（先写清楚预期，避免误会）：
- `fill="none"` / `stroke="none"` 不能乱改
- 渐变/滤镜/多色图标：强转 `currentColor` 会丢信息，建议保留原色或提供“仅替换纯色”的策略

## 8. 尺寸策略（你的选择）

把“放置尺寸”做成设置项（`placementSize`），并提供几种放置模式：

- **保持原比例 + 适配 placementSize**（默认推荐）：按 asset.viewBox 计算缩放，让最长边=placementSize
- **保持原始 viewBox 1:1**：更偏“原样摆放”，适合素材本来就是统一规格
- **自定义缩放**：放上去后再通过属性面板改 scale

## 9. 资产怎么用（你问的“哪种更流行”）

更常见、更符合用户直觉的是：

- **资产库（列表/网格） → 点击/拖拽 → 放到画布**

原因：这是 Figma/Sketch/大多数图标管理器的典型模式，用户心智成本低。

但“平铺到画布”也很实用（用于快速检查导入质量/对齐/统一大小），所以我建议做成一个额外按钮：

- **“平铺预览”**：把当前选择的一批 asset 自动按网格铺到画布（可一键撤回，或铺到单独的 Preview 页）

## 10. 后续路线（从 MVP 长出来）

- M1：导入面板（资产库）、搜索、缩略图、拖拽放置、批量平铺预览
- M2：撤销/重做（command history）、对齐/吸附、分组、图层面板
- M3：动画（预设动画 + 时间轴/关键帧的最小版）
- M4：导出图标库（sprite / 单文件 / 组件生成）

---

如果你确认这套方向，我下一步会把代码按上述模块拆出来，并补齐：
- 批量导入 + 资产库 UI
- “保留原色 / 规范 currentColor” 两个按钮
- placementSize 设置 + 平铺预览按钮

