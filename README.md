# svg_project（SVG Playground）

一个**零依赖**的 SVG 小项目骨架：支持新增图形、选中/拖拽、画布平移缩放、批量导入 SVG 到资产库、放置资产实例、导出 SVG / Sprite。

## 运行

### 方式 A：Node（推荐）

要求：Node.js ≥ 18（你这边是 22.x，够用）。

```bash
cd svg_project
npm run dev
```

然后打开：`http://localhost:5173`

### 方式 B：Python

```bash
cd svg_project
python -m http.server 5173
```

然后打开：`http://localhost:5173`

## 操作

- 点击工具栏按钮新增：矩形 / 圆形 / 文字
- 点击图形选中，拖拽移动（多选时可整体拖拽）
- `Shift` / `Ctrl` / `Cmd` + 点击：多选 / 取消选中
- 左侧「资产库」：导入 SVG（批量）→ 点击资产 → 在画布空白处单击放置；支持搜索/重命名/从资产库移除
- “单色 currentColor / 全资产 currentColor”：把资产里可替换的纯色 `fill/stroke` 规范成 `currentColor`，做“可换主题单色图标库”更省事（渐变/多色会跳过）
- “清空资产库”：清空资产库列表，但不会删除画布上的实例（实例请选中后按 `Delete`）
- 鼠标滚轮：缩放画布
- `Shift` + 滚轮：缩放选中元素（矩形/圆/文字/导入的 SVG 实例；多选时按整体包围盒缩放）
- 按住空格 + 拖拽：平移画布
- `Ctrl` + `Z`：撤销；`Ctrl` + `Y`：重做
- `Delete`：删除选中图形
- “导出 SVG”：下载当前内容
- “导出 Sprite”：导出资产库的 `<symbol>` sprite（打开空白是正常的，用 `<use href=\"sprite.svg#symbolId\">` 引用）

## 目录结构

```
svg_project/
  index.html
  src/
    main.js
    model/
    render/
    interaction/
    styles.css
  scripts/
    dev.mjs
```
