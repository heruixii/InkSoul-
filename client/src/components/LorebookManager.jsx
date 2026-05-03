import React, { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Plus, Save, Trash2, BookOpen } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useData } from '../contexts/DataContext'

function LorebookManager({ characters }) {
  const navigate = useNavigate()
  const { lorebooks, refreshLorebooks } = useData()
  const [selectedId, setSelectedId] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    keywords: '',
    character_id: '',
    enabled: true
  })

  useEffect(() => {
    if (!selectedId && lorebooks.length > 0) {
      setSelectedId(lorebooks[0].id)
    }
  }, [lorebooks, selectedId])

  useEffect(() => {
    if (isCreating) {
      return
    }

    const current = lorebooks.find(item => item.id === selectedId)
    if (current) {
      setFormData({
        title: current.title || '',
        content: current.content || '',
        keywords: Array.isArray(current.keywords) ? current.keywords.join(', ') : '',
        character_id: current.character_id || '',
        enabled: current.enabled !== false
      })
    }
  }, [selectedId, lorebooks, isCreating])

  const selectedLorebook = useMemo(
    () => lorebooks.find(item => item.id === selectedId) || null,
    [lorebooks, selectedId]
  )
  const selectedIsFileSource = selectedLorebook?.source === 'file'

  const startCreate = () => {
    setIsCreating(true)
    setSelectedId('')
    setFormData({
      title: '',
      content: '',
      keywords: '',
      character_id: '',
      enabled: true
    })
  }

  const handleSave = async () => {
    if (!formData.title.trim() || !formData.content.trim()) {
      alert('请至少填写标题和内容')
      return
    }

    setIsSaving(true)
    try {
      const payload = {
        ...formData,
        keywords: formData.keywords
      }

      if (isCreating) {
        const response = await axios.post('/api/lorebooks', payload)
        setIsCreating(false)
        setSelectedId(response.data.id)
      } else if (selectedLorebook) {
        await axios.put(`/api/lorebooks/${selectedLorebook.id}`, payload)
      }

      await refreshLorebooks()
    } catch (error) {
      alert('保存世界书失败: ' + (error.response?.data?.error || error.message))
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!selectedLorebook) return
    if (isDeleting || isSaving) return
    if (!confirm(`确定要删除世界书条目“${selectedLorebook.title}”吗？`)) return

    setIsDeleting(true)
    try {
      await axios.delete(`/api/lorebooks/${selectedLorebook.id}`)
      setSelectedId('')
      setIsCreating(false)
      await refreshLorebooks()
    } catch (error) {
      alert('删除失败: ' + error.message)
    } finally {
      setIsDeleting(false)
    }
  }

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }))
  }

  return (
    <div className="h-full flex">
      <div className="w-72 lg:w-80 wood-panel border-r border-amber-900/20 flex flex-col text-amber-50/90 tavern-glow">
        <div className="p-4 border-b border-amber-100/10 relative overflow-hidden">
          <div className="pointer-events-none absolute -top-10 right-3 h-20 w-20 rounded-full bg-amber-300/10 blur-2xl" />
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-amber-100/80 hover:text-amber-50 mb-3"
          >
            <ArrowLeft className="w-4 h-4" />
            返回
          </button>
          <button
            onClick={startCreate}
            disabled={isSaving || isDeleting}
            className="w-full btn-primary flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            新建世界书
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(0,0,0,0.08))]">
          {lorebooks.map(item => (
            <button
              key={item.id}
              onClick={() => {
                setIsCreating(false)
                setSelectedId(item.id)
              }}
              className={`w-full text-left rounded-xl px-3 py-3 border transition-all shadow-sm ${
                selectedId === item.id && !isCreating
                  ? 'bg-gradient-to-r from-moss-600/85 to-tavern-700/85 text-white border-amber-100/20 shadow-lg shadow-amber-950/20'
                  : 'bg-white/10 border-amber-100/10 hover:border-amber-100/25 hover:bg-white/14 text-amber-50/90'
              }`}
            >
              <div className="font-medium truncate">{item.title}</div>
              <div className={`text-xs mt-1 ${selectedId === item.id && !isCreating ? 'text-amber-100' : 'text-amber-200/60'}`}>
                {item.character_id ? '绑定角色' : '全局'}
                {item.enabled === false ? ' · 已禁用' : ' · 已启用'}
                {item.source === 'file' ? ' · 文件' : ' · 数据库'}
              </div>
            </button>
          ))}
          {lorebooks.length === 0 && (
            <div className="text-sm text-amber-200/45 px-2 py-4">还没有世界书条目</div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 relative">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_0%,rgba(255,206,122,0.12),transparent_24%),radial-gradient(circle_at_86%_2%,rgba(112,145,90,0.10),transparent_24%)]" />
        <div className="max-w-3xl mx-auto space-y-6 relative">
          <div className="rounded-[28px] border border-amber-100/40 bg-[linear-gradient(180deg,rgba(70,43,26,0.84),rgba(42,26,16,0.72)),radial-gradient(circle_at_top_left,rgba(255,198,114,0.18),transparent_30%)] px-6 py-6 text-amber-50 shadow-[0_24px_60px_rgba(51,31,18,0.22)] flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="text-xs uppercase tracking-[0.32em] text-amber-200/65 mb-2">Lore Archive</div>
              <h1 className="text-3xl font-bold">世界书管理</h1>
              <p className="text-sm text-amber-100/75 mt-1">像整理古老典籍一样，记录世界观、组织、地点与规则。</p>
            </div>
            {!isCreating && selectedLorebook && (
              <button onClick={handleDelete} disabled={selectedIsFileSource || isSaving || isDeleting} className="btn-secondary flex items-center gap-2 text-red-700 bg-white/14 border-amber-100/20">
                <Trash2 className="w-4 h-4" />
                {isDeleting ? '删除中...' : '删除'}
              </button>
            )}
          </div>

          <div className="card space-y-4 relative overflow-hidden bg-[linear-gradient(180deg,rgba(255,252,246,0.94),rgba(242,229,204,0.90))]">
            <div className="pointer-events-none absolute right-0 top-0 h-24 w-24 rounded-full bg-amber-300/10 blur-2xl" />
            <div className="mb-1 pb-3 border-b border-amber-100/60">
              <h2 className="text-lg font-bold text-tavern-900">条目编辑</h2>
              <p className="text-xs text-tavern-500 mt-1">完善标题、触发词与内容，命中后将自动注入上下文。</p>
              {selectedIsFileSource && !isCreating && (
                <p className="text-xs text-amber-700 mt-2">当前为文件来源条目（只读），请编辑 `worldbook/*.json` 后刷新。</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-tavern-700 mb-2">标题</label>
              <input
                name="title"
                value={formData.title}
                onChange={handleChange}
                className="input-field"
                placeholder="例如：帝国魔法学院"
                disabled={selectedIsFileSource && !isCreating}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-tavern-700 mb-2">触发关键词</label>
              <input
                name="keywords"
                value={formData.keywords}
                onChange={handleChange}
                className="input-field"
                placeholder="学院, 魔法学院, 帝国"
                disabled={selectedIsFileSource && !isCreating}
              />
              <p className="text-xs text-tavern-500 mt-1">多个关键词用逗号分隔；留空表示始终注入。</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-tavern-700 mb-2">绑定角色（可选）</label>
              <select
                name="character_id"
                value={formData.character_id}
                onChange={handleChange}
                className="input-field"
                disabled={selectedIsFileSource && !isCreating}
              >
                <option value="">全局世界书</option>
                {characters.map(character => (
                  <option key={character.id} value={character.id}>{character.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-tavern-700 mb-2">内容</label>
              <textarea
                name="content"
                value={formData.content}
                onChange={handleChange}
                rows={10}
                className="input-field"
                placeholder="写入会在命中关键词时注入给模型的背景设定。"
                disabled={selectedIsFileSource && !isCreating}
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-tavern-700">
              <input
                type="checkbox"
                name="enabled"
                checked={formData.enabled}
                onChange={handleChange}
                disabled={selectedIsFileSource && !isCreating}
              />
              启用这个世界书条目
            </label>

            <div className="flex justify-end">
              <button onClick={handleSave} disabled={(selectedIsFileSource && !isCreating) || isSaving || isDeleting} className="btn-primary flex items-center gap-2">
                <Save className="w-4 h-4" />
                {isSaving ? '保存中...' : '保存世界书'}
              </button>
            </div>
          </div>

          <div className="card bg-[linear-gradient(180deg,rgba(248,245,237,0.92),rgba(236,227,206,0.90))]">
            <div className="flex items-center gap-2 mb-3 text-tavern-800">
              <BookOpen className="w-5 h-5" />
              <h2 className="font-semibold">使用建议</h2>
            </div>
            <div className="text-sm text-tavern-600 space-y-2">
              <p>1. 一条世界书只描述一个概念，例如一个组织、一个地点或一个人物关系。</p>
              <p>2. 关键词尽量贴近对话里会实际出现的词，避免过多无关注入。</p>
              <p>3. 全局世界书适合世界规则，角色绑定世界书适合某角色专属背景。</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default LorebookManager
