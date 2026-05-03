/**
 * 角色验证器
 * 验证角色设定是否符合小说世界观，避免混入其他小说主角设定
 */

const fs = require('fs');
const path = require('path');

class CharacterValidator {
  constructor() {
    this.metadataPath = path.join(__dirname, '../data/novels/_metadata.json');
    this.metadata = null;
  }

  /**
   * 加载小说元数据
   */
  loadMetadata() {
    if (this.metadata) {
      return this.metadata;
    }
    
    try {
      const data = fs.readFileSync(this.metadataPath, 'utf8');
      this.metadata = JSON.parse(data);
      return this.metadata;
    } catch (error) {
      console.error('[Character Validator] Failed to load metadata:', error);
      return null;
    }
  }

  /**
   * 获取小说的验证规则
   */
  getValidationRules(novelId) {
    const metadata = this.loadMetadata();
    if (!metadata || !metadata[novelId]) {
      return null;
    }
    
    return metadata[novelId].characterValidationRules || null;
  }

  /**
   * 验证角色背景
   */
  validateCharacterBackground(novelId, characterType, background) {
    const rules = this.getValidationRules(novelId);
    if (!rules) {
      return { valid: true, errors: [] };
    }

    const errors = [];
    const typeRules = rules[characterType];

    if (!typeRules) {
      return { valid: true, errors: [] };
    }

    // 检查禁止的模式
    if (typeRules.forbiddenBackgroundPatterns) {
      for (const pattern of typeRules.forbiddenBackgroundPatterns) {
        if (background.includes(pattern)) {
          errors.push(`背景包含禁止模式："${pattern}"，这混入了其他小说主角的设定`);
        }
      }
    }

    // 检查禁止的行为
    if (typeRules.forbiddenActions) {
      for (const action of typeRules.forbiddenActions) {
        if (background.includes(action)) {
          errors.push(`背景包含禁止行为："${action}"，这是原著主角的经典剧情`);
        }
      }
    }

    // 检查必需元素
    if (typeRules.requiredElements && typeRules.requiredElements.length > 0) {
      const hasRequiredElement = typeRules.requiredElements.some(element => 
        background.includes(element)
      );
      if (!hasRequiredElement) {
        errors.push(`背景缺少必需元素，必须包含以下之一：${typeRules.requiredElements.join('、')}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      description: typeRules.description
    };
  }

  /**
   * 验证角色完整信息
   */
  validateCharacter(novelId, character) {
    const { name, type, scenario: background } = character;
    
    if (!type) {
      return {
        valid: false,
        errors: ['缺少角色类型（original/canon）']
      };
    }

    if (!background) {
      return {
        valid: false,
        errors: ['缺少角色背景描述']
      };
    }

    const backgroundValidation = this.validateCharacterBackground(
      novelId,
      type,
      background
    );

    return backgroundValidation;
  }

  /**
   * 自动修正角色背景（可选）
   */
  suggestBackgroundCorrection(novelId, characterType, background) {
    const validation = this.validateCharacterBackground(novelId, characterType, background);
    
    if (validation.valid) {
      return null;
    }

    // 提供修正建议
    const suggestions = [];
    
    if (characterType === 'original') {
      suggestions.push('原创角色应该使用"穿越"、"魂穿"等设定，而不是"重生"');
      suggestions.push('避免使用原著主角的经典剧情（如"夺回家产"、"贩卖生机叶"）');
      suggestions.push('建议背景包含"天外之魔"、"魂穿"等元素');
    } else if (characterType === 'canon') {
      suggestions.push('原著角色不应添加"穿越"、"系统"等设定');
      suggestions.push('保持原著角色的原有背景和经历');
    }

    return {
      errors: validation.errors,
      suggestions
    };
  }
}

module.exports = new CharacterValidator();
