'use client'

import { useState, useEffect } from 'react'
import { Language } from '../translations'
import { detectCountry, shouldUseDutch } from '../utils/countryDetection'

const LANGUAGE_STORAGE_KEY = 'boomerang-sidekick-language'

export function useLanguage(): Language {
  const [language, setLanguage] = useState<Language>(() => {
    // Check stored language immediately on mount
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY) as Language | null
      if (stored === 'en' || stored === 'nl') {
        return stored
      }
    }
    return 'en'
  })

  useEffect(() => {
    // If language is already stored, skip detection
    const storedLanguage = localStorage.getItem(LANGUAGE_STORAGE_KEY) as Language | null
    if (storedLanguage === 'en' || storedLanguage === 'nl') {
      return // Already set from initial state
    }

    // Detect country and set language
    detectCountry()
      .then((countryCode) => {
        const detectedLanguage: Language = shouldUseDutch(countryCode) ? 'nl' : 'en'
        setLanguage(detectedLanguage)
        localStorage.setItem(LANGUAGE_STORAGE_KEY, detectedLanguage)
      })
      .catch((error) => {
        console.warn('Language detection failed:', error)
        // Keep default 'en' if detection fails
      })
  }, [])

  return language
}

