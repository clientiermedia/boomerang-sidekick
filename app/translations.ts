export type Language = 'en' | 'nl'

export const translations = {
  en: {
    // UI Labels
    newChat: 'New Chat',
    conversations: 'Conversations',
    settings: 'Settings',
    archive: 'Archive',
    delete: 'Delete',
    cancel: 'Cancel',
    selectMultiple: 'Select Multiple',
    selectAll: 'Select All',
    deselectAll: 'Deselect All',
    export: 'Export',
    
    // Search
    searchConversations: 'Search conversations...',
    searchMessages: 'Search messages...',
    noConversationsFound: 'No conversations found',
    noConversationsYet: 'No conversations yet',
    
    // Selection Mode
    conversationsSelected: (count: number) => `${count} conversation${count !== 1 ? 's' : ''} selected`,
    
    // Messages
    thinking: 'Thinking...',
    loadingConversation: 'Loading conversation...',
    typeYourMessage: 'Type your message...',
    pressEnterToSend: 'Press',
    shiftEnterForNewLine: 'for new line',
    enterToSend: 'to send',
    
    // Suggested Questions
    suggestedQuestions: 'Suggested questions:',
    question1: 'What is the Boomerang Collective?',
    question2: 'How do Boomerang meetings work?',
    question3: 'What training resources are available?',
    question4: 'How can I join the Collective?',
    
    // Initial Message
    initialMessage: "Hi, I'm Boomerang Sidekick. I can help you understand Boomerang training, meetings, and how the Collective works.",
    
    // Actions
    copy: 'Copy',
    edit: 'Edit',
    save: 'Save',
    deleteMessage: 'Delete',
    
    // Role names for export
    you: 'You',
    boomerangSidekick: 'Boomerang Sidekick',
    
    // Confirmations
    deleteConversationConfirm: 'Are you sure you want to delete this conversation?',
    deleteMessageConfirm: 'Delete this message?',
    deleteBulkConfirm: (count: number) => `Are you sure you want to delete ${count} conversation(s)?`,
    
    // Toasts
    copiedToClipboard: 'Copied to clipboard!',
    failedToCopy: 'Failed to copy',
    conversationDeleted: 'Conversation deleted',
    messageDeleted: 'Message deleted',
    messageUpdated: 'Message updated',
    pinned: 'Pinned',
    unpinned: 'Unpinned',
    archived: 'Archived',
    unarchived: 'Unarchived',
    noConversationsSelected: 'No conversations selected',
    conversationsDeleted: (count: number) => `${count} conversation(s) deleted`,
    conversationsArchived: (count: number) => `${count} conversation(s) archived`,
    conversationExported: 'Conversation exported',
    
    // Time
    justNow: 'Just now',
    minutesAgo: (mins: number) => `${mins}m ago`,
    hoursAgo: (hours: number) => `${hours}h ago`,
    daysAgo: (days: number) => `${days}d ago`,
    
    // Settings
    darkMode: 'Dark Mode',
    darkModeDescription: 'Switch between light and dark theme',
    
    // Errors
    errorSendingMessage: 'Sorry, there was an error processing your request. Please try again.',
    networkError: 'Network error. Please check your connection and try again.',
    webhookNotFound: 'Webhook not found. Please check the webhook URL configuration.',
    authError: 'Authentication error. Please check webhook permissions.',
    serverError: 'Server error. The n8n workflow may have an issue. Check the browser console for details.',
    serverErrorWithCode: (code: string) => `Server error (${code}). Check the browser console (F12) for details.`,
    
    // Fallback
    newConversation: 'New Conversation',
  },
  nl: {
    // UI Labels
    newChat: 'Nieuwe Chat',
    conversations: 'Gesprekken',
    settings: 'Instellingen',
    archive: 'Archiveren',
    delete: 'Verwijderen',
    cancel: 'Annuleren',
    selectMultiple: 'Meerdere Selecteren',
    selectAll: 'Alles Selecteren',
    deselectAll: 'Alles Deselecteren',
    export: 'Exporteren',
    
    // Search
    searchConversations: 'Zoek gesprekken...',
    searchMessages: 'Zoek berichten...',
    noConversationsFound: 'Geen gesprekken gevonden',
    noConversationsYet: 'Nog geen gesprekken',
    
    // Selection Mode
    conversationsSelected: (count: number) => `${count} gesprek${count !== 1 ? 'ken' : ''} geselecteerd`,
    
    // Messages
    thinking: 'Denken...',
    loadingConversation: 'Gesprek laden...',
    typeYourMessage: 'Typ je bericht...',
    pressEnterToSend: 'Druk op',
    shiftEnterForNewLine: 'voor nieuwe regel',
    enterToSend: 'om te verzenden',
    
    // Suggested Questions
    suggestedQuestions: 'Voorgestelde vragen:',
    question1: 'Wat is het Boomerang Collectief?',
    question2: 'Hoe werken Boomerang vergaderingen?',
    question3: 'Welke trainingsbronnen zijn beschikbaar?',
    question4: 'Hoe kan ik meedoen aan het Collectief?',
    
    // Initial Message
    initialMessage: 'Hoi, ik ben Boomerang Sidekick. Ik kan je helpen om Boomerang training, vergaderingen en hoe het Collectief werkt te begrijpen.',
    
    // Actions
    copy: 'Kopiëren',
    edit: 'Bewerken',
    save: 'Opslaan',
    deleteMessage: 'Verwijderen',
    
    // Role names for export
    you: 'Jij',
    boomerangSidekick: 'Boomerang Sidekick',
    
    // Confirmations
    deleteConversationConfirm: 'Weet je zeker dat je dit gesprek wilt verwijderen?',
    deleteMessageConfirm: 'Dit bericht verwijderen?',
    deleteBulkConfirm: (count: number) => `Weet je zeker dat je ${count} gesprek${count !== 1 ? 'ken' : ''} wilt verwijderen?`,
    
    // Toasts
    copiedToClipboard: 'Gekopieerd naar klembord!',
    failedToCopy: 'Kopiëren mislukt',
    conversationDeleted: 'Gesprek verwijderd',
    messageDeleted: 'Bericht verwijderd',
    messageUpdated: 'Bericht bijgewerkt',
    pinned: 'Vastgezet',
    unpinned: 'Losgemaakt',
    archived: 'Gearchiveerd',
    unarchived: 'Gedearchiveerd',
    noConversationsSelected: 'Geen gesprekken geselecteerd',
    conversationsDeleted: (count: number) => `${count} gesprek${count !== 1 ? 'ken' : ''} verwijderd`,
    conversationsArchived: (count: number) => `${count} gesprek${count !== 1 ? 'ken' : ''} gearchiveerd`,
    conversationExported: 'Gesprek geëxporteerd',
    
    // Time
    justNow: 'Zojuist',
    minutesAgo: (mins: number) => `${mins} min geleden`,
    hoursAgo: (hours: number) => `${hours} u geleden`,
    daysAgo: (days: number) => `${days} d geleden`,
    
    // Settings
    darkMode: 'Donkere Modus',
    darkModeDescription: 'Schakel tussen licht en donker thema',
    
    // Errors
    errorSendingMessage: 'Sorry, er is een fout opgetreden bij het verwerken van je verzoek. Probeer het opnieuw.',
    networkError: 'Netwerkfout. Controleer je verbinding en probeer het opnieuw.',
    webhookNotFound: 'Webhook niet gevonden. Controleer de webhook URL configuratie.',
    authError: 'Authenticatiefout. Controleer de webhook rechten.',
    serverError: 'Serverfout. De n8n workflow heeft mogelijk een probleem. Controleer de browser console voor details.',
    serverErrorWithCode: (code: string) => `Serverfout (${code}). Controleer de browser console (F12) voor details.`,
    
    // Fallback
    newConversation: 'Nieuw Gesprek',
  },
} as const

export type TranslationKey = keyof typeof translations.en

