import React, { useState, useEffect, useMemo } from 'react'
import { Plus, Edit, Trash2, BookOpen, Users, ArrowLeft, Play } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useData } from '../contexts/DataContext'

function StoryManager() {
  const navigate = useNavigate()
  const { characters, lorebooks } = useData()
  const [stories, setStories] = useState([])
  const [showCreate, setShowCreate] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [selectedStory, setSelectedStory] = useState(null)
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    main_character_id: '',
    supporting_character_ids: [],
    lorebook_ids: []
  })
  const [isSaving, setIsSaving] = useState(false)

  const mainCharMap = useMemo(() => {
    const map = new Map()
    stories.forEach(story => {
      const mc = characters.find(c => c.id === story.main_character_id)
      if (mc) map.set(story.id, mc)
    })
    return map
  }, [stories, characters])

  const loadStories = async () => {
    try {
      const response = await axios.get('/api/stories')
      setStories(response.data)
    } catch (error) {
      console.error('加载故事失败:', error)
    }
  }

  useEffect(() => {
    loadStories()
  }, [])

  const handleCreate = async () => {
    if (!formData.title || !formData.main_character_id) {
      alert('请填写标题并选择主角')
      return
    }

    setIsSaving(true)
    try {
      await axios.post('/api/stories', formData)
      setShowCreate(false)
      setFormData({ title: '', description: '', main_character_id: '', supporting_character_ids: [], lorebook_ids: [] })
      await loadStories()
    } catch (error) {
      alert('创建故事失败: ' + (error.response?.data?.error || error.message))
    } finally {
      setIsSaving(false)
    }
  }

  const handleEdit = async () => {
    if (!selectedStory) return

    setIsSaving(true)
    try {
      await axios.put(`/api/stories/${selectedStory.id}`, formData)
      setShowEdit(false)
      setSelectedStory(null)
      setFormData({ title: '', description: '', main_character_id: '', supporting_character_ids: [], lorebook_ids: [] })
      await loadStories()
    } catch (error) {
      alert('更新故事失败: ' + (error.response?.data?.error || error.message))
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('确定要删除这个故事吗？')) return

    try {
      await axios.delete(`/api/stories/${id}`)
      await loadStories()
    } catch (error) {
      alert('删除失败: ' + error.message)
    }
  }

  const openEdit = (story) => {
    setSelectedStory(story)
    setFormData({
      title: story.title,
      description: story.description,
      main_character_id: story.main_character_id,
      supporting_character_ids: story.supporting_character_ids || [],
      lorebook_ids: story.lorebook_ids || []
    })
    setShowEdit(true)
  }

  const toggleSupportingCharacter = (charId) => {
    setFormData(prev => ({
      ...prev,
      supporting_character_ids: prev.supporting_character_ids.includes(charId)
        ? prev.supporting_character_ids.filter(id => id !== charId)
        : [...prev.supporting_character_ids, charId]
    }))
  }

  const selectAllSupportingCharacters = () => {
    const availableCharacters = characters.filter(c => c.id !== formData.main_character_id)
    setFormData(prev => ({
      ...prev,
      supporting_character_ids: availableCharacters.map(c => c.id)
    }))
  }

  const clearAllSupportingCharacters = () => {
    setFormData(prev => ({
      ...prev,
      supporting_character_ids: []
    }))
  }

  const toggleLorebook = (lorebookId) => {
    setFormData(prev => ({
      ...prev,
      lorebook_ids: prev.lorebook_ids.includes(lorebookId)
        ? prev.lorebook_ids.filter(id => id !== lorebookId)
        : [...prev.lorebook_ids, lorebookId]
    }))
  }

  const selectAllLorebooks = () => {
    setFormData(prev => ({
      ...prev,
      lorebook_ids: lorebooks.map(l => l.id)
    }))
  }

  const clearAllLorebooks = () => {
    setFormData(prev => ({
      ...prev,
      lorebook_ids: []
    }))
  }

  return (
    <div className="h-full flex flex-col bg-[linear-gradient(180deg,rgba(74,46,28,0.95),rgba(39,24,16,0.92))] text-amber-50">
      <div className="p-4 border-b border-amber-900/30 bg-[linear-gradient(180deg,rgba(106,67,37,0.15),rgba(122,147,86,0.10))">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-amber-100/80 hover:text-amber-50"
          >
            <ArrowLeft className="w-4 h-4" />
            返回
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            新建故事
          </button>
        </div>
        <h1 className="text-2xl font-bold text-amber-100">故事管理</h1>
        <p className="text-sm text-amber-200/60 mt-1">创建和管理你的RPG故事</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {stories.length === 0 ? (
          <div className="text-center py-16 text-amber-200/50">
            <BookOpen className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <p className="text-lg mb-2">还没有创建任何故事</p>
            <p className="text-sm">点击"新建故事"开始你的冒险</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {stories.map(story => {
              const mainChar = mainCharMap.get(story.id)
              return (
                <div key={story.id} className="card p-4 hover:-translate-y-1 transition-all">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="font-bold text-lg text-amber-100">{story.title}</h3>
                      <p className="text-sm text-amber-200/70 mt-1">
                        主角: {mainChar ? mainChar.name : story.main_character_id || '未设置'}
                      </p>
                    </div>
                  </div>
                  {story.description && (
                    <p className="text-sm text-amber-200/60 mb-4 line-clamp-2">{story.description}</p>
                  )}
                  <div className="flex items-center gap-2 text-xs text-amber-300/50 mb-4">
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {story.character_count || 0} 角色
                    </span>
                    <span className="flex items-center gap-1">
                      <BookOpen className="w-3 h-3" />
                      {story.lorebook_count || 0} 世界书
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Link
                      to={`/story/play/${story.id}`}
                      className="flex-1 btn-primary flex items-center justify-center gap-2 text-sm"
                    >
                      <Play className="w-4 h-4" />
                      开始
                    </Link>
                    <button
                      onClick={() => openEdit(story)}
                      className="btn-secondary p-2"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(story.id)}
                      className="btn-secondary p-2 text-red-400 hover:text-red-300"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 创建/编辑故事弹窗 */}
      {(showCreate || showEdit) && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[linear-gradient(180deg,rgba(255,249,239,0.98),rgba(241,227,200,0.95)] rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-amber-200/50 shadow-2xl">
            <h2 className="text-xl font-bold mb-4 text-tavern-900">
              {showCreate ? '新建故事' : '编辑故事'}
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-tavern-700 mb-2">故事标题 *</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  className="input-field"
                  placeholder="输入故事标题"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-tavern-700 mb-2">故事描述</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  className="input-field h-24"
                  placeholder="简要描述这个故事"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-tavern-700 mb-2">选择主角 *</label>
                <select
                  value={formData.main_character_id}
                  onChange={(e) => setFormData(prev => ({ ...prev, main_character_id: e.target.value }))}
                  className="input-field"
                >
                  <option value="">请选择主角</option>
                  {characters.map(char => (
                    <option key={char.id} value={char.id}>{char.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-semibold text-tavern-800">选择配角</label>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={selectAllSupportingCharacters}
                      className="text-xs px-3 py-1 rounded-full bg-tavern-100 hover:bg-tavern-200 text-tavern-700 transition-colors"
                    >
                      全选
                    </button>
                    <button
                      type="button"
                      onClick={clearAllSupportingCharacters}
                      className="text-xs px-3 py-1 rounded-full bg-tavern-100 hover:bg-tavern-200 text-tavern-700 transition-colors"
                    >
                      清空
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                  {characters.filter(c => c.id !== formData.main_character_id).map(char => (
                    <label key={char.id} className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                      formData.supporting_character_ids.includes(char.id)
                        ? 'border-amber-500 bg-amber-50 shadow-sm'
                        : 'border-tavern-200 hover:border-amber-300 hover:bg-tavern-50'
                    }`}>
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                        formData.supporting_character_ids.includes(char.id)
                          ? 'border-amber-500 bg-amber-500'
                          : 'border-tavern-300'
                      }`}>
                        {formData.supporting_character_ids.includes(char.id) && (
                          <div className="w-2.5 h-2.5 rounded-full bg-white" />
                        )}
                      </div>
                      <span className="text-sm font-medium text-tavern-800">{char.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-semibold text-tavern-800">选择世界书</label>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={selectAllLorebooks}
                      className="text-xs px-3 py-1 rounded-full bg-tavern-100 hover:bg-tavern-200 text-tavern-700 transition-colors"
                    >
                      全选
                    </button>
                    <button
                      type="button"
                      onClick={clearAllLorebooks}
                      className="text-xs px-3 py-1 rounded-full bg-tavern-100 hover:bg-tavern-200 text-tavern-700 transition-colors"
                    >
                      清空
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                  {lorebooks.map(lorebook => (
                    <label key={lorebook.id} className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                      formData.lorebook_ids.includes(lorebook.id)
                        ? 'border-amber-500 bg-amber-50 shadow-sm'
                        : 'border-tavern-200 hover:border-amber-300 hover:bg-tavern-50'
                    }`}>
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                        formData.lorebook_ids.includes(lorebook.id)
                          ? 'border-amber-500 bg-amber-500'
                          : 'border-tavern-300'
                      }`}>
                        {formData.lorebook_ids.includes(lorebook.id) && (
                          <div className="w-2.5 h-2.5 rounded-full bg-white" />
                        )}
                      </div>
                      <span className="text-sm font-medium text-tavern-800">{lorebook.title}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => {
                  setShowCreate(false)
                  setShowEdit(false)
                  setSelectedStory(null)
                  setFormData({ title: '', description: '', main_character_id: '', supporting_character_ids: [], lorebook_ids: [] })
                }}
                disabled={isSaving}
                className="btn-secondary"
              >
                取消
              </button>
              <button
                onClick={showCreate ? handleCreate : handleEdit}
                disabled={isSaving}
                className="btn-primary"
              >
                {isSaving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default StoryManager
