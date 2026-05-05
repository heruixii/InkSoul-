import { useState, useEffect, useCallback } from 'react'
import api from '../utils/api'

const CACHE_VERSION = 'v1'
const CACHE_KEY = `inksoul_characters_${CACHE_VERSION}`
const CACHE_DURATION = 5 * 60 * 1000

function getCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const { data, timestamp } = JSON.parse(raw)
    if (Date.now() - timestamp < CACHE_DURATION) return data
  } catch {
    localStorage.removeItem(CACHE_KEY)
  }
  return null
}

function setCache(data) {
  localStorage.setItem(CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }))
}

export function useCharacters() {
  const [characters, setCharacters] = useState([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get('/api/characters')
      setCharacters(data)
      setCache(data)
    } catch (error) {
      console.error('加载角色失败:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  const load = useCallback(async () => {
    const cached = getCache()
    if (cached) {
      setCharacters(cached)
      setLoading(false)
      // 后台刷新
      refresh()
      return
    }
    await refresh()
  }, [refresh])

  const invalidate = useCallback(() => {
    localStorage.removeItem(CACHE_KEY)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return { characters, loading, refresh, load, invalidate }
}
