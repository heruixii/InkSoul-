# GitHub 发布指南

## 最新版本: v1.1.2

### v1.1.2 更新内容
- **修复 GitHub Actions**：添加 `contents: write` 权限，替换弃用的 `create-release@v1` 为 `softprops/action-gh-release@v2`

### v1.1.1 更新内容
- **深度去专有化**：修复遗漏的蛊真人专有提示词（extract-novel-characters system prompt）
- **角色排名通用化**：移除转数体系评分，改为通用境界关键词检测
- **默认值清理**：story-framework-generator 移除东方长凡/二转初阶等硬编码默认值
- **工具脚本去专有**：character-corrector、apply-global-fix、fix-all-from-novel 清空硬编码修正规则
- **关键词通用化**：long-term-memory 移除蛊虫关键词，scheduled-diagnosis 清空默认配置
- **NPC生成修复**：generate-npc-cards 移除方源硬编码跳过，改为命令行参数
- **角色同步通用化**：sync-characters-with-novel 移除硬编码角色别名表

### v1.1.0 更新内容
- **多小说通用性增强**：类型检测从4种扩展到8种（仙侠/玄幻/奇幻/都市/科幻/武侠/历史/灵异）
- **术语库去专有化**：移除蛊真人专有术语，使用通用替代词
- **默认配置多样化**：新增玄幻斗气体系、奇幻魔法体系等默认实力系统
- **脚本通用化**：所有CLI脚本支持命令行参数指定小说文件
- **AI提示词优化**：角色提取提示词去除特定作品偏向
- **空值安全**：添加 null 检查防止脚本崩溃

## 发布前检查清单

### 1. 敏感信息清理

**已创建的保护文件：**
- ✅ `.gitignore` - 忽略敏感文件
- ✅ `.env.example` - 环境变量模板
- ✅ `SETUP.md` - 配置指南

**需要手动清理的敏感数据：**

#### 清理 server/data/tavern.json 中的API密钥
```bash
# 手动编辑 server/data/tavern.json
# 将 settings.apiKey 替换为空字符串或删除该字段
# 将 settings.apiUrl 替换为默认值或删除该字段
```

示例修改前：
```json
{
  "settings": {
    "apiUrl": "https://api.deepseek.com/v1/chat/completions",
    "apiKey": "sk-3c0835ceef7e46cb8c0a8f3a017d253f",
    "model": "deepseek-v4-flash"
  }
}
```

示例修改后：
```json
{
  "settings": {
    "apiUrl": "https://api.deepseek.com/v1/chat/completions",
    "apiKey": "",
    "model": "deepseek-v4-flash"
  }
}
```

#### 清理 server/data/tavern.json.bak
直接删除该文件：
```bash
rm server/data/tavern.json.bak
```

### 2. Git历史清理（如果已经提交过敏感数据）

如果之前已经提交过包含API密钥的文件，需要从Git历史中彻底删除：

```bash
# 方法1: 使用 git filter-branch
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch server/data/tavern.json" \
  --prune-empty --tag-name-filter cat -- --all

# 方法2: 使用 git filter-repo（推荐，需要先安装）
pip install git-filter-repo
git filter-repo --path server/data/tavern.json --invert-paths
```

清理后强制推送：
```bash
git push origin --force --all
```

### 3. 创建初始提交

```bash
git init
git add .
git commit -m "Initial commit"
```

### 4. 推送到GitHub

```bash
git remote add origin https://github.com/your-username/your-repo.git
git branch -M main
git push -u origin main
```

### 5. 验证发布

发布后检查：
- [ ] 仓库中没有 .env 文件
- [ ] 仓库中没有 server/data/tavern.json
- [ ] 仓库中没有 server/data/tavern.json.bak
- [ ] 代码中没有硬编码的API密钥

### 6. README更新

在 README.md 中添加配置说明：

```markdown
## 快速开始

### 环境配置

1. 复制环境变量模板：
```bash
cp .env.example .env
```

2. 编辑 `.env` 文件，填入你的API密钥

3. 启动服务器
```

## 安全最佳实践

1. **永远不要提交敏感信息到Git**
2. **使用环境变量管理密钥**
3. **定期轮换API密钥**
4. **使用私有仓库进行开发**
5. **定期审查提交历史**
