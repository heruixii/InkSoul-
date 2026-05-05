import React, { Suspense, lazy, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { DataProvider } from './contexts/DataContext'
import Sidebar from './components/Sidebar'
import { useSettings } from './hooks/useSettings'
import { useCharacters } from './hooks/useCharacters'

// 懒加载页面组件
const CharacterList = lazy(() => import('./components/CharacterList'))
const CharacterEdit = lazy(() => import('./components/CharacterEdit'))
const Chat = lazy(() => import('./components/Chat'))
const Settings = lazy(() => import('./components/Settings'))
const LorebookManager = lazy(() => import('./components/LorebookManager'))
const StoryManager = lazy(() => import('./components/StoryManager'))
const StoryPlay = lazy(() => import('./components/StoryPlay'))
const StoryTester = lazy(() => import('./components/StoryTester'))

const WATERMARK_TEXT = '本软件由我在家2up主制作'
const WATERMARK_POSITIONS = [
  [6, 8], [28, 12], [52, 7], [76, 10],
  [12, 34], [36, 30], [60, 33], [82, 29],
  [8, 58], [32, 54], [56, 59], [80, 55],
  [14, 82], [38, 78], [62, 83], [86, 79]
]

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="flex gap-2">
        <div className="w-2.5 h-2.5 bg-amber-400 rounded-full animate-bounce" />
        <div className="w-2.5 h-2.5 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
        <div className="w-2.5 h-2.5 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
      </div>
    </div>
  )
}

function AppContent() {
  const { settings } = useSettings()
  const { characters, loading: charactersLoading, refresh: refreshCharacters } = useCharacters()
  const [selectedCharacter, setSelectedCharacter] = useState(null)

  return (
    <BrowserRouter>
      <div className="relative h-screen overflow-hidden bg-transparent p-3 md:p-4 lg:p-5">
        {/* 落地灯暖光晕 - 左上角 */}
        <div className="lamp-glow" style={{ left: '-60px', top: '-40px' }} />
        {/* 壁炉余光 - 右下角 */}
        <div className="lamp-glow" style={{ right: '-80px', bottom: '-60px', width: '360px', height: '360px', background: 'radial-gradient(ellipse at center, rgba(220, 130, 60, 0.18) 0%, rgba(180, 90, 40, 0.10) 35%, transparent 70%)' }} />
        {/* 书架暗影 - 顶部 */}
        <div className="bookshelf-silhouette" style={{ left: '20%', top: '0', width: '60%', height: '38px' }} />

        <div className="global-watermark pointer-events-none absolute inset-0 z-[4]" aria-hidden="true">
          {WATERMARK_POSITIONS.map(([left, top], index) => (
            <span key={`${left}-${top}-${index}`} style={{ left: `${left}%`, top: `${top}%` }}>
              {WATERMARK_TEXT}
            </span>
          ))}
        </div>

        <div className="app-shell flex h-full">
          {/* 木板纹理过渡光层 */}
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(232,168,92,0.04),transparent_20%,transparent_80%,rgba(0,0,0,0.20))]" />
          {/* 摊开的书 SVG - 右下角桌面装饰 */}
          <svg className="pointer-events-none absolute z-[2] opacity-[0.13]" style={{ right: '24px', bottom: '20px', width: '110px', height: '70px' }} viewBox="0 0 110 70" fill="none">
            <path d="M5 12 L52 8 L55 60 L8 64 Z" fill="#3a2010" stroke="#6b3d22" strokeWidth="1"/>
            <path d="M105 12 L58 8 L55 60 L102 64 Z" fill="#3a2010" stroke="#6b3d22" strokeWidth="1"/>
            <path d="M55 8 L55 60" stroke="#1a0e07" strokeWidth="1.5"/>
            <path d="M14 22 L48 19 M14 30 L48 27 M14 38 L48 35" stroke="#8a5a2e" strokeWidth="0.6"/>
            <path d="M62 19 L96 22 M62 27 L96 30 M62 35 L96 38" stroke="#8a5a2e" strokeWidth="0.6"/>
          </svg>
          <Sidebar
            characters={characters}
            selectedCharacter={selectedCharacter}
            onSelectCharacter={setSelectedCharacter}
            onCharactersChange={refreshCharacters}
          />
          <main className="relative flex-1 overflow-hidden page-fade-in">
            <Suspense fallback={<LoadingFallback />}>
              <Routes>
                <Route path="/" element={
                  <CharacterList
                    characters={characters}
                    onCharactersChange={refreshCharacters}
                    onSelectCharacter={setSelectedCharacter}
                  />
                } />
                <Route path="/character/new" element={
                  <CharacterEdit onSave={refreshCharacters} />
                } />
                <Route path="/character/edit/:id" element={
                  <CharacterEdit onSave={refreshCharacters} />
                } />
                <Route path="/chat/:characterId" element={
                  <Chat settings={settings} characters={characters} />
                } />
                <Route path="/chat/:characterId/:chatId" element={
                  <Chat settings={settings} characters={characters} />
                } />
                <Route path="/settings" element={
                  <Settings />
                } />
                <Route path="/lorebooks" element={
                  <LorebookManager characters={characters} />
                } />
                <Route path="/stories" element={<StoryManager />} />
                <Route path="/story/play/:storyId" element={<StoryPlay />} />
                <Route path="/story-tester" element={<StoryTester />} />
                <Route path="*" element={<Navigate to="/" />} />
              </Routes>
            </Suspense>
          </main>
        </div>
      </div>
    </BrowserRouter>
  )
}

function App() {
  return (
    <DataProvider>
      <AppContent />
    </DataProvider>
  )
}

export default App
