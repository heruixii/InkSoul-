/**
 * Server Manager Module
 * Server Management Module - For starting, stopping, and monitoring InkSoul / 墨魂 backend service
 * 
 * Features:
 * - Start/Stop server
 * - Monitor server status
 * - Get server logs
 * - Manage configuration files
 */

const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

// Configuration
const SERVER_PORT = 3000;
const SERVER_URL = `http://localhost:${SERVER_PORT}`;
const SERVER_SCRIPT = path.join(__dirname, 'server/index.js');
const SERVER_DIR = path.join(__dirname, 'server');
const LOG_FILE = path.join(__dirname, 'logs/server.log');
const EXTRACTION_SCRIPT = path.join(__dirname, 'server/enrich-story-from-novel.js');
// Note: EXTRACTION_PROGRESS_FILE is dynamically set per novel during extraction

// Novel management configuration
const DATA_DIR = path.join(__dirname, 'data');
const NOVELS_DIR = path.join(DATA_DIR, 'novels');
const METADATA_FILE = path.join(NOVELS_DIR, '_metadata.json');
const ACTIVE_FILE = path.join(NOVELS_DIR, '_active.json');

class ServerManager {
  constructor() {
    this.serverProcess = null;
    this.isRunning = false;
    this.statusCallbacks = [];
    this.logCallbacks = [];
    
    // Novel extraction tracking
    this.extractionProcess = null;
    this.isExtracting = false;
    this.extractionCallbacks = [];
    this.extractionLogCallbacks = [];
  }

  /**
   * Start server
   */
  async start() {
    if (this.isRunning) {
      console.log('[ServerManager] Server already running');
      return { success: false, message: 'Server already running' };
    }

    console.log('[ServerManager] Starting server...');
    console.log('[ServerManager] Server directory:', SERVER_DIR);
    console.log('[ServerManager] Server script:', SERVER_SCRIPT);

    // 启动服务器进程
    this.serverProcess = spawn('node', ['index.js'], {
      cwd: SERVER_DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env }
    });

    // 监听输出
    this.serverProcess.stdout.on('data', (data) => {
      const log = data.toString();
      this._notifyLogCallbacks(log);
      console.log('[Server]', log.trim());
    });

    this.serverProcess.stderr.on('data', (data) => {
      const log = data.toString();
      this._notifyLogCallbacks(log);
      console.error('[Server Error]', log.trim());
    });

    // 监听进程退出
    this.serverProcess.on('close', (code) => {
      console.log(`[ServerManager] Server process exited, code: ${code}`);
      this.isRunning = false;
      this.serverProcess = null;
      this._notifyStatusCallbacks('stopped');
    });

    // 监听进程错误
    this.serverProcess.on('error', (error) => {
      console.error('[ServerManager] Failed to spawn server process:', error.message);
      this.isRunning = false;
      this.serverProcess = null;
      this._notifyStatusCallbacks('stopped');
    });

    // 等待服务器启动
    try {
      await this._waitForServerReady();
    } catch (error) {
      console.error('[ServerManager] Server startup error:', error.message);
      return { success: false, message: error.message };
    }

    if (this.isRunning) {
      this._notifyStatusCallbacks('running');
      return { success: true, message: 'Server started successfully' };
    } else {
      return { success: false, message: 'Server failed to start' };
    }
  }

  /**
   * Stop server
   */
  async stop() {
    if (!this.isRunning || !this.serverProcess) {
      console.log('[ServerManager] Server not running');
      return { success: false, message: 'Server not running' };
    }

    console.log('[ServerManager] Stopping server...');

    // 尝试优雅关闭
    this.serverProcess.kill('SIGTERM');

    // 等待进程退出
    await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        // 强制关闭
        this.serverProcess.kill('SIGKILL');
        resolve();
      }, 5000);

      this.serverProcess.on('close', () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    this.isRunning = false;
    this.serverProcess = null;
    this._notifyStatusCallbacks('stopped');

    return { success: true, message: 'Server stopped' };
  }

  /**
   * Get server status
   */
  getStatus() {
    return {
      running: this.isRunning,
      url: SERVER_URL,
      port: SERVER_PORT
    };
  }

  /**
   * Wait for server to be ready
   */
  async _waitForServerReady() {
    const maxAttempts = 30; // Wait up to 30 seconds
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        await this._checkServerHealth();
        this.isRunning = true;
        console.log('[ServerManager] Server ready');
        return true;
      } catch (error) {
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    this.isRunning = false;
    console.error('[ServerManager] Server startup timeout');
    return false;
  }

  /**
   * Check server health
   */
  async _checkServerHealth() {
    return new Promise((resolve, reject) => {
      const req = http.get(`${SERVER_URL}/health`, (res) => {
        if (res.statusCode === 200) {
          resolve();
        } else {
          reject(new Error(`Server returned ${res.statusCode}`));
        }
      });

      req.on('error', reject);
      req.setTimeout(5000, () => {
        req.abort();
        reject(new Error('Request timeout'));
      });
    });
  }

  /**
   * Get logs
   */
  getLogs(lines = 100) {
    if (!fs.existsSync(LOG_FILE)) {
      return [];
    }

    const content = fs.readFileSync(LOG_FILE, 'utf8');
    const allLines = content.split('\n');
    return allLines.slice(-lines);
  }

  /**
   * Register status callback
   */
  onStatusChange(callback) {
    this.statusCallbacks.push(callback);
  }

  /**
   * Register log callback
   */
  onLog(callback) {
    this.logCallbacks.push(callback);
  }

  /**
   * Notify status callbacks
   */
  _notifyStatusCallbacks(status) {
    this.statusCallbacks.forEach(callback => callback(status));
  }

  /**
   * Notify log callbacks
   */
  _notifyLogCallbacks(log) {
    this.logCallbacks.forEach(callback => callback(log));
  }

  /**
   * Get configuration
   */
  getConfig() {
    const envFile = path.join(__dirname, '.env');
    if (!fs.existsSync(envFile)) {
      return { apiKey: '', apiUrl: '' };
    }

    const content = fs.readFileSync(envFile, 'utf8');
    const config = {};
    content.split('\n').forEach(line => {
      const [key, value] = line.split('=');
      if (key && value) {
        config[key] = value.trim();
      }
    });

    return {
      apiKey: config.DEEPSEEK_API_KEY || '',
      apiUrl: config.DEEPSEEK_API_URL || ''
    };
  }

  /**
   * Set configuration
   */
  setConfig(config) {
    const envFile = path.join(__dirname, '.env');
    const content = Object.entries(config)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    
    fs.writeFileSync(envFile, content);
    return { success: true, message: 'Configuration saved' };
  }

  /**
   * Get novel extraction status
   */
  getExtractionStatus() {
    // Get active novel first
    const activeNovel = this.getActiveNovel();
    if (!activeNovel) {
      return {
        extracted: false,
        progress: null,
        stats: null
      };
    }

    // Check metadata for extraction status
    const metadata = this.getNovels();
    if (metadata[activeNovel.id] && metadata[activeNovel.id].extracted) {
      // If metadata says extracted, return true
      // Try to get progress info if available
      const progressFile = path.join(NOVELS_DIR, activeNovel.id, 'extraction_progress.json');
      
      if (fs.existsSync(progressFile)) {
        try {
          const progress = JSON.parse(fs.readFileSync(progressFile, 'utf8'));
          return {
            extracted: true,
            progress: progress,
            stats: {
              characters: Object.keys(progress.allCharacters || {}).length,
              events: progress.allEvents ? progress.allEvents.length : 0,
              worldbook: Object.values(progress.allWorldbook || {}).flat().length
            }
          };
        } catch (error) {
          console.error('[ServerManager] Failed to read extraction progress:', error);
          return {
            extracted: true,
            progress: null,
            stats: null
          };
        }
      }
      
      return {
        extracted: true,
        progress: null,
        stats: null
      };
    }

    // If metadata doesn't show extracted, check progress file
    const progressFile = path.join(NOVELS_DIR, activeNovel.id, 'extraction_progress.json');
    
    if (!fs.existsSync(progressFile)) {
      return {
        extracted: false,
        progress: null,
        stats: null
      };
    }

    try {
      const progress = JSON.parse(fs.readFileSync(progressFile, 'utf8'));
      
      // Check if extraction has any progress
      const hasProgress = progress.processedIndices && progress.processedIndices.length > 0;
      
      return {
        extracted: hasProgress,
        progress: progress,
        stats: {
          characters: Object.keys(progress.allCharacters || {}).length,
          events: progress.allEvents ? progress.allEvents.length : 0,
          worldbook: Object.values(progress.allWorldbook || {}).flat().length
        }
      };
    } catch (error) {
      console.error('[ServerManager] Failed to read extraction progress:', error);
      return {
        extracted: false,
        progress: null,
        stats: null
      };
    }
  }

  /**
   * Run novel extraction
   */
  async runNovelExtraction(retryFailedOnly = false) {
    if (this.isExtracting) {
      return { success: false, message: 'Extraction already in progress' };
    }

    // Get active novel
    const activeNovel = this.getActiveNovel();
    if (!activeNovel) {
      return { success: false, message: 'No active novel selected' };
    }

    // Check if novel file exists
    if (!fs.existsSync(activeNovel.filePath)) {
      return { success: false, message: `Novel file not found: ${activeNovel.filePath}` };
    }

    console.log('[ServerManager] Starting novel extraction...');
    if (retryFailedOnly) {
      console.log('[ServerManager] Retry failed chapters mode enabled');
    }
    console.log(`[ServerManager] Novel: ${activeNovel.name}, File: ${activeNovel.filePath}`);
    this.isExtracting = true;
    this._notifyExtractionStatus('running');

    // Start extraction process with novel file path and ID as arguments
    // Get API key from config
    const config = this.getConfig();
    const envVars = { ...process.env };
    if (config.apiKey) {
      envVars.DEEPSEEK_API_KEY = config.apiKey;
    }
    if (retryFailedOnly) {
      envVars.RETRY_FAILED = 'true';
    }

    this.extractionProcess = spawn('node', [EXTRACTION_SCRIPT, activeNovel.filePath, activeNovel.id], {
      cwd: __dirname,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: envVars
    });

    // Capture output
    this.extractionProcess.stdout.on('data', (data) => {
      const log = data.toString();
      this._notifyExtractionLog(log);
      console.log('[Extraction]', log.trim());
    });

    this.extractionProcess.stderr.on('data', (data) => {
      const log = data.toString();
      this._notifyExtractionLog(log);
      console.error('[Extraction Error]', log.trim());
    });

    // Handle process exit
    this.extractionProcess.on('close', (code) => {
      console.log(`[ServerManager] Extraction process exited with code: ${code}`);
      this.isExtracting = false;
      this.extractionProcess = null;
      
      if (code === 0) {
        this._notifyExtractionStatus('completed');
      } else {
        this._notifyExtractionStatus('failed');
      }
    });

    // Handle process error
    this.extractionProcess.on('error', (error) => {
      console.error('[ServerManager] Failed to start extraction process:', error);
      this.isExtracting = false;
      this.extractionProcess = null;
      this._notifyExtractionStatus('failed');
    });

    return { success: true, message: 'Extraction started' };
  }

  /**
   * Stop novel extraction
   */
  async stopExtraction() {
    if (!this.isExtracting || !this.extractionProcess) {
      return { success: false, message: 'No extraction in progress' };
    }

    console.log('[ServerManager] Stopping extraction...');
    this.extractionProcess.kill('SIGTERM');

    // Wait for process to exit
    await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.extractionProcess.kill('SIGKILL');
        resolve();
      }, 5000);

      this.extractionProcess.on('close', () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    this.isExtracting = false;
    this.extractionProcess = null;
    this._notifyExtractionStatus('stopped');

    return { success: true, message: 'Extraction stopped' };
  }

  /**
   * Register extraction status callback
   */
  onExtractionStatusChange(callback) {
    this.extractionCallbacks.push(callback);
  }

  /**
   * Register extraction log callback
   */
  onExtractionLog(callback) {
    this.extractionLogCallbacks.push(callback);
  }

  /**
   * Notify extraction status callbacks
   */
  _notifyExtractionStatus(status) {
    this.extractionCallbacks.forEach(callback => callback(status));
  }

  /**
   * Notify extraction log callbacks
   */
  _notifyExtractionLog(log) {
    this.extractionLogCallbacks.forEach(callback => callback(log));
  }

  /**
   * Get all novels
   */
  getNovels() {
    if (!fs.existsSync(METADATA_FILE)) {
      return {};
    }
    try {
      return JSON.parse(fs.readFileSync(METADATA_FILE, 'utf8'));
    } catch (error) {
      console.error('[ServerManager] Failed to read novel metadata:', error);
      return {};
    }
  }

  /**
   * Get active novel
   */
  getActiveNovel() {
    if (!fs.existsSync(ACTIVE_FILE)) {
      return null;
    }
    try {
      const active = JSON.parse(fs.readFileSync(ACTIVE_FILE, 'utf8'));
      const novelId = active.activeNovelId;
      const novels = this.getNovels();
      return novels[novelId] || null;
    } catch (error) {
      console.error('[ServerManager] Failed to read active novel:', error);
      return null;
    }
  }

  /**
   * Set active novel
   */
  setActiveNovel(novelId) {
    const novels = this.getNovels();
    if (!novels[novelId]) {
      return { success: false, message: 'Novel not found' };
    }

    fs.writeFileSync(ACTIVE_FILE, JSON.stringify({ activeNovelId: novelId }, null, 2));
    return { success: true, message: 'Active novel set' };
  }

  /**
   * Add novel
   */
  addNovel(novelFilePath, novelId = null) {
    if (!fs.existsSync(novelFilePath)) {
      return { success: false, message: 'Novel file not found' };
    }

    let actualFilePath = novelFilePath;
    const stats = fs.statSync(novelFilePath);

    // If path is a directory, automatically find the novel file
    if (stats.isDirectory()) {
      console.log('[ServerManager] Input is a directory, searching for novel file...');
      const files = fs.readdirSync(novelFilePath);
      
      // Look for common novel file patterns
      const novelFilePatterns = [
        /\.txt$/i,
        /\.txt\.utf-8$/i,
        /\.txt\.gb18030$/i,
        /\.utf-8$/i,
        /\.gbk$/i
      ];

      for (const pattern of novelFilePatterns) {
        const found = files.find(f => pattern.test(f));
        if (found) {
          actualFilePath = path.join(novelFilePath, found);
          console.log(`[ServerManager] Found novel file: ${actualFilePath}`);
          break;
        }
      }

      // If no pattern matched, try the first .txt file
      if (actualFilePath === novelFilePath) {
        const txtFile = files.find(f => f.toLowerCase().endsWith('.txt'));
        if (txtFile) {
          actualFilePath = path.join(novelFilePath, txtFile);
          console.log(`[ServerManager] Found .txt file: ${actualFilePath}`);
        } else {
          return { success: false, message: 'No novel file found in directory' };
        }
      }

      // Verify the found file exists and has content
      if (!fs.existsSync(actualFilePath)) {
        return { success: false, message: 'Novel file not found' };
      }

      const fileStats = fs.statSync(actualFilePath);
      if (fileStats.size === 0) {
        return { success: false, message: 'Novel file is empty' };
      }

      if (fileStats.size < 1024 * 1024) {
        console.warn(`[ServerManager] Warning: File size is small (${(fileStats.size / 1024 / 1024).toFixed(2)} MB)`);
      }
    }

    // Generate novel ID from filename if not provided
    const id = novelId || path.basename(actualFilePath, path.extname(actualFilePath)).toLowerCase().replace(/[^a-z0-9_]/g, '_');

    // Load existing metadata
    let metadata = {};
    if (fs.existsSync(METADATA_FILE)) {
      try {
        metadata = JSON.parse(fs.readFileSync(METADATA_FILE, 'utf8'));
      } catch (e) {
        metadata = {};
      }
    }

    // Add or update novel metadata
    const novelStats = fs.statSync(actualFilePath);
    metadata[id] = {
      id: id,
      name: path.basename(actualFilePath, path.extname(actualFilePath)),
      filePath: actualFilePath,
      fileSize: novelStats.size,
      createdAt: new Date().toISOString(),
      extracted: false
    };

    fs.writeFileSync(METADATA_FILE, JSON.stringify(metadata, null, 2));
    return { success: true, message: 'Novel added', novelId: id };
  }

  /**
   * Delete novel
   */
  deleteNovel(novelId) {
    const novels = this.getNovels();
    if (!novels[novelId]) {
      return { success: false, message: 'Novel not found' };
    }

    // Delete novel data directory
    const novelDataDir = path.join(NOVELS_DIR, novelId);
    if (fs.existsSync(novelDataDir)) {
      fs.rmSync(novelDataDir, { recursive: true, force: true });
    }

    // Remove from metadata
    delete novels[novelId];
    fs.writeFileSync(METADATA_FILE, JSON.stringify(novels, null, 2));

    // Clear active novel if this was the active one
    const active = this.getActiveNovel();
    if (active && active.id === novelId) {
      const remainingNovels = Object.keys(novels);
      if (remainingNovels.length > 0) {
        this.setActiveNovel(remainingNovels[0]);
      } else {
        fs.writeFileSync(ACTIVE_FILE, JSON.stringify({ activeNovelId: null }, null, 2));
      }
    }

    return { success: true, message: 'Novel deleted' };
  }
}

module.exports = ServerManager;
