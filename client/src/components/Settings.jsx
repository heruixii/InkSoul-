import React, { useState, useEffect } from 'react'
import { ArrowLeft, Save, TestTube } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'

function Settings({ settings, onSettingsChange }) {
  const navigate = useNavigate()
  const [formData, setFormData] = useState(settings)
  const [testStatus, setTestStatus] = useState(null)
  const [isTesting, setIsTesting] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [presets, setPresets] = useState([])
  const [presetForm, setPresetForm] = useState({
    name: '',
    apiUrl: '',
    model: '',
    maxTokens: 2000,
    temperature: 0.8,
    systemPromptPrefix: ''
  })

  useEffect(() => {
    setFormData(settings)
  }, [settings])

  useEffect(() => {
    axios.get('/api/presets').then(response => setPresets(response.data)).catch(() => {})
  }, [])

  const handleChange = (e) => {
    const { name, value, type } = e.target
    const newValue = type === 'number' ? parseFloat(value) : value
    setFormData(prev => ({ ...prev, [name]: newValue }))
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await Promise.all(Object.entries(formData).map(([key, value]) => axios.post('/api/settings', { key, value })))
      onSettingsChange(formData)
      alert('设置已保存！')
    } catch (error) {
      alert('保存失败: ' + error.message)
    } finally {
      setIsSaving(false)
    }
  }

  const testConnection = async () => {
    if (!formData.apiUrl || !formData.model) {
      setTestStatus({ type: 'error', message: '请先填写 API 地址和模型名称' })
      return
    }

    setIsTesting(true)
    setTestStatus(null)

    try {
      const response = await axios.post('/api/test-api', {
        apiUrl: formData.apiUrl,
        apiKey: formData.apiKey,
        model: formData.model
      })

      if (response.data?.ok) {
        const targetText = response.data.targetUrl ? `\n实际测试端点：${response.data.targetUrl}` : ''
        setTestStatus({ type: 'success', message: `连接成功！API 配置正确${targetText}` })
      }
    } catch (error) {
      setTestStatus({ type: 'error', message: '连接失败: ' + (error.response?.data?.error || error.message) })
    } finally {
      setIsTesting(false)
    }
  }

  const savePreset = async () => {
    if (!presetForm.name.trim()) {
      alert('请填写预设名称')
      return
    }

    try {
      const response = await axios.post('/api/presets', presetForm)
      setPresets(prev => [response.data, ...prev])
      setPresetForm({
        name: '',
        apiUrl: formData.apiUrl,
        model: formData.model,
        maxTokens: formData.maxTokens,
        temperature: formData.temperature,
        systemPromptPrefix: ''
      })
    } catch (error) {
      alert('保存预设失败: ' + (error.response?.data?.error || error.message))
    }
  }

  const applyPreset = (preset) => {
    setFormData(prev => ({
      ...prev,
      apiUrl: preset.apiUrl || prev.apiUrl,
      model: preset.model || prev.model,
      maxTokens: preset.maxTokens || prev.maxTokens,
      temperature: preset.temperature ?? prev.temperature,
      activePresetId: preset.id
    }))
  }

  const deletePreset = async (presetId) => {
    if (!confirm('确定要删除这个预设吗？')) return

    try {
      await axios.delete(`/api/presets/${presetId}`)
      setPresets(prev => prev.filter(item => item.id !== presetId))
      if (formData.activePresetId === presetId) {
        setFormData(prev => ({ ...prev, activePresetId: '' }))
      }
    } catch (error) {
      alert('删除预设失败: ' + (error.response?.data?.error || error.message))
    }
  }

  return (
    <div className="h-full overflow-auto p-6">
      <div className="max-w-2xl mx-auto">
        {/* 标题栏 */}
        <div className="mb-6 rounded-[28px] border border-amber-100/40 bg-[linear-gradient(180deg,rgba(70,43,26,0.84),rgba(42,26,16,0.72)),radial-gradient(circle_at_top_left,rgba(255,198,114,0.18),transparent_30%)] px-6 py-6 text-amber-50 shadow-[0_24px_60px_rgba(51,31,18,0.22)]">
          <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/')}
            className="btn-secondary p-2 bg-white/12 text-amber-50 border-amber-100/20 hover:bg-white/18"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
            <div>
              <div className="text-xs uppercase tracking-[0.32em] text-amber-200/65 mb-2">Tavern Ledger</div>
              <h1 className="text-3xl font-bold">墨魂账本</h1>
              <p className="text-sm text-amber-100/75 mt-2">在这里调整模型、密钥与预设，就像翻阅掌柜珍藏的配方书与账本。</p>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {/* AI API 设置 */}
          <div className="card bg-[linear-gradient(180deg,rgba(255,252,246,0.92),rgba(242,229,204,0.90))]">
            <div className="mb-4 pb-3 border-b border-amber-100/60">
              <h2 className="text-lg font-bold text-tavern-900">AI API 设置</h2>
              <p className="text-xs text-tavern-500 mt-1">在这里配置模型访问参数，并检查当前端点连通性。</p>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-tavern-700 mb-2">
                  API 地址
                </label>
                <input
                  type="url"
                  name="apiUrl"
                  value={formData.apiUrl}
                  onChange={handleChange}
                  className="input-field"
                  placeholder="https://api.openai.com/v1/chat/completions"
                />
                <p className="text-xs text-tavern-500 mt-1">
                  支持 OpenAI API 格式的任何端点（包括中转、本地模型等）
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-tavern-700 mb-2">
                  API 密钥
                </label>
                <input
                  type="password"
                  name="apiKey"
                  value={formData.apiKey}
                  onChange={handleChange}
                  className="input-field"
                  placeholder="sk-..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-tavern-700 mb-2">
                  模型名称
                </label>
                <input
                  type="text"
                  name="model"
                  value={formData.model}
                  onChange={handleChange}
                  className="input-field"
                  placeholder="gpt-3.5-turbo"
                />
                <p className="text-xs text-tavern-500 mt-1">
                  例如: gpt-3.5-turbo, gpt-4, claude-3-opus-20240229
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-tavern-700 mb-2">
                    最大 Token 数
                  </label>
                  <input
                    type="number"
                    name="maxTokens"
                    value={formData.maxTokens}
                    onChange={handleChange}
                    min="100"
                    max="8000"
                    className="input-field"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-tavern-700 mb-2">
                    温度 (Temperature)
                  </label>
                  <input
                    type="number"
                    name="temperature"
                    value={formData.temperature}
                    onChange={handleChange}
                    min="0"
                    max="2"
                    step="0.1"
                    className="input-field"
                  />
                  <p className="text-xs text-tavern-500 mt-1">
                    0-2，越高回答越随机
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-tavern-700 mb-2">
                  上下文策略
                </label>
                <select
                  name="contextMode"
                  value={formData.contextMode || 'balanced'}
                  onChange={handleChange}
                  className="input-field"
                >
                  <option value="balanced">平衡（推荐）</option>
                  <option value="max_context">极限上下文（带更多历史）</option>
                  <option value="stability">极致稳定（更少漂移）</option>
                </select>
                <p className="text-xs text-tavern-500 mt-1">
                  平衡：默认推荐；极限上下文：尽可能带更多历史；极致稳定：减少噪声和出戏概率。
                </p>
              </div>

              {/* 测试连接 */}
              <div className="pt-4 border-t border-tavern-200/80">
                <button
                  onClick={testConnection}
                  disabled={isTesting || !formData.apiKey}
                  className="btn-secondary flex items-center gap-2"
                >
                  <TestTube className="w-4 h-4" />
                  {isTesting ? '测试中...' : '测试连接'}
                </button>

                {testStatus && (
                  <div className={`mt-3 p-3 rounded-lg text-sm ${
                    testStatus.type === 'success' 
                      ? 'bg-[linear-gradient(180deg,rgba(233,252,238,0.95),rgba(218,247,226,0.92))] border border-green-200 text-green-800' 
                      : 'bg-[linear-gradient(180deg,rgba(255,243,243,0.96),rgba(255,232,232,0.93))] border border-red-200 text-red-800'
                  }`}>
                    <div className="whitespace-pre-line">{testStatus.message}</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 辅助模型设置：摘要 / 记忆抽取 / 记忆压缩 */}
          <div className="card bg-[linear-gradient(180deg,rgba(252,247,239,0.92),rgba(240,228,205,0.90))]">
            <div className="mb-4 pb-3 border-b border-amber-100/60">
              <h2 className="text-lg font-bold text-tavern-900">辅助模型设置</h2>
              <p className="text-xs text-tavern-500 mt-1">
                用于<strong>摘要、长期记忆抽取、记忆压缩</strong>的便宜模型。主对话/故事推进仍使用上方主模型。
                留空则与主模型一致。
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-tavern-700 mb-2">
                  辅助模型名称（summaryModel）
                </label>
                <input
                  type="text"
                  name="summaryModel"
                  value={formData.summaryModel || ''}
                  onChange={handleChange}
                  className="input-field"
                  placeholder="留空则复用主模型，例如：deepseek-chat、gpt-4o-mini、claude-haiku"
                />
                <p className="text-xs text-tavern-500 mt-1">
                  推荐填一个便宜的小模型。这个模型只跑摘要/记忆相关任务，不影响对话质量，但能大幅降低成本。
                </p>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-xl bg-white/40 border border-amber-100/60">
                <input
                  type="checkbox"
                  id="longTermMemory"
                  checked={formData.longTermMemory !== false}
                  onChange={(e) => setFormData(prev => ({ ...prev, longTermMemory: e.target.checked }))}
                  className="mt-1 w-4 h-4 accent-amber-700"
                />
                <label htmlFor="longTermMemory" className="flex-1 cursor-pointer">
                  <div className="text-sm font-medium text-tavern-800">启用长期记忆系统</div>
                  <div className="text-xs text-tavern-500 mt-1">
                    每次响应后自动抽取关键事实（人物/地点/决策/承诺等）保存为长期记忆，避免长对话遗忘。
                    包含规则化（同步、零成本）+ LLM 抽取（异步、用辅助模型，节流 60s/次）双层。
                  </div>
                </label>
              </div>

              <div className="text-xs text-tavern-500/80 space-y-1 mt-2 p-3 rounded-xl bg-amber-50/40 border border-amber-200/40">
                <div className="font-medium text-tavern-700">📋 各 AI 调用任务分配</div>
                <div>• <strong>主模型</strong>：对话生成、故事推进、NPC 生成（高质量）</div>
                <div>• <strong>辅助模型</strong>：长期记忆抽取、记忆压缩（合并相似条目）（便宜即可）</div>
                <div>• 摘要构建当前由本地启发式生成（不调用 LLM）</div>
              </div>
            </div>
          </div>

          <div className="card bg-[linear-gradient(180deg,rgba(250,248,241,0.92),rgba(236,226,203,0.90))]">
            <div className="mb-4 pb-3 border-b border-amber-100/60">
              <h2 className="text-lg font-bold text-tavern-900">预设系统</h2>
              <p className="text-xs text-tavern-500 mt-1">保存常用参数组合，快速切换不同玩法场景。</p>
            </div>

            <div className="space-y-4 mb-5">
              <input
                type="text"
                value={presetForm.name}
                onChange={(e) => setPresetForm(prev => ({ ...prev, name: e.target.value }))}
                className="input-field"
                placeholder="预设名称，例如：创意写作 / 严谨剧情"
              />
              <textarea
                value={presetForm.systemPromptPrefix}
                onChange={(e) => setPresetForm(prev => ({ ...prev, systemPromptPrefix: e.target.value }))}
                className="input-field"
                rows={3}
                placeholder="额外系统提示前缀，可给某种玩法固定规则。"
              />
              <button onClick={savePreset} className="btn-primary">保存当前为预设</button>
            </div>

            <div className="space-y-2">
              {presets.length === 0 && <div className="text-sm text-tavern-500 rounded-xl border border-tavern-200/70 bg-white/50 px-3 py-3">还没有保存任何预设</div>}
              {presets.map(preset => (
                <div key={preset.id} className="border border-tavern-200/80 rounded-2xl px-3 py-3 flex items-center justify-between gap-3 bg-[linear-gradient(180deg,rgba(255,255,255,0.75),rgba(246,237,219,0.60))] shadow-[0_8px_18px_rgba(75,49,28,0.07)]">
                  <div>
                    <div className="font-medium text-tavern-900">{preset.name}</div>
                    <div className="text-xs text-tavern-500 mt-1">{preset.model || '未指定模型'} · 温度 {preset.temperature} · Max {preset.maxTokens}{formData.activePresetId === preset.id ? ' · 当前默认' : ''}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => applyPreset(preset)} className="btn-secondary text-sm">应用</button>
                    <button onClick={() => deletePreset(preset.id)} className="btn-secondary text-sm text-red-700">删除</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 关于 */}
          <div className="card bg-[linear-gradient(180deg,rgba(248,245,237,0.92),rgba(236,227,206,0.90))]">
            <h2 className="text-lg font-bold text-tavern-900 mb-4">关于</h2>
            <p className="text-sm text-tavern-600">
              InkSoul / 墨魂 - 本地角色扮演聊天工具
            </p>
            <p className="text-sm text-tavern-500 mt-2">
              支持导入 TavernAI 格式角色卡，可对接 OpenAI、Claude 等 API 或本地模型。
            </p>
          </div>

          {/* 保存按钮 */}
          <div className="flex gap-4 pb-6">
            <button
              onClick={() => navigate('/')}
              className="btn-secondary flex-1"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || isTesting}
              className="btn-primary flex-1 flex items-center justify-center gap-2"
            >
              <Save className="w-4 h-4" />
              {isSaving ? '保存中...' : '保存设置'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Settings
