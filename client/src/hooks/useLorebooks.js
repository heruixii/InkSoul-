import { useState, useEffect, useCallback } from 'react'
import api from '../utils/api'

const CACHE_KEY = 'inksoul_lorebooks'
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

export function useLorebooks() {
  const [lorebooks, setLorebooks] = useState([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get('/api/lorebooks')
      setLorebooks(data)
      setCache(data)
    } catch (error) {
      console.error('加载世界书失败:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  const load = useCallback(async () => {
    const cached = getCache()
    if (cached) {
      setLorebooks(cached)
      setLoading(false)
      refresh()
      return
    }
    await refresh()
  }, [refresh])

  useEffect(() => {
    load()
  }, [load])

  return { lorebooks, loading, refresh }
}
