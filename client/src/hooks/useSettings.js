import { useState, useEffect, useCallback } from 'react'
import api from '../utils/api'

const defaultSettings = {
  apiUrl: 'https://api.openai.com/v1/chat/completions',
  apiKey: '',
  model: 'gpt-3.5-turbo',
  maxTokens: 2000,
  temperature: 0.8,
  activePresetId: '',
  contextMode: 'balanced'
}

export function useSettings() {
  const [settings, setSettings] = useState(defaultSettings)
  const [loading, setLoading] = useState(true)

  const loadSettings = useCallback(async () => {
    try {
      const { data } = await api.get('/api/settings')
      if (data && typeof data === 'object') {
        setSettings(prev => ({ ...prev, ...data }))
      }
    } catch (error) {
      console.error('加载设置失败:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  const updateSettings = useCallback(async (newSettings) => {
    try {
      await api.post('/api/settings', newSettings)
      setSettings(prev => ({ ...prev, ...newSettings }))
    } catch (error) {
      console.error('更新设置失败:', error)
      throw error
    }
  }, [])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  return { settings, loading, updateSettings, loadSettings }
}
