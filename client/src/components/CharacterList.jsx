import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Upload, Edit, Trash2, MessageCircle, Search, Star } from 'lucide-react'
import axios from 'axios'

function CharacterList({ characters, onCharactersChange, onSelectCharacter }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [showImport, setShowImport] = useState(false)
  const [importData, setImportData] = useState('')
  const [busyCharacterId, setBusyCharacterId] = useState('')
  const [isImporting, setIsImporting] = useState(false)

  // 删除角色
  const handleDelete = async (id) => {
    if (!confirm('确定要删除这个角色吗？')) return
    if (busyCharacterId || isImporting) return
    
    try {
      setBusyCharacterId(id)
      await axios.delete(`/api/characters/${id}`)
      onCharactersChange()
    } catch (error) {
      alert('删除失败: ' + error.message)
    } finally {
      setBusyCharacterId('')
    }
  }

  // 导入角色
  const handleImport = async () => {
    if (isImporting) return
    try {
      setIsImporting(true)
      const data = JSON.parse(importData)
      await axios.post('/api/characters/import', data)
      setShowImport(false)
      setImportData('')
      onCharactersChange()
      alert('导入成功！')
    } catch (error) {
      alert('导入失败: ' + (error.response?.data?.error || error.message))
    } finally {
      setIsImporting(false)
    }
  }

  // 过滤角色
  const filteredCharacters = characters.filter(char =>
    (char.name || '').toLowerCase().includes(searchTerm.toLowerCase())
  ).sort((a, b) => {
    if ((a.favorite ? 1 : 0) !== (b.favorite ? 1 : 0)) {
      return (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0)
    }
    return (b.updated_at || '').localeCompare(a.updated_at || '')
  })

  const toggleFavorite = async (char) => {
    if (busyCharacterId || isImporting) return
    try {
      setBusyCharacterId(char.id)
      await axios.put(`/api/characters/${char.id}/favorite`, { favorite: !char.favorite })
      onCharactersChange()
    } catch (error) {
      alert('收藏失败: ' + (error.response?.data?.error || error.message))
    } finally {
      setBusyCharacterId('')
    }
  }

  return (
    <div className="h-full overflow-auto p-6 relative">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_0%,rgba(255,205,122,0.12),transparent_24%),radial-gradient(circle_at_90%_2%,rgba(109,146,88,0.10),transparent_24%)]" />
      <div className="max-w-6xl mx-auto relative">
        <div className="grid grid-cols-1 xl:grid-cols-[1.35fr_0.85fr] gap-6 mb-6">
          <div className="rounded-[30px] border border-amber-100/40 bg-[linear-gradient(180deg,rgba(74,46,28,0.90),rgba(39,24,16,0.78)),radial-gradient(circle_at_top_left,rgba(255,196,110,0.18),transparent_32%)] px-7 py-7 text-amber-50 shadow-[0_28px_80px_rgba(45,27,16,0.28)] overflow-hidden relative">
            <div className="absolute right-[-30px] top-[-20px] w-44 h-44 rounded-full bg-amber-300/10 blur-3xl" />
            <div className="absolute inset-x-0 top-0 h-20 bg-[radial-gradient(circle_at_center,rgba(255,214,141,0.18),transparent_55%)]" />
            <div className="text-xs uppercase tracking-[0.34em] text-amber-200/65 mb-3">Welcome Home</div>
            <h1 className="text-4xl font-bold leading-tight">今晚的故事，
              <span className="block text-amber-200">在这间木屋酒馆里开始。</span>
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-amber-100/78">
              树木支起屋梁，暖炉驱散夜色。你可以在这里整理角色、翻阅设定、与他们在火光下交谈，像在真正安全的酒馆角落里慢慢讲完一段故事。
            </p>
            <div className="mt-6 flex flex-wrap gap-3 text-sm">
              <div className="rounded-2xl border border-amber-100/15 bg-white/8 px-4 py-3">🍺 暖火炉边</div>
              <div className="rounded-2xl border border-amber-100/15 bg-white/8 px-4 py-3">🌲 木屋与树影</div>
              <div className="rounded-2xl border border-amber-100/15 bg-white/8 px-4 py-3">📜 长篇角色扮演</div>
            </div>
          </div>

          <div className="card flex flex-col justify-between min-h-[220px] relative overflow-hidden">
            <div className="pointer-events-none absolute right-0 top-0 h-20 w-20 rounded-full bg-moss-200/20 blur-2xl" />
            <div>
              <div className="text-xs uppercase tracking-[0.28em] text-tavern-500 mb-3">Tonight's Room</div>
              <div className="space-y-3 text-sm text-tavern-700">
                <div className="flex items-center justify-between rounded-2xl bg-white/50 border border-tavern-200/70 px-4 py-3">
                  <span>酒馆旅人</span>
                  <strong className="text-xl text-tavern-900">{characters.length}</strong>
                </div>
                <div className="flex items-center justify-between rounded-2xl bg-white/50 border border-tavern-200/70 px-4 py-3">
                  <span>搜索结果</span>
                  <strong className="text-xl text-tavern-900">{filteredCharacters.length}</strong>
                </div>
                <div className="rounded-2xl bg-[linear-gradient(180deg,rgba(238,143,47,0.12),rgba(78,101,54,0.08))] border border-amber-200/60 px-4 py-4 text-tavern-800">
                  让常驻角色、世界书和预设一起构成一间真正能久待的酒馆。
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 标题栏 */}
        <div className="mb-6 rounded-[28px] border border-amber-100/40 bg-[linear-gradient(180deg,rgba(70,43,26,0.84),rgba(42,26,16,0.72)),radial-gradient(circle_at_top_left,rgba(255,198,114,0.18),transparent_30%)] px-6 py-6 text-amber-50 shadow-[0_24px_60px_rgba(51,31,18,0.22)]">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="text-xs uppercase tracking-[0.32em] text-amber-200/65 mb-2">Tavern Roster</div>
              <h1 className="text-3xl font-bold">炉边来客</h1>
              <p className="text-sm text-amber-100/75 mt-2">在木梁、树影与暖火之间，整理每一位会陪你讲故事的角色。</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setShowImport(true)}
                className="btn-secondary flex items-center gap-2 bg-white/12 text-amber-50 border-amber-100/20 hover:bg-white/18"
              >
                <Upload className="w-4 h-4" />
                导入角色
              </button>
              <Link
                to="/character/new"
                className="btn-primary flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                新建角色
              </Link>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-tavern-900">角色列表</h2>
          <div className="flex gap-2">
            <div className="text-sm text-tavern-600 bg-[linear-gradient(180deg,rgba(255,255,255,0.78),rgba(245,235,215,0.62))] border border-tavern-200/70 px-4 py-2 rounded-xl shadow-sm">
              共 {filteredCharacters.length} 位旅人
            </div>
          </div>
        </div>

        {/* 搜索框 */}
        <div className="mb-6 rounded-2xl border border-amber-100/55 bg-[linear-gradient(180deg,rgba(255,252,246,0.72),rgba(244,230,205,0.62))] p-3 shadow-[0_12px_26px_rgba(73,46,26,0.08)]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-tavern-400" />
            <input
              type="text"
              placeholder="搜索角色..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field pl-10 bg-white/82"
            />
          </div>
        </div>

        {/* 角色卡片网格 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCharacters.map(char => (
            <div key={char.id} className="card hover:-translate-y-1.5 hover:shadow-[0_28px_58px_rgba(67,41,21,0.20)] transition-all duration-300 overflow-hidden">
              {(() => {
                const isFileSource = char.source === 'file'
                const updatedAt = new Date(char.updated_at)
                const updatedLabel = Number.isNaN(updatedAt.getTime()) ? '未知时间' : updatedAt.toLocaleDateString()
                return (
                  <>
              <div className="-mx-4 -mt-4 px-4 py-4 mb-4 bg-[linear-gradient(135deg,rgba(106,67,37,0.15),rgba(122,147,86,0.10),rgba(255,214,150,0.18))] border-b border-amber-100/50">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-[18px] bg-gradient-to-br from-amber-200 via-tavern-300 to-moss-300 flex items-center justify-center text-tavern-800 text-xl font-bold shadow-md overflow-hidden">
                    {char.avatar ? (
                      <img src={char.avatar} alt={char.name} className="w-full h-full object-cover" />
                    ) : (
                      char.name.charAt(0)
                    )}
                  </div>
                  <div>
                    <h3 className="font-bold text-tavern-900 flex items-center gap-2">{char.name}{char.favorite && <Star className="w-4 h-4 fill-amber-400 text-amber-500" />}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-sm text-tavern-600">
                        {updatedLabel}
                      </p>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full border ${isFileSource ? 'bg-amber-100/80 text-amber-800 border-amber-300/70' : 'bg-moss-100/80 text-moss-700 border-moss-300/70'}`}>
                        {isFileSource ? '文件' : '数据库'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              </div>

              <p className="text-sm text-tavern-600 mb-4 line-clamp-2">
                {char.description || '暂无描述'}
              </p>

              {Array.isArray(char.tags) && char.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {char.tags.slice(0, 3).map(tag => (
                    <span key={tag} className="text-xs px-2.5 py-1 rounded-full bg-[linear-gradient(180deg,rgba(238,246,229,0.92),rgba(224,238,211,0.90))] text-moss-700 border border-moss-200/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]">
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex gap-2 pt-3 border-t border-amber-100/60">
                <Link
                  to={`/chat/${char.id}`}
                  onClick={() => onSelectCharacter(char)}
                  className="flex-1 btn-primary flex items-center justify-center gap-2 text-sm"
                >
                  <MessageCircle className="w-4 h-4" />
                  开始对话
                </Link>
                <Link
                  to={isFileSource ? '#' : `/character/edit/${char.id}`}
                  onClick={(e) => {
                    if (isFileSource) {
                      e.preventDefault()
                    }
                  }}
                  className={`btn-secondary p-2 ${isFileSource ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`}
                >
                  <Edit className="w-4 h-4" />
                </Link>
                <button
                  onClick={() => toggleFavorite(char)}
                  disabled={isFileSource || busyCharacterId === char.id || isImporting}
                  className={`btn-secondary p-2 ${char.favorite ? 'text-amber-600' : 'text-tavern-600'}`}
                >
                  <Star className={`w-4 h-4 ${char.favorite ? 'fill-amber-400 text-amber-500' : ''}`} />
                </button>
                <button
                  onClick={() => handleDelete(char.id)}
                  disabled={isFileSource || busyCharacterId === char.id || isImporting}
                  className="btn-secondary p-2 text-red-600 hover:text-red-700"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              {isFileSource && (
                <p className="mt-2 text-xs text-tavern-500">文件来源角色为只读，如需修改请编辑 `characters/*.json`。</p>
              )}
                  </>
                )
              })()}
            </div>
          ))}
        </div>
      </div>

      {/* 导入弹窗 */}
      {showImport && (
        <div className="fixed inset-0 bg-[radial-gradient(circle_at_center,rgba(68,42,23,0.36),rgba(20,12,8,0.74))] flex items-center justify-center z-50 p-4">
          <div className="bg-[linear-gradient(180deg,rgba(255,249,239,0.98),rgba(241,227,200,0.95))] rounded-[24px] p-6 w-full max-w-lg border border-amber-100/60 shadow-[0_28px_70px_rgba(42,24,14,0.35)]">
            <h2 className="text-xl font-bold mb-4 text-tavern-900">导入角色卡</h2>
            <p className="text-sm text-tavern-600 mb-4">
              粘贴 TavernAI 格式的 JSON 角色卡数据
            </p>
            <p className="text-xs text-tavern-500 mb-3">
              支持常见字段：`name`、`description`、`personality`、`scenario`、`first_mes`
            </p>
            <textarea
              value={importData}
              onChange={(e) => setImportData(e.target.value)}
              placeholder="粘贴 JSON 数据..."
              className="input-field h-48 font-mono text-sm"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => {
                  if (isImporting) return
                  setShowImport(false)
                }}
                disabled={isImporting}
                className="btn-secondary"
              >
                取消
              </button>
              <button
                onClick={handleImport}
                disabled={!importData.trim() || isImporting}
                className="btn-primary"
              >
                {isImporting ? '导入中...' : '导入'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default CharacterList
