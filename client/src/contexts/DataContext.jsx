import React, { createContext, useContext, useMemo } from 'react'
import { useCharacters } from '../hooks/useCharacters'
import { useLorebooks } from '../hooks/useLorebooks'

const DataContext = createContext(null)

export function DataProvider({ children }) {
  const { characters, loading: charactersLoading, refresh: refreshCharacters, load: loadCharacters } = useCharacters()
  const { lorebooks, loading: lorebooksLoading, refresh: refreshLorebooks, load: loadLorebooks } = useLorebooks()

  const invalidateCache = () => {
    localStorage.removeItem('inksoul_characters_v1')
    localStorage.removeItem('inksoul_lorebooks')
  }

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
  }), [characters, lorebooks, charactersLoading, lorebooksLoading, loadCharacters, loadLorebooks, refreshCharacters, refreshLorebooks])

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
