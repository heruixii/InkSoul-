/**
 * Story Data Verification Script - Enhanced Version
 * Verifies generated JSON data against the original novel
 * Random sampling, error reporting, and auto-correction suggestions
 */

const fs = require('fs');
const path = require('path');

// Configuration
const NOVEL_FILE = process.argv[2] ? path.resolve(process.argv[2]) : null;
const STORY_FRAMEWORK_FILE = path.join(__dirname, '../data/story_framework.json');
const TIMELINE_FILE = path.join(__dirname, '../data/timeline.json');
const CANON_ANCHORS_FILE = path.join(__dirname, '../data/canon_anchors.json');
const CHARACTER_CACHE_FILE = path.join(__dirname, '../data/character_attributes_cache.json');
const CORRECTION_SUGGESTIONS_FILE = path.join(__dirname, '../data/correction_suggestions.json');

// Verification settings
const SAMPLE_SIZE = 25; // Sample 25 items from each category
const CONTEXT_WINDOW = 300; // Characters around the match

/**
 * Read novel file
 */
function readNovel() {
  if (!fs.existsSync(NOVEL_FILE)) {
    console.error('Novel file not found:', NOVEL_FILE);
    process.exit(1);
  }
  
  return fs.readFileSync(NOVEL_FILE, 'utf-8');
}

/**
 * Verify character attributes against novel
 */
function verifyCharacter(novelContent, character) {
  const verification = {
    name: character.name,
    realm: character.realm,
    path: character.path,
    foundInNovel: false,
    realmMatch: false,
    pathMatch: false,
    context: '',
    issues: [],
    suggestions: []
  };
  
  // Check if character appears in novel
  const charIndex = novelContent.indexOf(character.name);
  if (charIndex !== -1) {
    verification.foundInNovel = true;
    
    // Extract context around character
    const contextStart = Math.max(0, charIndex - CONTEXT_WINDOW);
    const contextEnd = Math.min(novelContent.length, charIndex + character.name.length + CONTEXT_WINDOW);
    verification.context = novelContent.substring(contextStart, contextEnd);
    
    // Check realm
    if (character.realm) {
      if (verification.context.includes(character.realm)) {
        verification.realmMatch = true;
      } else {
        verification.issues.push('境界 "' + character.realm + '" 在上下文中未找到');
        verification.suggestions.push('手动检查小说中该角色的境界描述');
      }
    }
    
    // Check path
    if (character.path) {
      if (verification.context.includes(character.path)) {
        verification.pathMatch = true;
      } else {
        verification.issues.push('道途 "' + character.path + '" 在上下文中未找到');
        verification.suggestions.push('手动检查小说中该角色的道途描述');
      }
    }
  } else {
    verification.issues.push('角色名 "' + character.name + '" 在小说中未找到');
    verification.suggestions.push('确认角色名是否正确或是否为原创角色');
  }
  
  return verification;
}

/**
 * Verify event against novel
 */
function verifyEvent(novelContent, event) {
  const verification = {
    name: event.name,
    description: event.description,
    foundInNovel: false,
    descriptionMatch: false,
    context: '',
    issues: [],
    suggestions: []
  };
  
  // Check if event description appears in novel
  if (event.description && event.description.length > 10) {
    const descSnippet = event.description.substring(0, 20);
    const descIndex = novelContent.indexOf(descSnippet);
    if (descIndex !== -1) {
      verification.foundInNovel = true;
      
      const contextStart = Math.max(0, descIndex - CONTEXT_WINDOW);
      const contextEnd = Math.min(novelContent.length, descIndex + CONTEXT_WINDOW);
      verification.context = novelContent.substring(contextStart, contextEnd);
      
      if (verification.context.includes(event.description.substring(0, 15))) {
        verification.descriptionMatch = true;
      } else {
        verification.issues.push('事件描述与原文不完全匹配');
        verification.suggestions.push('检查事件描述是否准确');
      }
    } else {
      verification.issues.push('事件描述在小说中未找到');
      verification.suggestions.push('确认事件是否真实存在于原著');
    }
  } else {
    verification.issues.push('事件描述过短或为空');
    verification.suggestions.push('补充完整的事件描述');
  }
  
  return verification;
}

/**
 * Verify canon anchor against novel
 */
function verifyAnchor(novelContent, anchor) {
  const verification = {
    fact: anchor.fact,
    foundInNovel: false,
    context: '',
    issues: [],
    suggestions: []
  };
  
  // Check if anchor fact appears in novel
  if (anchor.fact && anchor.fact.length > 10) {
    const factSnippet = anchor.fact.substring(0, 15);
    const factIndex = novelContent.indexOf(factSnippet);
    if (factIndex !== -1) {
      verification.foundInNovel = true;
      
      const contextStart = Math.max(0, factIndex - CONTEXT_WINDOW);
      const contextEnd = Math.min(novelContent.length, factIndex + CONTEXT_WINDOW);
      verification.context = novelContent.substring(contextStart, contextEnd);
    } else {
      verification.issues.push('锚点事实在小说中未找到');
      verification.suggestions.push('确认锚点是否为原著设定或需要调整表述');
    }
  } else {
    verification.issues.push('锚点事实过短或为空');
    verification.suggestions.push('补充完整的锚点事实');
  }
  
  return verification;
}

/**
 * Random sampling from array
 */
function randomSample(array, size) {
  const shuffled = [...array].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, Math.min(size, array.length));
}

/**
 * Generate correction suggestions
 */
function generateCorrectionSuggestions(characterVerifications, eventVerifications, anchorVerifications) {
  const suggestions = {
    characters: [],
    events: [],
    anchors: [],
    generatedAt: new Date().toISOString()
  };
  
  // Character suggestions
  for (const v of characterVerifications) {
    if (v.issues.length > 0) {
      suggestions.characters.push({
        name: v.name,
        currentRealm: v.realm,
        currentPath: v.path,
        issues: v.issues,
        suggestions: v.suggestions,
        context: v.context
      });
    }
  }
  
  // Event suggestions
  for (const v of eventVerifications) {
    if (v.issues.length > 0) {
      suggestions.events.push({
        name: v.name,
        currentDescription: v.description,
        issues: v.issues,
        suggestions: v.suggestions,
        context: v.context
      });
    }
  }
  
  // Anchor suggestions
  for (const v of anchorVerifications) {
    if (v.issues.length > 0) {
      suggestions.anchors.push({
        fact: v.fact,
        issues: v.issues,
        suggestions: v.suggestions,
        context: v.context
      });
    }
  }
  
  return suggestions;
}

/**
 * Main function
 */
async function main() {
  console.log('=== Story Data Verification Script v2.0 ===\n');
  
  const shouldFix = process.argv.includes('--fix');
  if (shouldFix) {
    console.log('Auto-fix mode enabled\n');
  }
  
  // Read novel
  console.log('Reading novel...');
  const novelContent = readNovel();
  console.log('Novel loaded:', novelContent.length, 'characters\n');
  
  // Load data files
  console.log('Loading data files...');
  
  let storyFramework = null;
  let timeline = null;
  let canonAnchors = null;
  let characterCache = null;
  
  if (fs.existsSync(STORY_FRAMEWORK_FILE)) {
    storyFramework = JSON.parse(fs.readFileSync(STORY_FRAMEWORK_FILE, 'utf-8'));
    console.log('Loaded story framework');
  } else {
    console.error('Story framework file not found. Run enrich-story first.');
    process.exit(1);
  }
  
  if (fs.existsSync(TIMELINE_FILE)) {
    timeline = JSON.parse(fs.readFileSync(TIMELINE_FILE, 'utf-8'));
    console.log('Loaded timeline');
  } else {
    console.error('Timeline file not found. Run enrich-story first.');
    process.exit(1);
  }
  
  if (fs.existsSync(CANON_ANCHORS_FILE)) {
    canonAnchors = JSON.parse(fs.readFileSync(CANON_ANCHORS_FILE, 'utf-8'));
    console.log('Loaded canon anchors');
  } else {
    console.error('Canon anchors file not found. Run enrich-story first.');
    process.exit(1);
  }
  
  if (fs.existsSync(CHARACTER_CACHE_FILE)) {
    characterCache = JSON.parse(fs.readFileSync(CHARACTER_CACHE_FILE, 'utf-8'));
    console.log('Loaded character cache');
  }
  
  console.log();
  
  // Verify characters (random sample)
  console.log('=== Character Verification ===');
  const charactersToVerify = [];
  for (const chapter of storyFramework.chapters) {
    if (chapter.characters && chapter.characters.length > 0) {
      charactersToVerify.push(...chapter.characters);
    }
  }
  
  // Also add from character cache if available
  if (characterCache) {
    for (const charName of Object.keys(characterCache)) {
      charactersToVerify.push(charName);
    }
  }
  
  const uniqueCharacters = [...new Set(charactersToVerify)];
  const sampledCharacters = randomSample(uniqueCharacters, SAMPLE_SIZE);
  console.log('Verifying', sampledCharacters.length, 'random characters out of', uniqueCharacters.length, 'total\n');
  
  const characterVerifications = [];
  let charFoundCount = 0;
  let realmMatchCount = 0;
  let pathMatchCount = 0;
  
  for (const charName of sampledCharacters) {
    const charData = characterCache && characterCache[charName] ? characterCache[charName] : { name: charName, realm: null, path: null };
    const verification = verifyCharacter(novelContent, charData);
    characterVerifications.push(verification);
    
    console.log(`Character: ${verification.name}`);
    console.log(`  Found in novel: ${verification.foundInNovel ? 'Yes' : 'No'}`);
    console.log(`  Realm match: ${verification.realmMatch ? 'Yes' : 'N/A'}`);
    console.log(`  Path match: ${verification.pathMatch ? 'Yes' : 'N/A'}`);
    if (verification.issues.length > 0) {
      console.log(`  Issues: ${verification.issues.join('; ')}`);
    }
    if (verification.context) {
      console.log(`  Context: ${verification.context.substring(0, 100)}...`);
    }
    console.log('');
    
    if (verification.foundInNovel) charFoundCount++;
    if (verification.realmMatch) realmMatchCount++;
    if (verification.pathMatch) pathMatchCount++;
  }
  
  // Verify events (random sample)
  console.log('=== Event Verification ===');
  const sampledEvents = randomSample(timeline.events, SAMPLE_SIZE);
  console.log('Verifying', sampledEvents.length, 'random events out of', timeline.events.length, 'total\n');
  
  const eventVerifications = [];
  let eventFoundCount = 0;
  let eventMatchCount = 0;
  
  for (const event of sampledEvents) {
    const verification = verifyEvent(novelContent, event);
    eventVerifications.push(verification);
    
    console.log(`Event: ${verification.name}`);
    console.log(`  Found in novel: ${verification.foundInNovel ? 'Yes' : 'No'}`);
    console.log(`  Description match: ${verification.descriptionMatch ? 'Yes' : 'No'}`);
    if (verification.issues.length > 0) {
      console.log(`  Issues: ${verification.issues.join('; ')}`);
    }
    if (verification.context) {
      console.log(`  Context: ${verification.context.substring(0, 100)}...`);
    }
    console.log('');
    
    if (verification.foundInNovel) eventFoundCount++;
    if (verification.descriptionMatch) eventMatchCount++;
  }
  
  // Verify canon anchors
  console.log('=== Canon Anchor Verification ===');
  const sampledAnchors = randomSample(canonAnchors.anchors, SAMPLE_SIZE);
  console.log('Verifying', sampledAnchors.length, 'random anchors out of', canonAnchors.anchors.length, 'total\n');
  
  const anchorVerifications = [];
  let anchorFoundCount = 0;
  
  for (const anchor of sampledAnchors) {
    const verification = verifyAnchor(novelContent, anchor);
    anchorVerifications.push(verification);
    
    console.log(`Anchor: ${verification.fact.substring(0, 50)}...`);
    console.log(`  Found in novel: ${verification.foundInNovel ? 'Yes' : 'No'}`);
    if (verification.issues.length > 0) {
      console.log(`  Issues: ${verification.issues.join('; ')}`);
    }
    if (verification.context) {
      console.log(`  Context: ${verification.context.substring(0, 100)}...`);
    }
    console.log('');
    
    if (verification.foundInNovel) anchorFoundCount++;
  }
  
  // Summary
  console.log('=== Verification Summary ===');
  console.log(`Characters verified: ${sampledCharacters.length}/${uniqueCharacters.length}`);
  console.log(`Characters found in novel: ${charFoundCount} (${Math.round(charFoundCount/sampledCharacters.length*100)}%)`);
  console.log(`Realm matches: ${realmMatchCount}`);
  console.log(`Path matches: ${pathMatchCount}`);
  console.log(`Events verified: ${sampledEvents.length}/${timeline.events.length}`);
  console.log(`Events found in novel: ${eventFoundCount} (${Math.round(eventFoundCount/sampledEvents.length*100)}%)`);
  console.log(`Event description matches: ${eventMatchCount}`);
  console.log(`Anchors verified: ${sampledAnchors.length}/${canonAnchors.anchors.length}`);
  console.log(`Anchors found in novel: ${anchorFoundCount} (${Math.round(anchorFoundCount/sampledAnchors.length*100)}%)`);
  
  // Error report
  const failedCharacters = characterVerifications.filter(v => v.issues.length > 0);
  const failedEvents = eventVerifications.filter(v => v.issues.length > 0);
  const failedAnchors = anchorVerifications.filter(v => v.issues.length > 0);
  
  console.log('\n=== Error Report ===');
  console.log(`Characters with issues: ${failedCharacters.length}`);
  console.log(`Events with issues: ${failedEvents.length}`);
  console.log(`Anchors with issues: ${failedAnchors.length}`);
  
  if (failedCharacters.length > 0) {
    console.log('\nFailed Characters:');
    for (const v of failedCharacters) {
      console.log(`  - ${v.name}: ${v.issues.join('; ')}`);
    }
  }
  
  if (failedEvents.length > 0) {
    console.log('\nFailed Events:');
    for (const v of failedEvents) {
      console.log(`  - ${v.name}: ${v.issues.join('; ')}`);
    }
  }
  
  if (failedAnchors.length > 0) {
    console.log('\nFailed Anchors:');
    for (const v of failedAnchors) {
      console.log(`  - ${v.fact.substring(0, 30)}...: ${v.issues.join('; ')}`);
    }
  }
  
  // Generate correction suggestions
  console.log('\n=== Generating Correction Suggestions ===');
  const correctionSuggestions = generateCorrectionSuggestions(
    characterVerifications,
    eventVerifications,
    anchorVerifications
  );
  
  fs.writeFileSync(CORRECTION_SUGGESTIONS_FILE, JSON.stringify(correctionSuggestions, null, 2), 'utf-8');
  console.log('Correction suggestions saved:', CORRECTION_SUGGESTIONS_FILE);
  
  // Auto-fix if requested
  if (shouldFix) {
    console.log('\n=== Auto-Fix Mode ===');
    console.log('Auto-fix would call sync-characters-with-novel.js');
    console.log('Run: node server/sync-characters-with-novel.js');
  }
  
  console.log('\n=== Verification Complete ===');
}

// Run
main().catch(error => {
  console.error('Execution failed:', error);
  process.exit(1);
});
