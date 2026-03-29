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

- `server` 当前是骨架适配器，尚未实现时会抛出明确提示错误。
- `hybrid` 当前先委托到本地 IndexedDB，后续可在此处加入同步逻辑。
