# Windows 本机 PostgreSQL / MinIO 自动启动

这份文档面向本机直接安装 PostgreSQL 与 MinIO 的开发环境，不依赖 Docker。

适用场景：

- PostgreSQL 通过 Scoop 安装在用户目录下
- MinIO 通过 Scoop 安装在当前用户环境中
- 项目使用 `.env.local` 中的 `postgres-object-storage` 配置
- 希望在登录 Windows 后自动拉起本地依赖

## 当前约定

项目当前本地配置示例：

```env
NEXT_PUBLIC_STORAGE_DRIVER=server
SERVER_STORAGE_BACKEND=postgres-object-storage
SERVER_STORAGE_AUTO_INITIALIZE=true
SERVER_STORAGE_DATABASE_URL=postgresql://openmaic:openmaic@127.0.0.1:5432/openmaic
OBJECT_STORAGE_ENDPOINT=http://127.0.0.1:9000
OBJECT_STORAGE_BUCKET=openmaic-storage
OBJECT_STORAGE_ACCESS_KEY_ID=openmaic
OBJECT_STORAGE_SECRET_ACCESS_KEY=openmaic123
OBJECT_STORAGE_FORCE_PATH_STYLE=true
OBJECT_STORAGE_KEY_PREFIX=openmaic
```

对应本机服务：

- PostgreSQL: `127.0.0.1:5432`
- MinIO API: `127.0.0.1:9000`
- MinIO Console: `127.0.0.1:9001`

## 自动启动方式

当前采用的是“当前用户登录后自动启动”，不是 Windows 系统服务。

原因：

- PostgreSQL 数据目录位于当前用户目录下
- 当前机器创建计划任务时被系统拒绝
- 用 `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` 更稳定，也不需要额外管理员权限

已配置的自启动项：

- `PostgreSQL17-Autostart`
- `MinIO-Autostart`

注册表位置：

```text
HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Run
```

## 启动脚本

自启动项实际调用以下脚本：

- [start-postgres.ps1](../../scripts/local/start-postgres.ps1)
- [start-minio.ps1](../../scripts/local/start-minio.ps1)

### PostgreSQL

脚本行为：

- 检查 `127.0.0.1:5432` 是否已可用
- 若未启动，则调用 `pg_ctl start`
- 日志写入 `%USERPROFILE%\scoop\persist\postgresql17\startup.log`

等价手动启动命令：

```powershell
$pgHome = Join-Path $env:USERPROFILE 'scoop\apps\postgresql17\current'
& (Join-Path $pgHome 'bin\pg_ctl.exe') start `
  -D (Join-Path $pgHome 'data') `
  -l (Join-Path $env:USERPROFILE 'scoop\persist\postgresql17\startup.log')
```

### MinIO

脚本行为：

- 检查 `9000/9001` 端口是否已在监听
- 若未启动，则以 `openmaic / openmaic123` 启动 MinIO
- 数据目录使用 `%USERPROFILE%\minio-data`

等价手动启动命令：

```powershell
$env:MINIO_ROOT_USER='openmaic'
$env:MINIO_ROOT_PASSWORD='openmaic123'
minio server (Join-Path $env:USERPROFILE 'minio-data') --console-address :9001
```

## 验证方法

登录后可以用以下命令快速确认服务状态：

```powershell
& (Join-Path $env:USERPROFILE 'scoop\apps\postgresql17\current\bin\pg_isready.exe') -h 127.0.0.1 -p 5432
Test-NetConnection 127.0.0.1 -Port 9000
Test-NetConnection 127.0.0.1 -Port 9001
```

预期结果：

- PostgreSQL 返回 `accepting connections`
- `9000` 与 `9001` 的 `TcpTestSucceeded` 为 `True`

也可以直接访问：

- MinIO API 健康检查：`http://127.0.0.1:9000/minio/health/live`
- MinIO Console：`http://127.0.0.1:9001`

## 查看当前自启动项

```powershell
reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "PostgreSQL17-Autostart"
reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "MinIO-Autostart"
```

## 取消自动启动

```powershell
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "PostgreSQL17-Autostart" /f
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "MinIO-Autostart" /f
```

## 故障排查

### 1. PostgreSQL 仍然连接失败

先检查端口与数据库实际连通性：

```powershell
& (Join-Path $env:USERPROFILE 'scoop\apps\postgresql17\current\bin\pg_isready.exe') -h 127.0.0.1 -p 5432
& (Join-Path $env:USERPROFILE 'scoop\apps\postgresql17\current\bin\psql.exe') "postgresql://openmaic:openmaic@127.0.0.1:5432/openmaic" -c "select current_database(), current_user;"
```

如果 `pg_isready` 无响应，优先查看：

- `%USERPROFILE%\scoop\persist\postgresql17\startup.log`
- `%USERPROFILE%\scoop\persist\postgresql17\data\postmaster.pid`

如果存在陈旧的 `postmaster.pid`，而进程实际并不存在，通常说明上次异常退出，需要清理后再重启。

### 2. MinIO 已启动但应用仍报对象存储错误

优先核对：

- `.env.local` 中的 `OBJECT_STORAGE_ENDPOINT`
- `OBJECT_STORAGE_ACCESS_KEY_ID`
- `OBJECT_STORAGE_SECRET_ACCESS_KEY`
- `OBJECT_STORAGE_BUCKET`

项目当前本地默认值与自启动脚本保持一致：

- Access Key: `openmaic`
- Secret Key: `openmaic123`
- Endpoint: `http://127.0.0.1:9000`

### 3. 想要“开机未登录前就启动”

当前方案不覆盖这个需求。

如果确实需要：

- 可以将 PostgreSQL 注册成 Windows 服务
- 或改为系统级计划任务

但这通常需要管理员权限，并且要额外处理用户目录权限，所以当前开发机优先保留“登录后自动启动”的方案。
