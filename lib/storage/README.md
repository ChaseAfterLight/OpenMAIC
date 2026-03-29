# 可切换存储层

该模块用于为课堂持久化能力提供可切换的存储后端。

## 驱动选择

启动时会按以下环境变量顺序解析当前存储驱动：

1. `NEXT_PUBLIC_STORAGE_DRIVER`
2. `STORAGE_DRIVER`
3. `NEXT_PUBLIC_APP_STORAGE_DRIVER`
4. 默认回退：`indexeddb`

可选值：

- `indexeddb`
- `server`
- `hybrid`

## 开发环境示例

```powershell
$env:NEXT_PUBLIC_STORAGE_DRIVER='indexeddb'; pnpm dev
$env:NEXT_PUBLIC_STORAGE_DRIVER='hybrid'; pnpm dev
$env:NEXT_PUBLIC_STORAGE_DRIVER='server'; pnpm dev
```

## 生产环境示例

```powershell
$env:NEXT_PUBLIC_STORAGE_DRIVER='indexeddb'; pnpm build; pnpm start
$env:NEXT_PUBLIC_STORAGE_DRIVER='hybrid'; pnpm build; pnpm start
$env:NEXT_PUBLIC_STORAGE_DRIVER='server'; pnpm build; pnpm start
```

## 说明

- `indexeddb`：完全使用浏览器本地 IndexedDB。
- `server`：通过 `/api/storage` 读写服务端文件仓库，并在本地保留缓存用于恢复与回退。
- `hybrid`：先写本地，再异步同步到服务端；读取时优先本地，并在后台尝试与服务端对齐。

## 服务端落地

- 服务端课堂数据默认保存在 `data/storage/`。
- 课堂级记录会按 `stageId` 分目录保存：`stage/scenes/chat/playback/outlines/media`。
- 图片/PDF 等文件引用会单独保存在 `data/storage/images/`。

## Hybrid 同步状态

- `hybrid` 模式会记录课堂级最小同步状态：`synced`、`pending`、`failed`。
- 首页课堂卡片会展示“待同步”或“同步失败”标记。
- 运行日志会输出中文同步结果，便于定位失败路径。

## 当前限制

- `hybrid` 当前使用“课堂级整体同步”，还没有更细粒度的冲突合并。
- 当服务端与本地同时修改同一课堂时，当前版本不会自动做复杂冲突解决。
- 验证依赖本地已安装完整依赖；若 `vitest` / `playwright` 缺失，则只能执行手工验证。
