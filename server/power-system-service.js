/**
 * Power System Service
 * 通用实力等级系统服务
 * 
 * 功能：
 * - 从小说元数据中读取实力系统配置
 * - 从小说元数据中读取写作风格配置
 * - 从小说元数据中读取世界观配置
 * - 从小说元数据中读取禁止概念配置
 * - 从小说元数据中读取细化规则配置
 * - 自动识别小说原著主角
 * - 自动识别小说世界观
 * - 自动识别禁止概念
 * - 自动识别细化规则
 * - 角色关系网络分析
 * - 时间线一致性检查
 * - 物品/资源追踪
 * - 势力/组织识别
 * - 实力成长轨迹分析
 * - 地理连续性验证
 * - 根据主角当前境界生成实力限制规则
 * - 根据小说类型生成写作风格指导
 * - 生成世界观合理性提示词
 * - 生成禁止概念提示词
 * - 生成细化规则提示词
 * - 支持不同类型的实力系统（修炼、战力、等级等）
 * - 支持不同类型的写作风格（仙侠、玄幻、奇幻等）
 */

const fs = require('fs');
const path = require('path');

class PowerSystemService {
  constructor() {
    this.metadataPath = path.join(__dirname, '../data/novels/_metadata.json');
    this.powerSystems = {};
    this.writingStyles = {};
    this.canonProtagonists = {};
    this.worldviews = {};
    this.forbiddenConcepts = {};
    this.detailRules = {};
    this.customTermLibraries = {}; // 用户自定义术语库
    this.characterRelationships = {}; // 角色关系网络
    this.timelineConsistency = {}; // 时间线一致性
    this.itemTracking = {}; // 物品/资源追踪
    this.factionRecognition = {}; // 势力/组织识别
    this.powerGrowthTrajectory = {}; // 实力成长轨迹
    this.geographicContinuity = {}; // 地理连续性
    this.loadPowerSystems();
    this.loadWritingStyles();
    this.loadCanonProtagonists();
    this.loadWorldviews();
    this.loadForbiddenConcepts();
    this.loadDetailRules();
    this.loadCustomTermLibraries();
  }

  /**
   * 加载所有小说的实力系统配置
   */
  loadPowerSystems() {
    try {
      if (!fs.existsSync(this.metadataPath)) {
        console.warn('[Power System] Metadata file not found');
        return;
      }

      const metadata = JSON.parse(fs.readFileSync(this.metadataPath, 'utf8'));
      
      for (const novelId in metadata) {
        const novel = metadata[novelId];
        if (novel.powerSystem) {
          this.powerSystems[novelId] = novel.powerSystem;
          console.log(`[Power System] Loaded power system for ${novel.name}`);
        }
      }
    } catch (error) {
      console.error('[Power System] Failed to load power systems:', error);
    }
  }

  /**
   * 加载所有小说的写作风格配置
   */
  loadWritingStyles() {
    try {
      if (!fs.existsSync(this.metadataPath)) {
        console.warn('[Writing Style] Metadata file not found');
        return;
      }

      const metadata = JSON.parse(fs.readFileSync(this.metadataPath, 'utf8'));
      
      for (const novelId in metadata) {
        const novel = metadata[novelId];
        if (novel.writingStyle) {
          this.writingStyles[novelId] = novel.writingStyle;
          console.log(`[Writing Style] Loaded writing style for ${novel.name}`);
        }
      }
    } catch (error) {
      console.error('[Writing Style] Failed to load writing styles:', error);
    }
  }

  /**
   * 加载所有小说的原著主角配置
   */
  loadCanonProtagonists() {
    try {
      if (!fs.existsSync(this.metadataPath)) {
        console.warn('[Canon Protagonist] Metadata file not found');
        return;
      }

      const metadata = JSON.parse(fs.readFileSync(this.metadataPath, 'utf8'));
      
      for (const novelId in metadata) {
        const novel = metadata[novelId];
        let protagonists = [];
        
        // 从配置中读取
        if (novel.canonProtagonist) {
          protagonists = Array.isArray(novel.canonProtagonist) 
            ? novel.canonProtagonist 
            : [novel.canonProtagonist];
        }
        
        // 如果没有配置，尝试自动识别
        if (protagonists.length === 0) {
          protagonists = this.autoDetectProtagonists(novelId);
        }
        
        if (protagonists.length > 0) {
          this.canonProtagonists[novelId] = protagonists;
          console.log(`[Canon Protagonist] Loaded ${protagonists.length} protagonists for ${novel.name}: ${protagonists.join(', ')}`);
        }
      }
    } catch (error) {
      console.error('[Canon Protagonist] Failed to load canon protagonists:', error);
    }
  }

  /**
   * 加载所有小说的世界观配置
   */
  loadWorldviews() {
    try {
      if (!fs.existsSync(this.metadataPath)) {
        console.warn('[Worldview] Metadata file not found');
        return;
      }

      const metadata = JSON.parse(fs.readFileSync(this.metadataPath, 'utf8'));
      
      for (const novelId in metadata) {
        const novel = metadata[novelId];
        
        // 如果没有配置，尝试自动识别
        if (!novel.worldview) {
          const autoWorldview = this.autoDetectWorldview(novelId);
          if (autoWorldview) {
            novel.worldview = autoWorldview;
            this.worldviews[novelId] = autoWorldview;
            console.log(`[Worldview] Auto-detected worldview for ${novel.name}`);
          }
        } else {
          this.worldviews[novelId] = novel.worldview;
          console.log(`[Worldview] Loaded worldview for ${novel.name}`);
        }
      }
      
      // 保存更新后的元数据
      fs.writeFileSync(this.metadataPath, JSON.stringify(metadata, null, 2));
    } catch (error) {
      console.error('[Worldview] Failed to load worldviews:', error);
    }
  }

  /**
   * 自动识别世界观
   */
  autoDetectWorldview(novelId) {
    try {
      const metadata = JSON.parse(fs.readFileSync(this.metadataPath, 'utf8'));
      const novel = metadata[novelId];
      
      if (!novel || !novel.filePath) {
        return null;
      }

      // 尝试从提取的数据中识别世界观
      const dataPath = path.join(__dirname, '../data/novels', novelId, 'enriched.json');
      
      if (!fs.existsSync(dataPath)) {
        console.log(`[Worldview] Enriched data not found for ${novel.name}`);
        return null;
      }

      const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      
      // 识别地区
      const regions = this.detectRegions(data);
      
      // 生成距离规则
      const distanceRules = this.generateDistanceRules(regions);
      
      // 生成合理性规则
      const plausibilityRules = this.generatePlausibilityRules();
      
      // 如果没有识别到任何地区，返回null
      if (regions.length === 0) {
        return null;
      }
      
      return {
        name: `${novel.name}自动识别世界观`,
        regions,
        distanceRules,
        plausibilityRules
      };
    } catch (error) {
      console.error('[Worldview] Failed to auto-detect worldview:', error);
      return null;
    }
  }

  /**
   * 识别地区
   */
  detectRegions(data) {
    const locationTerms = new Map();
    const locationContexts = new Map();
    
    // 从事件中提取地理位置术语
    if (data.events && Array.isArray(data.events)) {
      data.events.forEach(event => {
        if (event.description) {
          // 更精确的地名匹配模式
          const locationPatterns = this.extractLocationPatterns(event.description);
          locationPatterns.forEach(location => {
            if (locationTerms.has(location)) {
              locationTerms.set(location, locationTerms.get(location) + 1);
            } else {
              locationTerms.set(location, 1);
            }
            
            // 记录上下文
            if (!locationContexts.has(location)) {
              locationContexts.set(location, []);
            }
            locationContexts.get(location).push(event.description);
          });
        }
      });
    }
    
    // 从角色数据中提取地理位置术语
    if (data.characters && Array.isArray(data.characters)) {
      data.characters.forEach(char => {
        if (char.description) {
          const locationPatterns = this.extractLocationPatterns(char.description);
          locationPatterns.forEach(location => {
            if (locationTerms.has(location)) {
              locationTerms.set(location, locationTerms.get(location) + 1);
            } else {
              locationTerms.set(location, 1);
            }
            
            if (!locationContexts.has(location)) {
              locationContexts.set(location, []);
            }
            locationContexts.get(location).push(char.description);
          });
        }
      });
    }
    
    // 过滤低频地名，保留出现频率高的地区
    const filteredLocations = Array.from(locationTerms.entries())
      .filter(([_, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    
    // 生成地区配置
    const regions = filteredLocations.map(([name, count], index) => {
      const contexts = locationContexts.get(name) || [];
      const description = this.generateLocationDescription(name, contexts);
      
      return {
        id: `region_${index}`,
        name: name,
        description: description || `在小说中出现${count}次的重要地区`,
        frequency: count
      };
    });
    
    return regions;
  }

  /**
   * 提取地名模式（改进版 - 支持虚构地名）
   */
  extractLocationPatterns(text) {
    const patterns = [];
    
    // 1. 匹配常见的地名后缀（适用于虚构地名）
    const locationSuffixes = ['州', '原', '疆', '漠', '海', '域', '界', '地', '山', '城', '国', '岛', '湖', '河', '林', '谷', '峰', '崖', '洞', '窟', '宫', '殿', '宗', '门', '派', '阁', '楼', '塔', '寺', '庙', '庭', '界', '天', '地'];
    
    // 2. 匹配地名前缀（适用于虚构地名）
    const locationPrefixes = ['东', '西', '南', '北', '中', '上', '下', '前', '后', '内', '外', '古', '新', '大', '小', '神', '魔', '仙', '妖', '鬼', '灵', '玄', '幽', '冥', '天', '地'];
    
    // 3. 匹配完整地名（前缀+主体+后缀）
    locationPrefixes.forEach(prefix => {
      locationSuffixes.forEach(suffix => {
        const regex = new RegExp(`${prefix}[\\u4e00-\\u9fa5]{1,3}${suffix}`, 'g');
        const matches = text.match(regex) || [];
        patterns.push(...matches);
      });
    });
    
    // 4. 匹配主体+后缀（2-4字）
    locationSuffixes.forEach(suffix => {
      const regex = new RegExp(`[\\u4e00-\\u9fa5]{2,4}${suffix}`, 'g');
      const matches = text.match(regex) || [];
      patterns.push(...matches);
    });
    
    // 5. 匹配前缀+主体（2-4字）
    locationPrefixes.forEach(prefix => {
      const regex = new RegExp(`${prefix}[\\u4e00-\\u9fa5]{1,3}`, 'g');
      const matches = text.match(regex) || [];
      patterns.push(...matches);
    });
    
    // 6. 通过上下文识别地名（基于句子结构）
    const locationContexts = this.identifyLocationsByContext(text);
    patterns.push(...locationContexts);
    
    // 去重
    return [...new Set(patterns)];
  }

  /**
   * 通过上下文识别地名
   */
  identifyLocationsByContext(text) {
    const locations = [];
    
    // 常见的地名上下文模式
    const contextPatterns = [
      /前往([\u4e00-\u9fa5]{2,4})/g,  // 前往XX
      /抵达([\u4e00-\u9fa5]{2,4})/g,  // 抵达XX
      /来到([\u4e00-\u9fa5]{2,4})/g,  // 来到XX
      /离开([\u4e00-\u9fa5]{2,4})/g,  // 离开XX
      /([\u4e00-\u9fa5]{2,4})之境/g,   // XX之境
      /([\u4e00-\u9fa5]{2,4})之地/g,   // XX之地
      /([\u4e00-\u9fa5]{2,4})之中/g,   // XX之中
      /([\u4e00-\u9fa5]{2,4})之上/g,   // XX之上
      /([\u4e00-\u9fa5]{2,4})之下/g,   // XX之下
      /([\u4e00-\u9fa5]{2,4})界/g,     // XX界
      /([\u4e00-\u9fa5]{2,4})域/g,     // XX域
    ];
    
    contextPatterns.forEach(pattern => {
      const matches = text.match(pattern) || [];
      matches.forEach(match => {
        // 提取地名部分
        const location = match.replace(/前往|抵达|来到|离开|之境|之地|之中|之上|之下|界|域/g, '');
        if (location.length >= 2 && location.length <= 4) {
          locations.push(location);
        }
      });
    });
    
    return locations;
  }

  /**
   * 生成地区描述
   */
  generateLocationDescription(locationName, contexts) {
    if (!contexts || contexts.length === 0) {
      return null;
    }
    
    // 分析上下文，提取地区特征
    const features = [];
    
    contexts.forEach(context => {
      // 检测地区类型
      if (context.includes('城') || context.includes('都')) {
        features.push('城市');
      }
      if (context.includes('山') || context.includes('峰')) {
        features.push('山脉');
      }
      if (context.includes('海') || context.includes('湖') || context.includes('河')) {
        features.push('水域');
      }
      if (context.includes('宗') || context.includes('门') || context.includes('派')) {
        features.push('宗门驻地');
      }
      if (context.includes('原') || context.includes('荒') || context.includes('漠')) {
        features.push('荒野');
      }
    });
    
    if (features.length > 0) {
      const uniqueFeatures = [...new Set(features)];
      return `位于${uniqueFeatures.join('、')}地区`;
    }
    
    return null;
  }

  /**
   * 生成距离规则（改进版）
   */
  generateDistanceRules(regions) {
    const distanceRules = [];
    
    // 为每对地区生成距离规则
    for (let i = 0; i < regions.length; i++) {
      for (let j = i + 1; j < regions.length; j++) {
        const fromRegion = regions[i];
        const toRegion = regions[j];
        
        // 计算地理距离
        const distanceInfo = this.calculateGeographicDistance(fromRegion, toRegion);
        
        distanceRules.push({
          from: fromRegion.id,
          to: toRegion.id,
          distance: distanceInfo.distance,
          travelTime: distanceInfo.travelTime,
          difficulty: distanceInfo.difficulty,
          confidence: distanceInfo.confidence // 置信度
        });
      }
    }
    
    return distanceRules;
  }

  /**
   * 计算地理距离
   */
  calculateGeographicDistance(region1, region2) {
    const name1 = region1.name;
    const name2 = region2.name;
    
    // 1. 基于地名特征的距离推断
    const featureDistance = this.inferDistanceByFeatures(name1, name2);
    
    // 2. 基于频率的距离推断（出现频率高的地区可能更重要）
    const freqDistance = this.inferDistanceByFrequency(region1.frequency, region2.frequency);
    
    // 3. 综合推断
    const combinedDistance = this.combineDistanceInferences(featureDistance, freqDistance);
    
    return combinedDistance;
  }

  /**
   * 基于地名特征推断距离
   */
  inferDistanceByFeatures(name1, name2) {
    let distanceScore = 2; // 默认中等距离
    let travelTime = '数日';
    let difficulty = '中等';
    
    // 方向词分析
    const directions = ['东', '西', '南', '北', '中'];
    const dir1 = directions.find(d => name1.includes(d));
    const dir2 = directions.find(d => name2.includes(d));
    
    if (dir1 && dir2) {
      // 相反方向（东vs西，南vs北）
      if ((dir1 === '东' && dir2 === '西') || (dir1 === '西' && dir2 === '东') ||
          (dir1 === '南' && dir2 === '北') || (dir1 === '北' && dir2 === '南')) {
        distanceScore = 4;
        travelTime = '数月';
        difficulty = '极高';
      }
      // 相邻方向（东vs南，南vs西等）
      else if (dir1 !== dir2) {
        distanceScore = 3;
        travelTime = '数周';
        difficulty = '高';
      }
      // 相同方向
      else {
        distanceScore = 1;
        travelTime = '数日';
        difficulty = '低';
      }
    }
    
    // 地理特征分析
    const geographicFeatures = ['海', '漠', '山', '原', '疆'];
    const geo1 = geographicFeatures.find(f => name1.includes(f));
    const geo2 = geographicFeatures.find(f => name2.includes(f));
    
    if (geo1 && geo2) {
      // 不同的地理特征通常距离较远
      if (geo1 !== geo2) {
        distanceScore = Math.max(distanceScore, 3);
      }
    }
    
    // 转换为标准格式
    const distanceMap = {
      1: { distance: '近', travelTime: '数小时', difficulty: '低' },
      2: { distance: '中等', travelTime: '数日', difficulty: '中等' },
      3: { distance: '远', travelTime: '数周', difficulty: '高' },
      4: { distance: '极远', travelTime: '数月', difficulty: '极高' }
    };
    
    const result = distanceMap[distanceScore] || distanceMap[2];
    
    return {
      ...result,
      confidence: 0.7 // 基于特征的置信度
    };
  }

  /**
   * 基于频率推断距离
   */
  inferDistanceByFrequency(freq1, freq2) {
    // 出现频率相近的地区可能距离较近
    const freqDiff = Math.abs(freq1 - freq2);
    const maxFreq = Math.max(freq1, freq2);
    
    let distanceScore = 2;
    
    if (freqDiff < maxFreq * 0.3) {
      distanceScore = 1; // 频率相近，可能距离近
    } else if (freqDiff > maxFreq * 0.7) {
      distanceScore = 3; // 频率差异大，可能距离远
    }
    
    const distanceMap = {
      1: { distance: '近', travelTime: '数小时', difficulty: '低' },
      2: { distance: '中等', travelTime: '数日', difficulty: '中等' },
      3: { distance: '远', travelTime: '数周', difficulty: '高' }
    };
    
    return {
      ...distanceMap[distanceScore],
      confidence: 0.5 // 基于频率的置信度较低
    };
  }

  /**
   * 综合距离推断
   */
  combineDistanceInferences(featureDistance, freqDistance) {
    // 加权平均，特征推断权重更高
    const featureWeight = 0.7;
    const freqWeight = 0.3;
    
    const distanceScores = {
      '近': 1,
      '中等': 2,
      '远': 3,
      '极远': 4
    };
    
    const score1 = distanceScores[featureDistance.distance] || 2;
    const score2 = distanceScores[freqDistance.distance] || 2;
    
    const combinedScore = Math.round(score1 * featureWeight + score2 * freqWeight);
    
    const distanceMap = {
      1: { distance: '近', travelTime: '数小时', difficulty: '低' },
      2: { distance: '中等', travelTime: '数日', difficulty: '中等' },
      3: { distance: '远', travelTime: '数周', difficulty: '高' },
      4: { distance: '极远', travelTime: '数月', difficulty: '极高' }
    };
    
    const result = distanceMap[combinedScore] || distanceMap[2];
    
    return {
      ...result,
      confidence: Math.min(1, featureDistance.confidence + freqDistance.confidence * 0.5)
    };
  }

  /**
   * 生成合理性规则
   */
  generatePlausibilityRules() {
    return [
      '角色在不同地区之间移动需要合理的时间和理由',
      '低境界角色难以跨越极远距离',
      '没有特殊手段不能快速移动',
      '角色相遇需要合理的地理位置和时间安排',
      '跨区域事件需要考虑政治、势力、资源等因素',
      '战斗需要考虑地理位置对能力效果的影响'
    ];
  }

  /**
   * 加载所有小说的禁止概念配置
   */
  loadForbiddenConcepts() {
    try {
      if (!fs.existsSync(this.metadataPath)) {
        console.warn('[Forbidden Concepts] Metadata file not found');
        return;
      }

      const metadata = JSON.parse(fs.readFileSync(this.metadataPath, 'utf8'));
      
      for (const novelId in metadata) {
        const novel = metadata[novelId];
        
        // 如果没有配置，尝试自动识别
        if (!novel.forbiddenConcepts) {
          const autoConcepts = this.autoDetectForbiddenConcepts(novelId);
          if (autoConcepts) {
            novel.forbiddenConcepts = autoConcepts;
            this.forbiddenConcepts[novelId] = autoConcepts;
            console.log(`[Forbidden Concepts] Auto-detected forbidden concepts for ${novel.name}`);
          }
        } else {
          this.forbiddenConcepts[novelId] = novel.forbiddenConcepts;
          console.log(`[Forbidden Concepts] Loaded forbidden concepts for ${novel.name}`);
        }
      }
      
      // 保存更新后的元数据
      fs.writeFileSync(this.metadataPath, JSON.stringify(metadata, null, 2));
    } catch (error) {
      console.error('[Forbidden Concepts] Failed to load forbidden concepts:', error);
    }
  }

  /**
   * 自动识别禁止概念
   */
  autoDetectForbiddenConcepts(novelId) {
    try {
      const metadata = JSON.parse(fs.readFileSync(this.metadataPath, 'utf8'));
      const novel = metadata[novelId];
      
      if (!novel || !novel.filePath) {
        return null;
      }

      // 尝试从提取的数据中识别禁止概念
      const dataPath = path.join(__dirname, '../data/novels', novelId, 'enriched.json');
      
      if (!fs.existsSync(dataPath)) {
        console.log(`[Forbidden Concepts] Enriched data not found for ${novel.name}`);
        return null;
      }

      const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      
      // 分析小说文本，识别术语
      const novelTerms = this.extractNovelTerms(data);
      
      // 识别小说类型
      const novelType = this.detectNovelType(data);
      
      // 自动识别货币术语
      const currencyInfo = this.detectCurrencyTerms(novelTerms, data);
      
      // 自动识别修行术语（如丹田/空窍）
      const cultivationInfo = this.detectCultivationTerms(novelTerms, data, novelType);
      
      // 自动识别能量术语（如灵气/真气）
      const energyInfo = this.detectEnergyTerms(novelTerms, data, novelType);
      
      // 自动识别境界术语（如筑基/一转）
      const realmInfo = this.detectRealmTerms(novelTerms, data, novelType);
      
      // 对比常见术语，识别其他禁止概念
      const otherConcepts = this.detectForbiddenConceptsByComparison(novelTerms, novel.name, novelType);
      
      // 构建完整的禁止概念配置
      const forbiddenConcepts = {
        name: `${novel.name}自动识别禁止概念`,
        description: `通过对比术语库和上下文分析自动识别的禁止概念`,
        currency: currencyInfo,
        cultivation: cultivationInfo,
        energy: energyInfo,
        realm: realmInfo,
        concepts: otherConcepts ? otherConcepts.concepts : [],
        rules: [
          '严格遵循原著设定，不得引入其他小说的概念'
        ]
      };
      
      // 添加货币规则
      if (currencyInfo && currencyInfo.primary) {
        forbiddenConcepts.rules.push(`货币使用${currencyInfo.primary}，不是其他货币`);
      }
      
      // 添加修行规则
      if (cultivationInfo && cultivationInfo.primary) {
        forbiddenConcepts.rules.push(`修行使用${cultivationInfo.primary}，不是其他概念`);
      }
      
      // 添加能量规则
      if (energyInfo && energyInfo.primary) {
        forbiddenConcepts.rules.push(`能量使用${energyInfo.primary}，不是其他概念`);
      }
      
      // 添加境界规则
      if (realmInfo && realmInfo.primary) {
        forbiddenConcepts.rules.push(`境界使用${realmInfo.primary}，不是其他概念`);
      }
      
      if (forbiddenConcepts.concepts && forbiddenConcepts.concepts.length > 0) {
        console.log(`[Forbidden Concepts] Auto-detected ${forbiddenConcepts.concepts.length} forbidden concepts for ${novel.name} (type: ${novelType})`);
      }
      
      if (currencyInfo) {
        console.log(`[Forbidden Concepts] Auto-detected currency: ${currencyInfo.primary} for ${novel.name}`);
      }
      
      if (cultivationInfo) {
        console.log(`[Forbidden Concepts] Auto-detected cultivation: ${cultivationInfo.primary} for ${novel.name}`);
      }
      
      if (energyInfo) {
        console.log(`[Forbidden Concepts] Auto-detected energy: ${energyInfo.primary} for ${novel.name}`);
      }
      
      if (realmInfo) {
        console.log(`[Forbidden Concepts] Auto-detected realm: ${realmInfo.primary} for ${novel.name}`);
      }
      
      return forbiddenConcepts;
    } catch (error) {
      console.error('[Forbidden Concepts] Failed to auto-detect forbidden concepts:', error);
      return null;
    }
  }

  /**
   * 自动识别修行术语（如丹田/空窍）
   */
  detectCultivationTerms(novelTerms, data, novelType) {
    // 常见修行术语列表
    const commonCultivations = [
      '丹田', '空窍', '气海', '识海', '紫府', '金丹', '元婴', '化神', '洞府', '窍穴'
    ];
    
    // 在小说术语中查找修行术语
    const foundCultivations = novelTerms.filter(term => 
      commonCultivations.some(cultivation => term.includes(cultivation))
    );
    
    if (foundCultivations.length === 0) {
      // 根据小说类型返回默认配置
      if (novelType === 'xianxia') {
        return {
          primary: '丹田',
          forbidden: [
            { term: '空窍', reason: '传统仙侠使用丹田，不是空窍', alternative: '丹田' }
          ]
        };
      } else if (novelType === 'xuanhuan') {
        return {
          primary: '丹田',
          forbidden: [
            { term: '空窍', reason: '玄幻小说使用丹田，不是空窍', alternative: '丹田' }
          ]
        };
      }
      return null;
    }
    
    // 统计修行术语出现频率
    const cultivationFrequency = {};
    foundCultivations.forEach(cultivation => {
      cultivationFrequency[cultivation] = (cultivationFrequency[cultivation] || 0) + 1;
    });
    
    // 选择出现频率最高的修行术语作为主要术语
    const primaryCultivation = Object.entries(cultivationFrequency)
      .sort((a, b) => b[1] - a[1])[0][0];
    
    // 其他修行术语作为禁止使用的术语
    const forbiddenCultivations = commonCultivations.filter(
      cultivation => cultivation !== primaryCultivation
    ).map(cultivation => ({
      term: cultivation,
      reason: `本小说使用${primaryCultivation}，不是${cultivation}`,
      alternative: primaryCultivation
    }));
    
    return {
      primary: primaryCultivation,
      forbidden: forbiddenCultivations
    };
  }

  /**
   * 自动识别能量术语（如灵气/真气）
   */
  detectEnergyTerms(novelTerms, data, novelType) {
    // 常见能量术语列表
    const commonEnergies = [
      '灵气', '真气', '元气', '魔力', '法力', '斗气', '真元', '天地二气', '仙元', '魔气'
    ];
    
    // 在小说术语中查找能量术语
    const foundEnergies = novelTerms.filter(term => 
      commonEnergies.some(energy => term.includes(energy))
    );
    
    if (foundEnergies.length === 0) {
      // 根据小说类型返回默认配置
      if (novelType === 'xianxia') {
        return {
          primary: '灵气',
          forbidden: [
            { term: '真气', reason: '传统仙侠使用灵气，不是真气', alternative: '灵气' },
            { term: '斗气', reason: '传统仙侠使用灵气，不是斗气', alternative: '灵气' }
          ]
        };
      } else if (novelType === 'xuanhuan') {
        return {
          primary: '斗气',
          forbidden: [
            { term: '灵气', reason: '玄幻小说使用斗气，不是灵气', alternative: '斗气' }
          ]
        };
      } else if (novelType === 'qihuan') {
        return {
          primary: '魔力',
          forbidden: [
            { term: '灵气', reason: '奇幻小说使用魔力，不是灵气', alternative: '魔力' }
          ]
        };
      }
      return null;
    }
    
    // 统计能量术语出现频率
    const energyFrequency = {};
    foundEnergies.forEach(energy => {
      energyFrequency[energy] = (energyFrequency[energy] || 0) + 1;
    });
    
    // 选择出现频率最高的能量术语作为主要术语
    const primaryEnergy = Object.entries(energyFrequency)
      .sort((a, b) => b[1] - a[1])[0][0];
    
    // 其他能量术语作为禁止使用的术语
    const forbiddenEnergies = commonEnergies.filter(
      energy => energy !== primaryEnergy
    ).map(energy => ({
      term: energy,
      reason: `本小说使用${primaryEnergy}，不是${energy}`,
      alternative: primaryEnergy
    }));
    
    return {
      primary: primaryEnergy,
      forbidden: forbiddenEnergies
    };
  }

  /**
   * 自动识别境界术语（如筑基/一转）
   */
  detectRealmTerms(novelTerms, data, novelType) {
    // 常见境界术语列表
    const commonRealms = [
      '筑基', '金丹', '元婴', '化神', '炼气', '一转', '二转', '三转', '四转', '五转', 
      '六转', '七转', '八转', '九转', '斗皇', '斗宗', '斗尊', '斗圣', '斗帝'
    ];
    
    // 在小说术语中查找境界术语
    const foundRealms = novelTerms.filter(term => 
      commonRealms.some(realm => term.includes(realm))
    );
    
    if (foundRealms.length === 0) {
      // 根据小说类型返回默认配置
      if (novelType === 'xianxia') {
        return {
          primary: '筑基、金丹、元婴...',
          forbidden: [
            { term: '一转', reason: '传统仙侠使用筑基等境界，不是转数', alternative: '筑基' },
            { term: '斗皇', reason: '传统仙侠使用筑基等境界，不是斗皇', alternative: '筑基' }
          ]
        };
      } else if (novelType === 'xuanhuan') {
        return {
          primary: '斗皇、斗宗、斗尊...',
          forbidden: [
            { term: '筑基', reason: '玄幻小说使用斗皇等境界，不是筑基', alternative: '斗皇' }
          ]
        };
      }
      return null;
    }
    
    // 统计境界术语出现频率
    const realmFrequency = {};
    foundRealms.forEach(realm => {
      realmFrequency[realm] = (realmFrequency[realm] || 0) + 1;
    });
    
    // 选择出现频率最高的境界术语作为主要术语
    const primaryRealm = Object.entries(realmFrequency)
      .sort((a, b) => b[1] - a[1])[0][0];
    
    // 检测是否是转数体系（如一转、二转等）
    const isRotationSystem = ['一转', '二转', '三转', '四转', '五转', '六转', '七转', '八转', '九转'].includes(primaryRealm);
    if (isRotationSystem) {
      return {
        primary: '一转至九转',
        forbidden: [
          { term: '筑基', reason: '本小说使用转数体系，不是筑基', alternative: '一转' },
          { term: '金丹', reason: '本小说使用转数体系，不是金丹', alternative: '四转' },
          { term: '元婴', reason: '本小说使用转数体系，不是元婴', alternative: '七转' },
          { term: '化神', reason: '本小说使用转数体系，不是化神', alternative: '仙尊、魔尊' }
        ]
      };
    }
    
    // 其他境界术语作为禁止使用的术语
    const forbiddenRealms = commonRealms.filter(
      realm => realm !== primaryRealm
    ).map(realm => ({
      term: realm,
      reason: `本小说使用${primaryRealm}体系，不是${realm}`,
      alternative: primaryRealm
    }));
    
    return {
      primary: primaryRealm,
      forbidden: forbiddenRealms
    };
  }

  /**
   * 自动识别货币术语
   */
  detectCurrencyTerms(novelTerms, data) {
    // 常见货币术语列表
    const commonCurrencies = [
      '元石', '灵石', '金币', '银币', '铜钱', '银两', '铜板', '灵币', '仙石', '魔石'
    ];
    
    // 在小说术语中查找货币术语
    const foundCurrencies = novelTerms.filter(term => 
      commonCurrencies.some(currency => term.includes(currency))
    );
    
    if (foundCurrencies.length === 0) {
      // 如果没有找到任何货币术语，返回默认配置
      return {
        primary: '灵石',
        forbidden: [
          { term: '铜钱', reason: '修仙小说中使用灵石作为货币', alternative: '灵石' },
          { term: '银两', reason: '修仙小说中使用灵石作为货币', alternative: '灵石' },
          { term: '金币', reason: '修仙小说中使用灵石作为货币', alternative: '灵石' }
        ]
      };
    }
    
    // 统计货币术语出现频率
    const currencyFrequency = {};
    foundCurrencies.forEach(currency => {
      currencyFrequency[currency] = (currencyFrequency[currency] || 0) + 1;
    });
    
    // 选择出现频率最高的货币作为主要货币
    const primaryCurrency = Object.entries(currencyFrequency)
      .sort((a, b) => b[1] - a[1])[0][0];
    
    // 其他货币作为禁止使用的术语
    const forbiddenCurrencies = commonCurrencies.filter(
      currency => currency !== primaryCurrency
    ).map(currency => ({
      term: currency,
      reason: `本小说使用${primaryCurrency}作为货币，不是${currency}`,
      alternative: primaryCurrency
    }));
    
    return {
      primary: primaryCurrency,
      forbidden: forbiddenCurrencies
    };
  }

  /**
   * 识别小说类型
   */
  detectNovelType(data) {
    const typeScores = {
      xianxia: 0,
      xuanhuan: 0,
      qihuan: 0,
      urban: 0
    };
    
    // 仙侠特征词
    const xianxiaKeywords = ['蛊', '蛊师', '转境', '空窍', '道痕', '元气', '元石', '仙元石', '炼化', '蛊虫'];
    // 玄幻特征词
    const xuanhuanKeywords = ['斗气', '异火', '功法', '武技', '斗皇', '斗宗', '斗尊', '斗圣'];
    // 奇幻特征词
    const qihuanKeywords = ['魔法', '魔力', '法术', '法师', '战士', '骑士', '精灵', '矮人'];
    // 都市特征词
    const urbanKeywords = ['系统', '任务', '奖励', '积分', '商城', '抽奖', '都市', '现代'];
    
    // 从事件中统计特征词
    if (data.events && Array.isArray(data.events)) {
      data.events.forEach(event => {
        if (event.description) {
          const text = event.description;
          
          xianxiaKeywords.forEach(keyword => {
            if (text.includes(keyword)) typeScores.xianxia++;
          });
          
          xuanhuanKeywords.forEach(keyword => {
            if (text.includes(keyword)) typeScores.xuanhuan++;
          });
          
          qihuanKeywords.forEach(keyword => {
            if (text.includes(keyword)) typeScores.qihuan++;
          });
          
          urbanKeywords.forEach(keyword => {
            if (text.includes(keyword)) typeScores.urban++;
          });
        }
      });
    }
    
    // 找出得分最高的类型
    let maxScore = 0;
    let detectedType = 'xianxia'; // 默认仙侠
    
    for (const type in typeScores) {
      if (typeScores[type] > maxScore) {
        maxScore = typeScores[type];
        detectedType = type;
      }
    }
    
    console.log(`[Novel Type Detection] Detected type: ${detectedType} (scores: ${JSON.stringify(typeScores)})`);
    
    return detectedType;
  }

  /**
   * 提取小说中的术语
   */
  extractNovelTerms(data) {
    const termSet = new Set();
    
    // 从事件中提取术语
    if (data.events && Array.isArray(data.events)) {
      data.events.forEach(event => {
        if (event.description) {
          const terms = event.description.match(/[\u4e00-\u9fa5]{2,4}/g) || [];
          terms.forEach(term => termSet.add(term));
        }
      });
    }
    
    // 从角色数据中提取术语
    if (data.characters && Array.isArray(data.characters)) {
      data.characters.forEach(char => {
        if (char.description) {
          const terms = char.description.match(/[\u4e00-\u9fa5]{2,4}/g) || [];
          terms.forEach(term => termSet.add(term));
        }
      });
    }
    
    return Array.from(termSet);
  }

  /**
   * 通过对比识别禁止概念
   */
  detectForbiddenConceptsByComparison(novelTerms, novelName, novelType = 'xianxia') {
    // 根据小说类型获取相应的术语库
    const termLibrary = this.getTermLibrary(novelType);
    const commonTerms = termLibrary.commonTerms || [];
    
    // 识别小说中没有出现的常见术语
    const forbiddenConcepts = commonTerms.filter(item => {
      return !novelTerms.includes(item.term);
    });
    
    // 如果没有识别到禁止概念，返回null
    if (forbiddenConcepts.length === 0) {
      return null;
    }
    
    // 使用智能替代术语推荐
    const enhancedConcepts = forbiddenConcepts.map(concept => {
      const smartAlternatives = this.recommendAlternativeTerms(concept.term, novelTerms, novelType);
      return {
        ...concept,
        alternative: smartAlternatives.length > 0 ? smartAlternatives.join('、') : concept.alternative
      };
    });
    
    return {
      name: `${novelName}自动识别禁止概念`,
      description: `通过对比${termLibrary.name}和上下文分析自动识别的禁止概念`,
      concepts: enhancedConcepts,
      rules: [
        '严格遵循原著设定，不得引入其他小说的概念',
        `避免使用${termLibrary.name}的通用术语`,
        '使用原著特有的术语和设定',
        '如果需要描述类似概念，使用原著中的替代术语'
      ]
    };
  }

  /**
   * 智能推荐替代术语
   */
  recommendAlternativeTerms(forbiddenTerm, novelTerms, novelType) {
    const recommendations = [];
    
    // 1. 基于术语相似度的推荐
    const similarTerms = this.findSimilarTerms(forbiddenTerm, novelTerms);
    recommendations.push(...similarTerms);
    
    // 2. 基于上下文分析的推荐
    const contextRecommendations = this.analyzeContextForAlternatives(forbiddenTerm, novelTerms);
    recommendations.push(...contextRecommendations);
    
    // 3. 基于术语库的推荐
    const termLibrary = this.getTermLibrary(novelType);
    const libraryRecommendation = termLibrary.commonTerms.find(item => item.term === forbiddenTerm);
    if (libraryRecommendation) {
      recommendations.push(...libraryRecommendation.alternative.split('、'));
    }
    
    // 去重并返回
    return [...new Set(recommendations)].slice(0, 3);
  }

  /**
   * 查找相似术语
   */
  findSimilarTerms(term, novelTerms) {
    const similarTerms = [];
    
    // 简单的相似度算法：基于字符重叠
    novelTerms.forEach(novelTerm => {
      const similarity = this.calculateSimilarity(term, novelTerm);
      if (similarity > 0.5 && similarity < 1.0) { // 相似但不完全相同
        similarTerms.push(novelTerm);
      }
    });
    
    return similarTerms;
  }

  /**
   * 计算术语相似度
   */
  calculateSimilarity(term1, term2) {
    if (term1 === term2) return 1.0;
    
    const set1 = new Set(term1);
    const set2 = new Set(term2);
    
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    return intersection.size / union.size;
  }

  /**
   * 基于上下文分析推荐替代术语
   */
  analyzeContextForAlternatives(forbiddenTerm, novelTerms) {
    // 这里可以实现更复杂的上下文分析逻辑
    // 目前返回空数组，后续可以扩展
    return [];
  }

  /**
   * 加载用户自定义术语库
   */
  loadCustomTermLibraries() {
    try {
      const customLibrariesPath = path.join(__dirname, '../data/term-libraries');
      
      if (!fs.existsSync(customLibrariesPath)) {
        console.log('[Custom Term Libraries] No custom libraries directory found');
        return;
      }
      
      const files = fs.readdirSync(customLibrariesPath);
      
      files.forEach(file => {
        if (file.endsWith('.json')) {
          const libraryPath = path.join(customLibrariesPath, file);
          const libraryName = file.replace('.json', '');
          
          try {
            const library = JSON.parse(fs.readFileSync(libraryPath, 'utf8'));
            this.customTermLibraries[libraryName] = library;
            console.log(`[Custom Term Libraries] Loaded ${libraryName}`);
          } catch (error) {
            console.error(`[Custom Term Libraries] Failed to load ${libraryName}:`, error);
          }
        }
      });
    } catch (error) {
      console.error('[Custom Term Libraries] Failed to load custom libraries:', error);
    }
  }

  /**
   * 获取小说类型的术语库
   */
  getTermLibrary(novelType) {
    // 优先使用用户自定义术语库
    if (this.customTermLibraries[novelType]) {
      return this.customTermLibraries[novelType];
    }
    
    // 使用内置术语库
    return this.getBuiltInTermLibrary(novelType);
  }

  /**
   * 获取可用的术语库列表
   */
  getAvailableTermLibraries() {
    const libraries = {};
    
    // 添加内置术语库
    const builtInTypes = ['xianxia', 'xuanhuan', 'qihuan', 'urban'];
    builtInTypes.forEach(type => {
      libraries[type] = {
        name: this.getBuiltInTermLibrary(type).name,
        type: type,
        isCustom: false
      };
    });
    
    // 添加自定义术语库
    for (const libraryName in this.customTermLibraries) {
      libraries[libraryName] = {
        name: this.customTermLibraries[libraryName].name,
        type: this.customTermLibraries[libraryName].type,
        isCustom: true
      };
    }
    
    return libraries;
  }

  /**
   * 创建自定义术语库
   */
  createCustomTermLibrary(library) {
    try {
      const libraryName = library.name || library.type;
      
      if (!libraryName) {
        throw new Error('Library name or type is required');
      }
      
      // 确保术语库目录存在
      const customLibrariesPath = path.join(__dirname, '../data/term-libraries');
      if (!fs.existsSync(customLibrariesPath)) {
        fs.mkdirSync(customLibrariesPath, { recursive: true });
      }
      
      // 保存术语库
      const libraryPath = path.join(customLibrariesPath, `${libraryName}.json`);
      fs.writeFileSync(libraryPath, JSON.stringify(library, null, 2));
      
      // 重新加载术语库
      this.loadCustomTermLibraries();
      
      return this.customTermLibraries[libraryName];
    } catch (error) {
      console.error('Failed to create custom term library:', error);
      throw error;
    }
  }

  /**
   * 更新自定义术语库
   */
  updateCustomTermLibrary(libraryName, updates) {
    try {
      if (!this.customTermLibraries[libraryName]) {
        throw new Error(`Custom term library ${libraryName} not found`);
      }
      
      // 更新术语库
      Object.assign(this.customTermLibraries[libraryName], updates);
      
      // 保存更新后的术语库
      const customLibrariesPath = path.join(__dirname, '../data/term-libraries');
      const libraryPath = path.join(customLibrariesPath, `${libraryName}.json`);
      fs.writeFileSync(libraryPath, JSON.stringify(this.customTermLibraries[libraryName], null, 2));
      
      return this.customTermLibraries[libraryName];
    } catch (error) {
      console.error('Failed to update custom term library:', error);
      throw error;
    }
  }

  /**
   * 删除自定义术语库
   */
  deleteCustomTermLibrary(libraryName) {
    try {
      if (!this.customTermLibraries[libraryName]) {
        throw new Error(`Custom term library ${libraryName} not found`);
      }
      
      // 删除文件
      const customLibrariesPath = path.join(__dirname, '../data/term-libraries');
      const libraryPath = path.join(customLibrariesPath, `${libraryName}.json`);
      
      if (fs.existsSync(libraryPath)) {
        fs.unlinkSync(libraryPath);
      }
      
      // 从内存中删除
      delete this.customTermLibraries[libraryName];
      
      console.log(`[Custom Term Libraries] Deleted ${libraryName}`);
    } catch (error) {
      console.error('Failed to delete custom term library:', error);
      throw error;
    }
  }
  getBuiltInTermLibrary(novelType) {
    const libraries = {
      xianxia: {
        name: '仙侠小说术语库',
        type: 'xianxia',
        commonTerms: [
          { term: '丹田', reason: '传统仙侠术语', alternative: '窍穴、空窍、气海' },
          { term: '经脉', reason: '传统仙侠术语', alternative: '道痕、血肉、经络' },
          { term: '灵气', reason: '传统仙侠术语', alternative: '元气、天地二气、真气' },
          { term: '灵石', reason: '传统仙侠术语', alternative: '元石、仙元石、灵晶' },
          { term: '筑基', reason: '传统仙侠术语', alternative: '一转、初阶、入门' },
          { term: '金丹', reason: '传统仙侠术语', alternative: '四转、中阶、核心' },
          { term: '元婴', reason: '传统仙侠术语', alternative: '七转、高阶、灵魂' },
          { term: '化神', reason: '传统仙侠术语', alternative: '仙尊、魔尊、神境' },
          { term: '飞升', reason: '传统仙侠术语', alternative: '升仙、成仙、飞升' },
          { term: '洞府', reason: '传统仙侠术语', alternative: '蛊窟、洞天、居所' },
          { term: '法宝', reason: '传统仙侠术语', alternative: '蛊虫、蛊具、宝物' },
          { term: '符箓', reason: '传统仙侠术语', alternative: '符蛊、信蛊、符咒' },
          { term: '灵根', reason: '传统仙侠术语', alternative: '天赋蛊、资质蛊、天赋' },
          { term: '宗门', reason: '传统仙侠术语', alternative: '门派、势力、组织' },
          { term: '渡劫', reason: '传统仙侠术语', alternative: '天劫、雷劫、考验' },
          { term: '神识', reason: '传统仙侠术语', alternative: '感知、神念、意识' }
        ]
      },
      xuanhuan: {
        name: '玄幻小说术语库',
        type: 'xuanhuan',
        commonTerms: [
          { term: '斗气', reason: '玄幻小说常见术语', alternative: '灵力、魔力、能量' },
          { term: '异火', reason: '玄幻小说常见术语', alternative: '特殊火焰、本命火' },
          { term: '功法', reason: '玄幻小说常见术语', alternative: '修炼法、秘术' },
          { term: '武技', reason: '玄幻小说常见术语', alternative: '战斗技巧、招式' },
          { term: '斗皇', reason: '玄幻小说常见术语', alternative: '强者、高阶修士' },
          { term: '斗宗', reason: '玄幻小说常见术语', alternative: '宗师、顶尖强者' },
          { term: '斗尊', reason: '玄幻小说常见术语', alternative: '至尊、巅峰强者' }
        ]
      },
      qihuan: {
        name: '奇幻小说术语库',
        type: 'qihuan',
        commonTerms: [
          { term: '魔法', reason: '奇幻小说常见术语', alternative: '法术、异能' },
          { term: '魔力', reason: '奇幻小说常见术语', alternative: '法力、能量' },
          { term: '法术', reason: '奇幻小说常见术语', alternative: '魔法、技能' },
          { term: '法师', reason: '奇幻小说常见术语', alternative: '术士、魔法师' },
          { term: '战士', reason: '奇幻小说常见术语', alternative: '武者、骑士' }
        ]
      },
      urban: {
        name: '都市小说术语库',
        type: 'urban',
        commonTerms: [
          { term: '系统', reason: '都市系统文常见术语', alternative: '金手指、特殊能力' },
          { term: '任务', reason: '都市系统文常见术语', alternative: '目标、挑战' },
          { term: '奖励', reason: '都市系统文常见术语', alternative: '收获、回报' }
        ]
      }
    };
    
    return libraries[novelType] || libraries.xianxia; // 默认使用仙侠术语库
  }
  loadDetailRules() {
    try {
      if (!fs.existsSync(this.metadataPath)) {
        console.warn('[Detail Rules] Metadata file not found');
        return;
      }

      const metadata = JSON.parse(fs.readFileSync(this.metadataPath, 'utf8'));
      
      for (const novelId in metadata) {
        const novel = metadata[novelId];
        
        // 如果没有配置，尝试自动识别
        if (!novel.detailRules) {
          const autoRules = this.autoDetectDetailRules(novelId);
          if (autoRules) {
            novel.detailRules = autoRules;
            this.detailRules[novelId] = autoRules;
            console.log(`[Detail Rules] Auto-detected detail rules for ${novel.name}`);
          }
        } else {
          this.detailRules[novelId] = novel.detailRules;
          console.log(`[Detail Rules] Loaded detail rules for ${novel.name}`);
        }
      }
      
      // 保存更新后的元数据
      fs.writeFileSync(this.metadataPath, JSON.stringify(metadata, null, 2));
    } catch (error) {
      console.error('[Detail Rules] Failed to load detail rules:', error);
    }
  }

  /**
   * 自动识别细化规则
   */
  autoDetectDetailRules(novelId) {
    try {
      const metadata = JSON.parse(fs.readFileSync(this.metadataPath, 'utf8'));
      const novel = metadata[novelId];
      
      if (!novel || !novel.filePath) {
        return null;
      }

      // 尝试从提取的数据中识别细化规则
      const dataPath = path.join(__dirname, '../data/novels', novelId, 'enriched.json');
      
      if (!fs.existsSync(dataPath)) {
        console.log(`[Detail Rules] Enriched data not found for ${novel.name}`);
        return null;
      }

      const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      
      // 分析术语和上下文
      const termAnalysis = this.analyzeTerms(data);
      
      // 根据分析结果生成细化规则
      const detailRules = this.generateDetailRulesFromAnalysis(termAnalysis, novel.name);
      
      if (detailRules) {
        console.log(`[Detail Rules] Auto-generated ${detailRules.categories.length} categories for ${novel.name}`);
      }
      
      return detailRules;
    } catch (error) {
      console.error('[Detail Rules] Failed to auto-detect detail rules:', error);
      return null;
    }
  }

  /**
   * 分析术语和上下文
   */
  analyzeTerms(data) {
    const termContexts = {};
    const termFrequency = {};
    const termCooccurrence = {}; // 术语共现关系
    
    // 从事件中提取术语和上下文
    if (data.events && Array.isArray(data.events)) {
      data.events.forEach(event => {
        if (event.description) {
          const sentences = event.description.split(/[。！？，；]/);
          sentences.forEach(sentence => {
            // 提取可能的术语（2-4个字的词汇）
            const terms = sentence.match(/[\u4e00-\u9fa5]{2,4}/g) || [];
            const sentenceTerms = [];
            
            terms.forEach(term => {
              if (!termFrequency[term]) {
                termFrequency[term] = 0;
                termContexts[term] = [];
                termCooccurrence[term] = {};
              }
              termFrequency[term]++;
              termContexts[term].push(sentence.trim());
              sentenceTerms.push(term);
            });
            
            // 记录术语共现关系
            for (let i = 0; i < sentenceTerms.length; i++) {
              for (let j = i + 1; j < sentenceTerms.length; j++) {
                const term1 = sentenceTerms[i];
                const term2 = sentenceTerms[j];
                
                if (!termCooccurrence[term1][term2]) {
                  termCooccurrence[term1][term2] = 0;
                }
                termCooccurrence[term1][term2]++;
                
                if (!termCooccurrence[term2][term1]) {
                  termCooccurrence[term2][term1] = 0;
                }
                termCooccurrence[term2][term1]++;
              }
            }
          });
        }
      });
    }
    
    // 从角色数据中提取术语
    if (data.characters && Array.isArray(data.characters)) {
      data.characters.forEach(char => {
        if (char.description) {
          const sentences = char.description.split(/[。！？，；]/);
          sentences.forEach(sentence => {
            const terms = sentence.match(/[\u4e00-\u9fa5]{2,4}/g) || [];
            const sentenceTerms = [];
            
            terms.forEach(term => {
              if (!termFrequency[term]) {
                termFrequency[term] = 0;
                termContexts[term] = [];
                termCooccurrence[term] = {};
              }
              termFrequency[term]++;
              termContexts[term].push(sentence.trim());
              sentenceTerms.push(term);
            });
            
            // 记录术语共现关系
            for (let i = 0; i < sentenceTerms.length; i++) {
              for (let j = i + 1; j < sentenceTerms.length; j++) {
                const term1 = sentenceTerms[i];
                const term2 = sentenceTerms[j];
                
                if (!termCooccurrence[term1][term2]) {
                  termCooccurrence[term1][term2] = 0;
                }
                termCooccurrence[term1][term2]++;
                
                if (!termCooccurrence[term2][term1]) {
                  termCooccurrence[term2][term1] = 0;
                }
                termCooccurrence[term2][term1]++;
              }
            }
          });
        }
      });
    }
    
    // 过滤低频术语
    const filteredTerms = {};
    for (const term in termFrequency) {
      if (termFrequency[term] >= 3) {
        filteredTerms[term] = {
          frequency: termFrequency[term],
          contexts: termContexts[term].slice(0, 5), // 保留前5个上下文
          cooccurrence: termCooccurrence[term] // 术语共现关系
        };
      }
    }
    
    return filteredTerms;
  }

  /**
   * 根据分析结果生成细化规则
   */
  generateDetailRulesFromAnalysis(termAnalysis, novelName) {
    if (!termAnalysis || Object.keys(termAnalysis).length === 0) {
      return null;
    }
    
    const categories = [];
    
    // 根据术语特征和共现关系分类
    const storageTerms = [];
    const battleTerms = [];
    const cultivationTerms = [];
    const usageTerms = [];
    
    for (const term in termAnalysis) {
      const contexts = termAnalysis[term].contexts.join(' ');
      const cooccurrence = termAnalysis[term].cooccurrence || {};
      
      // 存储相关术语
      if (term.includes('窍') || term.includes('囊') || term.includes('袋') || contexts.includes('存') || contexts.includes('放')) {
        // 查找与该术语经常共现的其他术语
        const relatedTerms = Object.entries(cooccurrence)
          .filter(([_, count]) => count >= 2)
          .map(([relatedTerm, _]) => relatedTerm)
          .slice(0, 3);
        
        storageTerms.push({ 
          term, 
          contexts: termAnalysis[term].contexts,
          relatedTerms
        });
      }
      
      // 战斗相关术语
      if (term.includes('战') || term.includes('攻') || term.includes('防') || contexts.includes('战斗') || contexts.includes('攻击')) {
        const relatedTerms = Object.entries(cooccurrence)
          .filter(([_, count]) => count >= 2)
          .map(([relatedTerm, _]) => relatedTerm)
          .slice(0, 3);
        
        battleTerms.push({ 
          term, 
          contexts: termAnalysis[term].contexts,
          relatedTerms
        });
      }
      
      // 修炼相关术语
      if (term.includes('修') || term.includes('炼') || term.includes('转') || contexts.includes('修炼') || contexts.includes('炼化')) {
        const relatedTerms = Object.entries(cooccurrence)
          .filter(([_, count]) => count >= 2)
          .map(([relatedTerm, _]) => relatedTerm)
          .slice(0, 3);
        
        cultivationTerms.push({ 
          term, 
          contexts: termAnalysis[term].contexts,
          relatedTerms
        });
      }
      
      // 使用相关术语
      if (term.includes('用') || term.includes('催') || term.includes('使') || contexts.includes('使用') || contexts.includes('催动')) {
        const relatedTerms = Object.entries(cooccurrence)
          .filter(([_, count]) => count >= 2)
          .map(([relatedTerm, _]) => relatedTerm)
          .slice(0, 3);
        
        usageTerms.push({ 
          term, 
          contexts: termAnalysis[term].contexts,
          relatedTerms
        });
      }
    }
    
    // 生成存储规则（利用术语关系）
    if (storageTerms.length > 0) {
      const rules = storageTerms.map(item => {
        const relatedInfo = item.relatedTerms.length > 0 
          ? `，常与${item.relatedTerms.join('、')}等术语一起出现` 
          : '';
        return `${item.term}是用于存储的术语${relatedInfo}，具体使用方式需根据上下文判断`;
      });
      categories.push({
        category: '存储相关',
        rules: [...rules, '物品存储应遵循原著设定的存储方式']
      });
    }
    
    // 生成战斗规则（利用术语关系）
    if (battleTerms.length > 0) {
      const rules = battleTerms.map(item => {
        const relatedInfo = item.relatedTerms.length > 0 
          ? `，常与${item.relatedTerms.join('、')}等术语一起出现` 
          : '';
        return `${item.term}是战斗相关的术语${relatedInfo}`;
      });
      categories.push({
        category: '战斗相关',
        rules: [...rules, '战斗描写应遵循原著设定的战斗方式']
      });
    }
    
    // 生成修炼规则（利用术语关系）
    if (cultivationTerms.length > 0) {
      const rules = cultivationTerms.map(item => {
        const relatedInfo = item.relatedTerms.length > 0 
          ? `，常与${item.relatedTerms.join('、')}等术语一起出现` 
          : '';
        return `${item.term}是修炼相关的术语${relatedInfo}`;
      });
      categories.push({
        category: '修炼相关',
        rules: [...rules, '修炼描写应遵循原著设定的修炼方式']
      });
    }
    
    // 生成使用规则（利用术语关系）
    if (usageTerms.length > 0) {
      const rules = usageTerms.map(item => {
        const relatedInfo = item.relatedTerms.length > 0 
          ? `，常与${item.relatedTerms.join('、')}等术语一起出现` 
          : '';
        return `${item.term}是使用相关的术语${relatedInfo}`;
      });
      categories.push({
        category: '使用相关',
        rules: [...rules, '物品使用应遵循原著设定的使用方式']
      });
    }
    
    // 如果没有识别到任何分类，返回null
    if (categories.length === 0) {
      return null;
    }
    
    return {
      name: `${novelName}自动识别细化规则`,
      description: '通过文本分析和术语关系分析自动识别的细化规则',
      categories,
      generalRules: [
        '严格按照原著设定描述细节',
        '避免使用其他小说的通用设定',
        '保持细节的一致性和逻辑性',
        '细节描写要符合原著世界观'
      ]
    };
  }

  /**
   * 自动识别小说原著主角
   */
  autoDetectProtagonists(novelId) {
    try {
      const metadata = JSON.parse(fs.readFileSync(this.metadataPath, 'utf8'));
      const novel = metadata[novelId];
      
      if (!novel || !novel.filePath) {
        return [];
      }

      // 尝试从提取的数据中识别主角
      const dataPath = path.join(__dirname, '../data/novels', novelId, 'enriched.json');
      
      if (!fs.existsSync(dataPath)) {
        console.log(`[Canon Protagonist] Enriched data not found for ${novel.name}`);
        return [];
      }

      const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      
      // 统计角色出现频率
      const characterFrequency = {};
      
      // 从事件中统计
      if (data.events && Array.isArray(data.events)) {
        data.events.forEach(event => {
          if (event.characters && Array.isArray(event.characters)) {
            event.characters.forEach(char => {
              if (char && char.trim()) {
                characterFrequency[char] = (characterFrequency[char] || 0) + 1;
              }
            });
          }
        });
      }
      
      // 从角色数据中统计（如果存在）
      if (data.characters && Array.isArray(data.characters)) {
        data.characters.forEach(char => {
          if (char.name && char.name.trim()) {
            characterFrequency[char.name] = (characterFrequency[char.name] || 0) + 2; // 角色数据权重更高
          }
        });
      }
      
      // 按频率排序
      const sortedCharacters = Object.entries(characterFrequency)
        .sort((a, b) => b[1] - a[1])
        .map(entry => entry[0]);
      
      // 返回前3个角色作为主角
      const topCharacters = sortedCharacters.slice(0, 3);
      
      if (topCharacters.length > 0) {
        console.log(`[Canon Protagonist] Auto-detected ${topCharacters.length} protagonists for ${novel.name}: ${topCharacters.join(', ')}`);
        
        // 自动更新元数据
        novel.canonProtagonist = topCharacters;
        fs.writeFileSync(this.metadataPath, JSON.stringify(metadata, null, 2));
        
        return topCharacters;
      }
      
      return [];
    } catch (error) {
      console.error('[Canon Protagonist] Failed to auto-detect protagonists:', error);
      return [];
    }
  }

  /**
   * 获取小说的实力系统配置
   */
  getPowerSystem(novelId) {
    return this.powerSystems[novelId] || null;
  }

  /**
   * 获取小说的写作风格配置
   */
  getWritingStyle(novelId) {
    return this.writingStyles[novelId] || null;
  }

  /**
   * 获取小说的原著主角列表
   */
  getCanonProtagonists(novelId) {
    return this.canonProtagonists[novelId] || [];
  }

  /**
   * 获取小说的世界观配置
   */
  getWorldview(novelId) {
    return this.worldviews[novelId] || null;
  }

  /**
   * 获取小说的禁止概念配置
   */
  getForbiddenConcepts(novelId) {
    return this.forbiddenConcepts[novelId] || null;
  }

  /**
   * 获取小说的细化规则配置
   */
  getDetailRules(novelId) {
    return this.detailRules[novelId] || null;
  }

  /**
   * 生成世界观合理性提示词
   */
  generatePlausibilityPrompt(novelId) {
    const worldview = this.getWorldview(novelId);
    
    if (!worldview) {
      // 如果没有配置，返回默认合理性规则
      return this.getDefaultPlausibilityPrompt();
    }

    let prompt = `【世界观合理性】${worldview.name}\n`;
    
    // 添加地区信息
    if (worldview.regions && worldview.regions.length > 0) {
      prompt += `【地区】${worldview.regions.map(r => `${r.name}（${r.description}）`).join('、')}\n`;
    }
    
    // 添加距离规则
    if (worldview.distanceRules && worldview.distanceRules.length > 0) {
      prompt += `【距离规则】`;
      worldview.distanceRules.forEach(rule => {
        const fromRegion = worldview.regions.find(r => r.id === rule.from)?.name || rule.from;
        const toRegion = worldview.regions.find(r => r.id === rule.to)?.name || rule.to;
        prompt += `${fromRegion}到${toRegion}：${rule.distance}（${rule.travelTime}，难度${rule.difficulty}）、`;
      });
      prompt = prompt.slice(0, -1) + '\n';
    }
    
    // 添加合理性规则
    if (worldview.plausibilityRules && worldview.plausibilityRules.length > 0) {
      prompt += `【合理性要求】\n${worldview.plausibilityRules.map(rule => `- ${rule}`).join('\n')}`;
    }

    return prompt;
  }

  /**
   * 默认合理性提示词（当没有配置时使用）
   */
  getDefaultPlausibilityPrompt() {
    return `【世界观合理性】通用规则
【合理性要求】
- 角色在不同地点之间移动需要合理的时间和理由
- 低境界角色难以跨越极远距离
- 没有特殊手段不能快速移动
- 角色相遇需要合理的地理位置和时间安排
- 跨区域事件需要考虑政治、势力、资源等因素
- 战斗需要考虑地理位置对能力效果的影响`;
  }

  /**
   * 生成禁止概念提示词
   */
  generateForbiddenConceptsPrompt(novelId) {
    const forbiddenConcepts = this.getForbiddenConcepts(novelId);
    
    if (!forbiddenConcepts) {
      // 如果没有配置，返回空字符串
      return '';
    }

    let prompt = `【禁止概念】${forbiddenConcepts.name}（${forbiddenConcepts.description}）\n`;

    // 支持新的分类结构（currency, cultivation, energy, realm, concepts）
    const categories = ['currency', 'cultivation', 'energy', 'realm'];
    categories.forEach(category => {
      if (forbiddenConcepts[category]) {
        const config = forbiddenConcepts[category];
        if (config.primary) {
          prompt += `【${category === 'currency' ? '货币' : category === 'cultivation' ? '修行' : category === 'energy' ? '能量' : '境界'}】主要使用：${config.primary}\n`;
        }
        if (config.forbidden && config.forbidden.length > 0) {
          prompt += `【禁止使用的${category === 'currency' ? '货币' : category === 'cultivation' ? '修行' : category === 'energy' ? '能量' : '境界'}术语】`;
          config.forbidden.forEach(item => {
            prompt += `${item.term}（原因：${item.reason}，替代：${item.alternative}）、`;
          });
          prompt = prompt.slice(0, -1) + '\n';
        }
      }
    });

    // 兼容旧的 concepts 数组结构
    if (forbiddenConcepts.concepts && Array.isArray(forbiddenConcepts.concepts) && forbiddenConcepts.concepts.length > 0) {
      prompt += `【禁止使用的其他术语】`;
      forbiddenConcepts.concepts.forEach(concept => {
        prompt += `${concept.term}（原因：${concept.reason}，替代：${concept.alternative}）、`;
      });
      prompt = prompt.slice(0, -1) + '\n';
    }
    
    // 添加规则
    if (forbiddenConcepts.rules && forbiddenConcepts.rules.length > 0) {
      prompt += `【禁止概念规则】\n${forbiddenConcepts.rules.map(rule => `- ${rule}`).join('\n')}`;
    }
    
    return prompt;
  }

  /**
   * 通用数据加载函数
   */
  loadNovelData(novelId) {
    const enrichedPath = path.join(__dirname, '../data/novels', novelId, 'enriched.json');
    
    if (fs.existsSync(enrichedPath)) {
      return JSON.parse(fs.readFileSync(enrichedPath, 'utf8'));
    }

    // 如果 enriched.json 不存在，尝试从其他数据源构建
    console.log(`[Data Loader] Enriched data not found, using alternative sources for ${novelId}`);
    
    const data = {
      events: [],
      characters: [],
      relationships: [],
      worldbook: {}
    };

    // 从 events.json 加载
    const eventsPath = path.join(__dirname, '../data/novels', novelId, 'events.json');
    if (fs.existsSync(eventsPath)) {
      const eventsData = JSON.parse(fs.readFileSync(eventsPath, 'utf8'));
      data.events = eventsData.events || [];
    }

    // 从 relationships.json 加载
    const relationshipsPath = path.join(__dirname, '../data/novels', novelId, 'relationships.json');
    if (fs.existsSync(relationshipsPath)) {
      const relationshipsData = JSON.parse(fs.readFileSync(relationshipsPath, 'utf8'));
      data.relationships = relationshipsData.relationships || [];
    }

    // 从 worldbook.json 加载
    const worldbookPath = path.join(__dirname, '../data/novels', novelId, 'worldbook.json');
    if (fs.existsSync(worldbookPath)) {
      const worldbookData = JSON.parse(fs.readFileSync(worldbookPath, 'utf8'));
      data.worldbook = worldbookData;
    }

    // 从 character_attributes_cache.json 加载
    const charCachePath = path.join(__dirname, '../data/novels', novelId, 'character_attributes_cache.json');
    if (fs.existsSync(charCachePath)) {
      const charCacheData = JSON.parse(fs.readFileSync(charCachePath, 'utf8'));
      data.characters = Object.keys(charCacheData).map(name => ({
        name,
        ...charCacheData[name]
      }));
    }

    return data;
  }

  /**
   * 分析角色关系网络
   */
  analyzeCharacterRelationships(novelId) {
    try {
      const data = this.loadNovelData(novelId);
      
      if (!data || (!data.events && !data.relationships)) {
        console.log(`[Character Relationships] No data available for ${novelId}`);
        return null;
      }

      const relationships = this.extractCharacterRelationships(data);
      
      this.characterRelationships[novelId] = relationships;
      
      console.log(`[Character Relationships] Analyzed ${Object.keys(relationships).length} characters for ${novelId}`);
      
      return relationships;
    } catch (error) {
      console.error('[Character Relationships] Failed to analyze:', error);
      return null;
    }
  }

  /**
   * 提取角色关系
   */
  extractCharacterRelationships(data) {
    const relationships = {};
    
    // 关系类型关键词
    const relationshipKeywords = {
      '师徒': ['师父', '师傅', '师尊', '弟子', '徒弟', '师妹', '师兄', '师姐'],
      '敌对': ['敌人', '仇敌', '对手', '敌对', '仇人', '死敌'],
      '盟友': ['盟友', '朋友', '同伴', '伙伴', '好友'],
      '亲属': ['父亲', '母亲', '儿子', '女儿', '兄弟', '姐妹', '夫妻', '妻子', '丈夫', '祖父', '祖母', '孙子', '孙女'],
      '上下级': ['上级', '下属', '主上', '属下', '大人', '属下']
    };
    
    // 从事件中提取角色互动
    if (data.events && Array.isArray(data.events)) {
      data.events.forEach(event => {
        if (event.characters && Array.isArray(event.characters) && event.description) {
          const characters = event.characters;
          
          // 分析每对角色之间的关系
          for (let i = 0; i < characters.length; i++) {
            for (let j = i + 1; j < characters.length; j++) {
              const char1 = characters[i];
              const char2 = characters[j];
              
              if (!relationships[char1]) {
                relationships[char1] = {};
              }
              if (!relationships[char2]) {
                relationships[char2] = {};
              }
              
              // 识别关系类型
              const relationshipType = this.identifyRelationshipType(event.description, relationshipKeywords);
              
              if (relationshipType) {
                // 记录关系
                if (!relationships[char1][char2]) {
                  relationships[char1][char2] = {
                    type: relationshipType,
                    strength: 0,
                    interactions: []
                  };
                }
                relationships[char1][char2].strength++;
                relationships[char1][char2].interactions.push(event.description);
                
                // 反向关系
                if (!relationships[char2][char1]) {
                  relationships[char2][char1] = {
                    type: relationshipType,
                    strength: 0,
                    interactions: []
                  };
                }
                relationships[char2][char1].strength++;
                relationships[char2][char1].interactions.push(event.description);
              }
            }
          }
        }
      });
    }
    
    return relationships;
  }

  /**
   * 识别关系类型
   */
  identifyRelationshipType(text, relationshipKeywords) {
    for (const type in relationshipKeywords) {
      const keywords = relationshipKeywords[type];
      for (const keyword of keywords) {
        if (text.includes(keyword)) {
          return type;
        }
      }
    }
    return null;
  }

  /**
   * 检查关系一致性
   */
  checkRelationshipConsistency(novelId, newInteraction) {
    const relationships = this.characterRelationships[novelId];
    if (!relationships) {
      return { consistent: true, conflicts: [] };
    }
    
    const conflicts = [];
    
    // 检查新互动是否与现有关系矛盾
    const characters = newInteraction.characters || [];
    for (let i = 0; i < characters.length; i++) {
      for (let j = i + 1; j < characters.length; j++) {
        const char1 = characters[i];
        const char2 = characters[j];
        
        if (relationships[char1] && relationships[char1][char2]) {
          const existingType = relationships[char1][char2].type;
          const newType = this.identifyRelationshipType(newInteraction.description, {
            '师徒': ['师父', '师傅', '师尊', '弟子', '徒弟', '师妹', '师兄', '师姐'],
            '敌对': ['敌人', '仇敌', '对手', '敌对', '仇人', '死敌'],
            '盟友': ['盟友', '朋友', '同伴', '伙伴', '好友'],
            '亲属': ['父亲', '母亲', '儿子', '女儿', '兄弟', '姐妹', '夫妻', '妻子', '丈夫', '祖父', '祖母', '孙子', '孙女'],
            '上下级': ['上级', '下属', '主上', '属下', '大人', '属下']
          });
          
          // 检测矛盾关系（敌对角色突然合作）
          if (existingType === '敌对' && newType === '盟友') {
            conflicts.push({
              characters: [char1, char2],
              existingType: existingType,
              newType: newType,
              description: '敌对角色突然合作，需要合理解释'
            });
          }
          
          // 检测矛盾关系（盟友角色突然敌对）
          if (existingType === '盟友' && newType === '敌对') {
            conflicts.push({
              characters: [char1, char2],
              existingType: existingType,
              newType: newType,
              description: '盟友角色突然敌对，需要合理解释'
            });
          }
        }
      }
    }
    
    return {
      consistent: conflicts.length === 0,
      conflicts: conflicts
    };
  }

  /**
   * 生成角色关系提示词
   */
  generateRelationshipPrompt(novelId) {
    const relationships = this.characterRelationships[novelId];
    if (!relationships || Object.keys(relationships).length === 0) {
      return '';
    }
    
    let prompt = '【角色关系网络】\n';
    
    for (const char1 in relationships) {
      for (const char2 in relationships[char1]) {
        const rel = relationships[char1][char2];
        prompt += `${char1}与${char2}的关系：${rel.type}（强度：${rel.strength}）\n`;
      }
    }
    
    prompt += '【关系一致性要求】角色互动必须符合已建立的关系设定，如需改变关系，需要合理的剧情铺垫。\n';
    
    return prompt;
  }

  /**
   * 分析时间线一致性
   */
  analyzeTimelineConsistency(novelId) {
    try {
      const data = this.loadNovelData(novelId);
      
      if (!data || !data.events) {
        console.log(`[Timeline Consistency] No data available for ${novelId}`);
        return null;
      }

      const timeline = this.extractTimeline(data);
      
      this.timelineConsistency[novelId] = timeline;
      
      console.log(`[Timeline Consistency] Analyzed ${timeline.length} events for ${novelId}`);
      
      return timeline;
    } catch (error) {
      console.error('[Timeline Consistency] Failed to analyze:', error);
      return null;
    }
  }

  /**
   * 提取时间线
   */
  extractTimeline(data) {
    const timeline = [];
    
    if (data.events && Array.isArray(data.events)) {
      data.events.forEach((event, index) => {
        const timeInfo = this.extractTimeInfo(event.description);
        timeline.push({
          eventId: index,
          description: event.description,
          characters: event.characters || [],
          location: this.extractLocation(event.description),
          time: timeInfo,
          timestamp: index // 使用事件索引作为时间戳
        });
      });
    }
    
    return timeline;
  }

  /**
   * 提取时间信息
   */
  extractTimeInfo(text) {
    const timePatterns = [
      /(\d+)年/g,
      /(\d+)月/g,
      /(\d+)日/g,
      /春|夏|秋|冬/g,
      /早|中|晚/g,
      /上午|下午|晚上/g,
      /清晨|黄昏/g
    ];
    
    const timeInfo = {};
    
    timePatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        timeInfo.raw = matches.join(' ');
      }
    });
    
    return timeInfo;
  }

  /**
   * 提取位置信息
   */
  extractLocation(text) {
    const locationPatterns = this.extractLocationPatterns(text);
    return locationPatterns.length > 0 ? locationPatterns[0] : null;
  }

  /**
   * 检测时间线冲突
   */
  detectTimelineConflicts(timeline) {
    const conflicts = [];
    
    // 检测角色同时在多个地方
    const characterLocations = {};
    
    timeline.forEach(event => {
      if (event.characters && event.characters.length > 0 && event.location) {
        event.characters.forEach(char => {
          if (!characterLocations[char]) {
            characterLocations[char] = [];
          }
          characterLocations[char].push({
            eventId: event.eventId,
            location: event.location,
            timestamp: event.timestamp
          });
        });
      }
    });
    
    // 检测同一角色在相近时间出现在不同地点
    for (const char in characterLocations) {
      const locations = characterLocations[char];
      
      for (let i = 0; i < locations.length; i++) {
        for (let j = i + 1; j < locations.length; j++) {
          const loc1 = locations[i];
          const loc2 = locations[j];
          
          // 时间差小于5个事件且地点不同
          if (Math.abs(loc1.timestamp - loc2.timestamp) < 5 && loc1.location !== loc2.location) {
            conflicts.push({
              type: '角色位置冲突',
              character: char,
              location1: loc1.location,
              location2: loc2.location,
              event1: loc1.eventId,
              event2: loc2.eventId,
              description: `${char}在相近时间出现在${loc1.location}和${loc2.location}`
            });
          }
        }
      }
    }
    
    return conflicts;
  }

  /**
   * 生成时间线提示词
   */
  generateTimelinePrompt(novelId) {
    const timelineData = this.timelineConsistency[novelId];
    if (!timelineData) {
      return '';
    }
    
    let prompt = '【时间线一致性要求】\n';
    
    if (timelineData.conflicts && timelineData.conflicts.length > 0) {
      prompt += '检测到以下时间线冲突，请避免类似问题：\n';
      timelineData.conflicts.forEach(conflict => {
        prompt += `- ${conflict.description}\n`;
      });
    }
    
    prompt += '角色移动需要合理的时间间隔，不能同时在多个地方出现。\n';
    
    return prompt;
  }

  /**
   * 分析物品/资源追踪
   */
  analyzeItemTracking(novelId) {
    try {
      const dataPath = path.join(__dirname, '../data/novels', novelId, 'enriched.json');
      
      if (!fs.existsSync(dataPath)) {
        console.log(`[Item Tracking] Enriched data not found for ${novelId}`);
        return null;
      }

      const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      
      const items = this.extractItems(data);
      const conflicts = this.detectItemConflicts(items);
      
      this.itemTracking[novelId] = {
        items: items,
        conflicts: conflicts
      };
      
      console.log(`[Item Tracking] Analyzed ${Object.keys(items).length} items with ${conflicts.length} conflicts for ${novelId}`);
      
      return this.itemTracking[novelId];
    } catch (error) {
      console.error('[Item Tracking] Failed to analyze:', error);
      return null;
    }
  }

  /**
   * 提取物品信息
   */
  extractItems(data) {
    const items = {};
    
    // 物品类型关键词
    const itemKeywords = {
      '蛊虫': ['蛊', '蛊虫'],
      '法宝': ['法宝', '宝物', '灵宝'],
      '武器': ['剑', '刀', '枪', '戟', '斧', '钺', '钩', '叉', '鞭', '锏', '锤'],
      '丹药': ['丹', '药', '丸'],
      '符箓': ['符', '箓'],
      '元石': ['元石', '仙元石']
    };
    
    if (data.events && Array.isArray(data.events)) {
      data.events.forEach(event => {
        if (event.description) {
          // 识别物品
          for (const itemType in itemKeywords) {
            const keywords = itemKeywords[itemType];
            keywords.forEach(keyword => {
              if (event.description.includes(keyword)) {
                // 提取物品名称（简化版）
                const itemPattern = new RegExp(`[\\u4e00-\\u9fa5]{2,6}${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
                const matches = event.description.match(itemPattern) || [];
                
                matches.forEach(itemName => {
                  if (!items[itemName]) {
                    items[itemName] = {
                      type: itemType,
                      owner: null,
                      history: [],
                      usageMethods: [], // 使用方法
                      effects: [] // 效果
                    };
                  }
                  
                  const action = this.identifyItemAction(event.description);
                  
                  // 记录历史
                  items[itemName].history.push({
                    eventId: event.id,
                    description: event.description,
                    action: action
                  });
                  
                  // 如果是使用动作，提取使用方法和效果
                  if (action === '使用') {
                    const usageMethod = this.extractUsageMethod(event.description, itemName);
                    const effect = this.extractEffect(event.description, itemName);
                    
                    if (usageMethod) {
                      items[itemName].usageMethods.push(usageMethod);
                    }
                    if (effect) {
                      items[itemName].effects.push(effect);
                    }
                  }
                  
                  // 识别拥有者
                  if (event.characters && event.characters.length > 0) {
                    items[itemName].owner = event.characters[0];
                  }
                });
              }
            });
          }
        }
      });
    }
    
    return items;
  }

  /**
   * 提取使用方法
   */
  extractUsageMethod(text, itemName) {
    // 使用方法关键词模式
    const usagePatterns = [
      /用([\u4e00-\u9fa5]{2,4})(攻击|防御|治疗|炼化|催动)/g,
      /([\u4e00-\u9fa5]{2,4})咬([\u4e00-\u9fa5]{2,4})/g,
      /([\u4e00-\u9fa5]{2,4})释放([\u4e00-\u9fa5]{2,4})/g,
      /([\u4e00-\u9fa5]{2,4})施展([\u4e00-\u9fa5]{2,4})/g
    ];
    
    for (const pattern of usagePatterns) {
      const matches = text.match(pattern);
      if (matches) {
        return matches[0];
      }
    }
    
    // 简化版：提取包含物品名的句子片段
    const sentences = text.split(/[，。！？]/);
    for (const sentence of sentences) {
      if (sentence.includes(itemName) && (sentence.includes('用') || sentence.includes('催动') || sentence.includes('施展'))) {
        return sentence.trim();
      }
    }
    
    return null;
  }

  /**
   * 提取效果
   */
  extractEffect(text, itemName) {
    // 效果关键词模式
    const effectPatterns = [
      /造成([\u4e00-\u9fa5]{2,6})伤害/g,
      /恢复([\u4e00-\u9fa5]{2,6})/g,
      /提升([\u4e00-\u9fa5]{2,6})/g,
      /降低([\u4e00-\u9fa5]{2,6})/g,
      /([\u4e00-\u9fa5]{2,6})成功/g,
      /([\u4e00-\u9fa5]{2,6})失败/g
    ];
    
    for (const pattern of effectPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        return matches[0];
      }
    }
    
    // 简化版：提取包含效果描述的句子片段
    const sentences = text.split(/[，。！？]/);
    for (const sentence of sentences) {
      if (sentence.includes(itemName) && (sentence.includes('造成') || sentence.includes('恢复') || sentence.includes('提升') || sentence.includes('降低'))) {
        return sentence.trim();
      }
    }
    
    return null;
  }

  /**
   * 识别物品动作
   */
  identifyItemAction(text) {
    if (text.includes('获得') || text.includes('得到') || text.includes('收取')) {
      return '获得';
    }
    if (text.includes('使用') || text.includes('催动') || text.includes('施展')) {
      return '使用';
    }
    if (text.includes('失去') || text.includes('丢失') || text.includes('毁坏')) {
      return '失去';
    }
    if (text.includes('赠送') || text.includes('给予')) {
      return '赠送';
    }
    return '未知';
  }

  /**
   * 检测物品冲突
   */
  detectItemConflicts(items) {
    const conflicts = [];
    
    for (const itemName in items) {
      const item = items[itemName];
      
      // 检测物品凭空消失
      const lastAction = item.history[item.history.length - 1];
      if (lastAction && lastAction.action === '使用' && !item.history.some(h => h.action === '失去')) {
        // 使用后没有失去记录，可能正常，不做冲突
      }
      
      // 检测物品重复获得
      const gainActions = item.history.filter(h => h.action === '获得');
      if (gainActions.length > 1) {
        conflicts.push({
          type: '物品重复获得',
          item: itemName,
          description: `${itemName}被获得${gainActions.length}次，可能不合理`
        });
      }
      
      // 检测物品在失去后仍使用
      let lost = false;
      for (const history of item.history) {
        if (history.action === '失去') {
          lost = true;
        }
        if (lost && history.action === '使用') {
          conflicts.push({
            type: '物品失去后使用',
            item: itemName,
            description: `${itemName}在失去后仍被使用`
          });
          break;
        }
      }
    }
    
    return conflicts;
  }

  /**
   * 生成物品追踪提示词
   */
  generateItemTrackingPrompt(novelId) {
    const itemData = this.itemTracking[novelId];
    if (!itemData) {
      return '';
    }
    
    let prompt = '【物品/资源追踪】\n';
    
    // 添加物品使用方法和效果
    for (const itemName in itemData.items) {
      const item = itemData.items[itemName];
      
      if (item.usageMethods.length > 0 || item.effects.length > 0) {
        prompt += `${itemName}（${item.type}）\n`;
        
        if (item.usageMethods.length > 0) {
          const uniqueMethods = [...new Set(item.usageMethods)];
          prompt += `  使用方法：${uniqueMethods.join('、')}\n`;
        }
        
        if (item.effects.length > 0) {
          const uniqueEffects = [...new Set(item.effects)];
          prompt += `  效果：${uniqueEffects.join('、')}\n`;
        }
      }
    }
    
    if (itemData.conflicts && itemData.conflicts.length > 0) {
      prompt += '检测到以下物品冲突，请避免类似问题：\n';
      itemData.conflicts.forEach(conflict => {
        prompt += `- ${conflict.description}\n`;
      });
    }
    
    prompt += '物品的获取、使用、失去需要符合逻辑，不能凭空出现或消失。使用方法和效果必须保持一致。\n';
    
    return prompt;
  }

  /**
   * 分析势力/组织识别
   */
  analyzeFactionRecognition(novelId) {
    try {
      const dataPath = path.join(__dirname, '../data/novels', novelId, 'enriched.json');
      
      if (!fs.existsSync(dataPath)) {
        console.log(`[Faction Recognition] Enriched data not found for ${novelId}`);
        return null;
      }

      const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      
      const factions = this.extractFactions(data);
      const relationships = this.analyzeFactionRelationships(factions, data);
      
      this.factionRecognition[novelId] = {
        factions: factions,
        relationships: relationships
      };
      
      console.log(`[Faction Recognition] Analyzed ${factions.length} factions for ${novelId}`);
      
      return this.factionRecognition[novelId];
    } catch (error) {
      console.error('[Faction Recognition] Failed to analyze:', error);
      return null;
    }
  }

  /**
   * 提取势力/组织
   */
  extractFactions(data) {
    const factions = {};
    
    // 势力关键词
    const factionKeywords = [
      '宗', '门', '派', '阁', '楼', '宫', '殿', '山', '谷', '岛', '城', '国',
      '盟', '帮', '会', '教', '族', '家', '府', '院', '塔', '寺', '庙'
    ];
    
    if (data.events && Array.isArray(data.events)) {
      data.events.forEach(event => {
        if (event.description) {
          factionKeywords.forEach(keyword => {
            const pattern = new RegExp(`[\\u4e00-\\u9fa5]{2,4}${keyword}`, 'g');
            const matches = event.description.match(pattern) || [];
            
            matches.forEach(factionName => {
              if (!factions[factionName]) {
                factions[factionName] = {
                  name: factionName,
                  members: [],
                  activities: []
                };
              }
              
              factions[factionName].activities.push({
                eventId: event.id,
                description: event.description
              });
              
              // 记录成员
              if (event.characters && event.characters.length > 0) {
                event.characters.forEach(char => {
                  if (!factions[factionName].members.includes(char)) {
                    factions[factionName].members.push(char);
                  }
                });
              }
            });
          });
        }
      });
    }
    
    return Object.values(factions);
  }

  /**
   * 分析势力关系
   */
  analyzeFactionRelationships(factions, data) {
    const relationships = {};
    
    // 关系类型关键词
    const relationshipKeywords = {
      '敌对': ['敌对', '仇敌', '死敌', '交战', '攻打', '征讨'],
      '盟友': ['盟友', '结盟', '联合', '合作'],
      '从属': ['附属', '归属', '隶属', '管辖'],
      '竞争': ['竞争', '争夺', '争夺']
    };
    
    if (data.events && Array.isArray(data.events)) {
      data.events.forEach(event => {
        if (event.description) {
          // 识别事件中涉及的势力
          const involvedFactions = factions.filter(f => 
            event.description.includes(f.name)
          );
          
          if (involvedFactions.length >= 2) {
            for (let i = 0; i < involvedFactions.length; i++) {
              for (let j = i + 1; j < involvedFactions.length; j++) {
                const f1 = involvedFactions[i];
                const f2 = involvedFactions[j];
                
                const relationshipType = this.identifyFactionRelationship(event.description, relationshipKeywords);
                
                if (relationshipType) {
                  const key = `${f1.name}-${f2.name}`;
                  if (!relationships[key]) {
                    relationships[key] = {
                      faction1: f1.name,
                      faction2: f2.name,
                      type: relationshipType,
                      strength: 0
                    };
                  }
                  relationships[key].strength++;
                }
              }
            }
          }
        }
      });
    }
    
    return Object.values(relationships);
  }

  /**
   * 识别势力关系类型
   */
  identifyFactionRelationship(text, relationshipKeywords) {
    for (const type in relationshipKeywords) {
      const keywords = relationshipKeywords[type];
      for (const keyword of keywords) {
        if (text.includes(keyword)) {
          return type;
        }
      }
    }
    return null;
  }

  /**
   * 生成势力提示词
   */
  generateFactionPrompt(novelId) {
    const factionData = this.factionRecognition[novelId];
    if (!factionData) {
      return '';
    }
    
    let prompt = '【势力/组织】\n';
    
    factionData.factions.forEach(faction => {
      prompt += `${faction.name}（成员：${faction.members.join('、')}）\n`;
    });
    
    if (factionData.relationships.length > 0) {
      prompt += '【势力关系】\n';
      factionData.relationships.forEach(rel => {
        prompt += `${rel.faction1}与${rel.faction2}：${rel.type}\n`;
      });
    }
    
    prompt += '势力行为必须符合已建立的势力关系和设定。\n';
    
    return prompt;
  }

  /**
   * 分析实力成长轨迹
   */
  analyzePowerGrowthTrajectory(novelId) {
    try {
      const dataPath = path.join(__dirname, '../data/novels', novelId, 'enriched.json');
      
      if (!fs.existsSync(dataPath)) {
        console.log(`[Power Growth Trajectory] Enriched data not found for ${novelId}`);
        return null;
      }

      const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      
      // 获取小说的实力系统配置
      const metadata = JSON.parse(fs.readFileSync(this.metadataPath, 'utf8'));
      const novel = metadata[novelId];
      const powerSystem = novel && novel.powerSystem;
      
      const trajectory = this.extractPowerTrajectory(data, powerSystem);
      const jumps = this.detectPowerJumps(trajectory, powerSystem);
      
      this.powerGrowthTrajectory[novelId] = {
        trajectory: trajectory,
        jumps: jumps
      };
      
      console.log(`[Power Growth Trajectory] Analyzed ${trajectory.length} power changes with ${jumps.length} jumps for ${novelId}`);
      
      return this.powerGrowthTrajectory[novelId];
    } catch (error) {
      console.error('[Power Growth Trajectory] Failed to analyze:', error);
      return null;
    }
  }

  /**
   * 提取实力轨迹
   */
  extractPowerTrajectory(data, powerSystem) {
    const trajectory = [];
    
    if (data.events && Array.isArray(data.events)) {
      data.events.forEach((event, index) => {
        if (event.description) {
          // 识别实力变化关键词
          const powerChangePatterns = [
            /晋升|突破|提升|升级/g,
            /达到|成为|踏入/g
          ];
          
          let hasPowerChange = false;
          powerChangePatterns.forEach(pattern => {
            if (event.description.match(pattern)) {
              hasPowerChange = true;
            }
          });
          
          if (hasPowerChange) {
            // 提取境界信息
            const realm = this.extractRealm(event.description, powerSystem);
            
            if (realm) {
              trajectory.push({
                eventId: index,
                description: event.description,
                realm: realm,
                timestamp: index
              });
            }
          }
        }
      });
    }
    
    return trajectory;
  }

  /**
   * 提取境界信息
   */
  extractRealm(text, powerSystem) {
    if (!powerSystem || !powerSystem.levels) {
      return null;
    }
    
    // 从文本中查找境界名称
    for (const level of powerSystem.levels) {
      if (text.includes(level.name)) {
        return level.name;
      }
    }
    
    return null;
  }

  /**
   * 检测实力跳跃
   */
  detectPowerJumps(trajectory, powerSystem) {
    const jumps = [];
    
    if (!powerSystem || !powerSystem.levels) {
      return jumps;
    }
    
    // 创建境界索引
    const levelIndex = {};
    powerSystem.levels.forEach((level, index) => {
      levelIndex[level.name] = index;
    });
    
    // 检测相邻事件之间的实力变化
    for (let i = 1; i < trajectory.length; i++) {
      const prev = trajectory[i - 1];
      const curr = trajectory[i];
      
      const prevIndex = levelIndex[prev.realm];
      const currIndex = levelIndex[curr.realm];
      
      if (prevIndex !== undefined && currIndex !== undefined) {
        const levelDiff = currIndex - prevIndex;
        
        // 如果跨越超过2级，标记为跳跃
        if (levelDiff > 2) {
          jumps.push({
            from: prev.realm,
            to: curr.realm,
            levelDiff: levelDiff,
            event1: prev.eventId,
            event2: curr.eventId,
            description: `从${prev.realm}直接晋升到${curr.realm}，跨越${levelDiff}级`
          });
        }
      }
    }
    
    return jumps;
  }

  /**
   * 生成物品提示词
   */
  generateItemPrompt(novelId) {
    let prompt = `【物品系统】`;
    
    try {
      const itemTracking = this.analyzeItemTracking(novelId);
      if (!itemTracking || !itemTracking.items || Object.keys(itemTracking.items).length === 0) {
        prompt += `\n【物品一致性要求】`;
        prompt += `\n- 保持物品状态的一致性`;
        prompt += `\n- 物品获得需要合理的剧情途径`;
        prompt += `\n- 避免随意添加未提及的物品`;
        return prompt;
      }

      const items = itemTracking.items;
      const conflicts = itemTracking.conflicts || [];

      // 按类型分组物品
      const itemTypes = {};
      for (const itemName in items) {
        const item = items[itemName];
        const type = item.type || '其他';
        if (!itemTypes[type]) {
          itemTypes[type] = [];
        }
        itemTypes[type].push(item);
      }

      // 生成物品类型提示
      for (const type in itemTypes) {
        const typeItems = itemTypes[type];
        prompt += `\n【${type}】`;
        typeItems.slice(0, 5).forEach(item => {
          prompt += `\n- ${item.name}`;
          if (item.effects && item.effects.length > 0) {
            prompt += `（效果：${item.effects.slice(0, 2).join('、')}）`;
          }
        });
      }

      // 添加冲突提示
      if (conflicts.length > 0) {
        prompt += `\n【物品一致性要求】`;
        conflicts.slice(0, 3).forEach(conflict => {
          prompt += `\n- ${conflict.description}`;
        });
      } else {
        prompt += `\n【物品一致性要求】`;
        prompt += `\n- 保持物品状态的一致性`;
        prompt += `\n- 物品获得需要合理的剧情途径`;
        prompt += `\n- 避免随意添加未提及的物品`;
      }
    } catch (error) {
      console.warn('[Item Prompt] Failed to analyze items:', error.message);
      prompt += `\n【物品一致性要求】`;
      prompt += `\n- 保持物品状态的一致性`;
      prompt += `\n- 物品获得需要合理的剧情途径`;
      prompt += `\n- 避免随意添加未提及的物品`;
    }

    return prompt;
  }

  /**
   * 生成地理连续性提示词
   */
  generateGeographicPrompt(novelId) {
    let prompt = `【地理连续性】`;
    
    // 获取世界观配置
    try {
      const metadata = JSON.parse(fs.readFileSync(this.metadataPath, 'utf8'));
      const novel = metadata[novelId];
      const worldview = novel && novel.worldview;

      // 生成地区信息
      if (worldview && worldview.regions) {
        prompt += `\n【世界观地区】`;
        worldview.regions.slice(0, 5).forEach(region => {
          prompt += `\n- ${region.name}（${region.description}）`;
        });
      }
    } catch (error) {
      console.warn('[Geographic Prompt] Failed to read metadata:', error.message);
    }

    // 获取移动数据
    const geographicData = this.analyzeGeographicContinuity(novelId);
    if (geographicData && geographicData.movements && geographicData.movements.length > 0) {
      const movements = geographicData.movements;
      const conflicts = geographicData.conflicts || [];

      // 生成移动轨迹提示
      if (movements.length > 0) {
        prompt += `\n【常见移动轨迹】`;
        const movementSample = movements.slice(0, 3);
        movementSample.forEach(movement => {
          prompt += `\n- ${movement.character}：${movement.to}`;
        });
      }

      // 添加移动规则提示
      try {
        const metadata = JSON.parse(fs.readFileSync(this.metadataPath, 'utf8'));
        const novel = metadata[novelId];
        const worldview = novel && novel.worldview;
        
        if (worldview && worldview.distanceRules && worldview.distanceRules.length > 0) {
          prompt += `\n【移动规则】`;
          worldview.distanceRules.slice(0, 3).forEach(rule => {
            const fromRegion = worldview.regions.find(r => r.id === rule.from)?.name || rule.from;
            const toRegion = worldview.regions.find(r => r.id === rule.to)?.name || rule.to;
            prompt += `\n- ${fromRegion}到${toRegion}：${rule.distance}（${rule.travelTime}）`;
          });
        }
      } catch (error) {
        console.warn('[Geographic Prompt] Failed to read distance rules:', error.message);
      }

      // 添加冲突提示
      if (conflicts.length > 0) {
        prompt += `\n【地理一致性要求】`;
        conflicts.slice(0, 2).forEach(conflict => {
          prompt += `\n- ${conflict.description}`;
        });
      }
    }

    return prompt;
  }

  /**
   * 生成因果关系提示词
   */
  generateCausalityPrompt(novelId) {
    let prompt = `【因果关系】`;
    
    try {
      const causalityData = this.analyzeCausality(novelId);
      if (!causalityData || !causalityData.causalChains || causalityData.causalChains.length === 0) {
        prompt += `\n【因果推理要求】`;
        prompt += `\n- 事件之间应有合理的因果关系`;
        prompt += `\n- 避免突兀的情节转折`;
        prompt += `\n- 确保角色动机合理`;
        return prompt;
      }

      const causalChains = causalityData.causalChains;
      const logicGaps = causalityData.logicGaps || [];

      // 生成因果链提示
      if (causalChains.length > 0) {
        prompt += `\n【因果链示例】`;
        causalChains.slice(0, 3).forEach(chain => {
          prompt += `\n- ${chain.cause} → ${chain.result}`;
        });
      }

      // 添加逻辑漏洞提示
      if (logicGaps.length > 0) {
        prompt += `\n【逻辑一致性要求】`;
        logicGaps.slice(0, 2).forEach(gap => {
          prompt += `\n- ${gap.description}`;
        });
      }

      prompt += `\n【因果推理要求】`;
      prompt += `\n- 事件之间应有合理的因果关系`;
      prompt += `\n- 避免突兀的情节转折`;
      prompt += `\n- 确保角色动机合理`;
    } catch (error) {
      console.warn('[Causality Prompt] Failed to analyze causality:', error.message);
      prompt += `\n【因果推理要求】`;
      prompt += `\n- 事件之间应有合理的因果关系`;
      prompt += `\n- 避免突兀的情节转折`;
      prompt += `\n- 确保角色动机合理`;
    }

    return prompt;
  }

  /**
   * 生成角色性格提示词
   */
  generatePersonalityPrompt(novelId) {
    let prompt = `【角色性格】`;
    
    try {
      const personalityData = this.analyzeCharacterPersonality(novelId);
      if (!personalityData || !personalityData.characters || Object.keys(personalityData.characters).length === 0) {
        prompt += `\n【性格一致性要求】`;
        prompt += `\n- 保持角色性格的一致性`;
        prompt += `\n- 避免角色行为突兀变化`;
        prompt += `\n- 角色动机应符合性格设定`;
        return prompt;
      }

      const characters = personalityData.characters;

      // 生成主要角色性格提示
      const characterEntries = Object.entries(characters).slice(0, 5);
      characterEntries.forEach(([charName, charData]) => {
        prompt += `\n【${charName}】`;
        if (charData.traits && charData.traits.length > 0) {
          prompt += `性格：${charData.traits.slice(0, 3).join('、')}`;
        }
        if (charData.behaviors && charData.behaviors.length > 0) {
          prompt += `行为模式：${charData.behaviors.slice(0, 2).join('、')}`;
        }
      });

      prompt += `\n【性格一致性要求】`;
      prompt += `\n- 保持角色性格的一致性`;
      prompt += `\n- 避免角色行为突兀变化`;
      prompt += `\n- 角色动机应符合性格设定`;
    } catch (error) {
      console.warn('[Personality Prompt] Failed to analyze personality:', error.message);
      prompt += `\n【性格一致性要求】`;
      prompt += `\n- 保持角色性格的一致性`;
      prompt += `\n- 避免角色行为突兀变化`;
      prompt += `\n- 角色动机应符合性格设定`;
    }

    return prompt;
  }

  /**
   * 生成设定冲突提示词
   */
  generateConflictsPrompt(novelId) {
    let prompt = `【设定冲突检测】`;
    
    try {
      const conflictsData = this.detectSettingConflicts(novelId);
      if (!conflictsData || !conflictsData.conflicts || conflictsData.conflicts.length === 0) {
        prompt += `\n【设定一致性要求】`;
        prompt += `\n- 严格遵守世界观设定`;
        prompt += `\n- 避免引入其他小说的概念`;
        prompt += `\n- 保持实力等级的合理性`;
        return prompt;
      }

      const conflicts = conflictsData.conflicts;

      // 生成冲突提示
      conflicts.slice(0, 3).forEach(conflict => {
        prompt += `\n- ${conflict.type}：${conflict.description}`;
        if (conflict.severity) {
          prompt += `（严重程度：${conflict.severity}）`;
        }
      });

      prompt += `\n【设定一致性要求】`;
      prompt += `\n- 严格遵守世界观设定`;
      prompt += `\n- 避免引入其他小说的概念`;
      prompt += `\n- 保持实力等级的合理性`;
    } catch (error) {
      console.warn('[Conflicts Prompt] Failed to detect conflicts:', error.message);
      prompt += `\n【设定一致性要求】`;
      prompt += `\n- 严格遵守世界观设定`;
      prompt += `\n- 避免引入其他小说的概念`;
      prompt += `\n- 保持实力等级的合理性`;
    }

    return prompt;
  }

  /**
   * 生成实力成长提示词
   */
  generatePowerGrowthPrompt(novelId) {
    let prompt = '【实力成长轨迹】\n';
    
    try {
      const trajectoryData = this.powerGrowthTrajectory[novelId];
      if (!trajectoryData) {
        prompt += '实力提升需要合理的剧情铺垫，不能跨越多个境界直接晋升。\n';
        return prompt;
      }
      
      if (trajectoryData.jumps && trajectoryData.jumps.length > 0) {
        prompt += '检测到以下实力跳跃，请避免类似问题：\n';
        trajectoryData.jumps.forEach(jump => {
          prompt += `- ${jump.description}\n`;
        });
      }
      
      prompt += '实力提升需要合理的剧情铺垫，不能跨越多个境界直接晋升。\n';
    } catch (error) {
      console.warn('[Power Growth Prompt] Failed to analyze power growth:', error.message);
      prompt += '实力提升需要合理的剧情铺垫，不能跨越多个境界直接晋升。\n';
    }
    
    return prompt;
  }

  /**
   * 分析地理连续性验证
   */
  analyzeGeographicContinuity(novelId) {
    try {
      const dataPath = path.join(__dirname, '../data/novels', novelId, 'enriched.json');
      
      if (!fs.existsSync(dataPath)) {
        console.log(`[Geographic Continuity] Enriched data not found for ${novelId}`);
        return null;
      }

      const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      
      // 获取世界观配置
      const metadata = JSON.parse(fs.readFileSync(this.metadataPath, 'utf8'));
      const novel = metadata[novelId];
      const worldview = novel && novel.worldview;
      
      const movements = this.extractMovements(data);
      const conflicts = this.detectMovementConflicts(movements, worldview);
      
      this.geographicContinuity[novelId] = {
        movements: movements,
        conflicts: conflicts
      };
      
      console.log(`[Geographic Continuity] Analyzed ${movements.length} movements with ${conflicts.length} conflicts for ${novelId}`);
      
      return this.geographicContinuity[novelId];
    } catch (error) {
      console.error('[Geographic Continuity] Failed to analyze:', error);
      return null;
    }
  }

  /**
   * 提取移动轨迹
   */
  extractMovements(data) {
    const movements = [];
    
    // 移动关键词
    const movementKeywords = ['前往', '抵达', '来到', '离开', '去往', '赶往', '返回'];
    
    if (data.events && Array.isArray(data.events)) {
      data.events.forEach((event, index) => {
        if (event.description && event.characters) {
          movementKeywords.forEach(keyword => {
            if (event.description.includes(keyword)) {
              const location = this.extractLocation(event.description);
              
              if (location) {
                event.characters.forEach(char => {
                  movements.push({
                    character: char,
                    from: null,
                    to: location,
                    eventId: index,
                    description: event.description,
                    timestamp: index
                  });
                });
              }
            }
          });
        }
      });
    }
    
    return movements;
  }

  /**
   * 检测移动冲突
   */
  detectMovementConflicts(movements, worldview) {
    const conflicts = [];
    
    if (!worldview || !worldview.distanceRules) {
      return conflicts;
    }
    
    // 创建地区ID映射
    const regionIdMap = {};
    worldview.regions.forEach(region => {
      regionIdMap[region.name] = region.id;
    });
    
    // 按角色分组移动
    const characterMovements = {};
    movements.forEach(movement => {
      if (!characterMovements[movement.character]) {
        characterMovements[movement.character] = [];
      }
      characterMovements[movement.character].push(movement);
    });
    
    // 检测每个角色的移动
    for (const char in characterMovements) {
      const charMovements = characterMovements[char];
      
      for (let i = 1; i < charMovements.length; i++) {
        const prev = charMovements[i - 1];
        const curr = charMovements[i];
        
        // 时间差小于3个事件
        if (curr.timestamp - prev.timestamp < 3) {
          const prevRegionId = regionIdMap[prev.to];
          const currRegionId = regionIdMap[curr.to];
          
          if (prevRegionId && currRegionId) {
            // 查找距离规则
            const distanceRule = worldview.distanceRules.find(rule => 
              (rule.from === prevRegionId && rule.to === currRegionId) ||
              (rule.from === currRegionId && rule.to === prevRegionId)
            );
            
            if (distanceRule && (distanceRule.distance === '远' || distanceRule.distance === '极远')) {
              conflicts.push({
                type: '移动时间不合理',
                character: char,
                from: prev.to,
                to: curr.to,
                distance: distanceRule.distance,
                timeDiff: curr.timestamp - prev.timestamp,
                description: `${char}在短时间内从${prev.to}移动到${curr.to}（距离：${distanceRule.distance}）`
              });
            }
          }
        }
      }
    }
    
    return conflicts;
  }

  /**
   * 生成地理连续性提示词
   */
  generateGeographicContinuityPrompt(novelId) {
    const continuityData = this.geographicContinuity[novelId];
    if (!continuityData) {
      return '';
    }
    
    let prompt = '【地理连续性】\n';
    
    if (continuityData.conflicts && continuityData.conflicts.length > 0) {
      prompt += '检测到以下移动冲突，请避免类似问题：\n';
      continuityData.conflicts.forEach(conflict => {
        prompt += `- ${conflict.description}\n`;
      });
    }
    
    prompt += '角色移动需要符合地理距离规则，不能在短时间内跨越极远距离。\n';
    
    return prompt;
  }

  /**
   * 分析因果关系
   */
  analyzeCausality(novelId) {
    try {
      const dataPath = path.join(__dirname, '../data/novels', novelId, 'enriched.json');
      
      if (!fs.existsSync(dataPath)) {
        console.log(`[Causality Analysis] Enriched data not found for ${novelId}`);
        return null;
      }

      const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      
      const causalChains = this.extractCausalChains(data);
      const logicGaps = this.detectLogicGaps(causalChains);
      
      // 暂不存储，因为因果关系分析较复杂
      console.log(`[Causality Analysis] Analyzed ${causalChains.length} causal chains with ${logicGaps.length} logic gaps for ${novelId}`);
      
      return {
        causalChains: causalChains,
        logicGaps: logicGaps
      };
    } catch (error) {
      console.error('[Causality Analysis] Failed to analyze:', error);
      return null;
    }
  }

  /**
   * 提取因果链
   */
  extractCausalChains(data) {
    const causalChains = [];
    
    // 因果关系关键词
    const causalKeywords = {
      'cause': ['因为', '由于', '因为...所以', '致使', '导致'],
      'result': ['所以', '因此', '结果', '于是', '接着']
    };
    
    if (data.events && Array.isArray(data.events)) {
      data.events.forEach((event, index) => {
        if (event.description) {
          let hasCause = false;
          let hasResult = false;
          
          for (const type in causalKeywords) {
            causalKeywords[type].forEach(keyword => {
              if (event.description.includes(keyword)) {
                if (type === 'cause') hasCause = true;
                if (type === 'result') hasResult = true;
              }
            });
          }
          
          if (hasCause || hasResult) {
            causalChains.push({
              eventId: index,
              description: event.description,
              hasCause: hasCause,
              hasResult: hasResult
            });
          }
        }
      });
    }
    
    return causalChains;
  }

  /**
   * 检测逻辑漏洞
   */
  detectLogicGaps(causalChains) {
    const logicGaps = [];
    
    // 检测只有结果没有原因的事件
    causalChains.forEach(chain => {
      if (chain.hasResult && !chain.hasCause) {
        logicGaps.push({
          type: '缺少原因',
          eventId: chain.eventId,
          description: '事件有结果描述但缺少原因说明'
        });
      }
    });
    
    return logicGaps;
  }

  /**
   * 分析角色性格特征
   */
  analyzeCharacterPersonality(novelId) {
    try {
      const dataPath = path.join(__dirname, '../data/novels', novelId, 'enriched.json');
      
      if (!fs.existsSync(dataPath)) {
        console.log(`[Character Personality] Enriched data not found for ${novelId}`);
        return null;
      }

      const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      
      const personalities = this.extractPersonalityTraits(data);
      
      console.log(`[Character Personality] Analyzed ${Object.keys(personalities).length} characters for ${novelId}`);
      
      return personalities;
    } catch (error) {
      console.error('[Character Personality] Failed to analyze:', error);
      return null;
    }
  }

  /**
   * 提取性格特征
   */
  extractPersonalityTraits(data) {
    const personalities = {};
    
    // 性格特征关键词
    const personalityKeywords = {
      '勇敢': ['勇敢', '无畏', '不惧', '敢于'],
      '谨慎': ['谨慎', '小心', '慎重', '小心谨慎'],
      '狡猾': ['狡猾', '狡诈', '阴险', '狡黠'],
      '正直': ['正直', '正义', '正直不阿', '刚正'],
      '残忍': ['残忍', '狠毒', '凶残', '无情'],
      '善良': ['善良', '仁慈', '仁善', '慈悲'],
      '冷静': ['冷静', '沉着', '镇定', '淡定'],
      '冲动': ['冲动', '鲁莽', '急躁', '暴躁']
    };
    
    if (data.characters && Array.isArray(data.characters)) {
      data.characters.forEach(char => {
        if (char.name && char.description) {
          const traits = [];
          
          for (const trait in personalityKeywords) {
            const keywords = personalityKeywords[trait];
            keywords.forEach(keyword => {
              if (char.description.includes(keyword)) {
                traits.push(trait);
              }
            });
          }
          
          if (traits.length > 0) {
            personalities[char.name] = traits;
          }
        }
      });
    }
    
    return personalities;
  }

  /**
   * 检测设定冲突
   */
  detectSettingConflicts(novelId) {
    try {
      const metadataPath = this.metadataPath;
      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
      const novel = metadata[novelId];
      
      if (!novel) {
        return null;
      }
      
      const conflicts = [];
      
      // 检测世界观与实力系统的冲突
      if (novel.worldview && novel.powerSystem) {
        // 这里可以添加具体的冲突检测逻辑
        // 例如：世界观中的地区数量与实力系统中的境界数量是否匹配
      }
      
      // 检测禁止概念与细化规则的冲突
      if (novel.forbiddenConcepts && novel.detailRules) {
        novel.forbiddenConcepts.concepts.forEach(concept => {
          novel.detailRules.categories.forEach(category => {
            category.rules.forEach(rule => {
              if (rule.includes(concept.term)) {
                conflicts.push({
                  type: '禁止概念与细化规则冲突',
                  concept: concept.term,
                  rule: rule,
                  description: `细化规则中包含了禁止使用的术语"${concept.term}"`
                });
              }
            });
          });
        });
      }
      
      console.log(`[Setting Conflicts] Detected ${conflicts.length} conflicts for ${novelId}`);
      
      return conflicts;
    } catch (error) {
      console.error('[Setting Conflicts] Failed to detect:', error);
      return null;
    }
  }

  /**
   * 检测术语使用一致性
   */
  detectTermUsageConsistency(novelId) {
    try {
      const dataPath = path.join(__dirname, '../data/novels', novelId, 'enriched.json');
      
      if (!fs.existsSync(dataPath)) {
        console.log(`[Term Usage Consistency] Enriched data not found for ${novelId}`);
        return null;
      }

      const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      
      const termUsage = this.trackTermUsage(data);
      const inconsistencies = this.detectTermInconsistencies(termUsage);
      
      console.log(`[Term Usage Consistency] Analyzed ${Object.keys(termUsage).length} terms with ${inconsistencies.length} inconsistencies for ${novelId}`);
      
      return {
        termUsage: termUsage,
        inconsistencies: inconsistencies
      };
    } catch (error) {
      console.error('[Term Usage Consistency] Failed to detect:', error);
      return null;
    }
  }

  /**
   * 追踪术语使用
   */
  trackTermUsage(data) {
    const termUsage = {};
    
    if (data.events && Array.isArray(data.events)) {
      data.events.forEach(event => {
        if (event.description) {
          const terms = event.description.match(/[\u4e00-\u9fa5]{2,4}/g) || [];
          
          terms.forEach(term => {
            if (!termUsage[term]) {
              termUsage[term] = {
                count: 0,
                contexts: []
              };
            }
            termUsage[term].count++;
            termUsage[term].contexts.push(event.description);
          });
        }
      });
    }
    
    return termUsage;
  }

  /**
   * 检测术语不一致
   */
  detectTermInconsistencies(termUsage) {
    const inconsistencies = [];
    
    // 检测术语混用（简化版）
    // 这里可以添加更复杂的逻辑，例如检测相似术语的混用
    
    return inconsistencies;
  }

  /**
   * 生成细化规则提示词
   */
  generateDetailRulesPrompt(novelId) {
    const detailRules = this.getDetailRules(novelId);
    
    if (!detailRules) {
      // 如果没有配置，返回空字符串
      return '';
    }

    let prompt = `【细化规则】${detailRules.name}（${detailRules.description}）\n`;
    
    // 添加分类规则
    if (detailRules.categories && detailRules.categories.length > 0) {
      detailRules.categories.forEach(category => {
        prompt += `【${category.category}】\n${category.rules.map(rule => `- ${rule}`).join('\n')}\n`;
      });
    }
    
    // 添加通用规则
    if (detailRules.generalRules && detailRules.generalRules.length > 0) {
      prompt += `【通用细化规则】\n${detailRules.generalRules.map(rule => `- ${rule}`).join('\n')}`;
    }

    return prompt;
  }

  /**
   * 根据主角当前境界生成实力限制规则
   */
  getPowerConstraints(novelId, currentRealm) {
    const powerSystem = this.getPowerSystem(novelId);
    
    if (!powerSystem) {
      // 如果没有配置，返回默认限制
      return this.getDefaultConstraints(currentRealm);
    }

    const currentLevel = powerSystem.levels.find(l => l.name === currentRealm);
    
    if (!currentLevel) {
      console.warn(`[Power System] Realm "${currentRealm}" not found in power system`);
      return this.getDefaultConstraints(currentRealm);
    }

    const constraints = {
      currentRealm: currentLevel.name,
      powerLevel: currentLevel.power,
      description: currentLevel.description,
      canDefeat: this.getDefeatableLevels(powerSystem, currentLevel.power),
      cannotDefeat: this.getUndefeatableLevels(powerSystem, currentLevel.power),
      rules: powerSystem.rules || []
    };

    return constraints;
  }

  /**
   * 生成写作风格指导提示词
   */
  generateWritingStylePrompt(novelId) {
    const writingStyle = this.getWritingStyle(novelId);
    
    if (!writingStyle) {
      // 如果没有配置，返回默认写作风格
      return this.getDefaultWritingStylePrompt();
    }

    const prompt = `【写作风格】${writingStyle.name}
${writingStyle.characteristics.map(c => `- ${c}`).join('\n')}`;

    return prompt;
  }

  /**
   * 获取主角可以击败的境界列表
   */
  getDefeatableLevels(powerSystem, currentPower) {
    // 可以击败实力相近或略低的敌人（差距不超过2级）
    return powerSystem.levels
      .filter(l => l.power <= currentPower && l.power >= currentPower - 2)
      .map(l => l.name);
  }

  /**
   * 获取主角无法击败的境界列表
   */
  getUndefeatableLevels(powerSystem, currentPower) {
    // 无法击败实力高2级以上的敌人
    return powerSystem.levels
      .filter(l => l.power > currentPower + 2)
      .map(l => l.name);
  }

  /**
   * 生成AI提示词中的实力限制部分
   */
  generatePowerConstraintsPrompt(novelId, currentRealm) {
    const constraints = this.getPowerConstraints(novelId, currentRealm);
    
    if (!constraints) {
      return '';
    }

    const prompt = `【主角实力限制】主角当前境界为${constraints.currentRealm}，必须严格遵循该境界的实力范围：
- 当前实力描述：${constraints.description}
- 可击败的境界：${constraints.canDefeat.join('、')}
- 无法击败的境界：${constraints.cannotDefeat.join('、')}
- 禁止让主角做出超出其境界能力的壮举
- 主角拥有的资源数量和品质必须符合其境界
- 战斗必须考虑实力差距，主角应避免与远超自己的敌人正面冲突
${constraints.rules.map(rule => `- ${rule}`).join('\n')}`;

    return prompt;
  }

  /**
   * 默认实力限制（当没有配置时使用）
   */
  getDefaultConstraints(currentRealm) {
    return {
      currentRealm: currentRealm || '初阶',
      powerLevel: 1,
      description: '实力有限，只能对付普通敌人',
      canDefeat: ['普通敌人'],
      cannotDefeat: ['强敌', 'BOSS'],
      rules: [
        '主角只能击败实力相近或略低的敌人',
        '禁止让主角做出超出其境界能力的壮举',
        '主角拥有的资源数量和品质必须符合其境界',
        '战斗必须考虑实力差距，主角应避免与远超自己的敌人正面冲突'
      ]
    };
  }

  /**
   * 默认写作风格指导（当没有配置时使用）
   */
  getDefaultWritingStylePrompt() {
    return `【写作风格】通用小说风格
- 保持原著小说的文学性，注重人物性格刻画和心理描写
- 通过对话、行动、环境细节展现人物性格，让角色"活"起来
- 描写要生动具体，避免空洞概括
- 适当加入环境氛围描写，增强代入感
- 人物对话要符合角色性格特点，避免千篇一律
- 注重情节的起承转合，保持小说的连贯性`;
  }

  /**
   * 为新小说添加默认实力系统配置
   */
  addDefaultPowerSystem(novelId, novelName, systemType = 'generic') {
    const defaultSystems = {
      cultivation: {
        type: 'cultivation',
        name: '修炼境界',
        levels: [
          { name: '炼气期', power: 1, description: '初入仙途，只能对付凡人和低阶妖兽' },
          { name: '筑基期', power: 2, description: '筑基成功，可轻易击败炼气期' },
          { name: '金丹期', power: 3, description: '金丹大成，可轻易击败筑基期' },
          { name: '元婴期', power: 4, description: '元婴初成，可轻易击败金丹期' },
          { name: '化神期', power: 5, description: '化神境，可轻易击败元婴期' },
          { name: '炼虚期', power: 6, description: '炼虚境，可轻易击败化神期' },
          { name: '合体期', power: 7, description: '合体境，可轻易击败炼虚期' },
          { name: '大乘期', power: 8, description: '大乘境，可轻易击败合体期' },
          { name: '渡劫期', power: 9, description: '渡劫境，即将飞升，可轻易击败大乘期' }
        ],
        rules: [
          '主角只能击败实力相近或略低的敌人',
          '禁止让主角做出超出其境界能力的壮举',
          '主角拥有的法宝数量和品质必须符合其境界',
          '战斗必须考虑实力差距，主角应避免与远超自己的敌人正面冲突',
          '实力提升需要合理的剧情铺垫（如奇遇、修炼、炼丹等）'
        ]
      },
      generic: {
        type: 'generic',
        name: '等级系统',
        levels: [
          { name: 'Lv.1', power: 1, description: '新手等级，只能对付低级怪物' },
          { name: 'Lv.10', power: 2, description: '初级冒险者，可轻易击败Lv.1-5' },
          { name: 'Lv.20', power: 3, description: '中级冒险者，可轻易击败Lv.10-15' },
          { name: 'Lv.30', power: 4, description: '高级冒险者，可轻易击败Lv.20-25' },
          { name: 'Lv.40', power: 5, description: '精英冒险者，可轻易击败Lv.30-35' },
          { name: 'Lv.50', power: 6, description: '大师级，可轻易击败Lv.40-45' },
          { name: 'Lv.60', power: 7, description: '宗师级，可轻易击败Lv.50-55' },
          { name: 'Lv.70', power: 8, description: '传奇级，可轻易击败Lv.60-65' },
          { name: 'Lv.80', power: 9, description: '英雄级，可轻易击败Lv.70-75' },
          { name: 'Lv.90', power: 10, description: '神话级，可轻易击败Lv.80-85' },
          { name: 'Lv.100', power: 11, description: '满级，世间顶尖强者' }
        ],
        rules: [
          '主角只能击败等级相近或略低的敌人',
          '禁止让主角做出超出其等级能力的壮举',
          '主角拥有的装备和技能必须符合其等级',
          '战斗必须考虑等级差距，主角应避免与远超自己的敌人正面冲突',
          '等级提升需要合理的剧情铺垫（如完成任务、击败强敌、获得经验等）'
        ]
      }
    };

    const defaultSystem = defaultSystems[systemType] || defaultSystems.generic;
    
    try {
      const metadata = JSON.parse(fs.readFileSync(this.metadataPath, 'utf8'));
      
      if (metadata[novelId]) {
        metadata[novelId].powerSystem = defaultSystem;
        fs.writeFileSync(this.metadataPath, JSON.stringify(metadata, null, 2));
        
        this.powerSystems[novelId] = defaultSystem;
        console.log(`[Power System] Added default power system for ${novelName}`);
        
        return true;
      }
    } catch (error) {
      console.error('[Power System] Failed to add default power system:', error);
    }

    return false;
  }

  /**
   * 为新小说添加默认写作风格配置
   */
  addDefaultWritingStyle(novelId, novelName, styleType = 'generic') {
    const defaultStyles = {
      xianxia: {
        type: 'xianxia',
        name: '仙侠小说风格',
        characteristics: [
          "注重人物性格刻画和心理描写，展现角色的复杂性和成长",
          "通过对话、行动、环境细节展现人物性格，让角色'活'起来",
          "描写要生动具体，避免空洞概括，多用感官描写",
          "适当加入环境氛围描写，增强代入感和意境",
          "人物对话要符合角色性格特点，避免千篇一律",
          "注重情节的起承转合，保持小说的连贯性和节奏感",
          "体现仙侠世界的独特世界观和价值观",
          "合理运用修仙术语和设定，增强原著氛围"
        ]
      },
      xuanhuan: {
        type: 'xuanhuan',
        name: '玄幻小说风格',
        characteristics: [
          "注重人物性格刻画和心理描写，展现角色的成长历程",
          "通过对话、行动、环境细节展现人物性格，让角色'活'起来",
          "描写要生动具体，避免空洞概括",
          "适当加入环境氛围描写，增强代入感",
          "人物对话要符合角色性格特点，避免千篇一律",
          "注重情节的起承转合，保持小说的连贯性",
          "体现玄幻世界的独特世界观和力量体系",
          "合理运用玄幻术语和设定，增强原著氛围"
        ]
      },
      fantasy: {
        type: 'fantasy',
        name: '奇幻小说风格',
        characteristics: [
          "注重人物性格刻画和心理描写，展现角色的复杂性和成长",
          "通过对话、行动、环境细节展现人物性格，让角色'活'起来",
          "描写要生动具体，避免空洞概括",
          "适当加入环境氛围描写，增强代入感",
          "人物对话要符合角色性格特点，避免千篇一律",
          "注重情节的起承转合，保持小说的连贯性",
          "体现奇幻世界的独特世界观和魔法体系",
          "合理运用奇幻术语和设定，增强原著氛围"
        ]
      },
      generic: {
        type: 'generic',
        name: '通用小说风格',
        characteristics: [
          "保持原著小说的文学性，注重人物性格刻画和心理描写",
          "通过对话、行动、环境细节展现人物性格，让角色'活'起来",
          "描写要生动具体，避免空洞概括",
          "适当加入环境氛围描写，增强代入感",
          "人物对话要符合角色性格特点，避免千篇一律",
          "注重情节的起承转合，保持小说的连贯性"
        ]
      }
    };

    const defaultStyle = defaultStyles[styleType] || defaultStyles.generic;
    
    try {
      const metadata = JSON.parse(fs.readFileSync(this.metadataPath, 'utf8'));
      
      if (metadata[novelId]) {
        metadata[novelId].writingStyle = defaultStyle;
        fs.writeFileSync(this.metadataPath, JSON.stringify(metadata, null, 2));
        
        this.writingStyles[novelId] = defaultStyle;
        console.log(`[Writing Style] Added default writing style for ${novelName}`);
        
        return true;
      }
    } catch (error) {
      console.error('[Writing Style] Failed to add default writing style:', error);
    }

    return false;
  }

  /**
   * 生成一致性分析提示词
   */
  generateConsistencyPrompt(analysis) {
    if (!analysis) {
      return '';
    }

    const prompts = [];

    // 角色关系分析
    if (analysis.relationships && Object.keys(analysis.relationships).length > 0) {
      prompts.push(`【角色关系】已识别${Object.keys(analysis.relationships).length}个角色的关系网络，生成剧情时需保持角色关系的一致性`);
    }

    // 时间线一致性
    if (analysis.timeline) {
      if (analysis.timeline.conflicts && analysis.timeline.conflicts.length > 0) {
        prompts.push(`【时间线】检测到${analysis.timeline.conflicts.length}个时间冲突，需避免类似矛盾`);
      }
      prompts.push(`【时间线】剧情发展需符合时间逻辑，角色不能同时出现在多个地点`);
    }

    // 物品追踪
    if (analysis.items && Object.keys(analysis.items).length > 0) {
      prompts.push(`【物品追踪】已追踪${Object.keys(analysis.items).length}个物品，需保持物品状态的一致性`);
    }

    // 势力识别
    if (analysis.factions && Object.keys(analysis.factions).length > 0) {
      prompts.push(`【势力关系】已识别${Object.keys(analysis.factions).length}个势力，需保持势力关系的一致性`);
    }

    // 实力成长轨迹
    if (analysis.powerGrowth && analysis.powerGrowth.jumps && analysis.powerGrowth.jumps.length > 0) {
      prompts.push(`【实力成长】检测到${analysis.powerGrowth.jumps.length}个实力跳跃，需避免类似问题`);
    }

    // 地理连续性
    if (analysis.geographic && analysis.geographic.conflicts && analysis.geographic.conflicts.length > 0) {
      prompts.push(`【地理连续性】检测到${analysis.geographic.conflicts.length}个地理冲突，需避免类似问题`);
    }

    // 如果没有有效的分析结果，返回空字符串
    if (prompts.length === 0) {
      return '';
    }

    return `\n【一致性分析】\n${prompts.join('\n')}\n`;
  }
}

module.exports = new PowerSystemService();
