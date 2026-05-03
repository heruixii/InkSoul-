import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Save } from 'lucide-react'
import axios from 'axios'

function CharacterEdit({ onSave }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEditing = !!id

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    personality: '',
    scenario: '',
    first_mes: '',
    mes_example: '',
    avatar: '',
    creator: '',
    tags: [],
    system_prompt: '',
    alternate_greetings: []
  })

  // 加载角色数据
  useEffect(() => {
    if (isEditing) {
      axios.get(`/api/characters/${id}`)
        .then(response => {
          setFormData({
            ...response.data,
            tags: Array.isArray(response.data.tags) ? response.data.tags : [],
            alternate_greetings: Array.isArray(response.data.alternate_greetings) ? response.data.alternate_greetings : []
          })
        })
        .catch(error => {
          alert('加载角色失败: ' + error.message)
          navigate('/')
        })
    }
  }, [id, isEditing, navigate])

  // 保存角色
  const handleSubmit = async (e) => {
    e.preventDefault()
    
    try {
      if (isEditing) {
        await axios.put(`/api/characters/${id}`, formData)
      } else {
        await axios.post('/api/characters', formData)
      }
      onSave()
      navigate('/')
    } catch (error) {
      alert('保存失败: ' + error.message)
    }
  }

  // 处理输入变化
  const handleChange = (e) => {
    const { name, value } = e.target
    if (name === 'tags' || name === 'alternate_greetings') {
      const items = value.split('\n').map(item => item.trim()).filter(Boolean)
      setFormData(prev => ({ ...prev, [name]: items }))
      return
    }
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  return (
    <div className="h-full overflow-auto p-6 relative">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(255,207,126,0.12),transparent_24%),radial-gradient(circle_at_88%_2%,rgba(105,143,84,0.10),transparent_24%)]" />
      <div className="max-w-3xl mx-auto relative">
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
              <div className="text-xs uppercase tracking-[0.32em] text-amber-200/65 mb-2">Character Archive</div>
              <h1 className="text-3xl font-bold">
                {isEditing ? '编辑角色档案' : '新建角色档案'}
              </h1>
              <p className="text-sm text-amber-100/75 mt-2">像在羊皮卷上记录一位旅人的背景、性格与说话方式。</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="card bg-[linear-gradient(180deg,rgba(255,252,246,0.92),rgba(242,229,204,0.90))]">
            <div className="mb-4 pb-3 border-b border-amber-100/60">
              <h2 className="text-lg font-bold text-tavern-900">基础档案</h2>
              <p className="text-xs text-tavern-500 mt-1">角色的身份、背景与核心设定。</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-tavern-700 mb-2">
                  角色名称 *
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  className="input-field"
                  placeholder="输入角色名称"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-tavern-700 mb-2">
                  角色描述
                </label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  rows={4}
                  className="input-field"
                  placeholder="描述角色的外貌、背景故事等"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-tavern-700 mb-2">
                  性格特点
                </label>
                <textarea
                  name="personality"
                  value={formData.personality}
                  onChange={handleChange}
                  rows={3}
                  className="input-field"
                  placeholder="描述角色的性格、说话风格、行为模式等"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-tavern-700 mb-2">
                  场景设定
                </label>
                <textarea
                  name="scenario"
                  value={formData.scenario}
                  onChange={handleChange}
                  rows={3}
                  className="input-field"
                  placeholder="设定当前的故事场景和环境"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-tavern-700 mb-2">
                    头像 URL (可选)
                  </label>
                  <input
                    type="url"
                    name="avatar"
                    value={formData.avatar}
                    onChange={handleChange}
                    className="input-field"
                    placeholder="https://example.com/avatar.png"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-tavern-700 mb-2">
                    作者 / Creator
                  </label>
                  <input
                    type="text"
                    name="creator"
                    value={formData.creator}
                    onChange={handleChange}
                    className="input-field"
                    placeholder="角色卡作者名"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-tavern-700 mb-2">
                  标签（每行一个）
                </label>
                <textarea
                  name="tags"
                  value={(formData.tags || []).join('\n')}
                  onChange={handleChange}
                  rows={4}
                  className="input-field"
                  placeholder="奇幻\n傲娇\n冒险"
                />
              </div>
            </div>
          </div>

          <div className="card bg-[linear-gradient(180deg,rgba(250,248,241,0.92),rgba(236,226,203,0.90))]">
            <div className="mb-4 pb-3 border-b border-amber-100/60">
              <h2 className="text-lg font-bold text-tavern-900">对话行为</h2>
              <p className="text-xs text-tavern-500 mt-1">控制开场语气、示例与额外行为约束。</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-tavern-700 mb-2">
                  开场白
                </label>
                <textarea
                  name="first_mes"
                  value={formData.first_mes}
                  onChange={handleChange}
                  rows={3}
                  className="input-field"
                  placeholder="角色说的第一句话"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-tavern-700 mb-2">
                  备用开场白（每行一个）
                </label>
                <textarea
                  name="alternate_greetings"
                  value={(formData.alternate_greetings || []).join('\n')}
                  onChange={handleChange}
                  rows={5}
                  className="input-field"
                  placeholder="第一种开场\n第二种开场"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-tavern-700 mb-2">
                  对话示例
                </label>
                <textarea
                  name="mes_example"
                  value={formData.mes_example}
                  onChange={handleChange}
                  rows={6}
                  className="input-field"
                  placeholder="给AI一些对话示例，帮助它更好地理解角色风格&#10;<START>&#10;{{user}}: 你好&#10;{{char}}: 回复内容"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-tavern-700 mb-2">
                  角色额外系统提示词
                </label>
                <textarea
                  name="system_prompt"
                  value={formData.system_prompt}
                  onChange={handleChange}
                  rows={4}
                  className="input-field"
                  placeholder="可写入额外约束、说话风格、剧情注意事项。"
                />
              </div>
            </div>
          </div>

          {/* 按钮 */}
          <div className="flex gap-4 pt-2 pb-6">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="btn-secondary flex-1"
            >
              取消
            </button>
            <button
              type="submit"
              className="btn-primary flex-1 flex items-center justify-center gap-2"
            >
              <Save className="w-4 h-4" />
              保存
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default CharacterEdit
