// useSearch.js — Search handlers for find-in-page
import { useState, useCallback } from 'react'

/**
 * @param {Object} deps
 * @param {React.MutableRefObject} deps.webviewRefs
 * @param {React.MutableRefObject} deps.activeIdRef
 * @param {React.MutableRefObject} deps.searchInputRef
 */
export default function useSearch({ webviewRefs, activeIdRef, searchInputRef }) {
  const [searchVisible, setSearchVisible] = useState(false)
  const [searchText, setSearchText] = useState('')

  const handleSearch = useCallback((text) => {
    setSearchText(text)
    const wv = webviewRefs.current[activeIdRef.current]
    if (!wv) return
    text ? wv.findInPage(text, { findNext: false }) : wv.stopFindInPage('clearSelection')
  }, [])  

  const toggleSearch = useCallback(() => {
    setSearchVisible(prev => {
      if (prev) {
        setSearchText('')
        webviewRefs.current[activeIdRef.current]?.stopFindInPage('clearSelection')
        return false
      }
      setTimeout(() => searchInputRef.current?.focus(), 80)
      return true
    })
  }, [])  

  return { handleSearch, toggleSearch, searchText, searchVisible, setSearchText, setSearchVisible }
}
