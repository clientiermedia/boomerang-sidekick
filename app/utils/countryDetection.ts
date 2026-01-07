const IPINFO_API_TOKEN = process.env.NEXT_PUBLIC_IPINFO_API_TOKEN || ''
const IPINFO_API_URL = 'https://ipinfo.io/json'

export type CountryCode = string | null

export interface IPInfoResponse {
  ip: string
  country: string
  country_code?: string
  [key: string]: any
}

// Countries that should use Dutch
const DUTCH_COUNTRIES = ['BE', 'NL'] // Belgium, Netherlands

export function shouldUseDutch(countryCode: string | null): boolean {
  if (!countryCode) return false
  return DUTCH_COUNTRIES.includes(countryCode.toUpperCase())
}

export async function detectCountry(retries = 2): Promise<CountryCode> {
  // Check if API token is available
  if (!IPINFO_API_TOKEN) {
    console.warn('IPInfo API token not configured')
    return null
  }
  
  // Create abort controller for timeout
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 5000)
  
  try {
    const response = await fetch(`${IPINFO_API_URL}?token=${IPINFO_API_TOKEN}`, {
      headers: {
        'Accept': 'application/json',
      },
      signal: controller.signal,
    })
    
    clearTimeout(timeoutId)
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    
    const data: IPInfoResponse = await response.json()
    return data.country_code || data.country || null
  } catch (error) {
    clearTimeout(timeoutId)
    
    // Retry logic with exponential backoff
    if (retries > 0 && error instanceof Error && error.name !== 'AbortError') {
      const delay = Math.pow(2, 2 - retries) * 1000 // Exponential backoff: 1s, 2s
      await new Promise(resolve => setTimeout(resolve, delay))
      return detectCountry(retries - 1)
    }
    
    console.warn('Error detecting country:', error)
    return null
  }
}

