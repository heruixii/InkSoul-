/**
 * 启动前依赖检查脚本
 * 用于确保所有必需的依赖都已安装
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('=== 启动前依赖检查 ===\n');

// 必需的依赖列表
const REQUIRED_DEPS = [
  'express',
  'cors',
  'axios',
  'uuid',
  'node-cron'
];

// 检查单个依赖
function checkDependency(dep) {
  try {
    const output = execSync(`npm list ${dep}`, { 
      encoding: 'utf-8',
      stdio: 'pipe'
    });
    return output.includes(dep);
  } catch (error) {
    return false;
  }
}

// 检查配置文件
function checkConfigFile() {
  const configPath = path.join(__dirname, '../config/forbidden-words.json');
  if (fs.existsSync(configPath)) {
    console.log('✓ 配置文件存在: config/forbidden-words.json');
    return true;
  } else {
    console.log('✗ 配置文件缺失: config/forbidden-words.json');
    return false;
  }
}

// 检查目录
function checkDirectories() {
  const dirs = [
    '../characters',
    '../worldbook',
    '../logs'
  ];

  let allExist = true;
  for (const dir of dirs) {
    const dirPath = path.join(__dirname, dir);
    if (!fs.existsSync(dirPath)) {
      console.log(`⚠ 目录不存在: ${dir} (将自动创建)`);
      try {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(`✓ 已创建目录: ${dir}`);
      } catch (error) {
        console.log(`✗ 创建目录失败: ${dir}`);
        allExist = false;
      }
    } else {
      console.log(`✓ 目录存在: ${dir}`);
    }
  }
  return allExist;
}

// 主检查逻辑
let allPassed = true;

console.log('检查必需的依赖...\n');

for (const dep of REQUIRED_DEPS) {
  if (checkDependency(dep)) {
    console.log(`✓ ${dep} 已安装`);
  } else {
    console.log(`✗ ${dep} 未安装`);
    allPassed = false;
  }
}

console.log('\n检查配置文件...\n');
if (!checkConfigFile()) {
  allPassed = false;
}

console.log('\n检查目录结构...\n');
if (!checkDirectories()) {
  allPassed = false;
}

console.log('\n=== 检查结果 ===\n');

if (allPassed) {
  console.log('✓ 所有检查通过，可以启动服务器\n');
  console.log('运行: node server/index.js');
  process.exit(0);
} else {
  console.log('✗ 部分检查失败，请先解决上述问题\n');
  console.log('运行: npm install');
  process.exit(1);
}
