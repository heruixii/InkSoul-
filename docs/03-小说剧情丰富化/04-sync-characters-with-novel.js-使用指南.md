# sync-characters-with-novel.js 使用指南

## 功能描述

`sync-characters-with-novel.js` 用于将从小说中提取的角色属性同步到现有的角色卡中，支持智能合并、别名匹配、预览模式等功能。

## 核心特性

- **智能合并**: 合并提取的属性与现有角色卡
- **别名匹配**: 支持角色名别名匹配（如"方源"匹配"古月方源"）
- **字段同步**: 同步 realm、path、title、affiliation 等字段
- **标签合并**: 合并并去重标签
- **描述追加**: 智能追加描述信息
- **版本控制**: 自动递增版本号
- **预览模式**: --dry-run 模式查看变更而不实际修改
- **热更新**: 同步后触发热更新 API
- **详细日志**: 记录所有变更操作

## 前置要求

### 1. 完成数据提取

必须先运行 `enrich-story-from-novel.js` 完成数据提取：

```bash
npm run enrich-story-full
```

### 2. 角色属性缓存存在

确保 `data/character_attributes_cache.json` 已生成。

### 3. 角色卡目录存在

确保 `characters/` 目录存在且包含角色卡文件。

## 使用方法

### 预览模式（推荐首次使用）

```bash
npm run sync-characters:dry
```

或

```bash
node server/sync-characters-with-novel.js --dry-run
```

### 执行同步

```bash
npm run sync-characters
```

或

```bash
node server/sync-characters-with-novel.js
```

## 同步流程

### 1. 加载数据

```
=== Character Sync Script ===
DRY-RUN MODE - No changes will be saved

Loading character attributes cache...
Loaded 456 extracted characters
Loading character card files...
Found 133 character cards
```

### 2. 处理角色卡

```
Processing: 方源
  Updated: 3 changes
    - realm: "null" -> "一转"
    - path: "null" -> "智道"
    - version: 1 -> 2
  Skipped: No changes will be saved

Processing: 楚度
  Updated: 2 changes
    - realm: "八转" -> "八转蛊仙"
    - tags: merged (3 -> 5)
  Skipped: No changes will be saved

Processing: 韩立
  Skipped: isOriginal: true
```

### 3. 同步摘要

```
=== Sync Summary ===
Total character cards: 133
Skipped: 15
Updated: 85
Unchanged: 33
```

### 4. 详细变更报告

```
=== Updated Characters ===
方源:
  - realm: "null" -> "一转"
  - path: "null" -> "智道"
  - version: 1 -> 2
楚度:
  - realm: "八转" -> "八转蛊仙"
  - tags: merged (3 -> 5)
...
```

### 5. 触发热更新

```
Triggering hot update API...
Hot update triggered successfully
```

## 同步规则

### 跳过规则

以下情况会被跳过：

1. **原创角色**: `isOriginal: true` 的角色卡永不覆盖
2. **无匹配属性**: 提取数据中没有匹配的角色名或别名
3. **无变更**: 提取的属性与现有属性完全相同

### 字段同步规则

#### realm（境界）

- 如果提取的 realm 非空且与现有值不同，则更新
- 示例: `"null" -> "一转"`, `"八转" -> "八转蛊仙"`

#### path（道途）

- 如果提取的 path 非空且与现有值不同，则更新
- 示例: `"null" -> "智道"`, `"力道" -> "力道"`

#### title（称号）

- 如果提取的 title 非空且与现有值不同，则更新
- 示例: `"null" -> "北原霸仙"`

#### affiliation（势力）

- 如果提取的 affiliation 非空且与现有值不同，则更新
- 示例: `"null" -> "古月家族"`

#### tags（标签）

- 合并提取的 tags 和现有的 tags
- 去重处理
- 示例: `["NPC", "酒馆"] + ["情报"] -> ["NPC", "酒馆", "情报"]`

#### description（描述）

- 如果提取的描述更详细（长度 > 现有描述的 1.5 倍）
- 且不与现有描述冲突
- 则追加到现有描述后
- 示例: `"简短描述" -> "简短描述\n\n更详细的描述"`

#### version（版本）

- 每次同步自动递增
- 示例: `1 -> 2`

## 别名匹配

### 支持的别名

脚本内置了常见角色别名映射：

```javascript
const aliases = {
  '方源': ['古月方源'],
  '楚度': ['楚度'],
  '商心慈': ['商心慈'],
  '白凝冰': ['白凝冰'],
  '马鸿运': ['马鸿运'],
  '赵怜云': ['赵怜云'],
  '武庸': ['武庸'],
  '龙公': ['龙公'],
  '影无邪': ['影无邪']
};
```

### 匹配逻辑

1. **直接匹配**: 角色名完全相同（忽略大小写和空格）
2. **别名匹配**: 检查内置别名映射表
3. **包含匹配**: 一个角色名包含另一个（用于家族名）

## 输出文件

### 同步日志

**logs/character-sync.log**

记录所有同步操作的详细日志：

```
[2026-04-30T10:00:00.000Z] === Character Sync Script ===
[2026-04-30T10:00:00.001Z] DRY-RUN MODE - No changes will be saved
[2026-04-30T10:00:00.002Z] Loading character attributes cache...
[2026-04-30T10:00:00.003Z] Loaded 456 extracted characters
[2026-04-30T10:00:00.004Z] Loading character card files...
[2026-04-30T10:00:00.005Z] Found 133 character cards
[2026-04-30T10:00:00.006Z] Processing: 方源
[2026-04-30T10:00:00.007Z]   Updated: 3 changes
[2026-04-30T10:00:00.008Z]     - realm: "null" -> "一转"
...
```

### 角色卡文件

角色卡文件会直接更新，例如：

**characters/角色卡_方源.json**

```json
{
  "name": "方源",
  "realm": "一转",
  "path": "智道",
  "version": 2,
  ...
}
```

## 热更新 API

同步完成后，脚本会尝试触发热更新 API：

```
POST /api/characters/correct-from-novel
Content-Type: application/json

{
  "source": "sync-characters-with-novel"
}
```

### API 失败处理

如果 API 未运行或请求失败，脚本会继续执行：

```
Hot update failed (API might not be running): connect ECONNREFUSED
```

这不会影响角色卡的同步，仅影响故事引擎的热更新。

## 配置参数

在脚本中可调整以下参数：

```javascript
const CHARACTERS_DIR = path.join(__dirname, '../characters');
const CHARACTER_CACHE_FILE = path.join(__dirname, '../data/character_attributes_cache.json');
const SYNC_LOG_FILE = path.join(__dirname, '../logs/character-sync.log');
```

## 常见问题

### Q: 角色卡目录未找到

```
Error: Characters directory not found
```

**解决**: 确保 `characters/` 目录存在。

### Q: 属性缓存文件未找到

```
Error: Character cache file not found. Run enrich-story first.
```

**解决**: 先运行 `npm run enrich-story-full` 完成数据提取。

### Q: 预览模式和实际执行结果不同

**说明**: 预览模式仅显示将要进行的变更，不实际修改文件。实际执行可能会因文件锁定等原因略有不同。

### Q: 热更新失败

```
Hot update failed (API might not be running): connect ECONNREFUSED
```

**说明**: 这不影响角色卡同步，仅影响故事引擎的热更新。如需热更新，确保服务器正在运行。

## 最佳实践

### 1. 首次使用预览模式

```bash
npm run sync-characters:dry
```

仔细检查变更报告，确认无误后再执行实际同步。

### 2. 备份角色卡

同步前建议备份角色卡目录：

```bash
cp -r characters characters.backup
```

### 3. 分批同步

如果角色卡数量较多，可以分批同步以降低风险。

### 4. 审核日志

同步后查看日志文件，确认所有变更符合预期：

```bash
cat logs/character-sync.log
```

### 5. 验证结果

同步后运行验证脚本检查数据一致性：

```bash
npm run verify-story
```

## 注意事项

1. **原创角色保护**: `isOriginal: true` 的角色卡永不覆盖
2. **版本递增**: 每次同步都会递增版本号
3. **描述追加**: 描述信息是追加而非替换，保留原有内容
4. **API 依赖**: 热更新需要服务器运行，失败不影响同步
5. **日志记录**: 所有操作都会记录到日志文件

## 回滚操作

如果同步后需要回滚，使用备份的角色卡：

```bash
# 恢复备份
rm -rf characters
mv characters.backup characters
```

或使用版本控制系统（如 Git）回滚：

```bash
git checkout characters/
```

## 性能指标

- **同步速度**: 约 50-100 个角色卡/秒
- **总耗时**: 约 1-3 秒（133 个角色卡）
- **内存占用**: 约 10-20MB

## 下一步

同步完成后，建议：

1. 验证数据一致性
2. 测试故事引擎
3. 检查角色卡显示是否正常
