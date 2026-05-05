import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Users, BookOpen, Plus, Trash2, Edit, RefreshCw, GitBranch, Sparkles, History, ChevronRight, ToggleLeft, ToggleRight, X, ArrowUpDown, Filter, ChevronDown, ChevronUp, Eye, MessageSquare, GitFork, StickyNote, Save, RotateCcw, Download } from 'lucide-react'
import axios from 'axios'
import Avatar from './Avatar'

function StoryPlay() {
  const { storyId } = useParams()
  const navigate = useNavigate()
  const [story, setStory] = useState(null)
  const [characterStates, setCharacterStates] = useState([])
  const [currentChapter, setCurrentChapter] = useState(null)
  const [currentEvent, setCurrentEvent] = useState(null)
  const [npcs, setNpcs] = useState([])
  const [relationships, setRelationships] = useState([])
  const [showNPCDialog, setShowNPCDialog] = useState(false)
  const [showGenerateNPC, setShowGenerateNPC] = useState(false)
  const [npcFormData, setNpcFormData] = useState({ name: '', description: '', role: '', traits: [] })
  const [generateContext, setGenerateContext] = useState('')
  const [generateRole, setGenerateRole] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [showRelationshipDialog, setShowRelationshipDialog] = useState(false)
  const [relFormData, setRelFormData] = useState({ character_id: '', target_id: '', type: 'companion', description: '' })
  const [currentPhase, setCurrentPhase] = useState('初期')
  const [framework, setFramework] = useState(null)
  const [isAiGenerating, setIsAiGenerating] = useState(false)
  const [previousChoice, setPreviousChoice] = useState('')
  const [storyHistory, setStoryHistory] = useState([])
  const [autoAdvance, setAutoAdvance] = useState(false)
  const [selectedCharacter, setSelectedCharacter] = useState(null)
  // 角色详情模态框：{ id, name, avatar, description, personality, scenario, isNpc }
  const [detailCharacter, setDetailCharacter] = useState(null)
  const [detailEvents, setDetailEvents] = useState([])
  const [detailLoading, setDetailLoading] = useState(false)
  // 右侧事件栏控制
  const [historySortDesc, setHistorySortDesc] = useState(true) // 默认新→旧
  const [historyExpanded, setHistoryExpanded] = useState(false)
  const [showAddNote, setShowAddNote] = useState(false)
  const [noteForm, setNoteForm] = useState({ title: '', description: '', involved_character_ids: [] })
  const [editingHistory, setEditingHistory] = useState(null) // 当前编辑的历史条目
  // 事件回顾跳转：被回顾的事件 id 高亮
  const [highlightedEventId, setHighlightedEventId] = useState(null)
  const eventRefs = useRef({}) // id -> DOM 节点
  // 隐藏经历解锁系统
  const [revealedFacts, setRevealedFacts] = useState([]) // 全部已解锁
  const [factsQueue, setFactsQueue] = useState([]) // 待显示的新解锁队列
  const [showFactsDrawer, setShowFactsDrawer] = useState(false)

  const STORY_CACHE_KEY = `story_${storyId}`
  const CACHE_DURATION = 5 * 60 * 1000 // 5 分钟

  const loadCharacterStates = async () => {
    try {
      const response = await axios.get(`/api/stories/${storyId}/character-states`)
      setCharacterStates(response.data)
    } catch (error) {
      console.error('加载角色状态失败:', error)
    }
  }

  const loadCurrentChapter = async () => {
    try {
      const response = await axios.get(`/api/stories/${storyId}/current-chapter`)
      setCurrentChapter(response.data)
    } catch (error) {
      console.error('加载当前章节失败:', error)
    }
  }

  const generateChapterTitle = async (chapterContent) => {
    try {
      const response = await axios.post(`/api/stories/${storyId}/generate-chapter-title`, {
        chapterContent
      })
      if (response.data.title) {
        setCurrentChapter(prev => ({
          ...prev,
          chapterTitle: response.data.title
        }))
      }
    } catch (error) {
      console.error('生成章节标题失败:', error)
    }
  }

  const loadStory = async () => {
    try {
      console.log('Loading story:', storyId)

      // 清除缓存，确保使用最新数据
      localStorage.removeItem(STORY_CACHE_KEY)

      // 从服务器加载
      refreshStory()
    } catch (error) {
      console.error('加载故事失败:', error)
      navigate('/stories')
    }
  }

  const refreshStory = async () => {
    try {
      const response = await axios.get(`/api/stories/${storyId}`)
      console.log('Story data from server:', response.data)
      setStory(response.data)

      // 如果故事还没有初始化，调用初始化API
      if (!response.data.current_event_id) {
        console.log('Story not initialized, initializing...')
        try {
          const initResponse = await axios.post(`/api/stories/${storyId}/initialize`)
          console.log('Story initialized:', initResponse.data)
          // 重新加载故事数据
          const updatedResponse = await axios.get(`/api/stories/${storyId}`)
          setStory(updatedResponse.data)
          if (updatedResponse.data.current_event_id) {
            const event = updatedResponse.data.events?.find(e => e.id === updatedResponse.data.current_event_id)
            setCurrentEvent(event)
            if (event && event.phase) setCurrentPhase(event.phase)
          }
        } catch (error) {
          console.error('故事初始化失败:', error)
        }
      } else {
        if (response.data.current_event_id) {
          const event = response.data.events?.find(e => e.id === response.data.current_event_id)
          setCurrentEvent(event)
          if (event && event.phase) setCurrentPhase(event.phase)
        }
      }

      setNpcs(response.data.npcs || [])
      setRelationships(response.data.relationships || [])
      setStoryHistory(response.data.history || [])

      // Load framework if available
      if (response.data.metadata?.framework_path) {
        try {
          const frameworkResponse = await axios.get(`/api/novels/${response.data.metadata.novel_id}/framework`)
          setFramework(frameworkResponse.data)
          console.log('Framework loaded:', frameworkResponse.data)
        } catch (error) {
          console.warn('Failed to load framework:', error)
        }
      }

      // 写入缓存
      localStorage.setItem(STORY_CACHE_KEY, JSON.stringify({
        data: response.data,
        timestamp: Date.now()
      }))
    } catch (error) {
      console.error('刷新故事失败:', error)
    }
  }

  // 加载该故事下已解锁的隐藏经历
  const loadRevealedFacts = async () => {
    try {
      const res = await axios.get(`/api/stories/${storyId}/revealed-facts`)
      setRevealedFacts(Array.isArray(res.data) ? res.data : [])
    } catch (err) {
      console.warn('加载已解锁经历失败:', err.message)
    }
  }

  // 收到 AI 响应后处理 newly_revealed_facts：入队 + 合并到全表
  const handleNewlyRevealed = (newly) => {
    if (!Array.isArray(newly) || newly.length === 0) return
    setRevealedFacts(prev => [...prev, ...newly])
    setFactsQueue(prev => [...prev, ...newly])
  }

  // 延迟轮询：捕获后端异步辅助 LLM 触发的语义解锁（约 6-8s 后）
  const refreshFactsAfterDelay = (delayMs = 7000) => {
    setTimeout(async () => {
      try {
        const res = await axios.get(`/api/stories/${storyId}/revealed-facts`)
        const fresh = Array.isArray(res.data) ? res.data : []
        setRevealedFacts(prev => {
          const knownIds = new Set(prev.map(r => r.id))
          const newOnes = fresh.filter(r => !knownIds.has(r.id))
          if (newOnes.length > 0) setFactsQueue(q => [...q, ...newOnes])
          return fresh
        })
      } catch (err) {
        console.warn('延迟刷新已解锁失败:', err.message)
      }
    }, delayMs)
  }

  useEffect(() => {
    Promise.all([loadStory(), loadRevealedFacts(), loadCharacterStates(), loadCurrentChapter()])
  }, [storyId])

  // 选择 + （可选）自动推进。
  // 自动推进时调用合并端点 /choose-and-advance，由后端在一次请求里完成"写入选择 → 调用 LLM → 写入新事件"，
  // 彻底消除前端两次 await 之间的 state 闭包/竞态问题。
  const handleChoose = async (choiceIndex) => {
    if (!currentEvent) return
    const choice = currentEvent.choices[choiceIndex]
    if (!choice) return

    // 防止用户在生成中再次点击导致重复请求
    if (isAiGenerating) return

    setPreviousChoice(choice.title)

    if (autoAdvance) {
      // ===== 一次请求完成选择 + AI 推进 =====
      setIsAiGenerating(true)
      try {
        const res = await axios.post(
          `/api/stories/${storyId}/events/${currentEvent.id}/choose-and-advance`,
          { choice_index: choiceIndex }
        )
        const { newEvent, newly_revealed_facts } = res.data
        if (newEvent) {
          setCurrentEvent(newEvent)
          if (newEvent.phase) setCurrentPhase(newEvent.phase)
        }
        handleNewlyRevealed(newly_revealed_facts)
        await loadStory()
        await loadCharacterStates()
        await loadCurrentChapter()
        refreshFactsAfterDelay() // 捕获后端异步辅助 LLM 解锁
      } catch (error) {
        const data = error.response?.data || {}
        const msg = data.error || error.message
        // 即便 AI 失败，后端已保存"选择"那一步，刷新一下让用户看到当前状态
        if (data.choiceSaved && data.chosenEvent) {
          setCurrentEvent(data.chosenEvent)
          if (data.chosenEvent.phase) setCurrentPhase(data.chosenEvent.phase)
        }
        await loadStory()
        await loadCharacterStates()
        await loadCurrentChapter()
        alert('自动推进失败：' + msg + '\n\n你的选择已保存，可点击「生成下一事件」手动重试。')
      } finally {
        setIsAiGenerating(false)
      }
      return
    }

    // ===== 普通模式：仅写入选择 =====
    try {
      const response = await axios.post(
        `/api/stories/${storyId}/events/${currentEvent.id}/choose`,
        { choice_index: choiceIndex }
      )
      setCurrentEvent(response.data)
      if (response.data.phase) setCurrentPhase(response.data.phase)
      await loadStory()
      await loadCharacterStates()
      await loadCurrentChapter()
    } catch (error) {
      alert('选择失败: ' + (error.response?.data?.error || error.message))
    }
  }

  // 重置剧情：清空所有事件 + 历史，从第一章重新开始
  const handleResetStory = async () => {
    if (!confirm('确定要重置剧情吗？\n\n这将删除所有已发生的事件、选择和 NPC，无法恢复。\n（角色卡、世界书等设定会保留）')) return
    if (isAiGenerating) return
    setIsAiGenerating(true)
    try {
      const res = await axios.post(`/api/stories/${storyId}/reset`)
      if (res.data?.openingEvent) {
        setCurrentEvent(res.data.openingEvent)
        if (res.data.openingEvent.phase) setCurrentPhase(res.data.openingEvent.phase)
      }
      setPreviousChoice('')
      await loadStory()
      await loadCharacterStates()
      await loadCurrentChapter()
    } catch (error) {
      alert('重置失败：' + (error.response?.data?.error || error.message))
    } finally {
      setIsAiGenerating(false)
    }
  }

  // 导出故事为txt
  const exportStory = () => {
    if (!story || !storyHistory.length) {
      alert('暂无故事内容可导出')
      return
    }

    let txtContent = ''
    txtContent += `========================================\n`
    txtContent += `  InkSoul / 墨魂 - 故事导出\n`
    txtContent += `========================================\n\n`
    txtContent += `故事: ${story.title || '未命名'}\n`
    txtContent += `章节: ${story.chapter_title || ''}\n`
    txtContent += `导出时间: ${new Date().toLocaleString()}\n`
    txtContent += `事件数: ${storyHistory.length}\n`
    txtContent += `\n----------------------------------------\n`
    txtContent += `                故事正文\n`
    txtContent += `----------------------------------------\n\n`

    storyHistory.forEach((item, index) => {
      txtContent += `【第 ${index + 1} 幕】${item.event_title || '未命名事件'}\n`
      if (item.choice) {
        txtContent += `选择: ${item.choice}\n`
      }
      txtContent += `${item.event_description || ''}\n\n`
    })

    txtContent += `----------------------------------------\n`
    txtContent += `         本软件由我在家2up主制作\n`
    txtContent += `========================================\n`

    const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${(story.title || 'story').replace(/[\\/:*?"<>|]/g, '_')}_故事.txt`
    link.click()
    URL.revokeObjectURL(url)
  }

  // 手动点击「生成下一事件」时调用
  const handleAiGenerate = async () => {
    if (isAiGenerating) return
    setIsAiGenerating(true)
    try {
      const response = await axios.post(`/api/stories/${storyId}/ai-generate`, {
        currentPhase,
        previousChoice,
        context: currentEvent ? currentEvent.description : ''
      })
      setCurrentEvent(response.data)
      if (response.data.phase) setCurrentPhase(response.data.phase)
      handleNewlyRevealed(response.data.newly_revealed_facts)
      await loadStory()
      await loadCharacterStates()
      await loadCurrentChapter()
      // 自动生成章节标题
      if (response.data.description) {
        generateChapterTitle(response.data.description)
      }
      refreshFactsAfterDelay() // 捕获后端异步辅助 LLM 解锁
    } catch (error) {
      alert('AI生成失败: ' + (error.response?.data?.error || error.message))
    } finally {
      setIsAiGenerating(false)
    }
  }

  const handleCreateNPC = async () => {
    if (!npcFormData.name) {
      alert('请填写NPC名称')
      return
    }

    try {
      await axios.post(`/api/stories/${storyId}/npcs`, npcFormData)
      setShowNPCDialog(false)
      setNpcFormData({ name: '', description: '', role: '', traits: [] })
      await loadStory()
    } catch (error) {
      alert('创建NPC失败: ' + (error.response?.data?.error || error.message))
    }
  }

  const handleGenerateNPC = async () => {
    setIsGenerating(true)
    try {
      const response = await axios.post(`/api/stories/${storyId}/npcs/generate`, {
        context: generateContext,
        role: generateRole
      })
      setShowGenerateNPC(false)
      setGenerateContext('')
      setGenerateRole('')
      await loadStory()
    } catch (error) {
      alert('生成NPC失败: ' + (error.response?.data?.error || error.message))
    } finally {
      setIsGenerating(false)
    }
  }

  const handleDeleteNPC = async (npcId) => {
    if (!confirm('确定要删除这个NPC吗？')) return

    try {
      await axios.delete(`/api/stories/${storyId}/npcs/${npcId}`)
      await loadStory()
    } catch (error) {
      alert('删除失败: ' + error.message)
    }
  }

  const handleCreateRelationship = async () => {
    if (!relFormData.character_id || !relFormData.target_id || !relFormData.type) {
      alert('请填写完整的关系信息')
      return
    }

    try {
      await axios.post(`/api/stories/${storyId}/relationships`, relFormData)
      setShowRelationshipDialog(false)
      setRelFormData({ character_id: '', target_id: '', type: 'companion', description: '' })
      await loadStory()
    } catch (error) {
      alert('创建关系失败: ' + (error.response?.data?.error || error.message))
    }
  }

  const handleDeleteRelationship = async (relId) => {
    if (!confirm('确定要删除这个关系吗？')) return

    try {
      await axios.delete(`/api/stories/${storyId}/relationships/${relId}`)
      await loadStory()
    } catch (error) {
      alert('删除失败: ' + error.message)
    }
  }

  // 打开角色详情：加载该角色参与的所有事件
  const openCharacterDetail = async (char) => {
    if (!char) {
      setDetailCharacter(null)
      setDetailEvents([])
      return
    }
    
    setDetailLoading(true)
    
    try {
      // 获取角色状态（包含动态描述）
      let charWithState = { ...char }
      
      try {
        console.log('[Character Detail] Fetching character states for:', char.name)
        const stateRes = await axios.get(`/api/stories/${storyId}/character-states`)
        console.log('[Character Detail] Character states response:', stateRes.data)
        const charState = stateRes.data.find(s => s.name === char.name)
        console.log('[Character Detail] Found character state:', charState)
        if (charState && charState.description) {
          console.log('[Character Detail] Updating description with dynamic state')
          charWithState = {
            ...charWithState,
            description: charState.description
          }
        } else {
          console.log('[Character Detail] No character state or description found')
        }
      } catch (stateErr) {
        console.warn('[Character Detail] Failed to get character states:', stateErr.message)
        // 失败时继续使用原始角色信息
      }
      
      setDetailCharacter(charWithState)
      
      // 加载该角色参与的事件
      if (char.id) {
        try {
          const res = await axios.get(`/api/characters/${char.id}/events`, { params: { storyId } })
          setDetailEvents(res.data || [])
        } catch (err) {
          // 如果是 NPC，后端 /api/characters/:id/events 也兼容查询 NPC
          // 失败时退化为本地名字过滤
          const fallback = storyHistory.filter(h => {
            const text = `${h.event_title || ''} ${h.event_description || ''} ${h.choice || ''}`
            return char.name && text.includes(char.name)
          })
          setDetailEvents(fallback)
        }
      } else {
        setDetailEvents([])
      }
    } catch (err) {
      console.error('[Character Detail] Failed to open character detail:', err)
      setDetailCharacter(char)
      setDetailEvents([])
    } finally {
      setDetailLoading(false)
    }
  }

  // 跳转到右侧时间线中的事件
  const jumpToEvent = (eventOrHistoryId) => {
    setHistoryExpanded(true) // 确保展开
    setHighlightedEventId(eventOrHistoryId)
    // 关闭详情模态框以露出时间线
    setDetailCharacter(null)
    setTimeout(() => {
      const node = eventRefs.current[eventOrHistoryId]
      if (node && typeof node.scrollIntoView === 'function') {
        node.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
      // 高亮 2.5 秒后取消
      setTimeout(() => setHighlightedEventId(null), 2500)
    }, 80)
  }

  // 添加自定义笔记
  const handleAddNote = async () => {
    if (!noteForm.title.trim()) {
      alert('请填写标题')
      return
    }
    try {
      await axios.post(`/api/stories/${storyId}/history`, {
        title: noteForm.title.trim(),
        description: noteForm.description,
        involved_character_ids: noteForm.involved_character_ids,
        phase: currentPhase
      })
      setShowAddNote(false)
      setNoteForm({ title: '', description: '', involved_character_ids: [] })
      await loadStory()
    } catch (err) {
      alert('添加失败: ' + (err.response?.data?.error || err.message))
    }
  }

  // 删除一条历史
  const handleDeleteHistory = async (historyId) => {
    if (!confirm('确定要删除这条事件概括吗？')) return
    try {
      await axios.delete(`/api/stories/${storyId}/history/${historyId}`)
      await loadStory()
    } catch (err) {
      alert('删除失败: ' + (err.response?.data?.error || err.message))
    }
  }

  // 编辑历史
  const handleSaveEditHistory = async () => {
    if (!editingHistory) return
    try {
      await axios.put(`/api/stories/${storyId}/history/${editingHistory.id}`, {
        event_title: editingHistory.event_title,
        event_description: editingHistory.event_description
      })
      setEditingHistory(null)
      await loadStory()
    } catch (err) {
      alert('保存失败: ' + (err.response?.data?.error || err.message))
    }
  }

  const mainCharacter = story?.main_character || null
  const supportingCharacters = story?.supporting_characters || []
  const allCharacters = [mainCharacter, ...supportingCharacters].filter(Boolean)

  // 计算角色活跃度：仅在依赖变化时重算，避免每次 render 重复 O(history × chars) 计算
  // 注意：必须在早返回之前调用以保证每次渲染 hook 数量一致
  const { characterActivity, sortedCharacters } = useMemo(() => {
    try {
      // 给 NPC 打标记，统一字段
      const allChars = [
        ...(allCharacters || []).map(c => ({ ...c, _isNpc: false })),
        ...(npcs || []).map(n => ({ ...n, _isNpc: true }))
      ]
      const activity = {}

      allChars.forEach(char => {
        if (char && char.name) {
          activity[char.name] = {
            id: char.id || '',
            name: char.name,
            avatar: char.avatar || '',
            description: char.description || '',
            personality: char.personality || '',
            scenario: char.scenario || '',
            isNpc: !!char._isNpc,
            role: char.role || '',
            traits: Array.isArray(char.traits) ? char.traits : [],
            appearanceCount: 0,
            lastMentionIndex: -1,
            events: [],
            isActive: false
          }
        }
      })

      // 一次遍历同时统计活跃度（避免再次 slice + 二次 forEach）
      const recentEventCount = 5
      const recentStart = Math.max(0, storyHistory.length - recentEventCount)

      storyHistory.forEach((item, index) => {
        if (!item || !item.event_description) return
        const description = item.event_description
        const isRecent = index >= recentStart
        allChars.forEach(char => {
          if (!char || !char.name) return
          if (!description.includes(char.name)) return
          const a = activity[char.name]
          if (!a) return
          a.appearanceCount++
          a.lastMentionIndex = index
          a.events.push({
            index,
            title: item.event_title,
            description,
            type: item.type
          })
          if (isRecent) a.isActive = true
        })
      })

      const sorted = Object.values(activity).sort((a, b) => {
        if (a.isActive && !b.isActive) return -1
        if (!a.isActive && b.isActive) return 1
        return b.lastMentionIndex - a.lastMentionIndex
      })

      return { characterActivity: activity, sortedCharacters: sorted }
    } catch (error) {
      console.error('计算角色活跃度失败:', error)
      return { characterActivity: {}, sortedCharacters: [] }
    }
  }, [allCharacters, npcs, storyHistory])

  // 早返回必须在所有 hooks 调用之后
  if (!story) {
    return <div className="h-full flex items-center justify-center text-stone-300/50">加载中...</div>
  }

  return (
    <div className="h-full flex flex-col bg-[linear-gradient(135deg,rgba(45,35,25,0.95),rgba(35,25,20,0.98))]">
      {/* 工具栏 */}
      <div className="p-4 border-b border-stone-700/20 bg-[linear-gradient(180deg,rgba(139,109,78,0.12),rgba(120,95,68,0.08))]">
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={() => navigate('/stories')}
            className="flex items-center gap-2 text-stone-200/80 hover:text-stone-100"
          >
            <ArrowLeft className="w-4 h-4" />
            返回
          </button>
          <div className="flex gap-2 items-center">
            <button
              onClick={loadStory}
              className="btn-secondary p-2"
              title="刷新"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowFactsDrawer(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-amber-900/20 hover:bg-amber-900/40 border-amber-700/50 text-amber-200 transition-all"
              title="查看已揭示的角色隐藏经历"
            >
              <Eye className="w-4 h-4" />
              <span className="text-sm">角色档案</span>
              {revealedFacts.length > 0 && (
                <span className="ml-1 text-xs bg-amber-500/30 px-1.5 rounded-full">{revealedFacts.length}</span>
              )}
            </button>
            <button
              onClick={exportStory}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-emerald-900/20 hover:bg-emerald-900/40 border-emerald-700/50 text-emerald-200 transition-all"
              title="导出故事为txt文件"
            >
              <Download className="w-4 h-4" />
              <span className="text-sm">导出</span>
            </button>
            <button
              onClick={handleResetStory}
              disabled={isAiGenerating}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-rose-900/20 hover:bg-rose-900/40 border-rose-700/50 text-rose-200 disabled:opacity-50 transition-all"
              title="清空所有进度，从第一章重新开始"
            >
              <RotateCcw className="w-4 h-4" />
              <span className="text-sm">重置剧情</span>
            </button>
            <button
              onClick={() => setAutoAdvance(!autoAdvance)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${
                autoAdvance 
                  ? 'bg-amber-600/30 border-amber-500/50 text-amber-200' 
                  : 'bg-stone-700/30 border-stone-600/40 text-stone-300'
              }`}
              title="自动推进：选择后自动生成下一个事件"
            >
              {autoAdvance ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
              <span className="text-sm">自动推进</span>
            </button>
            <button
              onClick={handleAiGenerate}
              disabled={isAiGenerating}
              className="btn-primary flex items-center gap-2 px-3"
              title="推进剧情"
            >
              <Sparkles className="w-4 h-4" />
              {isAiGenerating ? '生成中...' : '推进剧情'}
            </button>
          </div>
        </div>
        <h1 className="text-2xl font-bold text-stone-100">{story.title}</h1>
        {story.description && (
          <p className="text-sm text-stone-300/60 mt-1">{story.description}</p>
        )}
        {framework && (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs px-2 py-1 rounded-full bg-stone-700/30 border border-stone-600/40 text-stone-200">
              当前阶段: {currentPhase}
            </span>
            <span className="text-xs text-stone-400/50">
              {framework.timeline?.find(p => p.phase === currentPhase)?.title || ''}
            </span>
          </div>
        )}
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* 左侧边栏 - 角色和NPC */}
        <div className="w-72 border-r border-stone-700/20 p-4 overflow-y-auto bg-[linear-gradient(180deg,rgba(0,0,0,0.15),transparent)]">
          {/* 框架阶段 */}
          {framework && (
            <div className="mb-6">
              <h3 className="font-bold text-stone-100 mb-3 flex items-center gap-2">
                <BookOpen className="w-4 h-4" />
                故事阶段
              </h3>
              <div className="space-y-2">
                {(framework.timeline || []).map((phase, index) => (
                  <button
                    key={phase.phase}
                    onClick={() => setCurrentPhase(phase.phase)}
                    className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
                      currentPhase === phase.phase
                        ? 'border-amber-600/50 bg-amber-800/20'
                        : 'border-stone-600/30 hover:border-stone-500/40 hover:bg-stone-800/10'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-stone-100 text-sm">{phase.phase}</span>
                      {currentPhase === phase.phase && (
                        <div className="w-2 h-2 rounded-full bg-amber-500/70" />
                      )}
                    </div>
                    <div className="text-xs text-stone-300/60">{phase.title}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mb-6">
            {/* 当前章节信息 */}
            {currentChapter && (
              <div className="mb-4 p-3 rounded-lg bg-gradient-to-br from-amber-900/30 to-orange-900/20 border border-amber-700/40">
                <div className="flex items-center gap-2 mb-2">
                  <BookOpen className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-medium text-amber-200">当前章节</span>
                </div>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-stone-400">章节:</span>
                    <span className="text-amber-100 font-medium">
                      第 {currentChapter.chapterIndex} 章 / 共 {currentChapter.totalChapters} 章
                    </span>
                  </div>
                  <div>
                    <span className="text-stone-400 block mb-1">标题:</span>
                    <span className="text-amber-100 font-medium">{currentChapter.chapterTitle}</span>
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-stone-100 flex items-center gap-2">
                <Users className="w-4 h-4" />
                故事角色
              </h3>
              {selectedCharacter && (
                <button
                  onClick={() => setSelectedCharacter(null)}
                  className="text-xs text-amber-300/80 hover:text-amber-200 flex items-center gap-1"
                  title="清除筛选"
                >
                  <X className="w-3 h-3" /> 清除
                </button>
              )}
            </div>

            {/* 所有角色状态显示 */}
            {characterStates.length > 0 && (
              <div className="mb-3 space-y-2">
                {characterStates.map((charState, index) => (
                  <div 
                    key={charState.name}
                    className={`p-2.5 rounded-lg border ${
                      charState.isProtagonist 
                        ? 'bg-gradient-to-br from-amber-900/30 to-orange-900/20 border-amber-700/40' 
                        : 'bg-gradient-to-br from-stone-800/40 to-stone-900/30 border-stone-700/40'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      {charState.isProtagonist && (
                        <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                      )}
                      <span className="text-xs font-medium text-amber-200">
                        {charState.name}
                        {charState.isProtagonist && ' (主角)'}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <span className="text-stone-500 block text-[10px]">境界</span>
                        <span className="text-amber-100 font-medium">{charState.realm}</span>
                      </div>
                      <div>
                        <span className="text-stone-500 block text-[10px]">位置</span>
                        <span className="text-amber-100 font-medium">{charState.location}</span>
                      </div>
                      <div>
                        <span className="text-stone-500 block text-[10px]">状态</span>
                        <span className={`font-medium ${charState.alive ? 'text-green-400' : 'text-red-400'}`}>
                          {charState.alive ? '存活' : '死亡'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2">
              {sortedCharacters.length === 0 ? (
                <p className="text-sm text-stone-400/50 text-center py-4">暂无角色</p>
              ) : (
                sortedCharacters.map(char => {
                  const isFiltered = selectedCharacter === char.name
                  return (
                    <div
                      key={char.id || char.name}
                      className={`group flex items-center gap-3 p-2.5 rounded-lg border-2 transition-all ${
                        isFiltered
                          ? 'border-amber-500/60 bg-amber-800/20'
                          : char.isActive
                            ? 'border-amber-600/40 bg-amber-700/15 hover:border-amber-500/50'
                            : 'border-stone-600/20 bg-stone-800/10 hover:border-stone-500/30 opacity-70 hover:opacity-100'
                      }`}
                    >
                      <Avatar
                        src={char.avatar}
                        name={char.name}
                        size={42}
                        title={`点击查看 ${char.name} 的详情`}
                        onClick={() => openCharacterDetail(char)}
                      />
                      <button
                        type="button"
                        onClick={() => setSelectedCharacter(isFiltered ? null : char.name)}
                        className="flex-1 min-w-0 text-left"
                        title={isFiltered ? '取消筛选' : `仅显示 ${char.name} 参与的事件`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="font-medium text-stone-100 text-sm truncate">{char.name}</div>
                          {char.isActive && (
                            <div className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" title="近期活跃" />
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs mt-0.5">
                          <span className={char.isActive ? 'text-amber-200/70' : 'text-stone-400/60'}>
                            出现 {char.appearanceCount} 次
                          </span>
                          {char.isNpc && (
                            <span className="px-1.5 py-0.5 rounded bg-stone-700/50 text-stone-300 text-[10px]">NPC</span>
                          )}
                          {isFiltered && <Filter className="w-3 h-3 text-amber-300" />}
                        </div>
                      </button>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-stone-100 flex items-center gap-2">
                <Users className="w-4 h-4" />
                NPC管理
              </h3>
              <div className="flex gap-1">
                <button
                  onClick={() => setShowNPCDialog(true)}
                  className="btn-secondary p-1"
                  title="手动添加"
                >
                  <Plus className="w-3 h-3" />
                </button>
                <button
                  onClick={() => setShowGenerateNPC(true)}
                  className="btn-secondary p-1"
                  title="AI生成"
                >
                  <RefreshCw className="w-3 h-3" />
                </button>
              </div>
            </div>
            <div className="space-y-2">
              {npcs.length === 0 ? (
                <p className="text-sm text-stone-400/50 text-center py-4">暂无NPC</p>
              ) : (
                npcs.map(npc => (
                  <div key={npc.id} className="p-3 rounded-lg bg-stone-800/10 border border-stone-700/20">
                    <div className="flex items-start gap-3">
                      <Avatar
                        src={npc.avatar}
                        name={npc.name}
                        size={40}
                        onClick={() => openCharacterDetail({ ...npc, _isNpc: true })}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-medium text-stone-100 truncate">{npc.name}</div>
                            {npc.role && (
                              <div className="text-xs text-stone-400/60 truncate">{npc.role}</div>
                            )}
                          </div>
                          <button
                            onClick={() => handleDeleteNPC(npc.id)}
                            className="text-red-400 hover:text-red-300 flex-shrink-0"
                            title="删除 NPC"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                        {npc.description && (
                          <p className="text-xs text-stone-300/50 mt-1.5 line-clamp-2">{npc.description}</p>
                        )}
                        {npc.traits && npc.traits.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {npc.traits.map((trait, i) => (
                              <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-stone-700/50 text-stone-300">
                                {trait}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-stone-100 flex items-center gap-2">
                <GitBranch className="w-4 h-4" />
                关系
              </h3>
              <button
                onClick={() => setShowRelationshipDialog(true)}
                className="btn-secondary p-1"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
            <div className="space-y-2">
              {relationships.length === 0 ? (
                <p className="text-sm text-stone-400/50 text-center py-4">暂无关系</p>
              ) : (
                relationships.map(rel => (
                  <div key={rel.id} className="p-3 rounded-lg bg-stone-800/10 border border-stone-700/20">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-xs text-stone-400/60">{rel.type}</div>
                        <div className="text-sm text-stone-100 mt-1">
                          {allCharacters.find(c => c.character_id === rel.character_id)?.name} → {allCharacters.find(c => c.character_id === rel.target_id)?.name}
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteRelationship(rel.id)}
                        className="text-red-400 hover:text-red-300"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    {rel.description && (
                      <p className="text-xs text-stone-300/50 mt-2">{rel.description}</p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* 主内容区 - 当前事件 */}
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 p-6 overflow-y-auto">
            {!currentEvent ? (
              <div className="h-full flex flex-col items-center justify-center text-stone-300/50">
                <BookOpen className="w-16 h-16 mb-4 opacity-50" />
                <p className="text-lg mb-4">故事还没有开始</p>
                <button
                  onClick={async () => {
                    // 创建初始事件
                    try {
                      await axios.post(`/api/stories/${storyId}/events`, {
                        title: '故事开始',
                        description: '你的冒险开始了...',
                        choices: [
                          { title: '开始探索', description: '向未知的世界出发' },
                          { title: '寻找线索', description: '先收集一些信息' }
                        ]
                      })
                      await loadStory()
                    } catch (error) {
                      alert('创建初始事件失败: ' + error.message)
                    }
                  }}
                  className="btn-primary"
                >
                  开始故事
                </button>
              </div>
            ) : (
              <div className="max-w-3xl mx-auto">
                <div className="bg-[linear-gradient(135deg,rgba(139,109,78,0.15),rgba(120,95,68,0.10))] backdrop-blur-sm p-6 mb-6 rounded-2xl border border-stone-700/30 shadow-lg">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-2xl font-bold text-stone-100">{currentEvent.title}</h2>
                    <span className="text-sm text-blue-300 bg-blue-900/30 px-3 py-1 rounded border border-blue-700/50">
                      第 {Math.floor((storyHistory?.length || 0) / 10)} 章
                    </span>
                  </div>
                  {currentEvent.description && (
                    <p className="text-stone-200/85 leading-relaxed mb-6">
                      {typeof currentEvent.description === 'string' 
                        ? currentEvent.description 
                        : JSON.stringify(currentEvent.description)}
                    </p>
                  )}
                  
                  {currentEvent.choices && currentEvent.choices.length > 0 ? (
                    <div>
                      <h3 className="font-bold text-stone-100 mb-4 text-lg">选择你的行动</h3>
                      <div className="space-y-4">
                        {currentEvent.choices.map((choice, index) => (
                          <button
                            key={index}
                            onClick={() => handleChoose(index)}
                            className="w-full text-left p-5 rounded-xl bg-[linear-gradient(135deg,rgba(160,130,90,0.25),rgba(140,115,75,0.18))] border-2 border-amber-700/50 hover:border-amber-500/70 hover:bg-[linear-gradient(135deg,rgba(170,140,100,0.30),rgba(150,125,85,0.22))] transition-all duration-300 group shadow-md hover:shadow-lg"
                            style={{
                              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1), 0 2px 8px rgba(0,0,0,0.2)'
                            }}
                          >
                            <div className="flex items-start gap-3">
                              <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-[linear-gradient(135deg,rgba(139,109,78,0.5),rgba(120,95,68,0.4)] border border-amber-600/40 flex items-center justify-center text-stone-100 font-bold text-sm group-hover:bg-[linear-gradient(135deg,rgba(149,119,88,0.6),rgba(130,105,78,0.5))] group-hover:border-amber-500/50 transition-all">
                                {index + 1}
                              </div>
                              <div className="flex-1">
                                <div className="font-bold text-stone-100 mb-2 text-base group-hover:text-stone-50 transition-colors">{choice.title}</div>
                                {choice.description && (
                                  <p className="text-sm text-stone-200/75 leading-relaxed">{choice.description}</p>
                                )}
                              </div>
                              <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                <div className="w-6 h-6 rounded-full bg-amber-500/30 flex items-center justify-center border border-amber-400/30">
                                  <div className="w-2 h-2 rounded-full bg-amber-300"></div>
                                </div>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <p className="text-stone-400/50">这个故事分支还没有选择</p>
                    </div>
                  )}
                </div>

                {/* 世界书信息 */}
                {story.lorebooks && story.lorebooks.length > 0 && (
                  <div className="bg-[linear-gradient(135deg,rgba(139,109,78,0.10),rgba(120,95,68,0.05))] backdrop-blur-sm p-4 rounded-2xl border border-stone-700/20">
                    <h3 className="font-bold text-stone-100 mb-3 flex items-center gap-2">
                      <BookOpen className="w-4 h-4" />
                      相关世界书
                    </h3>
                    <div className="space-y-2">
                      {story.lorebooks.map(lorebook => (
                        <div key={lorebook.id} className="p-3 rounded-lg bg-stone-800/10 border border-stone-700/20">
                          <div className="font-medium text-stone-100">{lorebook.title}</div>
                          {lorebook.content && (
                            <p className="text-sm text-stone-300/60 mt-1 line-clamp-2">{lorebook.content}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 右侧边栏 - 故事概括（事件时间线） */}
          <div className="w-80 border-l border-stone-700/20 p-4 overflow-y-auto bg-[linear-gradient(180deg,rgba(0,0,0,0.15),transparent)]">
            {/* 顶部工具栏 */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-stone-100 flex items-center gap-2">
                  <History className="w-4 h-4" />
                  事件概括
                </h3>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setHistorySortDesc(!historySortDesc)}
                  className="p-1.5 rounded hover:bg-stone-700/30 text-stone-300/70 hover:text-stone-100"
                  title={historySortDesc ? '当前：新→旧（点击切换）' : '当前：旧→新（点击切换）'}
                >
                  <ArrowUpDown className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setShowAddNote(true)}
                  className="p-1.5 rounded hover:bg-stone-700/30 text-stone-300/70 hover:text-stone-100"
                  title="添加笔记"
                >
                  <StickyNote className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* 当前筛选提示 */}
            {selectedCharacter && (
              <div className="mb-3 px-3 py-2 rounded-lg bg-amber-900/15 border border-amber-700/30 text-xs flex items-center justify-between">
                <span className="text-amber-200/80 flex items-center gap-1.5">
                  <Filter className="w-3 h-3" />
                  筛选：{selectedCharacter}
                </span>
                <button
                  onClick={() => setSelectedCharacter(null)}
                  className="text-amber-300/80 hover:text-amber-100"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            {(() => {
              // 时间线渲染
              let items = [...storyHistory]
              // 角色筛选
              if (selectedCharacter) {
                items = items.filter(h => {
                  if (Array.isArray(h.involved_character_ids) && h.involved_character_ids.length > 0) {
                    const charObj = sortedCharacters.find(c => c.name === selectedCharacter)
                    if (charObj && charObj.id && h.involved_character_ids.includes(charObj.id)) return true
                  }
                  const text = `${h.event_title || ''} ${h.event_description || ''} ${h.choice || ''}`
                  return text.includes(selectedCharacter)
                })
              }
              // 排序
              items.sort((a, b) => {
                const ta = a.timestamp || a.created_at || ''
                const tb = b.timestamp || b.created_at || ''
                return historySortDesc ? tb.localeCompare(ta) : ta.localeCompare(tb)
              })
              const total = items.length
              const showCount = historyExpanded ? items.length : Math.min(5, items.length)
              const visible = items.slice(0, showCount)

              if (total === 0) {
                return <p className="text-sm text-stone-400/50 text-center py-8">暂无事件记录</p>
              }

              const typeIcon = (type) => {
                if (type === 'choice') return <GitFork className="w-3.5 h-3.5" />
                if (type === 'ai_generate') return <Sparkles className="w-3.5 h-3.5" />
                if (type === 'note') return <StickyNote className="w-3.5 h-3.5" />
                return <MessageSquare className="w-3.5 h-3.5" />
              }
              const typeLabel = (type) => ({ choice: '选择', ai_generate: 'AI推进', note: '笔记' })[type] || '事件'

              return (
                <div className="space-y-2">
                  {visible.map((h, idx) => {
                    const isHighlight = highlightedEventId === h.id
                    return (
                      <div
                        key={h.id || idx}
                        ref={(el) => { if (el) eventRefs.current[h.id] = el }}
                        className={`group p-3 rounded-lg border transition-all ${
                          isHighlight
                            ? 'border-amber-400 bg-amber-700/30 shadow-[0_0_0_3px_rgba(251,191,36,0.25)]'
                            : 'border-stone-700/25 bg-stone-800/15 hover:border-stone-600/40 hover:bg-stone-800/25'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-1.5 text-xs text-stone-400/70">
                            <span className="text-amber-300/70">{typeIcon(h.type)}</span>
                            <span>{typeLabel(h.type)}</span>
                            {h.phase && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-600/20 text-amber-200/70 text-[10px]">
                                {h.phase}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => jumpToEvent(h.id)}
                              className="p-1 rounded hover:bg-stone-700/40 text-stone-400/70 hover:text-amber-300"
                              title="📖 回顾"
                            >
                              <Eye className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => setEditingHistory({ ...h })}
                              className="p-1 rounded hover:bg-stone-700/40 text-stone-400/70 hover:text-stone-100"
                              title="编辑"
                            >
                              <Edit className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => handleDeleteHistory(h.id)}
                              className="p-1 rounded hover:bg-stone-700/40 text-red-400/70 hover:text-red-300"
                              title="删除"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                        <div className="text-sm font-medium text-stone-100 leading-snug">
                          {h.event_title || (h.type === 'choice' ? `选择：${h.choice}` : '（无标题）')}
                        </div>

                        {h.type === 'choice' && h.choice && (
                          <div className="mt-1 text-xs text-amber-200/70 flex items-start gap-1">
                            <ChevronRight className="w-3 h-3 mt-0.5 flex-shrink-0" />
                            <span className="line-clamp-1">{h.choice}</span>
                          </div>
                        )}

                        {h.event_description && (
                          <div className="mt-1.5 text-xs text-stone-300/70 line-clamp-2 leading-relaxed">
                            {h.event_description}
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {total > 5 && (
                    <button
                      onClick={() => setHistoryExpanded(!historyExpanded)}
                      className="w-full mt-2 py-2 rounded-lg border border-stone-600/30 text-xs text-stone-300/70 hover:text-stone-100 hover:border-stone-500/40 hover:bg-stone-800/30 flex items-center justify-center gap-1.5 transition-all"
                    >
                      {historyExpanded ? (
                        <><ChevronUp className="w-3 h-3" /> 收起（仅看最近 5 条）</>
                      ) : (
                        <><ChevronDown className="w-3 h-3" /> 展开历史（剩余 {total - 5} 条）</>
                      )}
                    </button>
                  )}
                </div>
              )
            })()}
          </div>
        </div>
      </div>

      {/* NPC创建弹窗 */}
      {showNPCDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[linear-gradient(180deg,rgba(245,240,230,0.96),rgba(235,225,210,0.94))] rounded-2xl p-6 w-full max-w-md border border-stone-300/40 shadow-2xl">
            <h2 className="text-xl font-bold mb-6 text-stone-800">添加NPC</h2>
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-stone-700 mb-2">名称 *</label>
                <input
                  type="text"
                  value={npcFormData.name}
                  onChange={(e) => setNpcFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="input-field"
                  placeholder="输入NPC名称"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-stone-700 mb-2">描述</label>
                <textarea
                  value={npcFormData.description}
                  onChange={(e) => setNpcFormData(prev => ({ ...prev, description: e.target.value }))}
                  className="input-field h-24"
                  placeholder="描述NPC的外貌、性格或背景"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-stone-800 mb-2">角色定位</label>
                <input
                  type="text"
                  value={npcFormData.role}
                  onChange={(e) => setNpcFormData(prev => ({ ...prev, role: e.target.value }))}
                  className="input-field"
                  placeholder="如：商人、守卫、村民"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowNPCDialog(false)
                  setNpcFormData({ name: '', description: '', role: '', traits: [] })
                }}
                className="btn-secondary"
              >
                取消
              </button>
              <button
                onClick={handleCreateNPC}
                className="btn-primary"
              >
                添加NPC
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NPC生成弹窗 */}
      {showGenerateNPC && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[linear-gradient(180deg,rgba(245,240,230,0.96),rgba(235,225,210,0.94))] rounded-2xl p-6 w-full max-w-md border border-stone-300/40 shadow-2xl">
            <h2 className="text-xl font-bold mb-6 text-stone-800 flex items-center gap-2">
              <RefreshCw className="w-5 h-5" />
              AI生成NPC
            </h2>
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-stone-700 mb-2">场景描述</label>
                <textarea
                  value={generateContext}
                  onChange={(e) => setGenerateContext(e.target.value)}
                  className="input-field h-28"
                  placeholder="描述当前场景，如：在酒馆里遇到了一个神秘的商人"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-stone-800 mb-2">角色定位</label>
                <input
                  type="text"
                  value={generateRole}
                  onChange={(e) => setGenerateRole(e.target.value)}
                  className="input-field"
                  placeholder="如：商人、守卫、村民"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowGenerateNPC(false)
                  setGenerateContext('')
                  setGenerateRole('')
                }}
                disabled={isGenerating}
                className="btn-secondary"
              >
                取消
              </button>
              <button
                onClick={handleGenerateNPC}
                disabled={isGenerating}
                className="btn-primary"
              >
                {isGenerating ? '生成中...' : '开始生成'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 关系创建弹窗 */}
      {showRelationshipDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[linear-gradient(180deg,rgba(245,240,230,0.96),rgba(235,225,210,0.94))] rounded-2xl p-6 w-full max-w-md border border-stone-300/40 shadow-2xl">
            <h2 className="text-xl font-bold mb-6 text-stone-800 flex items-center gap-2">
              <GitBranch className="w-5 h-5" />
              创建关系
            </h2>
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-stone-700 mb-2">源角色</label>
                <select
                  value={relFormData.character_id}
                  onChange={(e) => setRelFormData(prev => ({ ...prev, character_id: e.target.value }))}
                  className="input-field"
                >
                  <option value="">请选择角色</option>
                  {allCharacters.map(char => (
                    <option key={char.character_id} value={char.character_id}>{char.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-stone-700 mb-2">目标角色</label>
                <select
                  value={relFormData.target_id}
                  onChange={(e) => setRelFormData(prev => ({ ...prev, target_id: e.target.value }))}
                  className="input-field"
                >
                  <option value="">请选择目标</option>
                  {allCharacters.filter(c => c.character_id !== relFormData.character_id).map(char => (
                    <option key={char.character_id} value={char.character_id}>{char.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-stone-700 mb-2">关系类型</label>
                <select
                  value={relFormData.type}
                  onChange={(e) => setRelFormData(prev => ({ ...prev, type: e.target.value }))}
                  className="input-field"
                >
                  <option value="companion">同伴</option>
                  <option value="enemy">敌人</option>
                  <option value="neutral">中立</option>
                  <option value="romantic">恋人</option>
                  <option value="family">家人</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-stone-700 mb-2">关系描述</label>
                <textarea
                  value={relFormData.description}
                  onChange={(e) => setRelFormData(prev => ({ ...prev, description: e.target.value }))}
                  className="input-field h-24"
                  placeholder="描述这段关系的特点"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowRelationshipDialog(false)
                  setRelFormData({ character_id: '', target_id: '', type: 'companion', description: '' })
                }}
                className="btn-secondary"
              >
                取消
              </button>
              <button
                onClick={handleCreateRelationship}
                className="btn-primary"
              >
                创建关系
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 角色详情模态框 */}
      {detailCharacter && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={() => setDetailCharacter(null)}
        >
          <div
            className="bg-[linear-gradient(180deg,rgba(62,45,30,0.98),rgba(45,33,22,0.98))] rounded-2xl w-full max-w-lg border border-stone-700/40 shadow-2xl text-stone-100 max-h-[85vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 头部 */}
            <div className="p-5 border-b border-stone-700/30 flex items-start gap-4">
              {(() => {
                // 判断是否为文件来源角色（不可在前端编辑）
                const isFileSource = detailCharacter.source === 'file' || String(detailCharacter.id || '').startsWith('file-char:')
                const isNpc = detailCharacter._isNpc
                const canEdit = !!detailCharacter.id && !isFileSource
                return (
                  <Avatar
                    src={detailCharacter.avatar}
                    name={detailCharacter.name}
                    size={72}
                    editable={canEdit}
                    uploadUrl={
                      canEdit
                        ? (isNpc
                            ? `/api/stories/${storyId}/npcs/${detailCharacter.id}/avatar`
                            : `/api/characters/${detailCharacter.id}/avatar`)
                        : ''
                    }
                    removeUrl={canEdit && !isNpc ? `/api/characters/${detailCharacter.id}/avatar` : ''}
                    onChange={async (newUrl) => {
                      setDetailCharacter(prev => prev ? { ...prev, avatar: newUrl } : prev)
                      await loadStory()
                    }}
                  />
                )
              })()}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-xl font-bold truncate">{detailCharacter.name}</h2>
                  <button
                    onClick={() => setDetailCharacter(null)}
                    className="text-stone-400 hover:text-stone-100 flex-shrink-0"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                {detailCharacter.role && (
                  <div className="text-xs text-amber-200/70 mt-1">{detailCharacter.role}</div>
                )}
                {detailCharacter._isNpc && (
                  <span className="inline-block mt-1.5 px-2 py-0.5 rounded bg-stone-700/50 text-stone-300 text-[10px]">NPC</span>
                )}
              </div>
            </div>

            {/* 内容 */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {detailCharacter.description && (
                <div>
                  <div className="text-xs uppercase tracking-wider text-stone-400/70 mb-1">简介</div>
                  <p className="text-sm text-stone-200/90 leading-relaxed whitespace-pre-line">{detailCharacter.description}</p>
                </div>
              )}
              {detailCharacter.personality && (
                <div>
                  <div className="text-xs uppercase tracking-wider text-stone-400/70 mb-1">性格</div>
                  <p className="text-sm text-stone-200/90 leading-relaxed">{detailCharacter.personality}</p>
                </div>
              )}
              {detailCharacter.scenario && (
                <div>
                  <div className="text-xs uppercase tracking-wider text-stone-400/70 mb-1">背景</div>
                  <p className="text-sm text-stone-200/90 leading-relaxed">{detailCharacter.scenario}</p>
                </div>
              )}
              {Array.isArray(detailCharacter.traits) && detailCharacter.traits.length > 0 && (
                <div>
                  <div className="text-xs uppercase tracking-wider text-stone-400/70 mb-1">特征</div>
                  <div className="flex flex-wrap gap-1.5">
                    {detailCharacter.traits.map((t, i) => (
                      <span key={i} className="px-2 py-0.5 rounded-full bg-stone-700/40 text-stone-200 text-xs">{t}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* 参与的事件 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs uppercase tracking-wider text-stone-400/70">参与的事件</div>
                  {detailLoading && <span className="text-xs text-stone-400/60">加载中...</span>}
                </div>
                {!detailLoading && detailEvents.length === 0 ? (
                  <p className="text-sm text-stone-400/50">暂无参与事件</p>
                ) : (
                  <div className="space-y-1.5">
                    {detailEvents.map((ev, idx) => (
                      <button
                        key={ev.id || idx}
                        onClick={() => jumpToEvent(ev.id)}
                        className="w-full text-left p-2.5 rounded-lg bg-stone-800/30 border border-stone-700/30 hover:border-amber-600/40 hover:bg-amber-900/10 transition-all group"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-stone-100 truncate">
                              {ev.event_title || (ev.choice ? `选择：${ev.choice}` : '（无标题）')}
                            </div>
                            {ev.event_description && (
                              <div className="text-xs text-stone-300/60 line-clamp-2 mt-0.5">
                                {ev.event_description}
                              </div>
                            )}
                            {ev.phase && (
                              <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-amber-600/20 text-amber-200/70 text-[10px]">
                                {ev.phase}
                              </span>
                            )}
                          </div>
                          <Eye className="w-4 h-4 text-stone-400/60 group-hover:text-amber-300 flex-shrink-0 mt-0.5" />
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 添加笔记弹窗 */}
      {showAddNote && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[linear-gradient(180deg,rgba(245,240,230,0.96),rgba(235,225,210,0.94))] rounded-2xl p-6 w-full max-w-md border border-stone-300/40 shadow-2xl">
            <h2 className="text-xl font-bold mb-5 text-stone-800 flex items-center gap-2">
              <StickyNote className="w-5 h-5" />
              添加事件笔记
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-stone-700 mb-2">标题 *</label>
                <input
                  type="text"
                  value={noteForm.title}
                  onChange={(e) => setNoteForm(prev => ({ ...prev, title: e.target.value }))}
                  className="input-field"
                  placeholder="如：遇到神秘商人"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-stone-700 mb-2">描述</label>
                <textarea
                  value={noteForm.description}
                  onChange={(e) => setNoteForm(prev => ({ ...prev, description: e.target.value }))}
                  className="input-field h-24"
                  placeholder="详细描述这个事件..."
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-stone-700 mb-2">关联角色（可多选）</label>
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-2 rounded-lg bg-stone-100/60 border border-stone-300/40">
                  {sortedCharacters.length === 0 && (
                    <span className="text-xs text-stone-500">暂无角色可选</span>
                  )}
                  {sortedCharacters.map(c => {
                    const selected = noteForm.involved_character_ids.includes(c.id)
                    return (
                      <button
                        key={c.id || c.name}
                        type="button"
                        onClick={() => {
                          setNoteForm(prev => ({
                            ...prev,
                            involved_character_ids: selected
                              ? prev.involved_character_ids.filter(x => x !== c.id)
                              : [...prev.involved_character_ids, c.id]
                          }))
                        }}
                        className={`px-2 py-1 rounded-full text-xs border transition-all ${
                          selected
                            ? 'bg-amber-600 text-white border-amber-700'
                            : 'bg-white text-stone-700 border-stone-300 hover:border-amber-500'
                        }`}
                      >
                        {c.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowAddNote(false)
                  setNoteForm({ title: '', description: '', involved_character_ids: [] })
                }}
                className="btn-secondary"
              >
                取消
              </button>
              <button onClick={handleAddNote} className="btn-primary">添加</button>
            </div>
          </div>
        </div>
      )}

      {/* 编辑历史条目弹窗 */}
      {editingHistory && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[linear-gradient(180deg,rgba(245,240,230,0.96),rgba(235,225,210,0.94))] rounded-2xl p-6 w-full max-w-md border border-stone-300/40 shadow-2xl">
            <h2 className="text-xl font-bold mb-5 text-stone-800 flex items-center gap-2">
              <Edit className="w-5 h-5" />
              编辑事件
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-stone-700 mb-2">标题</label>
                <input
                  type="text"
                  value={editingHistory.event_title || ''}
                  onChange={(e) => setEditingHistory(prev => ({ ...prev, event_title: e.target.value }))}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-stone-700 mb-2">描述</label>
                <textarea
                  value={editingHistory.event_description || ''}
                  onChange={(e) => setEditingHistory(prev => ({ ...prev, event_description: e.target.value }))}
                  className="input-field h-32"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setEditingHistory(null)}
                className="btn-secondary"
              >
                取消
              </button>
              <button onClick={handleSaveEditHistory} className="btn-primary flex items-center gap-1.5">
                <Save className="w-4 h-4" /> 保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== 隐藏经历解锁通知（队首一条）===== */}
      {factsQueue.length > 0 && (() => {
        const cur = factsQueue[0]
        return (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-300">
            <div className="bg-[linear-gradient(180deg,rgba(62,45,30,0.98),rgba(45,33,22,0.95))] border-2 border-amber-500/60 rounded-xl max-w-lg w-full p-6 shadow-[0_0_40px_rgba(245,158,11,0.4)]">
              <div className="flex items-center gap-2 mb-3 text-amber-300">
                <Sparkles className="w-5 h-5" />
                <span className="text-xs uppercase tracking-widest font-semibold">隐藏经历揭示</span>
              </div>
              <h3 className="text-xl font-bold text-stone-100 mb-1">{cur.character_name}</h3>
              <p className="text-sm text-amber-200/80 mb-4 italic">「{cur.title}」</p>
              <div className="bg-stone-900/40 border border-amber-700/30 rounded-lg p-4 mb-5 text-stone-200 leading-relaxed text-sm whitespace-pre-wrap">
                {cur.reveal_text}
              </div>
              <div className="flex justify-end gap-2">
                {factsQueue.length > 1 && (
                  <span className="text-xs text-stone-400 self-center mr-auto">还有 {factsQueue.length - 1} 条揭示...</span>
                )}
                <button
                  onClick={() => setFactsQueue(q => q.slice(1))}
                  className="btn-primary px-5"
                >
                  我知道了
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ===== 角色档案抽屉 ===== */}
      {showFactsDrawer && (
        <div className="fixed inset-0 z-40 flex justify-end" onClick={() => setShowFactsDrawer(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="relative w-full max-w-md h-full bg-[linear-gradient(180deg,rgba(62,45,30,0.98),rgba(45,33,22,0.95))] border-l-2 border-amber-700/40 overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-[rgba(45,33,22,0.95)] backdrop-blur-sm border-b border-amber-700/30 p-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-amber-200 flex items-center gap-2">
                <Eye className="w-5 h-5" />
                角色档案 · 隐藏经历
              </h2>
              <button onClick={() => setShowFactsDrawer(false)} className="p-1 hover:bg-stone-700/40 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              {revealedFacts.length === 0 ? (
                <div className="text-stone-400/60 text-sm text-center py-12">
                  尚未揭示任何隐藏经历。<br />
                  与角色多次互动 / 完成关键事件 / 提及关键词都可能触发。
                </div>
              ) : (
                Object.entries(
                  revealedFacts.reduce((acc, f) => {
                    const k = f.character_name || '未知'
                    ;(acc[k] = acc[k] || []).push(f)
                    return acc
                  }, {})
                ).map(([charName, facts]) => (
                  <div key={charName} className="border border-stone-700/40 rounded-lg overflow-hidden">
                    <div className="bg-stone-800/40 px-4 py-2 font-semibold text-stone-100 flex items-center justify-between">
                      <span>{charName}</span>
                      <span className="text-xs text-amber-300/80">{facts.length} 条</span>
                    </div>
                    <div className="divide-y divide-stone-700/30">
                      {facts.map(f => (
                        <div key={f.id} className="p-3 hover:bg-stone-800/20">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <div className="text-sm font-medium text-amber-200">{f.title}</div>
                            {f.category && (
                              <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-amber-800/30 text-amber-300/80 shrink-0">
                                {f.category}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-stone-300/70 leading-relaxed whitespace-pre-wrap">{f.reveal_text}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default StoryPlay
