/**
 * Character Sync Script
 * Syncs extracted novel attributes with existing character cards
 * Supports dry-run mode and detailed logging
 */

const fs = require('fs');
const path = require('path');
const https = require('http');

// Configuration
const CHARACTERS_DIR = path.join(__dirname, '../characters');
const CHARACTER_CACHE_FILE = path.join(__dirname, '../data/character_attributes_cache.json');
const SYNC_LOG_FILE = path.join(__dirname, '../logs/character-sync.log');

// Ensure logs directory exists
const LOG_DIR = path.dirname(SYNC_LOG_FILE);
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

/**
 * Write to log file
 */
function writeLog(message) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${message}\n`;
  fs.appendFileSync(SYNC_LOG_FILE, logEntry, 'utf-8');
  console.log(message);
}

/**
 * Load character attributes cache
 */
function loadCharacterCache() {
  if (!fs.existsSync(CHARACTER_CACHE_FILE)) {
    writeLog('Error: Character cache file not found. Run enrich-story first.');
    process.exit(1);
  }
  
  const cacheData = fs.readFileSync(CHARACTER_CACHE_FILE, 'utf-8');
  return JSON.parse(cacheData);
}

/**
 * Get all character card files
 */
function getCharacterCardFiles() {
  if (!fs.existsSync(CHARACTERS_DIR)) {
    writeLog('Error: Characters directory not found');
    process.exit(1);
  }
  
  const files = fs.readdirSync(CHARACTERS_DIR).filter(f => f.endsWith('.json'));
  return files.map(f => ({
    filename: f,
    name: f.replace(/^角色卡_/, '').replace(/\.json$/, ''),
    path: path.join(CHARACTERS_DIR, f)
  }));
}

/**
 * Load character card
 */
function loadCharacterCard(filePath) {
  const cardData = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(cardData);
}

/**
 * Save character card
 */
function saveCharacterCard(filePath, cardData) {
  fs.writeFileSync(filePath, JSON.stringify(cardData, null, 2), 'utf-8');
}

/**
 * Normalize character name for matching
 */
function normalizeName(name) {
  return name.replace(/[_\s]/g, '').toLowerCase();
}

/**
 * Check if names match (including aliases)
 */
function namesMatch(cardName, cacheName) {
  const normalizedCard = normalizeName(cardName);
  const normalizedCache = normalizeName(cacheName);
  
  // Direct match
  if (normalizedCard === normalizedCache) {
    return true;
  }
  
  // Check for common aliases (loaded from novel config)
  const aliases = {}; // 由小说配置文件决定
  
  for (const [key, aliasList] of Object.entries(aliases)) {
    if (normalizedCard === normalizeName(key) && aliasList.includes(cacheName)) {
      return true;
    }
    if (normalizedCache === normalizeName(key) && aliasList.includes(cardName)) {
      return true;
    }
  }
  
  // Check if one name contains the other (for clan names)
  if (normalizedCache.includes(normalizedCard) || normalizedCard.includes(normalizedCache)) {
    return true;
  }
  
  return false;
}

/**
 * Merge tags
 */
function mergeTags(existingTags, newTags) {
  const merged = new Set();
  
  if (existingTags && Array.isArray(existingTags)) {
    existingTags.forEach(tag => merged.add(tag));
  }
  
  if (newTags && Array.isArray(newTags)) {
    newTags.forEach(tag => merged.add(tag));
  }
  
  return Array.from(merged);
}

/**
 * Append description if more detailed
 */
function appendDescription(existingDesc, newDesc) {
  if (!newDesc) return existingDesc;
  if (!existingDesc) return newDesc;
  
  // If new description is significantly longer and doesn't conflict
  if (newDesc.length > existingDesc.length * 1.5 && !existingDesc.includes(newDesc.substring(0, 50))) {
    return existingDesc + '\n\n' + newDesc;
  }
  
  return existingDesc;
}

/**
 * Sync character card with extracted data
 */
function syncCharacterCard(cardData, extractedAttrs, dryRun = false) {
  const changes = [];
  
  // Skip if original character
  if (cardData.isOriginal === true) {
    return { skipped: true, reason: 'isOriginal: true', changes: [] };
  }
  
  // Try to find matching extracted attributes
  let matchedAttrs = null;
  
  // Direct name match
  if (extractedAttrs[cardData.name]) {
    matchedAttrs = extractedAttrs[cardData.name];
  } else {
    // Try alias matching
    for (const [cacheName, attrs] of Object.entries(extractedAttrs)) {
      if (namesMatch(cardData.name, cacheName)) {
        matchedAttrs = attrs;
        changes.push(`Matched via alias: ${cardData.name} <-> ${cacheName}`);
        break;
      }
    }
  }
  
  if (!matchedAttrs) {
    return { skipped: true, reason: 'No matching extracted attributes', changes: [] };
  }
  
  // Sync realm
  if (matchedAttrs.realm && matchedAttrs.realm !== cardData.realm) {
    const oldRealm = cardData.realm;
    cardData.realm = matchedAttrs.realm;
    changes.push(`realm: "${oldRealm}" -> "${matchedAttrs.realm}"`);
  }
  
  // Sync path
  if (matchedAttrs.path && matchedAttrs.path !== cardData.path) {
    const oldPath = cardData.path;
    cardData.path = matchedAttrs.path;
    changes.push(`path: "${oldPath}" -> "${matchedAttrs.path}"`);
  }
  
  // Sync title
  if (matchedAttrs.title && matchedAttrs.title !== cardData.title) {
    const oldTitle = cardData.title;
    cardData.title = matchedAttrs.title;
    changes.push(`title: "${oldTitle}" -> "${matchedAttrs.title}"`);
  }
  
  // Sync affiliation
  if (matchedAttrs.affiliation && matchedAttrs.affiliation !== cardData.affiliation) {
    const oldAffiliation = cardData.affiliation;
    cardData.affiliation = matchedAttrs.affiliation;
    changes.push(`affiliation: "${oldAffiliation}" -> "${matchedAttrs.affiliation}"`);
  }
  
  // Merge tags
  if (matchedAttrs.tags) {
    const oldTags = cardData.tags || [];
    const newTags = mergeTags(oldTags, matchedAttrs.tags);
    if (JSON.stringify(oldTags) !== JSON.stringify(newTags)) {
      cardData.tags = newTags;
      changes.push(`tags: merged (${oldTags.length} -> ${newTags.length})`);
    }
  }
  
  // Append description
  if (matchedAttrs.description) {
    const oldDesc = cardData.description;
    const newDesc = appendDescription(oldDesc, matchedAttrs.description);
    if (oldDesc !== newDesc) {
      cardData.description = newDesc;
      changes.push(`description: appended (${oldDesc.length} -> ${newDesc.length} chars)`);
    }
  }
  
  // Increment version
  const oldVersion = cardData.version || 1;
  cardData.version = oldVersion + 1;
  changes.push(`version: ${oldVersion} -> ${cardData.version}`);
  
  return { skipped: false, changes: changes };
}

/**
 * Trigger hot update API
 */
function triggerHotUpdate() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/characters/correct-from-novel',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    };
    
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(data);
        } else {
          reject(new Error(`API returned status ${res.statusCode}`));
        }
      });
    });
    
    req.on('error', (error) => {
      // API might not be running, that's okay
      resolve(null);
    });
    
    req.write(JSON.stringify({ source: 'sync-characters-with-novel' }));
    req.end();
  });
}

/**
 * Main function
 */
async function main() {
  const dryRun = process.argv.includes('--dry-run');
  
  writeLog('=== Character Sync Script ===');
  writeLog(dryRun ? 'DRY-RUN MODE - No changes will be saved' : 'LIVE MODE - Changes will be saved');
  writeLog('');
  
  // Load cache
  writeLog('Loading character attributes cache...');
  const characterCache = loadCharacterCache();
  writeLog(`Loaded ${Object.keys(characterCache).length} extracted characters`);
  
  // Get character card files
  writeLog('Loading character card files...');
  const characterFiles = getCharacterCardFiles();
  writeLog(`Found ${characterFiles.length} character cards`);
  writeLog('');
  
  // Statistics
  const stats = {
    total: characterFiles.length,
    skipped: 0,
    updated: 0,
    unchanged: 0
  };
  
  const syncResults = [];
  
  // Process each character card
  for (const file of characterFiles) {
    writeLog(`Processing: ${file.name}`);
    
    const cardData = loadCharacterCard(file.path);
    const syncResult = syncCharacterCard(cardData, characterCache, dryRun);
    
    syncResult.cardName = file.name;
    syncResults.push(syncResult);
    
    if (syncResult.skipped) {
      stats.skipped++;
      writeLog(`  Skipped: ${syncResult.reason}`);
    } else if (syncResult.changes.length > 0) {
      stats.updated++;
      writeLog(`  Updated: ${syncResult.changes.length} changes`);
      for (const change of syncResult.changes) {
        writeLog(`    - ${change}`);
      }
      
      // Save if not dry run
      if (!dryRun) {
        saveCharacterCard(file.path, cardData);
        writeLog(`  Saved: ${file.filename}`);
      }
    } else {
      stats.unchanged++;
      writeLog(`  Unchanged`);
    }
    
    writeLog('');
  }
  
  // Summary
  writeLog('=== Sync Summary ===');
  writeLog(`Total character cards: ${stats.total}`);
  writeLog(`Skipped: ${stats.skipped}`);
  writeLog(`Updated: ${stats.updated}`);
  writeLog(`Unchanged: ${stats.unchanged}`);
  
  // Detailed changes report
  if (stats.updated > 0) {
    writeLog('');
    writeLog('=== Updated Characters ===');
    for (const result of syncResults) {
      if (!result.skipped && result.changes.length > 0) {
        writeLog(`${result.cardName}:`);
        for (const change of result.changes) {
          writeLog(`  - ${change}`);
        }
      }
    }
  }
  
  // Trigger hot update if not dry run and there were updates
  if (!dryRun && stats.updated > 0) {
    writeLog('');
    writeLog('Triggering hot update API...');
    try {
      await triggerHotUpdate();
      writeLog('Hot update triggered successfully');
    } catch (error) {
      writeLog('Hot update failed (API might not be running): ' + error.message);
    }
  }
  
  writeLog('');
  writeLog('=== Sync Complete ===');
}

// Run
main().catch(error => {
  writeLog('Execution failed: ' + error.message);
  process.exit(1);
});
