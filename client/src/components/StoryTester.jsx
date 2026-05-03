import React, { useState, useEffect, useRef } from 'react';
import { Loader2, CheckCircle, XCircle, AlertCircle, Trash2, Square } from 'lucide-react';

export default function StoryTester() {
  const [stories, setStories] = useState([]);
  const [selectedStories, setSelectedStories] = useState([]);
  const [timeLimit, setTimeLimit] = useState('');
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [testing, setTesting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [error, setError] = useState(null);
  const abortControllerRef = useRef(null);

  // 从localStorage恢复测试状态
  useEffect(() => {
    const savedTesting = localStorage.getItem('storyTester_testing');
    const savedTestResult = localStorage.getItem('storyTester_testResult');
    const savedError = localStorage.getItem('storyTester_error');
    
    if (savedTesting === 'true') setTesting(true);
    if (savedTestResult) setTestResult(JSON.parse(savedTestResult));
    if (savedError) setError(savedError);
  }, []);

  // 保存测试状态到localStorage
  useEffect(() => {
    localStorage.setItem('storyTester_testing', testing);
  }, [testing]);

  useEffect(() => {
    localStorage.setItem('storyTester_testResult', JSON.stringify(testResult));
  }, [testResult]);

  useEffect(() => {
    localStorage.setItem('storyTester_error', error || '');
  }, [error]);

  // 加载故事列表
  useEffect(() => {
    fetchStories();
  }, []);

  const fetchStories = async () => {
    try {
      const response = await fetch('/api/stories');
      if (!response.ok) throw new Error('Failed to fetch stories');
      const data = await response.json();
      setStories(data);
    } catch (err) {
      setError('加载故事列表失败: ' + err.message);
    }
  };

  const handleStoryToggle = (storyId) => {
    setSelectedStories(prev =>
      prev.includes(storyId)
        ? prev.filter(id => id !== storyId)
        : [...prev, storyId]
    );
  };

  const handleSelectAll = () => {
    if (selectedStories.length === stories.length) {
      setSelectedStories([]);
    } else {
      setSelectedStories(stories.map(s => s.id));
    }
  };

  const runTest = async () => {
    if (selectedStories.length === 0) {
      setError('请至少选择一个故事进行测试');
      return;
    }

    setTesting(true);
    setStopping(false);
    setError(null);
    setTestResult(null);

    // 创建新的 AbortController
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch('/api/stories/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          storyIds: selectedStories,
          timeLimit: timeLimit ? parseInt(timeLimit) : 0,
          autoAdvance: autoAdvance
        }),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) throw new Error('测试执行失败');

      const data = await response.json();
      
      // 处理测试中断的情况
      if (data.interrupted) {
        setError('测试已停止，显示部分结果');
      }
      
      setTestResult(data);
    } catch (err) {
      if (err.name === 'AbortError') {
        setError('测试已取消');
      } else {
        setError('测试执行失败: ' + err.message);
      }
    } finally {
      setTesting(false);
      abortControllerRef.current = null;
    }
  };

  const stopTest = async () => {
    if (stopping) return; // 防止重复点击

    setStopping(true);
    setError('正在停止测试...');

    // 立即 abort 前端请求
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // 调用后端停止API
    try {
      await fetch('/api/stories/test/stop', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      setError('测试已停止');
    } catch (err) {
      console.error('停止测试失败:', err);
      setError('停止测试请求已发送');
    }

    // 延迟更新状态，给用户时间看到反馈
    setTimeout(() => {
      setTesting(false);
      setStopping(false);
      abortControllerRef.current = null;
    }, 1000);
  };

  const clearTestResult = () => {
    setTestResult(null);
    setError(null);
    setTesting(false);
    setStopping(false);
    localStorage.removeItem('storyTester_testing');
    localStorage.removeItem('storyTester_testResult');
    localStorage.removeItem('storyTester_error');
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-amber-200/20 shadow-lg">
        <h1 className="text-2xl font-bold text-amber-50 mb-2">故事测试工具</h1>
        <p className="text-amber-200/70 text-sm">
          测试故事与原作设定、角色设定的符合度，以及剧情合理度
        </p>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="bg-red-500/20 backdrop-blur-sm rounded-xl p-4 border border-red-300/30">
          <div className="flex items-center gap-2 text-red-200">
            <AlertCircle className="w-5 h-5" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* 故事选择 */}
      <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-amber-200/20 shadow-lg space-y-4">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={selectedStories.length === stories.length && stories.length > 0}
            onChange={handleSelectAll}
            className="w-5 h-5 rounded border-amber-200/30 bg-white/10 text-amber-500 focus:ring-amber-500"
          />
          <label className="text-amber-50 font-medium">全选</label>
          <span className="text-sm text-amber-200/60">
            ({selectedStories.length}/{stories.length} 已选择)
          </span>
        </div>

        <div className="space-y-2 max-h-60 overflow-y-auto border border-amber-200/20 rounded-xl p-4 bg-white/5">
          {stories.length === 0 ? (
            <p className="text-sm text-amber-200/60">暂无故事</p>
          ) : (
            stories.map(story => (
              <div key={story.id} className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={selectedStories.includes(story.id)}
                  onChange={() => handleStoryToggle(story.id)}
                  className="w-5 h-5 mt-0.5 rounded border-amber-200/30 bg-white/10 text-amber-500 focus:ring-amber-500"
                />
                <div className="flex-1">
                  <label className="text-amber-50 font-medium cursor-pointer">
                    {story.title}
                  </label>
                  <p className="text-xs text-amber-200/60 mt-1">
                    {story.description}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>

        {/* 时间限制设置 */}
        <div className="space-y-2">
          <label className="text-amber-50 font-medium">时间限制（秒，0表示无限制）</label>
          <input
            type="number"
            min="0"
            placeholder="输入秒数，如 60"
            value={timeLimit}
            onChange={(e) => setTimeLimit(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-amber-200/30 bg-white/10 text-amber-50 placeholder-amber-200/50 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
          />
        </div>

        {/* 自动推进选项 */}
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={autoAdvance}
            onChange={(e) => setAutoAdvance(e.target.checked)}
            className="w-5 h-5 rounded border-amber-200/30 bg-white/10 text-amber-500 focus:ring-amber-500"
          />
          <label className="text-amber-50 font-medium cursor-pointer">自动推进故事（随机选择选项）</label>
        </div>

        {/* 运行测试按钮 */}
        {testing ? (
          <button
            onClick={stopTest}
            disabled={stopping}
            className="w-full px-4 py-3 rounded-xl text-white font-medium transition-all bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 shadow-lg border border-red-300/30 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="flex items-center justify-center gap-2">
              {stopping ? <Loader2 className="w-5 h-5 animate-spin" /> : <Square className="w-5 h-5" />}
              <span>{stopping ? '正在停止...' : '停止测试'}</span>
            </div>
          </button>
        ) : (
          <button
            onClick={runTest}
            disabled={selectedStories.length === 0}
            className="w-full px-4 py-3 rounded-xl text-white font-medium transition-all bg-gradient-to-r from-amber-600 to-tavern-600 hover:from-amber-500 hover:to-tavern-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg border border-amber-200/30"
          >
            运行测试
          </button>
        )}
      </div>

      {/* 测试结果 */}
      {testResult && (
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-amber-200/20 shadow-lg space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-amber-50 mb-2">测试结果</h2>
              <p className="text-sm text-amber-200/60">
                测试时间: {new Date(testResult.timestamp).toLocaleString('zh-CN')}
              </p>
            </div>
            <button
              onClick={clearTestResult}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-red-200 hover:bg-red-500/20 transition-all border border-red-300/30"
            >
              <Trash2 className="w-4 h-4" />
              删除结果
            </button>
          </div>

          {/* 总体统计 */}
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-4 bg-green-500/20 rounded-xl border border-green-300/30">
              <div className="text-2xl font-bold text-green-300">
                {testResult.summary.passed}
              </div>
              <div className="text-sm text-green-200">通过</div>
            </div>
            <div className="text-center p-4 bg-red-500/20 rounded-xl border border-red-300/30">
              <div className="text-2xl font-bold text-red-300">
                {testResult.summary.failed}
              </div>
              <div className="text-sm text-red-200">失败</div>
            </div>
            <div className="text-center p-4 bg-blue-500/20 rounded-xl border border-blue-300/30">
              <div className="text-2xl font-bold text-blue-300">
                {testResult.summary.averageScore.toFixed(1)}%
              </div>
              <div className="text-sm text-blue-200">平均分数</div>
            </div>
          </div>

          {/* 故事详细结果 */}
          <div className="space-y-4">
            <h3 className="font-semibold text-amber-50">详细结果</h3>
            {testResult.results.map((result, index) => (
              <div key={result.storyId} className="bg-white/5 rounded-xl p-4 border border-amber-200/20">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-lg font-medium text-amber-50">{result.storyTitle}</h4>
                  <div className="flex items-center gap-2">
                    {result.overallScore >= 80 ? (
                      <CheckCircle className="w-5 h-5 text-green-400" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-400" />
                    )}
                    <span className="text-sm font-medium text-amber-50">
                      {result.overallScore.toFixed(1)}%
                    </span>
                  </div>
                </div>
                <div className="space-y-3">
                  {result.tests.map((test, testIndex) => (
                    <div key={testIndex} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-amber-50">{test.name}</span>
                        {test.passed ? (
                          <CheckCircle className="w-4 h-4 text-green-400" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-400" />
                        )}
                      </div>
                      {test.issues.length > 0 && (
                        <div className="text-xs text-amber-200/60 space-y-1">
                          {test.issues.map((issue, issueIndex) => (
                            <div key={issueIndex} className="flex items-start gap-2">
                              <AlertCircle className="w-3 h-3 text-yellow-400 mt-0.5 flex-shrink-0" />
                              <span>{issue}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* 问题汇总 */}
          {testResult.summary && testResult.summary.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-semibold text-amber-50">问题汇总</h3>
              {testResult.summary.map((item, index) => (
                <div key={index} className="bg-red-500/10 rounded-xl p-4 border border-red-300/30">
                  <div className="flex items-start gap-2 text-red-200">
                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <div>
                      <strong>{item.story}</strong> ({item.issueCount} 个问题):
                      <ul className="mt-1 ml-4 list-disc">
                        {item.issues.map((issue, issueIndex) => (
                          <li key={issueIndex}>{issue}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
