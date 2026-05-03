import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import axios from 'axios'

const DataContext = createContext(null)

const CACHE_VERSION = 'v1'
const CHARACTERS_CACHE_KEY = `tavern_characters_${CACHE_VERSION}`
const LOREBOOKS_CACHE_KEY = `tavern_lorebooks_${CACHE_VERSION}`
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

const isCacheValid = (timestamp) => {
  if (!timestamp) return false
  return Date.now() - timestamp < CACHE_DURATION
}

export function DataProvider({ children }) {
  const [characters, setCharacters] = useState([])
  const [lorebooks, setLorebooks] = useState([])
  const [charactersLoading, setCharactersLoading] = useState(true)
  const [lorebooksLoading, setLorebooksLoading] = useState(true)

  const loadCharacters = useCallback(async (forceRefresh = false) => {
    try {
      // Try cache first
      if (!forceRefresh) {
        const cached = localStorage.getItem(CHARACTERS_CACHE_KEY)
        if (cached) {
          try {
            const { data, timestamp } = JSON.parse(cached)
            if (isCacheValid(timestamp)) {
              setCharacters(data)
              setCharactersLoading(false)
              // Background refresh
              refreshCharacters()
              return
            }
          } catch (e) {
            console.warn('Cache parse error:', e)
          }
        }
      }

      // Fetch from API
      const response = await axios.get('/api/characters')
      setCharacters(response.data)
      localStorage.setItem(CHARACTERS_CACHE_KEY, JSON.stringify({
        data: response.data,
        timestamp: Date.now()
      }))
    } catch (error) {
      console.error('加载角色失败:', error)
      // Try to use stale cache on error
      const cached = localStorage.getItem(CHARACTERS_CACHE_KEY)
      if (cached) {
        try {
          const { data } = JSON.parse(cached)
          setCharacters(data)
        } catch (e) {}
      }
    } finally {
      setCharactersLoading(false)
    }
  }, [])

  const refreshCharacters = useCallback(async () => {
    try {
      const response = await axios.get('/api/characters')
      setCharacters(response.data)
      localStorage.setItem(CHARACTERS_CACHE_KEY, JSON.stringify({
        data: response.data,
        timestamp: Date.now()
      }))
    } catch (error) {
      console.error('刷新角色失败:', error)
    }
  }, [])

  const loadLorebooks = useCallback(async (forceRefresh = false) => {
    try {
      // Try cache first
      if (!forceRefresh) {
        const cached = localStorage.getItem(LOREBOOKS_CACHE_KEY)
        if (cached) {
          try {
            const { data, timestamp } = JSON.parse(cached)
            if (isCacheValid(timestamp)) {
              setLorebooks(data)
              setLorebooksLoading(false)
              // Background refresh
              refreshLorebooks()
              return
            }
          } catch (e) {
            console.warn('Cache parse error:', e)
          }
        }
      }

      // Fetch from API
      const response = await axios.get('/api/lorebooks')
      setLorebooks(response.data)
      localStorage.setItem(LOREBOOKS_CACHE_KEY, JSON.stringify({
        data: response.data,
        timestamp: Date.now()
      }))
    } catch (error) {
      console.error('加载世界书失败:', error)
      // Try to use stale cache on error
      const cached = localStorage.getItem(LOREBOOKS_CACHE_KEY)
      if (cached) {
        try {
          const { data } = JSON.parse(cached)
          setLorebooks(data)
        } catch (e) {}
      }
    } finally {
      setLorebooksLoading(false)
    }
  }, [])

  const refreshLorebooks = useCallback(async () => {
    try {
      const response = await axios.get('/api/lorebooks')
      setLorebooks(response.data)
      localStorage.setItem(LOREBOOKS_CACHE_KEY, JSON.stringify({
        data: response.data,
        timestamp: Date.now()
      }))
    } catch (error) {
      console.error('刷新世界书失败:', error)
    }
  }, [])

  const invalidateCache = useCallback(() => {
    localStorage.removeItem(CHARACTERS_CACHE_KEY)
    localStorage.removeItem(LOREBOOKS_CACHE_KEY)
  }, [])

  useEffect(() => {
    Promise.all([loadCharacters(), loadLorebooks()])
  }, [loadCharacters, loadLorebooks])

  // 记忆化 context value，避免函数引用变化导致所有消费者 re-render
  const value = useMemo(() => ({
    characters,
    lorebooks,
    charactersLoading,
    lorebooksLoading,
    loadCharacters,
    loadLorebooks,
    refreshCharacters,
    refreshLorebooks,
    invalidateCache
  }), [characters, lorebooks, charactersLoading, lorebooksLoading, loadCharacters, loadLorebooks, refreshCharacters, refreshLorebooks, invalidateCache])

  return (
    <DataContext.Provider value={value}>
      {children}
    </DataContext.Provider>
  )
}

export function useData() {
  const context = useContext(DataContext)
  if (!context) {
    throw new Error('useData must be used within DataProvider')
  }
  return context
}
