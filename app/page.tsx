'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import rehypeRaw from 'rehype-raw'
import { translations, Language } from './translations'
import { useLanguage } from './hooks/useLanguage'

type Message = {
  role: 'user' | 'assistant'
  content: string
  timestamp?: number
  id?: string
}

type Conversation = {
  id: string
  title: string
  timestamp: number
  messages: Message[]
  sessionId: string
  pinned?: boolean
  archived?: boolean
}

type Toast = {
  id: string
  message: string
  type: 'success' | 'error' | 'info'
}

type Settings = {
  darkMode: boolean
}

const WEBHOOK_URL = 'https://vmi2979892.contaboserver.net/webhook/987b25c6-ca22-41db-83e3-d672e44787f9/chat'
const TITLE_GENERATION_WEBHOOK_URL = 'https://vmi2979892.contaboserver.net/webhook/generate-chat-title'
const CONVERSATIONS_STORAGE_KEY = 'boomerang-sidekick-conversations'
const CURRENT_CONVERSATION_KEY = 'boomerang-sidekick-current-conversation'
const SETTINGS_STORAGE_KEY = 'boomerang-sidekick-settings'

// Generate a unique session ID
const generateSessionId = () => {
  return 'session_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36)
}

// Load conversations from localStorage
const loadConversationsFromStorage = (): Conversation[] => {
  if (typeof window === 'undefined') {
    return []
  }
  
  try {
    const stored = localStorage.getItem(CONVERSATIONS_STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed)) {
        return parsed
      }
    }
  } catch (error) {
    console.error('Error loading conversations from storage:', error)
  }
  
  return []
}

// Save conversations to localStorage
const saveConversationsToStorage = (conversations: Conversation[]) => {
  if (typeof window === 'undefined') {
    return
  }
  
  try {
    localStorage.setItem(CONVERSATIONS_STORAGE_KEY, JSON.stringify(conversations))
  } catch (error) {
    console.error('Error saving conversations to storage:', error)
  }
}

// Generate conversation title from first user message (fallback)
// Note: This function will need access to translations, so it's moved inside the component

// Truncate title to 6 words for display, but allow more characters if words are short
const truncateTitle = (title: string, maxWords: number = 6): string => {
  const words = title.trim().split(/\s+/)
  if (words.length <= maxWords) {
    return title
  }
  // Take up to 6 words, but allow up to 60 characters total for better display
  const truncated = words.slice(0, maxWords).join(' ')
  return truncated.length > 60 ? truncated.substring(0, 57) + '...' : truncated + '...'
}

// Generate conversation title functions moved inside component to access translations

// Initial message will be created dynamically based on language

// Load settings from localStorage
const loadSettings = (): Settings => {
  if (typeof window === 'undefined') {
    return {
      darkMode: false,
    }
  }
  
  try {
    const stored = localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      return { darkMode: parsed.darkMode || false }
    }
  } catch (error) {
    console.error('Error loading settings:', error)
  }
  
  return {
    darkMode: false,
  }
}

// Save settings to localStorage
const saveSettings = (settings: Settings) => {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
  } catch (error) {
    console.error('Error saving settings:', error)
  }
}

export default function ChatPage() {
  // Initialize language system
  const language = useLanguage()
  const t = translations[language]
  
  // Create initial message function
  const getInitialMessage = (): Message => ({
    role: 'assistant',
    content: t.initialMessage,
    timestamp: Date.now(),
    id: 'initial_' + Date.now(),
  })
  
  // Always start with initial message to avoid hydration mismatch
  const [messages, setMessages] = useState<Message[]>([getInitialMessage()])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingPreviousSession, setIsLoadingPreviousSession] = useState(true)
  const [isMounted, setIsMounted] = useState(false)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null)
  const [loadingConversationIds, setLoadingConversationIds] = useState<Set<string>>(new Set()) // Track which conversations are loading
  const [sessionId, setSessionId] = useState<string>(() => {
    if (typeof window === 'undefined') {
      return generateSessionId()
    }
    return generateSessionId()
  })
  const [toasts, setToasts] = useState<Toast[]>([])
  const [settings, setSettings] = useState<Settings>(loadSettings())
  const [searchQuery, setSearchQuery] = useState('')
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const [selectedConversationIds, setSelectedConversationIds] = useState<Set<string>>(new Set())
  const [showConversationsDropdown, setShowConversationsDropdown] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const conversationsDropdownRef = useRef<HTMLDivElement>(null)
  // Ref to track current conversation ID for async operations (prevents stale closure issues)
  const currentConversationIdRef = useRef<string | null>(null)

  // Generate conversation title from first user message (fallback)
  const generateConversationTitleFallback = (messages: Message[]): string => {
    const firstUserMessage = messages.find(msg => msg.role === 'user')
    if (firstUserMessage) {
      const title = firstUserMessage.content.trim()
      return title.length > 50 ? title.substring(0, 50) + '...' : title
    }
    return t.newConversation
  }

  // Generate conversation title using AI via n8n webhook
  const generateConversationTitleAI = async (messages: Message[]): Promise<string> => {
    try {
      // Find the first user message and the first assistant response after it
      const firstUserIndex = messages.findIndex(msg => msg.role === 'user')
      if (firstUserIndex === -1) {
        return generateConversationTitleFallback(messages)
      }

      const firstUserMessage = messages[firstUserIndex]
      // Find the first assistant message after the user message
      const firstAssistantAfterUser = messages.slice(firstUserIndex + 1).find(msg => msg.role === 'assistant')

      const formattedMessages = []
      if (firstUserMessage) {
        formattedMessages.push({
          role: firstUserMessage.role,
          content: firstUserMessage.content,
        })
      }
      if (firstAssistantAfterUser) {
        formattedMessages.push({
          role: firstAssistantAfterUser.role,
          content: firstAssistantAfterUser.content,
        })
      }

      // Only generate title if we have at least a user message
      if (formattedMessages.length === 0 || formattedMessages[0].role !== 'user') {
        return generateConversationTitleFallback(messages)
      }

      const response = await fetch(TITLE_GENERATION_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: formattedMessages,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to generate title')
      }

      const data = await response.json()
      const generatedTitle = data.title || data.response || data.answer
      
      if (generatedTitle && typeof generatedTitle === 'string') {
        return generatedTitle.trim()
      }

      // Fallback if title is not in expected format
      return generateConversationTitleFallback(messages)
    } catch (error) {
      console.error('Error generating AI title:', error)
      // Fallback to simple title generation
      return generateConversationTitleFallback(messages)
    }
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  // Toast notification system
  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = 'toast_' + Date.now()
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 3000)
  }, [])

  // Copy to clipboard
  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      showToast(t.copiedToClipboard, 'success')
    } catch (error) {
      showToast(t.failedToCopy, 'error')
    }
  }, [showToast, t])

  // Format message timestamp
  const formatMessageTime = (timestamp: number): string => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)

    if (diffMins < 1) return t.justNow
    if (diffMins < 60) return t.minutesAgo(diffMins)
    
    const hours = date.getHours()
    const minutes = date.getMinutes()
    const ampm = hours >= 12 ? 'PM' : 'AM'
    const displayHours = hours % 12 || 12
    const displayMinutes = minutes.toString().padStart(2, '0')
    
    if (diffMs < 86400000) {
      return `${displayHours}:${displayMinutes} ${ampm}`
    }
    
    return date.toLocaleDateString() + ` ${displayHours}:${displayMinutes} ${ampm}`
  }

  // Mark component as mounted (client-side only)
  useEffect(() => {
    setIsMounted(true)
  }, [])

  // Load conversations and current conversation after mount
  useEffect(() => {
    if (!isMounted) return
    
    const loadedConversations = loadConversationsFromStorage()
    setConversations(loadedConversations)
    
    // Get current conversation ID from localStorage or use first conversation
    const storedCurrentId = localStorage.getItem(CURRENT_CONVERSATION_KEY)
    
    if (storedCurrentId && loadedConversations.find(c => c.id === storedCurrentId)) {
      // Load existing conversation
      const conversation = loadedConversations.find(c => c.id === storedCurrentId)!
      setCurrentConversationId(conversation.id)
      setMessages(conversation.messages)
      setSessionId(conversation.sessionId)
    } else if (loadedConversations.length > 0) {
      // Load most recent conversation
      const mostRecent = loadedConversations.sort((a, b) => b.timestamp - a.timestamp)[0]
      setCurrentConversationId(mostRecent.id)
      setMessages(mostRecent.messages)
      setSessionId(mostRecent.sessionId)
      localStorage.setItem(CURRENT_CONVERSATION_KEY, mostRecent.id)
    } else {
      // Create new conversation
      const newConversationId = 'conv_' + Date.now()
      const newSessionId = generateSessionId()
      setCurrentConversationId(newConversationId)
      setSessionId(newSessionId)
    }
  }, [isMounted])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Keep the ref in sync with state for async operations
  useEffect(() => {
    currentConversationIdRef.current = currentConversationId
  }, [currentConversationId])

  // Save current conversation whenever messages change
  useEffect(() => {
    if (!isMounted || !currentConversationId) return
    
    // Read from localStorage to ensure we have the latest state
    // This prevents race conditions where conversations state might be stale
    const storedConversations = loadConversationsFromStorage()
    const conversationIndex = storedConversations.findIndex(c => c.id === currentConversationId)
    
    // Use fallback title generation for auto-save (AI title will be set separately)
    const conversationData: Conversation = {
      id: currentConversationId,
      title: conversationIndex >= 0 ? storedConversations[conversationIndex].title : generateConversationTitleFallback(messages),
      timestamp: conversationIndex >= 0 ? storedConversations[conversationIndex].timestamp : Date.now(),
      messages: messages,
      sessionId: sessionId,
    }
    
    const updatedConversations = [...storedConversations]
    if (conversationIndex >= 0) {
      updatedConversations[conversationIndex] = conversationData
    } else {
      updatedConversations.push(conversationData)
    }
    
    // Sort by timestamp (newest first)
    updatedConversations.sort((a, b) => b.timestamp - a.timestamp)
    
    setConversations(updatedConversations)
    saveConversationsToStorage(updatedConversations)
    localStorage.setItem(CURRENT_CONVERSATION_KEY, currentConversationId)
  }, [messages, sessionId, currentConversationId, isMounted])

  // Load previous session from API when conversation is loaded
  useEffect(() => {
    if (!isMounted || !currentConversationId || !sessionId) {
      setIsLoadingPreviousSession(false)
      return
    }
    
    const loadPreviousSession = async () => {
      try {
        const response = await fetch(`${WEBHOOK_URL}?action=loadPreviousSession`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sessionId: sessionId,
          }),
        })

        if (!response.ok) {
          setIsLoadingPreviousSession(false)
          return
        }

        const data = await response.json()
        
        let previousMessages: Message[] | null = null
        
        if (data.messages && Array.isArray(data.messages)) {
          previousMessages = data.messages.map((msg: any) => ({
            role: msg.role || (msg.type === 'user' ? 'user' : 'assistant'),
            content: msg.content || msg.text || msg.message || '',
          }))
        } else if (data.chatHistory && Array.isArray(data.chatHistory)) {
          previousMessages = data.chatHistory.map((msg: any) => ({
            role: msg.role || (msg.type === 'user' ? 'user' : 'assistant'),
            content: msg.content || msg.text || msg.message || '',
          }))
        } else if (data.history && Array.isArray(data.history)) {
          previousMessages = data.history.map((msg: any) => ({
            role: msg.role || (msg.type === 'user' ? 'user' : 'assistant'),
            content: msg.content || msg.text || msg.message || '',
          }))
        }
        
        if (previousMessages && previousMessages.length > 0) {
          setMessages(previousMessages)
        }
      } catch (error) {
        console.error('Error loading previous session:', error)
      } finally {
        setIsLoadingPreviousSession(false)
      }
    }

    loadPreviousSession()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMounted, currentConversationId, sessionId])

  // Extract response text from various n8n response formats
  const extractResponseText = (data: any): string => {
    if (typeof data === 'string') {
      return data
    }
    
    if (typeof data !== 'object' || data === null) {
      return String(data)
    }

    // Check for nested output.answer structure (common in AI Agent responses)
    if (data.output && typeof data.output === 'object' && data.output.answer) {
      return data.output.answer
    }

    // Try common top-level response field names
    const possibleFields = [
      'answer',
      'response',
      'text',
      'message',
      'chatOutput',
      'reply',
      'content',
    ]

    for (const field of possibleFields) {
      if (data[field] && typeof data[field] === 'string') {
        return data[field]
      }
    }

    // If output is a string, return it
    if (data.output && typeof data.output === 'string') {
      return data.output
    }

    // If it's an array, try to get the first item
    if (Array.isArray(data) && data.length > 0) {
      const firstItem = data[0]
      if (typeof firstItem === 'string') {
        return firstItem
      }
      if (typeof firstItem === 'object' && firstItem !== null) {
        return extractResponseText(firstItem)
      }
    }

    // Last resort: stringify
    console.warn('Unknown response format:', data)
    return JSON.stringify(data, null, 2)
  }

  const handleSend = async () => {
    const trimmedInput = inputValue.trim()
    if (!trimmedInput || loadingConversationIds.has(currentConversationId!)) return

    const requestConversationId = currentConversationId
    const requestSessionId = sessionId
    const requestMessages = [...messages] // Capture current messages state

    const userMessage: Message = {
      role: 'user',
      content: trimmedInput,
      timestamp: Date.now(),
      id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(7),
    }

    // Get the conversation from storage to ensure we have the latest messages
    // Calculate updatedMessages using current conversations state
    const existingConversation = conversations.find(c => c.id === requestConversationId)
    const conversationMessages = existingConversation ? existingConversation.messages : requestMessages
    const updatedMessages = [...conversationMessages, userMessage]
    
    
    // Update current conversation's messages immediately if it's the active one
    // Use ref to get the CURRENT conversation ID (not stale closure value)
    if (requestConversationId === currentConversationIdRef.current) {
      setMessages(updatedMessages)
    }
    
    // Update conversation in storage
    setConversations((prevConversations) => {
      const updated = prevConversations.map(c => 
        c.id === requestConversationId 
          ? { ...c, messages: updatedMessages }
          : c
      )
      // If conversation doesn't exist yet, create it
      if (!prevConversations.find(c => c.id === requestConversationId)) {
        updated.push({
          id: requestConversationId!,
          title: generateConversationTitleFallback(updatedMessages),
          timestamp: Date.now(),
          messages: updatedMessages,
          sessionId: requestSessionId,
        })
      }
      saveConversationsToStorage(updated)
      return updated
    })
    
    setInputValue('')
    setIsLoading(true)
    // Add this conversation to the set of loading conversations
    setLoadingConversationIds(prev => new Set(prev).add(requestConversationId!))

    try {
      // Request body with chat input and session ID
      const requestBody = {
        chatInput: trimmedInput,
        sessionId: requestSessionId,
        action: 'sendMessage',
      }
      
      console.log('Sending request to:', WEBHOOK_URL)
      console.log('Request body:', { ...requestBody, chatInput: trimmedInput.substring(0, 20) + '...' })

      const response = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      })


      if (!response.ok) {
        let errorText = 'Unknown error'
        try {
          errorText = await response.text()
        } catch (e) {
          console.error('Failed to read error response:', e)
        }
        
        console.error('API Error:', {
          status: response.status,
          statusText: response.statusText,
          url: WEBHOOK_URL,
          requestBody: requestBody,
          responseBody: errorText,
        })
        
        throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`)
      }

      let data: any
      const contentType = response.headers.get('content-type')
      
      if (contentType && contentType.includes('application/json')) {
        data = await response.json()
      } else {
        const text = await response.text()
        // Try to parse as JSON, fallback to plain text
        try {
          data = JSON.parse(text)
        } catch {
          data = text
        }
      }

      console.log('API Response:', data)

      // Extract the response text using the flexible extractor
      const responseText = extractResponseText(data)

      const assistantMessage: Message = {
        role: 'assistant',
        content: responseText,
        timestamp: Date.now(),
        id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(7),
      }


      // Always update the conversation that sent the request, regardless of current conversation
      // Read the conversation from storage to get the latest messages (including the user message we just added)
      
      // CRITICAL: Use updatedMessages (captured at send time) as the source of truth
      // This ensures we don't pick up messages from concurrent requests
      // updatedMessages already includes the user message we added when sending
      const finalMessages = [...updatedMessages, assistantMessage]
      
      
      setConversations((prevConversations) => {
        const conversation = prevConversations.find(c => c.id === requestConversationId)
        
        const updated = prevConversations.map(c => {
          if (c.id === requestConversationId) {
            return { ...c, messages: finalMessages }
          }
          return c
        })
        
        // If conversation doesn't exist in state, add it
        if (!conversation) {
          updated.push({
            id: requestConversationId!,
            title: generateConversationTitleFallback(finalMessages),
            timestamp: Date.now(),
            messages: finalMessages,
            sessionId: requestSessionId,
          })
        }
        
        saveConversationsToStorage(updated)
        
        // Update current messages if this is the active conversation
        // Use ref to get the CURRENT conversation ID (not stale closure value)
        if (requestConversationId === currentConversationIdRef.current) {
          setMessages(finalMessages)
        }
        
        // Generate AI title after first exchange (user message + assistant response)
        // Check if this is the first real exchange (after initial assistant message)
        // Use requestMessages (captured at send time) to check original state
        if (requestMessages.length === 1 && requestMessages[0].role === 'assistant' && requestConversationId) {
          generateConversationTitleAI(finalMessages).then(title => {
            setConversations(prevConversations => {
              const updated = prevConversations.map(conv => 
                conv.id === requestConversationId ? { ...conv, title } : conv
              )
              saveConversationsToStorage(updated)
              return updated
            })
          }).catch(() => {})
        }
        
        return updated
      })
    } catch (error) {
      console.error('Error sending message:', error)
      
      // Provide more detailed error information
      let errorMessage: string = t.errorSendingMessage
      
      if (error instanceof Error) {
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
          errorMessage = t.networkError
        } else if (error.message.includes('HTTP')) {
          // Extract status code from error message for more specific error
          const statusMatch = error.message.match(/HTTP (\d+)/)
          if (statusMatch) {
            const statusCode = statusMatch[1]
            if (statusCode === '404') {
              errorMessage = t.webhookNotFound
            } else if (statusCode === '401' || statusCode === '403') {
              errorMessage = t.authError
            } else if (statusCode === '500') {
              errorMessage = t.serverError
            } else {
              errorMessage = t.serverErrorWithCode(statusCode)
            }
          } else {
            errorMessage = t.serverError
          }
        }
        console.error('Full error details:', {
          message: error.message,
          stack: error.stack,
          error: error,
        })
      }

      // Always update the conversation that had the error
      const errorMsg: Message = {
        role: 'assistant',
        content: errorMessage,
        timestamp: Date.now(),
        id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(7),
      }
      
      setConversations((prevConversations) => {
        const conversation = prevConversations.find(c => c.id === requestConversationId)
        const conversationMessages = conversation ? conversation.messages : updatedMessages
        
        const updated = prevConversations.map(c => 
          c.id === requestConversationId 
            ? { ...c, messages: [...conversationMessages, errorMsg] }
            : c
        )
        
        // If conversation doesn't exist, add it
        if (!conversation) {
          updated.push({
            id: requestConversationId!,
            title: generateConversationTitleFallback([...updatedMessages, errorMsg]),
            timestamp: Date.now(),
            messages: [...updatedMessages, errorMsg],
            sessionId: requestSessionId,
          })
        }
        
        saveConversationsToStorage(updated)
        
        // Update current messages if this is the active conversation
        // Use ref to get the CURRENT conversation ID (not stale closure value)
        if (requestConversationId === currentConversationIdRef.current) {
          setMessages([...conversationMessages, errorMsg])
          showToast('Error sending message', 'error')
        }
        
        return updated
      })
    } finally {
      // Remove this conversation from the set of loading conversations
      setLoadingConversationIds(prev => {
        const newSet = new Set(prev)
        newSet.delete(requestConversationId!)
        // Only clear isLoading if the current conversation is no longer loading
        // Use ref to get the CURRENT conversation ID (not stale closure value)
        const actualCurrentId = currentConversationIdRef.current
        if (requestConversationId === actualCurrentId && !newSet.has(actualCurrentId!)) {
          setIsLoading(false)
        }
        return newSet
      })
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }


  // Update settings and save
  const updateSettings = useCallback((newSettings: Partial<Settings>) => {
    const updated = { ...settings, ...newSettings }
    setSettings(updated)
    saveSettings(updated)
    if (newSettings.darkMode !== undefined) {
      document.documentElement.classList.toggle('dark', newSettings.darkMode)
    }
  }, [settings])

  // Apply dark mode on mount
  useEffect(() => {
    if (isMounted && settings.darkMode) {
      document.documentElement.classList.add('dark')
    }
  }, [isMounted, settings.darkMode])

  // Close conversations dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (conversationsDropdownRef.current && !conversationsDropdownRef.current.contains(event.target as Node)) {
        setShowConversationsDropdown(false)
      }
    }
    if (showConversationsDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showConversationsDropdown])

  const handleNewConversation = () => {
    
    const newConversationId = 'conv_' + Date.now()
    const newSessionId = generateSessionId()
    const initialMessages = [getInitialMessage()]
    
    // Create the new conversation object
    const newConversation: Conversation = {
      id: newConversationId,
      title: generateConversationTitleFallback(initialMessages),
      timestamp: Date.now(),
      messages: initialMessages,
      sessionId: newSessionId,
    }
    
    // Save the new conversation immediately to localStorage
    const storedConversations = loadConversationsFromStorage()
    const updatedConversations = [...storedConversations, newConversation]
    saveConversationsToStorage(updatedConversations)
    setConversations(updatedConversations)
    
    setCurrentConversationId(newConversationId)
    setMessages(initialMessages)
    setSessionId(newSessionId)
    setInputValue('')
    localStorage.setItem(CURRENT_CONVERSATION_KEY, newConversationId)
    // New conversation is not loading, so hide loading indicator
    // But don't clear loadingConversationIds - let the response handler clear it
    setIsLoading(false)
  }

  const handleSelectConversation = (conversationId: string) => {
    
    // Read from localStorage to ensure we have the latest messages
    const storedConversations = loadConversationsFromStorage()
    const conversation = storedConversations.find(c => c.id === conversationId) || conversations.find(c => c.id === conversationId)
    
    
    if (conversation) {
      setCurrentConversationId(conversation.id)
      setMessages(conversation.messages)
      setSessionId(conversation.sessionId)
      setInputValue('')
      
      // Set isLoading based on whether the conversation we're switching to is currently loading
      const shouldBeLoading = loadingConversationIds.has(conversationId)
      setIsLoading(shouldBeLoading)
    }
  }

  const handleDeleteConversation = (e: React.MouseEvent, conversationId: string) => {
    e.stopPropagation()
    if (window.confirm(t.deleteConversationConfirm)) {
      const updatedConversations = conversations.filter(c => c.id !== conversationId)
      setConversations(updatedConversations)
      saveConversationsToStorage(updatedConversations)
      showToast(t.conversationDeleted, 'success')
      
      if (currentConversationId === conversationId) {
        if (updatedConversations.length > 0) {
          const mostRecent = updatedConversations[0]
          handleSelectConversation(mostRecent.id)
        } else {
          handleNewConversation()
        }
      }
    }
  }

  const handlePinConversation = (e: React.MouseEvent, conversationId: string) => {
    e.stopPropagation()
    const updatedConversations = conversations.map(c => 
      c.id === conversationId ? { ...c, pinned: !c.pinned } : c
    )
    updatedConversations.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1
      if (!a.pinned && b.pinned) return 1
      return b.timestamp - a.timestamp
    })
    setConversations(updatedConversations)
    saveConversationsToStorage(updatedConversations)
    showToast(updatedConversations.find(c => c.id === conversationId)?.pinned ? t.pinned : t.unpinned, 'success')
  }

  const handleArchiveConversation = (e: React.MouseEvent, conversationId: string) => {
    e.stopPropagation()
    const updatedConversations = conversations.map(c => 
      c.id === conversationId ? { ...c, archived: !c.archived } : c
    )
    setConversations(updatedConversations)
    saveConversationsToStorage(updatedConversations)
    showToast(updatedConversations.find(c => c.id === conversationId)?.archived ? t.archived : t.unarchived, 'success')
    
    if (currentConversationId === conversationId && updatedConversations.find(c => c.id === conversationId)?.archived) {
      const unarchived = updatedConversations.filter(c => !c.archived)
      if (unarchived.length > 0) {
        handleSelectConversation(unarchived[0].id)
      } else {
        handleNewConversation()
      }
    }
  }

  // Bulk selection handlers
  const toggleConversationSelection = (conversationId: string) => {
    setSelectedConversationIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(conversationId)) {
        newSet.delete(conversationId)
      } else {
        newSet.add(conversationId)
      }
      return newSet
    })
  }

  const selectAllConversations = () => {
    const allIds = filteredConversations.map(c => c.id)
    setSelectedConversationIds(new Set(allIds))
  }

  const deselectAllConversations = () => {
    setSelectedConversationIds(new Set())
  }

  const exitSelectionMode = () => {
    setIsSelectionMode(false)
    setSelectedConversationIds(new Set())
  }

  const handleBulkDelete = () => {
    if (selectedConversationIds.size === 0) {
      showToast(t.noConversationsSelected, 'info')
      return
    }
    
    if (window.confirm(t.deleteBulkConfirm(selectedConversationIds.size))) {
      const updatedConversations = conversations.filter(c => !selectedConversationIds.has(c.id))
      setConversations(updatedConversations)
      saveConversationsToStorage(updatedConversations)
      showToast(t.conversationsDeleted(selectedConversationIds.size), 'success')
      
      // If current conversation was deleted, switch to another
      if (currentConversationId && selectedConversationIds.has(currentConversationId)) {
        const remaining = updatedConversations.filter(c => !c.archived)
        if (remaining.length > 0) {
          handleSelectConversation(remaining[0].id)
        } else {
          handleNewConversation()
        }
      }
      
      exitSelectionMode()
    }
  }

  const handleBulkArchive = () => {
    if (selectedConversationIds.size === 0) {
      showToast(t.noConversationsSelected, 'info')
      return
    }
    
    const updatedConversations = conversations.map(c => 
      selectedConversationIds.has(c.id) ? { ...c, archived: true } : c
    )
    setConversations(updatedConversations)
    saveConversationsToStorage(updatedConversations)
    showToast(t.conversationsArchived(selectedConversationIds.size), 'success')
    
    // If current conversation was archived, switch to another
    if (currentConversationId && selectedConversationIds.has(currentConversationId)) {
      const unarchived = updatedConversations.filter(c => !c.archived)
      if (unarchived.length > 0) {
        handleSelectConversation(unarchived[0].id)
      } else {
        handleNewConversation()
      }
    }
    
    exitSelectionMode()
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Selection mode shortcuts
      if (isSelectionMode) {
        // Escape to exit selection mode
        if (e.key === 'Escape') {
          e.preventDefault()
          exitSelectionMode()
          return
        }
        // Cmd/Ctrl + A to select/deselect all
        if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
          e.preventDefault()
          // Compute filtered conversations (same logic as in component)
          const filtered = conversations.filter(conv => {
            if (searchQuery.trim() === '') return !conv.archived
            const query = searchQuery.toLowerCase()
            return (
              !conv.archived &&
              (conv.title.toLowerCase().includes(query) ||
               conv.messages.some(msg => msg.content.toLowerCase().includes(query)))
            )
          })
          if (selectedConversationIds.size === filtered.length) {
            deselectAllConversations()
          } else {
            selectAllConversations()
          }
          return
        }
        // Delete key to delete selected conversations
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault()
          if (selectedConversationIds.size > 0) {
            handleBulkDelete()
          }
          return
        }
      }
      
      // Cmd/Ctrl + K for new conversation (only when not in selection mode)
      if ((e.metaKey || e.ctrlKey) && e.key === 'k' && !isSelectionMode) {
        e.preventDefault()
        handleNewConversation()
      }
      // Esc to close sidebar/modal (only when not in selection mode)
      if (e.key === 'Escape' && !isSelectionMode) {
        setShowSettings(false)
        setEditingMessageId(null)
        setShowConversationsDropdown(false)
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [isSelectionMode, selectedConversationIds.size, conversations, searchQuery, handleNewConversation, exitSelectionMode, selectAllConversations, deselectAllConversations, handleBulkDelete])

  const handleEditMessage = (messageId: string, content: string) => {
    setEditingMessageId(messageId)
    setEditContent(content)
  }

  const handleSaveEdit = () => {
    if (!editingMessageId) return
    setMessages((prev) => prev.map(msg => 
      msg.id === editingMessageId 
        ? { ...msg, content: editContent, timestamp: msg.timestamp || Date.now() }
        : msg
    ))
    setEditingMessageId(null)
    setEditContent('')
    showToast(t.messageUpdated, 'success')
  }

  const handleDeleteMessage = (messageId: string) => {
    if (window.confirm(t.deleteMessageConfirm)) {
      setMessages((prev) => prev.filter(msg => msg.id !== messageId))
      showToast(t.messageDeleted, 'success')
    }
  }

  const handleExportConversation = () => {
    if (!currentConversationId) return
    const conversation = conversations.find(c => c.id === currentConversationId)
    if (!conversation) return

    const content = conversation.messages.map(msg => {
      const role = msg.role === 'user' ? t.you : t.boomerangSidekick
      const time = msg.timestamp ? formatMessageTime(msg.timestamp) : ''
      return `[${time}] ${role}: ${msg.content}`
    }).join('\n\n')

    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `boomerang-chat-${conversation.title.substring(0, 20)}.txt`
    a.click()
    URL.revokeObjectURL(url)
    showToast(t.conversationExported, 'success')
  }

  // Filter conversations based on search
  const filteredConversations = conversations.filter(conv => {
    if (searchQuery.trim() === '') return !conv.archived
    const query = searchQuery.toLowerCase()
    return (
      !conv.archived &&
      (conv.title.toLowerCase().includes(query) ||
       conv.messages.some(msg => msg.content.toLowerCase().includes(query)))
    )
  })

  // Search within current conversation
  const [messageSearchQuery, setMessageSearchQuery] = useState('')
  const filteredMessages = messageSearchQuery.trim() === '' 
    ? messages 
    : messages.filter(msg => msg.content.toLowerCase().includes(messageSearchQuery.toLowerCase()))

  // Suggested questions
  const suggestedQuestions = [
    t.question1,
    t.question2,
    t.question3,
    t.question4,
  ]

  const handleSuggestedQuestion = (question: string) => {
    setInputValue(question)
    inputRef.current?.focus()
  }

  const formatTimestamp = (timestamp: number): string => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return t.justNow
    if (diffMins < 60) return t.minutesAgo(diffMins)
    if (diffHours < 24) return t.hoursAgo(diffHours)
    if (diffDays < 7) return t.daysAgo(diffDays)
    return date.toLocaleDateString()
  }

  return (
    <div className={`flex h-[100dvh] w-full overflow-hidden ${settings.darkMode ? 'dark bg-gray-900' : 'bg-[#f8f9fa]'}`}>
      {/* Main Chat Area */}
      <div className={`flex-1 flex flex-col min-w-0 w-full relative overflow-hidden ${settings.darkMode ? 'bg-gray-900' : 'bg-white'}`}>
        {/* Floating Action Buttons */}
        {!isSelectionMode && (
        <div className="fixed top-2 right-2 sm:top-4 sm:right-4 z-40 flex items-center gap-1.5 sm:gap-2">
          {/* New Chat Button */}
          <button
            onClick={handleNewConversation}
            className={`px-2.5 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all duration-200 flex items-center gap-1.5 sm:gap-2 shadow-lg ${
              settings.darkMode
                ? 'bg-[#6c6ccb] hover:bg-[#5c5cbb] text-white'
                : 'bg-[#6c6ccb] hover:bg-[#5c5cbb] text-white'
            } hover:shadow-xl`}
            title={t.newChat}
          >
            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            <span className="hidden sm:inline">{t.newChat}</span>
          </button>

          {/* Conversations Dropdown Button */}
          <div className="relative" ref={conversationsDropdownRef}>
            <button
              onClick={() => setShowConversationsDropdown(!showConversationsDropdown)}
              className={`px-2.5 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all duration-200 flex items-center gap-1.5 sm:gap-2 shadow-lg ${
                settings.darkMode
                  ? 'bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700'
                  : 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-200'
              } hover:shadow-xl`}
              title="All conversations"
            >
              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              {filteredConversations.length > 0 && (
                <span className={`px-1.5 sm:px-2 py-0.5 rounded-full text-xs ${
                  settings.darkMode ? 'bg-gray-700 text-gray-200' : 'bg-gray-100 text-gray-700'
                }`}>
                  {filteredConversations.length}
                </span>
              )}
              <svg className={`w-3.5 h-3.5 sm:w-4 sm:h-4 transition-transform ${showConversationsDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Full Conversations Dropdown */}
            {showConversationsDropdown && (
              <div className={`absolute top-full right-0 mt-2 w-[calc(100vw-1rem)] sm:w-96 max-w-[calc(100vw-1rem)] sm:max-w-md max-h-[calc(100vh-8rem)] sm:max-h-[600px] overflow-y-auto rounded-lg shadow-xl border z-50 ${
                settings.darkMode
                  ? 'bg-gray-800 border-gray-700'
                  : 'bg-white border-gray-200'
              }`}>
                {/* Dropdown Header */}
                <div className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className={`font-semibold ${settings.darkMode ? 'text-white' : 'text-gray-900'}`}>{t.conversations}</h3>
                    <button
                      onClick={() => setShowConversationsDropdown(false)}
                      className={`p-1 rounded-lg ${settings.darkMode ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-100 text-gray-500'}`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  {/* Search Conversations */}
                  <input
                    type="text"
                    placeholder={t.searchConversations}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className={`w-full px-3 py-2 rounded-lg text-sm border mb-3 ${
                      settings.darkMode
                        ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400'
                        : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400'
                    } focus:outline-none focus:ring-2 focus:ring-[#6c6ccb]/20 focus:border-[#6c6ccb]`}
                  />

                  {/* Message Search */}
                  {currentConversationId && (
                    <div className="relative mb-3">
                      <input
                        type="text"
                        placeholder={t.searchMessages}
                        value={messageSearchQuery}
                        onChange={(e) => setMessageSearchQuery(e.target.value)}
                        className={`w-full px-3 py-2 rounded-lg text-sm border ${
                          settings.darkMode 
                            ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                            : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400'
                        } focus:outline-none focus:ring-2 focus:ring-[#6c6ccb]/20 focus:border-[#6c6ccb] transition-all`}
                      />
                      {messageSearchQuery && (
                        <button
                          onClick={() => setMessageSearchQuery('')}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="p-2 flex gap-2 border-t border-gray-200 dark:border-gray-700">
                  <button
                    onClick={() => {
                      setIsSelectionMode(true)
                      setShowConversationsDropdown(false)
                    }}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 border ${
                      settings.darkMode
                        ? 'border-gray-600 text-gray-300 hover:bg-gray-700'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {t.selectMultiple}
                  </button>
                  {currentConversationId && (
                    <button
                      onClick={() => {
                        handleExportConversation()
                        setShowConversationsDropdown(false)
                      }}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 border ${
                        settings.darkMode
                          ? 'border-gray-600 text-gray-300 hover:bg-gray-700'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                      title={t.export}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setShowSettings(true)
                      setShowConversationsDropdown(false)
                    }}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                      settings.darkMode
                        ? 'hover:bg-gray-700 text-gray-300'
                        : 'hover:bg-gray-100 text-gray-500'
                    }`}
                    title={t.settings}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </button>
                </div>

                {/* Conversation List */}
                <div className="p-2 max-h-[400px] overflow-y-auto">
                  {filteredConversations.length === 0 ? (
                    <div className="p-6 text-center">
                      <p className={`text-sm ${settings.darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        {searchQuery ? t.noConversationsFound : t.noConversationsYet}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {filteredConversations.map((conversation) => (
                        <button
                          key={conversation.id}
                          onClick={() => {
                            handleSelectConversation(conversation.id)
                            setShowConversationsDropdown(false)
                          }}
                          className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all duration-200 flex items-center justify-between ${
                            currentConversationId === conversation.id
                              ? settings.darkMode
                                ? 'bg-[#6c6ccb] text-white'
                                : 'bg-[#6c6ccb] text-white'
                              : settings.darkMode
                                ? 'hover:bg-gray-700 text-gray-200'
                                : 'hover:bg-gray-100 text-gray-700'
                          }`}
                        >
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            {conversation.pinned && (
                              <svg className="w-3 h-3 flex-shrink-0 opacity-70" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M4 3a2 2 0 100 4h12a2 2 0 100-4H4z" />
                                <path fillRule="evenodd" d="M3 8h14v7a2 2 0 01-2 2H5a2 2 0 01-2-2V8zm5 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" clipRule="evenodd" />
                              </svg>
                            )}
                            <span className="truncate">{truncateTitle(conversation.title)}</span>
                          </div>
                          {loadingConversationIds.has(conversation.id) && (
                            <div className="flex-shrink-0 w-2 h-2 bg-current rounded-full animate-pulse ml-2" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        )}

        {/* Selection Mode Banner */}
        {isSelectionMode && (
          <div className={`flex-shrink-0 border-b px-3 sm:px-4 md:px-6 py-2 sm:py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0 ${
            settings.darkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'
          }`}>
            <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
              <span className={`text-xs sm:text-sm font-medium ${settings.darkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                {t.conversationsSelected(selectedConversationIds.size)}
              </span>
              <button
                onClick={selectedConversationIds.size === filteredConversations.length ? deselectAllConversations : selectAllConversations}
                className={`text-xs sm:text-sm px-2 sm:px-3 py-1 rounded-md transition-colors ${
                  settings.darkMode
                    ? 'text-gray-300 hover:bg-gray-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {selectedConversationIds.size === filteredConversations.length ? t.deselectAll : t.selectAll}
              </button>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              <button
                onClick={handleBulkArchive}
                disabled={selectedConversationIds.size === 0}
                className={`px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all duration-200 flex items-center gap-1.5 sm:gap-2 ${
                  selectedConversationIds.size === 0
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : settings.darkMode
                      ? 'bg-gray-700 hover:bg-gray-600 text-gray-200'
                      : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                }`}
              >
                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                </svg>
                <span className="hidden xs:inline">{t.archive}</span>
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={selectedConversationIds.size === 0}
                className={`px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all duration-200 flex items-center gap-1.5 sm:gap-2 ${
                  selectedConversationIds.size === 0
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : settings.darkMode
                      ? 'bg-gray-700 hover:bg-gray-600 text-gray-200'
                      : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                }`}
              >
                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                <span className="hidden xs:inline">{t.delete}</span>
              </button>
              <button
                onClick={exitSelectionMode}
                className={`px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all duration-200 ${
                  settings.darkMode
                    ? 'text-gray-300 hover:bg-gray-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {t.cancel}
              </button>
            </div>
          </div>
        )}

        {/* Selection Mode Modal */}
        {isSelectionMode && (
          <div className="flex-1 overflow-y-auto px-4 py-6">
            <div className="max-w-4xl mx-auto">
              <div className={`rounded-lg border p-4 ${
                settings.darkMode
                  ? 'bg-gray-800 border-gray-700'
                  : 'bg-white border-gray-200'
              }`}>
                <div className="mb-4">
                  <input
                    type="text"
                    placeholder={t.searchConversations}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className={`w-full px-3 py-2 rounded-lg text-sm border ${
                      settings.darkMode
                        ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400'
                        : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400'
                    } focus:outline-none focus:ring-2 focus:ring-[#6c6ccb]/20 focus:border-[#6c6ccb]`}
                  />
                </div>
                <div className="space-y-2 max-h-[500px] overflow-y-auto">
                  {filteredConversations.length === 0 ? (
                    <div className="p-6 text-center">
                      <p className={`text-sm ${settings.darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        {searchQuery ? 'No conversations found' : 'No conversations yet'}
                      </p>
                    </div>
                  ) : (
                    filteredConversations.map((conversation) => (
                      <div
                        key={conversation.id}
                        onClick={() => toggleConversationSelection(conversation.id)}
                        className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all duration-200 ${
                          selectedConversationIds.has(conversation.id)
                            ? settings.darkMode
                              ? 'bg-[#6c6ccb]/30 border border-[#6c6ccb]'
                              : 'bg-[#6c6ccb]/10 border border-[#6c6ccb]'
                            : settings.darkMode
                              ? 'hover:bg-gray-700 border border-transparent'
                              : 'hover:bg-gray-50 border border-transparent'
                        }`}
                      >
                        <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all duration-200 flex-shrink-0 ${
                          selectedConversationIds.has(conversation.id)
                            ? 'bg-[#6c6ccb] border-[#6c6ccb]'
                            : settings.darkMode
                              ? 'border-gray-500'
                              : 'border-gray-300'
                        }`}>
                          {selectedConversationIds.has(conversation.id) && (
                            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {conversation.pinned && (
                              <svg className="w-3 h-3 flex-shrink-0 opacity-70" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M4 3a2 2 0 100 4h12a2 2 0 100-4H4z" />
                                <path fillRule="evenodd" d="M3 8h14v7a2 2 0 01-2 2H5a2 2 0 01-2-2V8zm5 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" clipRule="evenodd" />
                              </svg>
                            )}
                            <span className={`text-sm font-medium truncate ${
                              settings.darkMode ? 'text-gray-200' : 'text-gray-900'
                            }`}>
                              {conversation.title}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Chat Messages Area */}
        {!isSelectionMode && (
        <div 
          className={`flex-1 overflow-y-auto overflow-x-hidden px-3 md:px-4 py-2 sm:py-4 md:py-6 relative min-h-0 ${
            settings.darkMode 
              ? 'bg-gray-900' 
              : ''
          }`}
          style={settings.darkMode ? {} : {
            background: `
              linear-gradient(to right, 
                rgba(108, 108, 203, 0.15) 0%, 
                rgba(108, 108, 203, 0.08) 25%,
                rgba(108, 108, 203, 0.005) 50%,
                rgba(108, 108, 203, 0.08) 75%,
                rgba(108, 108, 203, 0.15) 100%
              ),
              white
            `,
          }}
        >
          {/* SVG Background Panel - positioned top right */}
          {!settings.darkMode && (
            <div 
              className="hidden md:block absolute right-0 pointer-events-none"
              style={{
                width: '780px',
                height: 'auto',
                zIndex: 0,
                opacity: 0.6,
                top: '5.375rem',
                transform: 'translateX(13%)',
              }}
            >
              <img 
                src="/bg-panel.svg" 
                alt="" 
                className="w-full h-auto"
              />
            </div>
          )}
          <div className="relative z-10">
          <div className="max-w-3xl mx-auto space-y-3 md:space-y-4">
            {/* Suggested Questions - Show only when no messages or just initial message */}
            {messages.length <= 1 && !isLoading && !isLoadingPreviousSession && (
              <div className="hidden md:block space-y-2 sm:space-y-3 px-1">
                <p className={`text-xs sm:text-sm font-medium text-center ${settings.darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  {t.suggestedQuestions}
                </p>
                <div className="flex flex-wrap gap-1.5 sm:gap-2 justify-center">
                  {suggestedQuestions.map((question, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSuggestedQuestion(question)}
                      className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-xs sm:text-sm font-medium transition-all ${
                        settings.darkMode
                          ? 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                          : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-200'
                      } shadow-sm hover:shadow-md`}
                    >
                      {question}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {isLoadingPreviousSession && (
              <div className="flex justify-start">
                <div className={`rounded-xl px-3 md:px-4 py-2 md:py-3 shadow-sm border ${
                  settings.darkMode 
                    ? 'bg-gray-800 border-gray-700' 
                    : 'bg-white border-gray-100'
                }`}>
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      <div className="w-1.5 h-1.5 bg-[#6c6ccb] rounded-full animate-bounce" style={{ animationDelay: '0ms', animationDuration: '1s' }}></div>
                      <div className="w-1.5 h-1.5 bg-[#6c6ccb] rounded-full animate-bounce" style={{ animationDelay: '200ms', animationDuration: '1s' }}></div>
                      <div className="w-1.5 h-1.5 bg-[#6c6ccb] rounded-full animate-bounce" style={{ animationDelay: '400ms', animationDuration: '1s' }}></div>
                    </div>
                    <span className={`text-xs font-medium ${settings.darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                      {t.loadingConversation}
                    </span>
                  </div>
                </div>
              </div>
            )}
            {filteredMessages.map((message, index) => (
              <div
                key={message.id || index}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'} group relative`}
              >
                {message.role === 'user' ? (
                  <>
                    {/* User Message - With Card */}
                    <div className="max-w-[90%] sm:max-w-[85%] md:max-w-[75%] rounded-xl md:rounded-2xl px-3 md:px-4 py-2 md:py-2.5 shadow-sm bg-[#6c6ccb] text-white">
                      {editingMessageId === message.id ? (
                        <div className="space-y-2">
                          <textarea
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            className="w-full p-2 rounded-lg text-sm border bg-gray-50 border-gray-200 text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#6c6ccb]/20"
                            rows={3}
                            autoFocus
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={handleSaveEdit}
                              className="px-3 py-1 bg-white text-[#6c6ccb] rounded-lg text-xs font-medium hover:bg-gray-100"
                            >
                              {t.save}
                            </button>
                            <button
                              onClick={() => {
                                setEditingMessageId(null)
                                setEditContent('')
                              }}
                              className="px-3 py-1 rounded-lg text-xs font-medium bg-white/20 text-white hover:bg-white/30"
                            >
                              {t.cancel}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap break-words leading-relaxed text-sm text-white">
                          {message.content}
                        </p>
                      )}
                    </div>
                    
                    {/* User Message Actions */}
                    {message.id && (
                      <div className="absolute -bottom-6 right-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => copyToClipboard(message.content)}
                          className="p-1 rounded bg-gray-100 text-gray-500 hover:bg-gray-200"
                          title={t.copy}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleEditMessage(message.id!, message.content)}
                          className="p-1 rounded bg-gray-100 text-gray-500 hover:bg-gray-200"
                          title={t.edit}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDeleteMessage(message.id!)}
                          className="p-1 rounded bg-gray-100 text-gray-500 hover:bg-gray-200"
                          title={t.deleteMessage}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {/* Assistant Message - With Card */}
                    <div className={`max-w-[90%] sm:max-w-[85%] md:max-w-[75%] rounded-xl md:rounded-2xl px-3 md:px-4 py-2 md:py-2.5 shadow-sm ${
                      settings.darkMode
                        ? 'bg-gray-800 text-gray-100 border border-gray-700'
                        : 'bg-white text-gray-900 border border-gray-100'
                    }`}>
                      <div className={`prose prose-sm max-w-none leading-relaxed ${settings.darkMode ? 'prose-invert' : ''}`}>
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          rehypePlugins={[rehypeRaw, rehypeHighlight]}
                          className={settings.darkMode ? 'text-gray-100' : 'text-gray-800'}
                          components={{
                            p: ({ children }) => <p className="my-4 leading-relaxed">{children}</p>,
                            ul: ({ children }) => <ul className="my-5 space-y-2">{children}</ul>,
                            ol: ({ children }) => <ol className="my-5 space-y-2">{children}</ol>,
                            li: ({ children }) => <li className="my-2 leading-relaxed">{children}</li>,
                            h1: ({ children }) => <h1 className="mt-8 mb-4 font-bold leading-tight">{children}</h1>,
                            h2: ({ children }) => <h2 className="mt-7 mb-3 font-bold leading-tight">{children}</h2>,
                            h3: ({ children }) => <h3 className="mt-6 mb-3 font-semibold leading-snug">{children}</h3>,
                            blockquote: ({ children }) => <blockquote className="border-l-4 border-gray-300 dark:border-gray-600 pl-5 pr-4 py-2 my-5 italic bg-gray-50 dark:bg-gray-800/50 rounded-r">{children}</blockquote>,
                            code: ({ children, className, ...props }: any) => {
                              const isInline = !className || !className.includes('language-')
                              return isInline ? (
                                <code className="bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100 px-1.5 py-0.5 rounded text-sm font-mono" {...props}>{children}</code>
                              ) : (
                                <code className={className} {...props}>{children}</code>
                              )
                            },
                            pre: ({ children }) => <pre className="bg-gray-900 dark:bg-gray-950 text-gray-100 rounded-lg p-4 overflow-x-auto my-5 border border-gray-800 dark:border-gray-700">{children}</pre>,
                            a: ({ children, href }) => <a href={href} className="text-[#6c6ccb] hover:text-[#5c5cbb] font-medium underline underline-offset-2 hover:underline-offset-4 transition-all">{children}</a>,
                            table: ({ children }) => <table className="w-full border-collapse my-5 text-sm">{children}</table>,
                            thead: ({ children }) => <thead className="border-b-2 border-gray-300 dark:border-gray-700">{children}</thead>,
                            th: ({ children }) => <th className="bg-gray-100 dark:bg-gray-800 font-semibold px-4 py-3 text-left text-gray-900 dark:text-gray-200">{children}</th>,
                            td: ({ children }) => <td className="border-b border-gray-200 dark:border-gray-700 px-4 py-3">{children}</td>,
                            tbody: ({ children }) => <tbody className="[&>tr:hover]:bg-gray-50 dark:[&>tr:hover]:bg-gray-800/50">{children}</tbody>,
                            hr: () => <hr className="my-8 border-0 border-t border-gray-300 dark:border-gray-700" />,
                            strong: ({ children }) => <strong className="font-bold text-gray-900 dark:text-gray-100">{children}</strong>,
                            em: ({ children }) => <em className="italic">{children}</em>,
                          }}
                        >
                          {message.content}
                        </ReactMarkdown>
                      </div>
                    </div>
                    
                    {/* Assistant Message Actions */}
                    <div className="absolute -bottom-6 left-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => copyToClipboard(message.content)}
                        className={`p-1 rounded ${settings.darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                        title={t.copy}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
            {isLoading && currentConversationId && loadingConversationIds.has(currentConversationId) && (
              <div className="flex justify-start">
                <div className={`rounded-xl px-3 md:px-4 py-2 md:py-3 shadow-sm border ${
                  settings.darkMode 
                    ? 'bg-gray-800 border-gray-700' 
                    : 'bg-white border-gray-100'
                }`}>
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      <div className="w-1.5 h-1.5 bg-[#6c6ccb] rounded-full animate-bounce" style={{ animationDelay: '0ms', animationDuration: '1s' }}></div>
                      <div className="w-1.5 h-1.5 bg-[#6c6ccb] rounded-full animate-bounce" style={{ animationDelay: '200ms', animationDuration: '1s' }}></div>
                      <div className="w-1.5 h-1.5 bg-[#6c6ccb] rounded-full animate-bounce" style={{ animationDelay: '400ms', animationDuration: '1s' }}></div>
                    </div>
                    <span className={`text-xs font-medium ${settings.darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                      {t.thinking}
                    </span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          </div>
        </div>
        )}

        {/* Input Area */}
        {!isSelectionMode && (
        <div className={`flex-shrink-0 border-t px-3 md:px-6 py-2.5 sm:py-3 md:py-4 safe-area-inset-bottom ${
          settings.darkMode 
            ? 'bg-gray-800 border-gray-700' 
            : 'bg-white border-gray-100'
        }`}>
          <div className="max-w-3xl mx-auto">
            <div className="flex items-end gap-2 sm:gap-3">
              <div className="flex-1 relative">
                <textarea
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={t.typeYourMessage}
                  className={`w-full resize-none border rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 focus:outline-none focus:ring-2 focus:ring-[#6c6ccb]/20 focus:border-[#6c6ccb] transition-all text-sm sm:text-base leading-relaxed ${
                    settings.darkMode
                      ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400'
                      : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400'
                  }`}
                  rows={1}
                  style={{
                    minHeight: '44px',
                    maxHeight: '120px',
                  }}
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement
                    target.style.height = 'auto'
                    target.style.height = `${Math.min(target.scrollHeight, 120)}px`
                  }}
                />
              </div>
              <button
                onClick={handleSend}
                disabled={!inputValue.trim() || !!(currentConversationId && loadingConversationIds.has(currentConversationId))}
                className="flex-shrink-0 bg-[#6c6ccb] hover:bg-[#5c5cbb] text-white rounded-xl font-semibold shadow-md hover:shadow-lg disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 active:scale-95 flex items-center justify-center touch-manipulation"
                style={{
                  width: '44px',
                  height: '44px',
                }}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
            <p className={`text-xs text-center mt-2 hidden sm:block ${
              settings.darkMode ? 'text-gray-500' : 'text-gray-400'
            }`}>
              Press <kbd className={`px-1.5 py-0.5 rounded ${
                settings.darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'
              }`}>Enter</kbd> to send, <kbd className={`px-1.5 py-0.5 rounded ${
                settings.darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'
              }`}>Shift + Enter</kbd> for new line
            </p>
          </div>
        </div>
        )}
      </div>

      {/* Toast Notifications */}
      <div className="fixed bottom-2 right-2 sm:bottom-4 sm:right-4 left-2 sm:left-auto z-50 space-y-2 max-w-[calc(100vw-1rem)] sm:max-w-sm">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg shadow-lg flex items-center gap-2 animate-in slide-in-from-right ${
              toast.type === 'success' 
                ? 'bg-green-500 text-white' 
                : toast.type === 'error'
                  ? 'bg-red-500 text-white'
                  : 'bg-blue-500 text-white'
            }`}
          >
            <span className="text-xs sm:text-sm font-medium flex-1">{toast.message}</span>
            <button
              onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
              className="text-white/80 hover:text-white flex-shrink-0"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-3 sm:p-4" onClick={() => setShowSettings(false)}>
          <div
            className={`rounded-xl sm:rounded-2xl shadow-xl max-w-md w-full p-4 sm:p-6 max-h-[90vh] overflow-y-auto ${
              settings.darkMode ? 'bg-gray-800' : 'bg-white'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className={`text-xl font-bold ${settings.darkMode ? 'text-white' : 'text-gray-900'}`}>
                {t.settings}
              </h2>
              <button
                onClick={() => setShowSettings(false)}
                className={`p-1 rounded-lg ${settings.darkMode ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-100 text-gray-500'}`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="space-y-4">
              {/* Dark Mode Toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <p className={`font-medium ${settings.darkMode ? 'text-white' : 'text-gray-900'}`}>{t.darkMode}</p>
                  <p className={`text-sm ${settings.darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    {t.darkModeDescription}
                  </p>
                </div>
                <button
                  onClick={() => updateSettings({ darkMode: !settings.darkMode })}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    settings.darkMode ? 'bg-[#6c6ccb]' : 'bg-gray-300'
                  }`}
                >
                  <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                    settings.darkMode ? 'translate-x-6' : 'translate-x-0'
                  }`} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

