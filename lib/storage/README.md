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
- `server`：通过 `/api/storage` 读写服务端仓库，并在本地保留缓存用于恢复与回退。
- `hybrid`：先写本地，再异步同步到服务端；读取时优先本地，并在后台尝试与服务端对齐。

## 服务端落地

- `SERVER_STORAGE_BACKEND=file` 时，服务端继续使用 `data/storage/` 文件仓库。
- `SERVER_STORAGE_BACKEND=postgres-object-storage` 时：
  - 结构化数据进入 PostgreSQL：`classrooms`、`scenes`、`chat_sessions`、`playback_states`、`stage_outlines`
  - 大文件进入对象存储，数据库保存稳定对象 key 与元数据：`media_files`、`image_files`
  - `server` 与 `hybrid` 两种模式共用同一套服务端仓库实现，不改 `StorageAdapter` 调用面

## 对象存储 Key 约定

- 课堂媒体原文件：`{prefix}/stages/{base64url(stageId)}/media/{base64url(mediaId)}/original.{mime}`
- 课堂媒体封面：`{prefix}/stages/{base64url(stageId)}/media/{base64url(mediaId)}/poster.png`
- 图片/PDF 引用：`{prefix}/images/{base64url(imageId)}/{sanitized-filename}{ext}`

## 环境变量

- `SERVER_STORAGE_BACKEND`
  - `file`：保留旧文件仓库，作为回退路径
  - `postgres-object-storage`：启用 PostgreSQL + 对象存储
- `SERVER_STORAGE_DATABASE_URL`
- `SERVER_STORAGE_AUTO_INITIALIZE`
  - `true`：服务端启动时自动应用 `db/postgres-object-storage.sql` 并尝试创建 bucket
- `OBJECT_STORAGE_ENDPOINT`
- `OBJECT_STORAGE_REGION`
- `OBJECT_STORAGE_BUCKET`
- `OBJECT_STORAGE_ACCESS_KEY_ID`
- `OBJECT_STORAGE_SECRET_ACCESS_KEY`
- `OBJECT_STORAGE_FORCE_PATH_STYLE`
- `OBJECT_STORAGE_PUBLIC_BASE_URL`
- `OBJECT_STORAGE_KEY_PREFIX`

## 本地开发依赖

- `docker compose up -d postgres minio`
- PostgreSQL 默认连接串示例：`postgresql://openmaic:openmaic@127.0.0.1:5432/openmaic`
- MinIO 控制台默认地址：`http://127.0.0.1:9001`
- Windows 本机安装并配置自动启动时，可参考 [Windows 本机 PostgreSQL / MinIO 自动启动](./windows-local-services.md)
- 推荐本地 `.env.local`：

```powershell
$env:NEXT_PUBLIC_STORAGE_DRIVER='server'
$env:SERVER_STORAGE_BACKEND='postgres-object-storage'
$env:SERVER_STORAGE_AUTO_INITIALIZE='true'
$env:SERVER_STORAGE_DATABASE_URL='postgresql://openmaic:openmaic@127.0.0.1:5432/openmaic'
$env:OBJECT_STORAGE_ENDPOINT='http://127.0.0.1:9000'
$env:OBJECT_STORAGE_BUCKET='openmaic-storage'
$env:OBJECT_STORAGE_ACCESS_KEY_ID='openmaic'
$env:OBJECT_STORAGE_SECRET_ACCESS_KEY='openmaic123'
$env:OBJECT_STORAGE_FORCE_PATH_STYLE='true'
$env:OBJECT_STORAGE_KEY_PREFIX='openmaic'
pnpm dev
```

## Windows 本机自动启动

如果没有走 Docker，而是直接在 Windows 本机安装 PostgreSQL 与 MinIO，可以使用当前用户登录自启动方案。

- PostgreSQL 启动脚本：[start-postgres.ps1](../../scripts/local/start-postgres.ps1)
- MinIO 启动脚本：[start-minio.ps1](../../scripts/local/start-minio.ps1)
- 详细说明见：[Windows 本机 PostgreSQL / MinIO 自动启动](./windows-local-services.md)

## 迁移与回退

- 迁移脚本：`pnpm storage:migrate:postgres-object`
- 迁移校验：`pnpm storage:verify:postgres-object`
- 试跑但不落库：`pnpm storage:migrate:postgres-object -- --dry-run`
- 回退策略：
  - 保留 `data/storage/` 原始文件仓库，不在迁移后立即删除
  - 将 `SERVER_STORAGE_BACKEND` 切回 `file` 即可恢复旧服务端仓库
  - PostgreSQL / 对象存储写入失败时，数据库会记录 `storage_status` 与 `storage_error`，日志会输出中文告警

## 验证清单

- `server` 模式下保存课堂后，检查 PostgreSQL 的 `classrooms` / `scenes` / `chat_sessions` / `media_files`
- 通过对象存储控制台确认媒体与图片对象已写入对应 key 前缀
- 关闭页面后重新进入课堂，确认课堂、聊天、播放状态与 outlines 可恢复
- `hybrid` 模式下断开 PostgreSQL 或对象存储，确认首页仍显示“待同步 / 同步失败”且本地缓存可继续使用
- 重新恢复依赖后触发同步，确认失败状态可清除
- 执行迁移脚本后检查 `data/storage-migration/latest-migration-report.json`
- 执行校验脚本后检查 `data/storage-migration/latest-verification-report.json`

## Hybrid 同步状态

- `hybrid` 模式会记录课堂级最小同步状态：`synced`、`pending`、`failed`。
- 首页课堂卡片会展示“待同步”或“同步失败”标记。
- 运行日志会输出中文同步结果，便于定位失败路径。

## 当前限制

- `hybrid` 当前使用“课堂级整体同步”，还没有更细粒度的冲突合并。
- 当服务端与本地同时修改同一课堂时，当前版本不会自动做复杂冲突解决。
- 服务端当前默认依赖 S3 兼容接口，尚未细分供应商特性（R2/OSS/S3/MinIO 均走兼容层）。
- `SERVER_STORAGE_AUTO_INITIALIZE` 更适合本地开发；生产环境建议先显式应用 schema 再启服务。
- 验证依赖本地已安装完整依赖；若 `vitest` / `playwright` 缺失，则只能执行手工验证。
