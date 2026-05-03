# 配置指南

## 环境变量配置

### 1. 复制环境变量模板
```bash
cp .env.example .env
```

### 2. 编辑 .env 文件
填入你的API密钥：
```env
DEEPSEEK_API_KEY=your_actual_api_key
DEEPSEEK_API_URL=https://api.deepseek.com/v1/chat/completions
PORT=3000
PANEL_PORT=3002
```

## 数据文件配置

首次运行时，系统会自动创建 `server/data/tavern.json`，请在管理面板中配置API密钥。

## 启动项目

### 启动主服务器
```bash
cd server
node index.js
```

### 启动管理面板服务器
```bash
node panel-server.js
```

### 访问管理面板
打开浏览器访问：http://localhost:3002

## 安全注意事项

- **不要**将 .env 文件提交到Git
- **不要**将包含真实API密钥的 tavern.json 提交到Git
- 定期更换API密钥
- 使用环境变量管理敏感信息
