'use client'

import { useState, useEffect } from 'react'
import { Language } from '../translations'
import { detectCountry, shouldUseDutch } from '../utils/countryDetection'

const LANGUAGE_STORAGE_KEY = 'boomerang-sidekick-language'

export function useLanguage(): Language {
  const [language, setLanguage] = useState<Language>('en')

  useEffect(() => {
    // Check if language is already stored
    const storedLanguage = localStorage.getItem(LANGUAGE_STORAGE_KEY) as Language | null
    if (storedLanguage === 'en' || storedLanguage === 'nl') {
      setLanguage(storedLanguage)
      return
    }

    // Detect country and set language
    detectCountry().then((countryCode) => {
      const detectedLanguage: Language = shouldUseDutch(countryCode) ? 'nl' : 'en'
      setLanguage(detectedLanguage)
      localStorage.setItem(LANGUAGE_STORAGE_KEY, detectedLanguage)
    }).catch(() => {
      // Default to English on error
      setLanguage('en')
    })
  }, [])

  return language
}

