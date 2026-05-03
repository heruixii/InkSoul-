import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Send, Plus, Trash2, RefreshCw, BookOpen, Pencil, Save, Search, Download, Upload, Star, GitBranch, Bug } from 'lucide-react'
import axios from 'axios'
import { marked } from 'marked'

function Chat({ settings, characters }) {
  const { characterId, chatId: urlChatId } = useParams()
  const navigate = useNavigate()
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const loadChatRequestIdRef = useRef(0)

  const [character, setCharacter] = useState(null)
  const [chats, setChats] = useState([])
  const [currentChat, setCurrentChat] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [isDeletingChat, setIsDeletingChat] = useState(false)
  const [showNewChat, setShowNewChat] = useState(false)
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)
  const [chatError, setChatError] = useState('')
  const [summary, setSummary] = useState('')
  const [isSummarizing, setIsSummarizing] = useState(false)
  const [chatLorebooks, setChatLorebooks] = useState([])
  const [showLorebookDebug, setShowLorebookDebug] = useState(false)
  const [isLoadingLorebookDebug, setIsLoadingLorebookDebug] = useState(false)
  const [lorebookDebug, setLorebookDebug] = useState({
    triggered: [],
    triggeredCount: 0,
    candidateCount: 0,
    contextPreview: ''
  })
  const [editingMessageId, setEditingMessageId] = useState('')
  const [editingContent, setEditingContent] = useState('')
  const [presets, setPresets] = useState([])
  const [activePresetId, setActivePresetId] = useState(settings.activePresetId || '')
  const [branchInfo, setBranchInfo] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [chatSearchTerm, setChatSearchTerm] = useState('')
  const [chatSearchResults, setChatSearchResults] = useState([])
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [importPayload, setImportPayload] = useState('')
  const [importError, setImportError] = useState('')
  const [isImporting, setIsImporting] = useState(false)

  // 加载角色信息：仅在 characterId 变化时重跑，避免 characters 数组每次更新都触发
  const charactersRef = useRef(characters)
  useEffect(() => { charactersRef.current = characters }, [characters])
  useEffect(() => {
    const char = charactersRef.current.find(c => c.id === characterId)
    if (char) {
      setCharacter(char)
    } else {
      axios.get(`/api/characters/${characterId}`)
        .then(response => setCharacter(response.data))
        .catch(() => navigate('/'))
    }
  }, [characterId, navigate])

  const toggleChatFavorite = async (chat) => {
    try {
      const response = await axios.put(`/api/chats/${chat.id}/favorite`, { favorite: !chat.favorite })
      if (currentChat?.id === chat.id) {
        setCurrentChat(prev => prev ? { ...prev, favorite: response.data.favorite } : prev)
      }
      await loadChats()
    } catch (error) {
      setChatError('收藏对话失败: ' + (error.response?.data?.error || error.message))
    }
  }

  const exportChat = async () => {
    if (!currentChat) return
    try {
      const response = await axios.get(`/api/chats/${currentChat.id}/export`)
      const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${(currentChat.title || 'chat').replace(/[\\/:*?"<>|]/g, '_')}.json`
      link.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      setChatError('导出失败: ' + (error.response?.data?.error || error.message))
    }
  }

  const importChat = async () => {
    if (isImporting) return

    setImportError('')
    setChatError('')
    let parsed

    try {
      parsed = JSON.parse(importPayload)
    } catch (error) {
      setImportError('JSON 格式无效，请检查后重试')
      return
    }

    if (!parsed || !Array.isArray(parsed.messages)) {
      setImportError('导入数据缺少 messages 数组，请使用导出的原始 JSON')
      return
    }

    setIsImporting(true)
    try {
      const response = await axios.post('/api/chats/import', {
        character_id: characterId,
        chat: parsed.chat,
        messages: parsed.messages
      })
      setShowImportDialog(false)
      setImportPayload('')
      setImportError('')
      await loadChats()
      setChatError('')
      navigate(`/chat/${characterId}/${response.data.id}`)
    } catch (error) {
      setChatError('导入失败: ' + (error.response?.data?.error || error.message))
    } finally {
      setIsImporting(false)
    }
  }

  const handleBranchChat = async (message) => {
    if (!currentChat) return

    try {
      const response = await axios.post('/api/chats', {
        character_id: characterId,
        title: `${currentChat.title} · 分支`,
        branch_from_chat_id: currentChat.id,
        branch_from_message_id: message.id
      })

      await loadChats()
      navigate(`/chat/${characterId}/${response.data.id}`)
    } catch (error) {
      setChatError('创建分支失败: ' + (error.response?.data?.error || error.message))
    }
  }

  // 加载聊天列表
  const loadChats = async () => {
    try {
      const response = await axios.get(`/api/characters/${characterId}/chats`)
      setChats(response.data)
    } catch (error) {
      console.error('加载聊天列表失败:', error)
      setChatError('加载聊天列表失败')
    }
  }

  const loadLorebooks = async (chatId) => {
    try {
      const response = await axios.get('/api/lorebooks', {
        params: {
          characterId,
          chatId
        }
      })
      setChatLorebooks(response.data)
    } catch (error) {
      console.error('加载世界书失败:', error)
    }
  }

  const loadLorebookDebug = async (chatId) => {
    if (!chatId) return

    setIsLoadingLorebookDebug(true)
    try {
      const response = await axios.get(`/api/chats/${chatId}/lorebook-debug`)
      setLorebookDebug({
        triggered: Array.isArray(response.data?.triggered) ? response.data.triggered : [],
        triggeredCount: response.data?.triggeredCount || 0,
        candidateCount: response.data?.candidateCount || 0,
        contextPreview: response.data?.contextPreview || ''
      })
    } catch (error) {
      console.error('加载世界书调试信息失败:', error)
      setLorebookDebug({ triggered: [], triggeredCount: 0, candidateCount: 0, contextPreview: '' })
    } finally {
      setIsLoadingLorebookDebug(false)
    }
  }

  useEffect(() => {
    if (characterId) {
      loadChats()
    }
  }, [characterId])

  useEffect(() => {
    if (!characterId || !chatSearchTerm.trim()) {
      setChatSearchResults([])
      return
    }

    const timer = setTimeout(() => {
      axios.get(`/api/characters/${characterId}/chat-search`, {
        params: { q: chatSearchTerm }
      }).then(response => setChatSearchResults(response.data)).catch(() => setChatSearchResults([]))
    }, 180)

    return () => clearTimeout(timer)
  }, [characterId, chatSearchTerm])

  useEffect(() => {
    axios.get('/api/presets').then(response => setPresets(response.data)).catch(() => {})
  }, [])

  useEffect(() => {
    setActivePresetId(settings.activePresetId || '')
  }, [settings.activePresetId])

  // 加载特定聊天
  useEffect(() => {
    if (urlChatId) {
      setShowNewChat(false)
      loadChat(urlChatId)
      loadLorebooks(urlChatId)
      loadLorebookDebug(urlChatId)
    } else {
      setCurrentChat(null)
      setMessages([])
      setSummary('')
      setChatLorebooks([])
      setBranchInfo(null)
      setShowLorebookDebug(false)
      setLorebookDebug({ triggered: [], triggeredCount: 0, candidateCount: 0, contextPreview: '' })
    }
  }, [urlChatId])

  useEffect(() => {
    if (!urlChatId) {
      return
    }

    const matchedChat = chats.find(c => c.id === urlChatId)
    if (matchedChat) {
      setCurrentChat(matchedChat)
    }
  }, [chats, urlChatId])

  const loadChat = async (id) => {
    const requestId = ++loadChatRequestIdRef.current
    try {
      setChatError('')
      setIsLoadingMessages(true)
      const chat = chats.find(c => c.id === id)
      if (chat) {
        setCurrentChat(chat)
      }
      
      const response = await axios.get(`/api/chats/${id}/messages`)
      if (requestId !== loadChatRequestIdRef.current) return
      setMessages(response.data)
      const chatResponse = await axios.get(`/api/chats/${id}`)
      if (requestId !== loadChatRequestIdRef.current) return
      setSummary(chatResponse.data.summary || '')
      setBranchInfo(chatResponse.data.branch_from_chat ? chatResponse.data : null)
    } catch (error) {
      console.error('加载消息失败:', error)
      setChatError('加载消息失败，请稍后重试')
    } finally {
      if (requestId === loadChatRequestIdRef.current) {
        setIsLoadingMessages(false)
      }
    }
  }

  const filteredMessages = searchTerm.trim()
    ? messages.filter(message => (message.content || '').toLowerCase().includes(searchTerm.toLowerCase()))
    : messages

  const childBranches = currentChat
    ? chats.filter(item => item.branch_from_chat_id === currentChat.id)
    : []

  const visibleChats = chatSearchTerm.trim()
    ? chatSearchResults.map(result => {
        const chat = chats.find(item => item.id === result.chat_id)
        if (!chat) {
          return null
        }
        return {
          ...chat,
          search_preview: result.preview || '',
          search_match_count: result.match_count || 0
        }
      }).filter(Boolean)
    : [...chats].sort((a, b) => {
        if ((a.favorite ? 1 : 0) !== (b.favorite ? 1 : 0)) {
          return (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0)
        }
        return (b.updated_at || '').localeCompare(a.updated_at || '')
      })

  useEffect(() => {
    if (!currentChat?.id) {
      return
    }

    const latest = chats.find(chat => chat.id === currentChat.id)
    if (!latest) {
      setCurrentChat(null)
      setMessages([])
      setSummary('')
      setBranchInfo(null)
      setChatLorebooks([])
      return
    }

    if (
      latest.title !== currentChat.title ||
      latest.favorite !== currentChat.favorite ||
      latest.updated_at !== currentChat.updated_at
    ) {
      setCurrentChat(prev => prev ? { ...prev, ...latest } : latest)
    }
  }, [chats, currentChat])

  // 创建新聊天
  const createNewChat = async () => {
    try {
      const response = await axios.post('/api/chats', {
        character_id: characterId,
        title: `对话 ${chats.length + 1}`
      })
      
      const newChat = response.data
      setChats(prev => [newChat, ...prev])
      setCurrentChat(newChat)
      setChatError('')
      setSummary('')
      setBranchInfo(null)
      setChatLorebooks([])
      setSearchTerm('')
      navigate(`/chat/${characterId}/${newChat.id}`)
      setShowNewChat(false)

      let nextMessages = []

      const greetings = Array.isArray(character?.alternate_greetings) ? character.alternate_greetings : []
      const openingMessage = greetings.length > 0
        ? greetings[Math.floor(Math.random() * greetings.length)]
        : character?.first_mes

      if (openingMessage) {
        const firstMessageResponse = await axios.post(`/api/chats/${newChat.id}/messages`, {
          role: 'assistant',
          content: openingMessage
        })
        nextMessages = [firstMessageResponse.data]
      }

      setMessages(nextMessages)
      loadLorebooks(newChat.id)
      loadLorebookDebug(newChat.id)
    } catch (error) {
      alert('创建聊天失败: ' + error.message)
    }
  }

  const handleSummarize = async () => {
    if (!currentChat) return

    setIsSummarizing(true)
    try {
      const response = await axios.post(`/api/chats/${currentChat.id}/summarize`, {
        summary
      })
      setSummary(response.data.summary || '')
      await loadChats()
    } catch (error) {
      setChatError('生成摘要失败: ' + (error.response?.data?.error || error.message))
    } finally {
      setIsSummarizing(false)
    }
  }

  const handleStartEdit = (message) => {
    setEditingMessageId(message.id)
    setEditingContent(message.content)
  }

  const handleSaveEdit = async () => {
    if (!editingMessageId) return

    try {
      const response = await axios.put(`/api/messages/${editingMessageId}`, {
        content: editingContent
      })
      setMessages(prev => prev.map(item => item.id === editingMessageId ? response.data : item))
      setEditingMessageId('')
      setEditingContent('')
      await loadChats()
    } catch (error) {
      setChatError('保存消息失败: ' + (error.response?.data?.error || error.message))
    }
  }

  const handleRegenerate = async () => {
    if (!currentChat || isGenerating) return

    setIsGenerating(true)
    setChatError('')
    const previousAssistantMessage = [...messages].reverse().find(item => item.role === 'assistant') || null
    let regenerateAssistantId = ''
    try {
      const response = await fetch(`/api/chats/${currentChat.id}/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...settings,
          regenerate: true,
          presetId: activePresetId || undefined
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || '重新生成失败')
      }

      if (!response.body) {
        throw new Error('服务端未返回可读取的数据流')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let aiMessage = ''
      const aiMessageId = (Date.now() + 1).toString()
      regenerateAssistantId = aiMessageId

      setMessages(prev => [...prev, { id: aiMessageId, role: 'assistant', content: '' }])

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n').filter(line => line.trim())

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6)
          if (data === '[DONE]') continue

          try {
            const parsed = JSON.parse(data)
            if (parsed.content) {
              aiMessage += parsed.content
              setMessages(prev => prev.map(item => item.id === aiMessageId ? { ...item, content: aiMessage } : item))
            }
          } catch (error) {
          }
        }
      }
      await loadChat(currentChat.id)
      await loadLorebookDebug(currentChat.id)
      await loadChats()
    } catch (error) {
      if (regenerateAssistantId) {
        setMessages(prev => prev.filter(item => item.id !== regenerateAssistantId))
      }
      if (previousAssistantMessage) {
        await loadChat(currentChat.id)
      }
      setChatError(error.message || '重新生成失败')
    } finally {
      setIsGenerating(false)
    }
  }

  // 发送消息
  const sendMessage = async () => {
    if (!input.trim() || isGenerating) return
    
    if (!currentChat) {
      setShowNewChat(true)
      return
    }

    const userMessage = input.trim()
    setInput('')
    setChatError('')
    
    // 添加用户消息到界面
    const tempId = Date.now().toString()
    setMessages(prev => [...prev, {
      id: tempId,
      role: 'user',
      content: userMessage
    }])

    // 保存用户消息到服务器
    let savedUserMessage = null
    try {
      const response = await axios.post(`/api/chats/${currentChat.id}/messages`, {
        role: 'user',
        content: userMessage
      })
      savedUserMessage = response.data
      setMessages(prev => prev.map(item => item.id === tempId ? savedUserMessage : item))
      await loadChats()
    } catch (error) {
      console.error('保存消息失败:', error)
      setMessages(prev => prev.filter(item => item.id !== tempId))
      setInput(userMessage)
      setChatError('保存消息失败: ' + (error.response?.data?.error || error.message))
      return
    }

    // 生成 AI 回复
    setIsGenerating(true)
    let aiMessageId = ''
    
    try {
      const response = await fetch(`/api/chats/${currentChat.id}/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...settings,
          presetId: activePresetId || undefined
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || '生成请求失败')
      }

      if (!response.body) {
        throw new Error('服务端未返回可读取的数据流')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let aiMessage = ''
      aiMessageId = (Date.now() + 1).toString()

      setMessages(prev => [...prev, {
        id: aiMessageId,
        role: 'assistant',
        content: ''
      }])

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n').filter(line => line.trim())

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') continue

            try {
              const parsed = JSON.parse(data)
              if (parsed.content) {
                aiMessage += parsed.content
                setMessages(prev => prev.map(m =>
                  m.id === aiMessageId ? { ...m, content: aiMessage } : m
                ))
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      }

      // 滚动到底部
      scrollToBottom()
      await loadChat(currentChat.id)
      await loadLorebookDebug(currentChat.id)
      await loadChats()
    } catch (error) {
      console.error('生成失败:', error)
      if (aiMessageId) {
        setMessages(prev => prev.filter(item => item.id !== aiMessageId))
      }
      await loadChat(currentChat.id)
      setChatError(error.message || '生成回复失败')
    } finally {
      setIsGenerating(false)
    }
  }

  // 删除聊天
  const deleteChat = async (id) => {
    if (!confirm('确定要删除这个对话吗？')) return
    if (isDeletingChat) return

    try {
      setIsDeletingChat(true)
      await axios.delete(`/api/chats/${id}`)
      setChats(prev => prev.filter(c => c.id !== id))
      if (currentChat?.id === id) {
        setCurrentChat(null)
        setMessages([])
        setSummary('')
        setBranchInfo(null)
        setChatLorebooks([])
        setShowLorebookDebug(false)
        setLorebookDebug({ triggered: [], triggeredCount: 0, candidateCount: 0, contextPreview: '' })
        setSearchTerm('')
        setChatSearchTerm('')
        navigate(`/chat/${characterId}`)
      }
    } catch (error) {
      alert('删除失败: ' + error.message)
    } finally {
      setIsDeletingChat(false)
    }
  }

  // 滚动到底部
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // 处理 Enter 键
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  if (!character) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-tavern-500">加载中...</div>
      </div>
    )
  }

  return (
    <div className="h-full flex">
      {/* 左侧聊天列表 */}
      <div className="w-72 wood-panel border-r border-amber-900/20 flex flex-col text-amber-50/90 tavern-glow">
        <div className="p-4 border-b border-amber-100/10 relative overflow-hidden">
          <div className="pointer-events-none absolute -top-10 right-4 h-24 w-24 rounded-full bg-amber-300/10 blur-2xl" />
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-amber-100/80 hover:text-amber-50 mb-3"
          >
            <ArrowLeft className="w-4 h-4" />
            返回
          </button>
          <div className="font-bold text-xl text-amber-50">{character.name}</div>
          <div className="text-xs text-amber-200/60 mt-1">炉边对话簿</div>
          <div className="mt-3 inline-flex rounded-full border border-amber-100/10 bg-white/8 px-3 py-1 text-[11px] text-amber-100/70">
            今夜故事正在木屋里酝酿
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          <div className="relative px-1 pb-2">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-200/55" />
            <input
              value={chatSearchTerm}
              onChange={(e) => setChatSearchTerm(e.target.value)}
              placeholder="搜索这个角色的全部对话..."
              className="input-field pl-10 bg-white/10 text-amber-50 border-amber-100/10 placeholder:text-amber-200/45"
            />
          </div>

          <button
            onClick={() => setShowNewChat(true)}
            className="w-full flex items-center gap-2 px-3 py-3 rounded-xl bg-white/10 hover:bg-white/15 text-amber-50 text-sm border border-amber-100/10"
          >
            <Plus className="w-4 h-4" />
            新建对话
          </button>

          {visibleChats.map(chat => (
            <div
              key={chat.id}
              onClick={() => {
                setShowNewChat(false)
                setCurrentChat(chat)
                loadChat(chat.id)
                navigate(`/chat/${characterId}/${chat.id}`)
              }}
              className={`group flex items-center justify-between px-3 py-2 rounded-xl cursor-pointer text-sm border ${
                currentChat?.id === chat.id
                  ? 'bg-gradient-to-r from-ember-700/80 to-tavern-700/80 text-white border-amber-100/10 shadow-lg shadow-amber-950/15'
                  : 'hover:bg-white/10 text-amber-50/90 border-transparent hover:border-amber-100/10'
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="truncate flex items-center gap-2">
                  <span className="truncate">{chat.title}</span>
                  {chat.favorite && <Star className="w-3.5 h-3.5 fill-amber-300 text-amber-200 shrink-0" />}
                </div>
                {(chat.branch_from_chat_id || chat.summary) && (
                  <div className={`text-[10px] mt-1 flex items-center gap-2 ${currentChat?.id === chat.id ? 'text-tavern-200' : 'text-tavern-500'}`}>
                    {chat.branch_from_chat_id ? <GitBranch className="w-3 h-3" /> : null}
                    <span>{chat.branch_from_chat_id ? '分支对话' : '已摘要'}</span>
                  </div>
                )}
                {chatSearchTerm.trim() && chat.search_match_count > 0 && (
                  <div className={`text-[10px] mt-1 ${currentChat?.id === chat.id ? 'text-amber-100/90' : 'text-amber-200/80'}`}>
                    命中 {chat.search_match_count} 处 · {chat.search_preview || '标题匹配'}
                  </div>
                )}
              </div>
              <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleChatFavorite(chat)
                  }}
                  className="p-1 hover:text-amber-300"
                >
                  <Star className={`w-3 h-3 ${chat.favorite ? 'fill-amber-300 text-amber-200' : ''}`} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    deleteChat(chat.id)
                  }}
                  disabled={isDeletingChat}
                  className="p-1 hover:text-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}

          {chatSearchTerm.trim() && chatSearchResults.length === 0 && (
            <div className="px-3 py-3 text-xs text-amber-200/55">没有找到匹配的对话</div>
          )}
        </div>
      </div>

      {/* 右侧聊天区域 */}
      <div className="flex-1 flex flex-col bg-transparent relative">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_8%,rgba(255,214,140,0.10),transparent_26%),radial-gradient(circle_at_84%_6%,rgba(120,158,96,0.08),transparent_22%)]" />
        {/* 头部 */}
        <div className="min-h-24 border-b border-amber-100/45 flex items-center justify-between gap-4 px-6 py-4 bg-[linear-gradient(180deg,rgba(255,248,236,0.95),rgba(244,231,205,0.90))] backdrop-blur-sm shadow-[0_12px_32px_rgba(70,45,24,0.08)] relative overflow-hidden">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-full bg-[radial-gradient(circle_at_center_top,rgba(255,206,120,0.18),transparent_42%)]" />
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-[18px] bg-gradient-to-br from-amber-200 via-tavern-300 to-moss-300 flex items-center justify-center text-tavern-800 font-bold shadow-md overflow-hidden">
              {character.avatar ? (
                <img src={character.avatar} alt={character.name} className="w-full h-full object-cover" />
              ) : (
                character.name.charAt(0)
              )}
            </div>
            <div className="rounded-[20px] border border-amber-100/60 bg-[linear-gradient(180deg,rgba(255,250,242,0.78),rgba(244,230,204,0.72))] px-4 py-2 shadow-sm">
              <div className="text-[10px] uppercase tracking-[0.25em] text-amber-700/60 mb-1">Tavern Table</div>
              <div className="font-bold text-tavern-900">{character.name}</div>
              <div className="text-xs text-tavern-500">
                {currentChat ? currentChat.title : '选择一个对话或创建新对话'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            {currentChat && (
              <>
                <select
                  value={activePresetId}
                  onChange={(e) => setActivePresetId(e.target.value)}
                  className="input-field w-44 text-sm py-2 bg-white/80"
                >
                  <option value="">默认配置</option>
                  {presets.map(preset => (
                    <option key={preset.id} value={preset.id}>{preset.name}</option>
                  ))}
                </select>
                <button onClick={handleSummarize} disabled={isSummarizing} className="btn-secondary flex items-center gap-2 text-sm">
                  <BookOpen className="w-4 h-4" />
                  {isSummarizing ? '整理中...' : '生成摘要'}
                </button>
                <button onClick={exportChat} className="btn-secondary flex items-center gap-2 text-sm">
                  <Download className="w-4 h-4" />
                  导出
                </button>
                <button onClick={() => setShowImportDialog(true)} className="btn-secondary flex items-center gap-2 text-sm">
                  <Upload className="w-4 h-4" />
                  导入
                </button>
                <button onClick={handleRegenerate} disabled={isGenerating || messages.length === 0} className="btn-secondary flex items-center gap-2 text-sm">
                  <RefreshCw className="w-4 h-4" />
                  重生成
                </button>
                <button
                  onClick={async () => {
                    const next = !showLorebookDebug
                    setShowLorebookDebug(next)
                    if (next && currentChat?.id) {
                      await loadLorebookDebug(currentChat.id)
                    }
                  }}
                  disabled={isLoadingLorebookDebug}
                  className="btn-secondary flex items-center gap-2 text-sm"
                >
                  <Bug className="w-4 h-4" />
                  {isLoadingLorebookDebug ? '分析中...' : '命中调试'}
                </button>
              </>
            )}
          </div>
        </div>

        {/* 消息列表 */}
        <div className="relative flex-1 overflow-y-auto p-6 space-y-4 bg-[radial-gradient(circle_at_top_right,rgba(255,205,120,0.12),transparent_22%),radial-gradient(circle_at_top_left,rgba(99,138,77,0.10),transparent_20%),linear-gradient(180deg,rgba(255,250,241,0.24),rgba(255,250,241,0.10))]">
          {currentChat && (
            <div className="rounded-2xl border border-tavern-200/80 bg-[linear-gradient(180deg,rgba(255,252,247,0.80),rgba(244,231,206,0.70))] px-4 py-3 shadow-[0_14px_30px_rgba(63,40,23,0.08)] backdrop-blur-sm">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-tavern-400" />
                <input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="搜索当前对话内容..."
                  className="input-field pl-9"
                />
              </div>
            </div>
          )}

          {currentChat && (branchInfo?.branch_from_chat || childBranches.length > 0) && (
            <div className="rounded-2xl border border-amber-200/70 bg-[linear-gradient(180deg,rgba(255,248,236,0.95),rgba(241,227,201,0.90))] px-4 py-4 text-sm text-tavern-800 shadow-[0_12px_28px_rgba(68,43,24,0.08)]">
              <div className="font-semibold text-tavern-900 mb-3 flex items-center gap-2">
                <GitBranch className="w-4 h-4" />
                分支关系
              </div>
              <div className="space-y-2">
                {branchInfo?.branch_from_chat && (
                  <button
                    onClick={() => navigate(`/chat/${characterId}/${branchInfo.branch_from_chat.id}`)}
                    className="w-full text-left rounded-xl border border-amber-100/70 bg-white/70 px-3 py-2 hover:bg-white"
                  >
                    <div className="text-xs text-tavern-500">上游对话</div>
                    <div className="font-medium text-tavern-900 truncate">{branchInfo.branch_from_chat.title}</div>
                  </button>
                )}
                {childBranches.map(chat => (
                  <button
                    key={chat.id}
                    onClick={() => navigate(`/chat/${characterId}/${chat.id}`)}
                    className="w-full text-left rounded-xl border border-amber-100/70 bg-white/70 px-3 py-2 hover:bg-white"
                  >
                    <div className="text-xs text-tavern-500">下游分支</div>
                    <div className="font-medium text-tavern-900 truncate">{chat.title}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {currentChat && summary && (
            <div className="rounded-2xl border border-amber-200/70 bg-[linear-gradient(180deg,rgba(255,248,232,0.96),rgba(247,233,201,0.92))] px-4 py-3 text-sm text-amber-900 shadow-[0_10px_22px_rgba(80,52,27,0.07)]">
              <div className="font-medium mb-1">对话摘要</div>
              <div className="whitespace-pre-wrap">{summary}</div>
            </div>
          )}

          {currentChat && branchInfo?.branch_from_chat && (
            <div className="rounded-2xl border border-tavern-200/70 bg-[linear-gradient(180deg,rgba(251,246,236,0.95),rgba(238,225,199,0.90))] px-4 py-3 text-sm text-tavern-800 shadow-[0_10px_22px_rgba(80,52,27,0.06)]">
              <div className="font-medium mb-1">分支来源</div>
              <div>
                来自对话「{branchInfo.branch_from_chat.title || '未命名对话'}」
                {branchInfo.branch_from_message?.content ? `，分支节点：${branchInfo.branch_from_message.content.slice(0, 80)}` : ''}
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-tavern-200/80 bg-[linear-gradient(180deg,rgba(255,249,240,0.95),rgba(242,228,202,0.88))] px-4 py-4 text-sm text-tavern-700 shadow-[0_16px_35px_rgba(66,41,22,0.08)]">
            <div className="font-semibold text-tavern-900 mb-3">角色资料</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-tavern-500 mb-1">简介</div>
                <div className="line-clamp-4">{character.description || '暂无角色简介'}</div>
              </div>
              <div>
                <div className="text-xs text-tavern-500 mb-1">性格</div>
                <div className="line-clamp-4">{character.personality || '暂无性格设定'}</div>
              </div>
              <div>
                <div className="text-xs text-tavern-500 mb-1">场景</div>
                <div className="line-clamp-4">{character.scenario || '暂无场景设定'}</div>
              </div>
              <div>
                <div className="text-xs text-tavern-500 mb-1">标签 / 作者</div>
                <div>
                  {Array.isArray(character.tags) && character.tags.length > 0 ? character.tags.join(' / ') : '无标签'}
                  {character.creator ? ` · ${character.creator}` : ''}
                </div>
              </div>
            </div>
          </div>

          {currentChat && chatLorebooks.length > 0 && (
            <div className="rounded-2xl border border-moss-200/70 bg-[linear-gradient(180deg,rgba(241,247,235,0.95),rgba(227,238,217,0.92))] px-4 py-3 text-sm text-moss-900 shadow-[0_14px_30px_rgba(53,78,36,0.08)]">
              <div className="font-medium mb-2">当前可用世界书</div>
              <div className="flex flex-wrap gap-2">
                {chatLorebooks.map(entry => (
                  <span key={entry.id} className="rounded-full bg-white/90 px-3 py-1 text-xs border border-moss-200/80 text-moss-800">
                    {entry.title}
                  </span>
                ))}
              </div>
            </div>
          )}

          {currentChat && showLorebookDebug && (
            <div className="rounded-2xl border border-tavern-200/80 bg-[linear-gradient(180deg,rgba(250,248,241,0.95),rgba(236,226,203,0.92))] px-4 py-4 text-sm text-tavern-800 shadow-[0_14px_28px_rgba(64,41,23,0.08)]">
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="font-semibold text-tavern-900 flex items-center gap-2">
                  <Bug className="w-4 h-4" />
                  世界书命中调试
                </div>
                <button
                  onClick={() => loadLorebookDebug(currentChat.id)}
                  disabled={isLoadingLorebookDebug}
                  className="btn-secondary text-xs"
                >
                  刷新
                </button>
              </div>

              <div className="text-xs text-tavern-600 mb-3">
                可参与匹配 {lorebookDebug.candidateCount} 条 · 实际命中 {lorebookDebug.triggeredCount} 条
              </div>

              {isLoadingLorebookDebug ? (
                <div className="text-xs text-tavern-500">正在分析上下文命中情况...</div>
              ) : lorebookDebug.triggered.length === 0 ? (
                <div className="text-xs text-tavern-500">当前上下文没有命中世界书。</div>
              ) : (
                <div className="space-y-2 mb-3">
                  {lorebookDebug.triggered.map(entry => (
                    <div key={entry.id} className="rounded-xl border border-amber-100/80 bg-white/70 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium text-tavern-900 truncate">{entry.title}</div>
                        <div className="text-[10px] rounded-full px-2 py-0.5 bg-amber-100 text-amber-700 border border-amber-200">
                          {entry.scope === 'chat' ? '对话级' : entry.scope === 'character' ? '角色级' : '全局'}
                        </div>
                      </div>
                      {Array.isArray(entry.matched_keywords) && entry.matched_keywords.length > 0 && (
                        <div className="mt-1 text-[11px] text-moss-700">命中关键词：{entry.matched_keywords.join(' / ')}</div>
                      )}
                      <div className="mt-1 text-xs text-tavern-600 line-clamp-2">{entry.content_preview || '无内容预览'}</div>
                    </div>
                  ))}
                </div>
              )}

              {lorebookDebug.contextPreview && (
                <div className="rounded-xl border border-tavern-200/80 bg-white/60 px-3 py-2">
                  <div className="text-[11px] text-tavern-500 mb-1">上下文预览（最近消息）</div>
                  <div className="text-xs text-tavern-700 whitespace-pre-wrap max-h-28 overflow-y-auto">{lorebookDebug.contextPreview}</div>
                </div>
              )}
            </div>
          )}

          {chatError && (
            <div className="rounded-2xl border border-red-200 bg-[linear-gradient(180deg,rgba(255,244,244,0.95),rgba(255,235,235,0.92))] px-4 py-3 text-sm text-red-700 shadow-[0_8px_20px_rgba(120,45,45,0.08)]">
              {chatError}
            </div>
          )}

          {!currentChat && !showNewChat && (
            <div className="h-full flex flex-col items-center justify-center text-tavern-500 rounded-[30px] border border-amber-100/40 bg-[linear-gradient(180deg,rgba(255,248,236,0.82),rgba(243,228,200,0.75))] shadow-[0_24px_60px_rgba(64,41,23,0.10)]">
              <div className="text-6xl mb-4">🔥🍺</div>
              <p className="mb-2 text-lg font-semibold text-tavern-800">炉火已经点亮</p>
              <p className="mb-4 text-sm max-w-md text-center text-tavern-600">挑选一段对话，或者开始新的故事，让这间木屋酒馆今晚再次热闹起来。</p>
              <button
                onClick={() => setShowNewChat(true)}
                className="btn-primary"
              >
                开始新对话
              </button>
            </div>
          )}

          {showNewChat && (
            <div className="h-full flex flex-col items-center justify-center text-tavern-500 rounded-[30px] border border-amber-100/40 bg-[linear-gradient(180deg,rgba(255,248,236,0.82),rgba(243,228,200,0.75))] shadow-[0_24px_60px_rgba(64,41,23,0.10)]">
              <div className="text-6xl mb-4">🕯️🎭</div>
              <p className="mb-2 text-lg font-semibold text-tavern-800">开始与 {character.name} 的新对话</p>
              <p className="mb-4 text-sm max-w-md text-center text-tavern-600">把椅子拉近炉火，等角色先开口，或者由你先把今晚的故事说出来。</p>
              <button
                onClick={createNewChat}
                className="btn-primary"
              >
                确认开始
              </button>
            </div>
          )}

          {currentChat && messages.length === 0 && !character.first_mes && (
            <div className="text-center text-tavern-500 py-8">
              发送第一条消息开始对话
            </div>
          )}

          {currentChat && isLoadingMessages && (
            <div className="text-center text-tavern-500 py-8">
              正在加载消息...
            </div>
          )}

          {filteredMessages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`message-bubble ${message.role === 'user' ? 'message-user' : 'message-assistant'}`}>
                {editingMessageId === message.id ? (
                  <div className="space-y-2">
                    <textarea
                      value={editingContent}
                      onChange={(e) => setEditingContent(e.target.value)}
                      rows={4}
                      className="input-field text-tavern-900"
                    />
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setEditingMessageId('')} className="btn-secondary text-sm">取消</button>
                      <button onClick={handleSaveEdit} className="btn-primary text-sm flex items-center gap-2">
                        <Save className="w-4 h-4" />
                        保存
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div
                      className="prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{
                        __html: marked(message.content, { breaks: true })
                      }}
                    />
                    {message.role === 'user' && (
                      <div className="mt-2 flex justify-end gap-3">
                        <button onClick={() => handleStartEdit(message)} className="text-xs opacity-80 hover:opacity-100 flex items-center gap-1">
                          <Pencil className="w-3 h-3" />
                          编辑
                        </button>
                        <button onClick={() => handleBranchChat(message)} className="text-xs opacity-80 hover:opacity-100 flex items-center gap-1">
                          <Plus className="w-3 h-3" />
                          分支
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}

          {isGenerating && (
            <div className="flex justify-start">
              <div className="message-bubble message-assistant">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-tavern-400 rounded-full animate-bounce" />
                  <div className="w-2 h-2 bg-tavern-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                  <div className="w-2 h-2 bg-tavern-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* 输入框 */}
        {currentChat && (
          <div className="border-t border-amber-100/45 p-4 bg-[linear-gradient(180deg,rgba(255,247,234,0.93),rgba(243,228,200,0.90))] backdrop-blur-sm">
            <div className="flex gap-2 max-w-4xl mx-auto rounded-2xl border border-amber-100/55 bg-white/40 p-2 shadow-[0_14px_28px_rgba(74,48,28,0.08)]">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="输入消息... (Enter 发送, Shift+Enter 换行)"
                rows={2}
                className="input-field flex-1 bg-white/82"
                disabled={isGenerating || isLoadingMessages}
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || isGenerating || isLoadingMessages}
                className="btn-primary px-4"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {showImportDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[radial-gradient(circle_at_center,rgba(68,42,23,0.36),rgba(20,12,8,0.74))]">
            <div className="w-full max-w-2xl rounded-[24px] border border-amber-100/60 bg-[linear-gradient(180deg,rgba(255,249,239,0.98),rgba(241,227,200,0.95))] p-6 shadow-[0_28px_70px_rgba(42,24,14,0.35)]">
              <div className="text-xl font-bold text-tavern-900 mb-2">导入对话</div>
              <div className="text-sm text-tavern-600 mb-4">粘贴之前导出的 JSON 对话数据，将其导入到当前角色下。</div>
              <textarea
                value={importPayload}
                onChange={(e) => setImportPayload(e.target.value)}
                className="input-field h-64 font-mono text-sm"
                placeholder="粘贴导出的对话 JSON..."
              />
              {importError && (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {importError}
                </div>
              )}
              <div className="flex justify-end gap-2 mt-4">
                <button
                  onClick={() => {
                    if (isImporting) return
                    setShowImportDialog(false)
                    setImportError('')
                  }}
                  disabled={isImporting}
                  className="btn-secondary"
                >
                  取消
                </button>
                <button onClick={importChat} disabled={!importPayload.trim() || isImporting} className="btn-primary">
                  {isImporting ? '导入中...' : '导入'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default Chat
