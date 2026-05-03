# verify-story-data.js 使用指南

## 功能描述

`verify-story-data.js` 用于验证从小说中提取的数据的准确性，通过随机抽样、关键词匹配和上下文判断来检查角色、事件、锚点是否与原著一致。

## 核心特性

- **随机抽样验证**: 从每类数据中随机抽取 25 个样本
- **关键词匹配**: 在小说原文中搜索关键词
- **上下文判断**: 提取上下文进行人工审核
- **错误报告**: 列出验证失败的项目
- **自动纠错建议**: 生成纠错建议文件
- **自动纠错模式**: 支持调用同步脚本自动修复

## 前置要求

### 1. 完成数据提取

必须先运行 `enrich-story-from-novel.js` 完成数据提取：

```bash
npm run enrich-story-full
```

### 2. 生成文件存在

确保以下文件已生成：
- `data/story_framework.json`
- `data/timeline.json`
- `data/canon_anchors.json`
- `data/character_attributes_cache.json` (可选)

### 3. 小说文件存在

确保小说文件 `Gu Zhen Ren - Gu Zhen Ren.txt` 存在。

## 使用方法

### 基本验证

```bash
npm run verify-story
```

### 自动纠错模式

```bash
npm run verify-story:fix
```

此模式会调用 `sync-characters-with-novel.js` 进行自动修复。

### 直接运行脚本

```bash
# 仅验证
node server/verify-story-data.js

# 验证并自动纠错
node server/verify-story-data.js --fix
```

## 验证流程

### 1. 加载数据

```
=== Story Data Verification Script v2.0 ===

Reading novel...
Novel loaded: 14409866 characters

Loading data files...
Loaded story framework
Loaded timeline
Loaded canon anchors
Loaded character cache
```

### 2. 角色验证

```
=== Character Verification ===
Verifying 25 random characters out of 456 total

Character: 方源
  Found in novel: Yes
  Realm match: Yes
  Path match: Yes
  Context: ...方源...一转...智道...
Character: 楚度
  Found in novel: Yes
  Realm match: No
  Path match: Yes
  Issues: 境界 "八转" 在上下文中未找到
  Context: ...
```

### 3. 事件验证

```
=== Event Verification ===
Verifying 25 random events out of 892 total

Event: 方源重生
  Found in novel: Yes
  Description match: Yes
  Context: ...春秋蝉...五百年...
Event: 未知事件
  Found in novel: No
  Description match: No
  Issues: 事件描述在小说中未找到
  Context: ...
```

### 4. 锚点验证

```
=== Canon Anchor Verification ===
Verifying 25 random anchors out of 22 total

Anchor: 方源使用春秋蝉重生
  Found in novel: Yes
  Context: ...春秋蝉...重生...
Anchor: 方源最终成为尊者
  Found in novel: Yes
  Context: ...
```

### 5. 验证摘要

```
=== Verification Summary ===
Characters verified: 25/456
Characters found in novel: 23 (92%)
Realm matches: 20
Path matches: 22
Events verified: 25/892
Events found in novel: 22 (88%)
Event description matches: 20
Anchors verified: 25/22
Anchors found in novel: 20 (80%)
```

### 6. 错误报告

```
=== Error Report ===
Characters with issues: 2
Events with issues: 3
Anchors with issues: 5

Failed Characters:
  - 楚度: 境界 "八转" 在上下文中未找到
  - 白凝冰: 道途 "冰道" 在上下文中未找到

Failed Events:
  - 未知事件: 事件描述在小说中未找到
  - ...

Failed Anchors:
  - 方源最终成为尊者: 锚点事实在小说中未找到
  - ...
```

### 7. 生成纠错建议

```
=== Generating Correction Suggestions ===
Correction suggestions saved: data/correction_suggestions.json

=== Verification Complete ===
```

## 输出文件

### 纠错建议文件

**data/correction_suggestions.json**

```json
{
  "characters": [
    {
      "name": "楚度",
      "currentRealm": "八转",
      "currentPath": "智道",
      "issues": ["境界 \"八转\" 在上下文中未找到"],
      "suggestions": ["手动检查小说中该角色的境界描述"],
      "context": "..."
    }
  ],
  "events": [
    {
      "name": "未知事件",
      "currentDescription": "...",
      "issues": ["事件描述在小说中未找到"],
      "suggestions": ["确认事件是否真实存在于原著"],
      "context": "..."
    }
  ],
  "anchors": [
    {
      "fact": "方源最终成为尊者",
      "issues": ["锚点事实在小说中未找到"],
      "suggestions": ["确认锚点是否为原著设定或需要调整表述"],
      "context": "..."
    }
  ],
  "generatedAt": "2026-04-30T10:00:00.000Z"
}
```

## 验证逻辑

### 角色验证

1. **名称匹配**: 在小说中搜索角色名
2. **境界验证**: 在角色名上下文中搜索境界关键词
3. **道途验证**: 在角色名上下文中搜索道途关键词
4. **上下文提取**: 提取角色名前后 300 字符用于人工审核

### 事件验证

1. **描述匹配**: 在小说中搜索事件描述的前 20 字
2. **上下文验证**: 提取匹配位置前后 300 字符
3. **完整度检查**: 验证描述是否完整

### 锚点验证

1. **事实匹配**: 在小说中搜索锚点事实的前 15 字
2. **上下文验证**: 提取匹配位置前后 300 字符
3. **准确性检查**: 验证锚点是否为原著设定

## 配置参数

在脚本中可调整以下参数：

```javascript
const SAMPLE_SIZE = 25;           // 每类抽样数量
const CONTEXT_WINDOW = 300;       // 上下文窗口大小（字符）
```

## 常见问题

### Q: 数据文件未找到

```
Error: Story framework file not found. Run enrich-story first.
```

**解决**: 先运行 `npm run enrich-story-full` 完成数据提取。

### Q: 验证准确率低

```
Characters found in novel: 15 (60%)
```

**可能原因**:
- 提取质量不高
- 角色名不准确
- 小说版本不同

**解决**:
- 检查提取日志
- 手动审核错误报告
- 调整抽样大小

### Q: 自动纠错失败

```
Auto-fix would call sync-characters-with-novel.js
Run: node server/sync-characters-with-novel.js
```

**说明**: 自动纠错模式仅提示，需要手动运行同步脚本。

## 下一步

### 手动审核错误报告

查看 `data/correction_suggestions.json`，审核每个错误项：

1. 检查上下文是否正确
2. 确认提取值是否准确
3. 决定是否需要手动修正

### 运行同步脚本

如果需要自动修复：

```bash
# 预览同步
npm run sync-characters:dry

# 执行同步
npm run sync-characters
```

### 重新提取（可选）

如果错误率过高，考虑重新提取：

```bash
rm data/extraction_progress.json
npm run enrich-story-full
```

## 注意事项

1. **抽样代表性**: 随机抽样可能无法覆盖所有错误
2. **上下文窗口**: 300 字符可能不包含完整信息
3. **人工审核**: 建议人工审核错误报告
4. **版本差异**: 不同小说版本可能导致验证失败

## 性能指标

- **验证速度**: 约 1-2 秒/样本
- **总耗时**: 约 1-2 分钟（75 个样本）
- **内存占用**: 约 50-100MB（加载小说全文）

## 最佳实践

1. **定期验证**: 每次提取后都应运行验证
2. **保存报告**: 保存纠错建议文件用于后续分析
3. **逐步修复**: 根据错误报告逐步修复问题
4. **记录变更**: 记录手动修正的内容
