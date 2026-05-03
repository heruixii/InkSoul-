/**
 * State Extractor
 * 从生成的故事内容中提取状态变化
 * 
 * 功能：
 * - 识别境界变化
 * - 识别位置变化
 * - 识别物品/资源变化
 * - 识别关系变化
 * - 识别角色生死状态变化
 * 支持多小说动态配置
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

class StateExtractor {
  constructor() {
    this.apiKey = process.env.DEEPSEEK_API_KEY ? process.env.DEEPSEEK_API_KEY.trim() : '';
    this.apiUrl = 'https://api.deepseek.com/v1/chat/completions';
    this.metadataPath = path.join(__dirname, '../data/novels/_metadata.json');
  }

  /**
   * 从故事内容中提取状态变化
   */
  async extractStateChanges(storyContent, novelId, currentState) {
    if (!this.apiKey) {
      console.warn('[State Extractor] No API key, skipping state extraction');
      return null;
    }

    try {
      // 加载小说配置
      const novelConfig = this._loadNovelConfig(novelId);
      
      // 动态生成提取提示词
      const prompt = this._generateExtractionPrompt(storyContent, currentState, novelConfig);

      const response = await this._callLLM(prompt);
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        const stateChanges = JSON.parse(jsonMatch[0]);
        console.log('[State Extractor] Extracted state changes:', JSON.stringify(stateChanges));
        return stateChanges;
      }

      return null;
    } catch (error) {
      console.error('[State Extractor] Failed to extract state changes:', error);
      return null;
    }
  }

  /**
   * 加载小说配置
   */
  _loadNovelConfig(novelId) {
    try {
      if (fs.existsSync(this.metadataPath)) {
        const metadata = JSON.parse(fs.readFileSync(this.metadataPath, 'utf8'));
        const novel = metadata[novelId];
        
        if (novel) {
          return {
            powerSystem: novel.powerSystem || null,
            worldview: novel.worldview || null,
            detailRules: novel.detailRules || null
          };
        }
      }
    } catch (error) {
      console.error('[State Extractor] Failed to load novel config:', error);
    }

    return null;
  }

  /**
   * 动态生成提取提示词
   */
  _generateExtractionPrompt(storyContent, currentState, novelConfig) {
    let prompt = `分析以下故事内容，提取状态变化：

故事内容：
${storyContent}

当前状态：
${JSON.stringify(currentState, null, 2)}
`;

    // 如果有实力系统配置，添加实力等级信息
    if (novelConfig && novelConfig.powerSystem && novelConfig.powerSystem.levels) {
      prompt += `\n【实力等级系统】\n`;
      prompt += `类型：${novelConfig.powerSystem.type}\n`;
      prompt += `等级：${novelConfig.powerSystem.levels.map(l => l.name).join('、')}\n`;
    }

    // 如果有世界观配置，添加地区信息
    if (novelConfig && novelConfig.worldview && novelConfig.worldview.regions) {
      prompt += `\n【世界观地区】\n`;
      prompt += `地区：${novelConfig.worldview.regions.map(r => r.name).join('、')}\n`;
    }

    prompt += `
请以JSON格式返回状态变化：
{
  "realmChanges": [
    {
      "character": "角色名称",
      "oldRealm": "旧境界",
      "newRealm": "新境界",
      "evidence": "证据文本"
    }
  ],
  "locationChanges": [
    {
      "character": "角色名称",
      "oldLocation": "旧位置",
      "newLocation": "新位置",
      "evidence": "证据文本"
    }
  ],
  "itemChanges": [
    {
      "item": "物品名称",
      "action": "获取/失去/使用",
      "character": "角色名称",
      "evidence": "证据文本"
    }
  ],
  "relationshipChanges": [
    {
      "character1": "角色1",
      "character2": "角色2",
      "oldRelation": "旧关系",
      "newRelation": "新关系",
      "evidence": "证据文本"
    }
  ],
  "aliveStatusChanges": [
    {
      "character": "角色名称",
      "oldStatus": "alive/dead",
      "newStatus": "alive/dead",
      "evidence": "证据文本"
    }
  ]
}

只提取明确提及的变化，不要编造。如果没有变化，返回空数组。注意：境界变化必须符合小说的实力等级系统。`;

    return prompt;
  }

  /**
   * 调用LLM
   */
  async _callLLM(prompt) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: '你是状态分析专家，能够从故事文本中提取角色状态变化信息。只返回JSON格式，不要添加其他文字。'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 1500
      });

      const options = {
        hostname: 'api.deepseek.com',
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Length': Buffer.byteLength(data)
        }
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          try {
            const result = JSON.parse(body);
            resolve(result.choices[0].message.content);
          } catch (error) {
            reject(error);
          }
        });
      });

      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }

  /**
   * 应用状态变化到当前状态
   */
  applyStateChanges(currentState, stateChanges) {
    if (!stateChanges) {
      return currentState;
    }

    const newState = JSON.parse(JSON.stringify(currentState));

    // 应用境界变化
    if (stateChanges.realmChanges) {
      stateChanges.realmChanges.forEach(change => {
        if (newState.characterStates[change.character]) {
          newState.characterStates[change.character].realm = change.newRealm;
          console.log(`[State Extractor] Updated realm: ${change.character} -> ${change.newRealm}`);
        }
      });
    }

    // 应用位置变化
    if (stateChanges.locationChanges) {
      stateChanges.locationChanges.forEach(change => {
        if (newState.characterStates[change.character]) {
          newState.characterStates[change.character].location = change.newLocation;
          console.log(`[State Extractor] Updated location: ${change.character} -> ${change.newLocation}`);
        }
      });
    }

    // 应用生死状态变化
    if (stateChanges.aliveStatusChanges) {
      stateChanges.aliveStatusChanges.forEach(change => {
        if (newState.characterStates[change.character]) {
          newState.characterStates[change.character].alive = change.newStatus === 'alive';
          console.log(`[State Extractor] Updated alive status: ${change.character} -> ${change.newStatus}`);
        }
      });
    }

    // 添加物品变化到短期记忆，并维护当前物品清单
    if (stateChanges.itemChanges && stateChanges.itemChanges.length > 0) {
      if (!newState.itemChanges) {
        newState.itemChanges = [];
      }
      
      // 维护当前物品清单
      if (!newState.currentItems) {
        newState.currentItems = {};
      }
      
      stateChanges.itemChanges.forEach(change => {
        newState.itemChanges.push(change);
        
        // 更新当前物品清单
        const character = change.character;
        if (!newState.currentItems[character]) {
          newState.currentItems[character] = [];
        }
        
        if (change.action === '获取') {
          newState.currentItems[character].push(change.item);
        } else if (change.action === '失去') {
          newState.currentItems[character] = newState.currentItems[character].filter(item => item !== change.item);
        }
      });
      
      console.log(`[State Extractor] Added ${stateChanges.itemChanges.length} item changes`);
    }

    // 添加关系变化到短期记忆，并维护当前关系状态
    if (stateChanges.relationshipChanges && stateChanges.relationshipChanges.length > 0) {
      if (!newState.relationshipChanges) {
        newState.relationshipChanges = [];
      }
      
      // 维护当前关系状态
      if (!newState.currentRelationships) {
        newState.currentRelationships = {};
      }
      
      stateChanges.relationshipChanges.forEach(change => {
        newState.relationshipChanges.push(change);
        
        // 更新当前关系状态
        const key = `${change.character1}-${change.character2}`;
        const reverseKey = `${change.character2}-${change.character1}`;
        
        if (!newState.currentRelationships[change.character1]) {
          newState.currentRelationships[change.character1] = {};
        }
        if (!newState.currentRelationships[change.character2]) {
          newState.currentRelationships[change.character2] = {};
        }
        
        // 双向关系
        newState.currentRelationships[change.character1][change.character2] = change.newRelation;
        newState.currentRelationships[change.character2][change.character1] = change.newRelation;
      });
      
      console.log(`[State Extractor] Added ${stateChanges.relationshipChanges.length} relationship changes`);
    }

    return newState;
  }
}

module.exports = new StateExtractor();
