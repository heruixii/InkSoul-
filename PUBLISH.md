# GitHub 发布指南

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
