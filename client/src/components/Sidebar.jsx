import React from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Users, Settings, Plus, Wine, BookOpen, GitBranch, TestTube } from 'lucide-react'

function Sidebar({ characters, selectedCharacter, onSelectCharacter, onCharactersChange }) {
  const location = useLocation()
  const navigate = useNavigate()

  const isActive = (path) => location.pathname === path

  return (
    <aside className="w-64 md:w-72 wood-panel text-tavern-100 flex flex-col border-r border-amber-900/20 tavern-glow">
      {/* Logo */}
      <div className="p-5 border-b border-amber-200/10 relative overflow-hidden">
        <div className="pointer-events-none absolute -top-12 -right-8 h-28 w-28 rounded-full bg-amber-300/12 blur-2xl" />
        <Link to="/" className="flex items-center gap-3 text-xl font-bold tracking-wide">
          <div className="w-11 h-11 rounded-2xl bg-[radial-gradient(circle_at_30%_30%,rgba(255,218,148,0.98),rgba(168,96,36,0.92))] flex items-center justify-center shadow-lg shadow-amber-950/30 ring-1 ring-amber-100/25">
            <Wine className="w-6 h-6 text-amber-50" />
          </div>
          <div>
            <div className="text-amber-50">InkSoul / 墨魂</div>
            <div className="text-[11px] font-normal text-amber-200/75">炉火、木屋与故事</div>
          </div>
        </Link>
      </div>

      {/* 导航菜单 */}
      <nav className="flex-1 p-4 space-y-2">
        <Link
          to="/"
          className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all border ${
            isActive('/') ? 'bg-gradient-to-r from-amber-700/85 to-tavern-700/85 text-white border-amber-100/20 shadow-lg shadow-amber-950/20' : 'border-transparent hover:bg-white/10 text-amber-50/90 hover:border-amber-100/10'
          }`}
        >
          <Users className="w-5 h-5" />
          <span>角色列表</span>
        </Link>

        <Link
          to="/settings"
          className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all border ${
            isActive('/settings') ? 'bg-gradient-to-r from-amber-700/85 to-tavern-700/85 text-white border-amber-100/20 shadow-lg shadow-amber-950/20' : 'border-transparent hover:bg-white/10 text-amber-50/90 hover:border-amber-100/10'
          }`}
        >
          <Settings className="w-5 h-5" />
          <span>设置</span>
        </Link>

        <Link
          to="/lorebooks"
          className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all border ${
            isActive('/lorebooks') ? 'bg-gradient-to-r from-moss-600/85 to-tavern-700/85 text-white border-amber-100/20 shadow-lg shadow-amber-950/20' : 'border-transparent hover:bg-white/10 text-amber-50/90 hover:border-amber-100/10'
          }`}
        >
          <BookOpen className="w-5 h-5" />
          <span>世界书</span>
        </Link>

        <Link
          to="/stories"
          className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all border ${
            isActive('/stories') ? 'bg-gradient-to-r from-tavern-600/85 to-moss-600/85 text-white border-amber-100/20 shadow-lg shadow-amber-950/20' : 'border-transparent hover:bg-white/10 text-amber-50/90 hover:border-amber-100/10'
          }`}
        >
          <GitBranch className="w-5 h-5" />
          <span>故事模式</span>
        </Link>

        <Link
          to="/story-tester"
          className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all border ${
            isActive('/story-tester') ? 'bg-gradient-to-r from-blue-600/85 to-indigo-600/85 text-white border-amber-100/20 shadow-lg shadow-amber-950/20' : 'border-transparent hover:bg-white/10 text-amber-50/90 hover:border-amber-100/10'
          }`}
        >
          <TestTube className="w-5 h-5" />
          <span>故事测试</span>
        </Link>
      </nav>

      {/* 角色快捷列表 */}
      <div className="p-4 border-t border-amber-200/10">
        <div className="text-xs uppercase tracking-[0.25em] text-amber-200/60 mb-3">最近角色</div>
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {characters.slice(0, 5).map(char => (
            <button
              key={char.id}
              onClick={() => {
                onSelectCharacter(char)
                navigate(`/chat/${char.id}`)
              }}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left text-sm transition-colors border ${
                selectedCharacter?.id === char.id
                  ? 'bg-white/14 border-amber-100/20 text-amber-50'
                  : 'border-transparent hover:bg-white/10 hover:border-amber-100/10'
              }`}
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-moss-500/90 to-tavern-700 flex items-center justify-center text-xs shadow-md ring-1 ring-amber-100/15">
                {char.name.charAt(0)}
              </div>
              <span className="truncate">{char.name}</span>
            </button>
          ))}
          {characters.length === 0 && (
            <div className="text-sm text-amber-200/45 px-2">暂无角色</div>
          )}
        </div>
      </div>

      {/* 新建角色按钮 */}
      <div className="p-4 border-t border-amber-200/10">
        <Link
          to="/character/new"
          className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl text-white transition-all bg-gradient-to-r from-ember-600 to-tavern-600 hover:from-ember-500 hover:to-tavern-500 shadow-lg shadow-amber-950/25 border border-amber-200/30"
        >
          <Plus className="w-5 h-5" />
          <span>新建角色</span>
        </Link>
      </div>
    </aside>
  )
}

export default Sidebar
