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

export async function detectCountry(): Promise<CountryCode> {
  try {
    const response = await fetch(`${IPINFO_API_URL}?token=${IPINFO_API_TOKEN}`, {
      headers: {
        'Accept': 'application/json',
      },
    })
    
    if (!response.ok) {
      console.warn('Failed to detect country:', response.status)
      return null
    }
    
    const data: IPInfoResponse = await response.json()
    return data.country_code || data.country || null
  } catch (error) {
    console.warn('Error detecting country:', error)
    return null
  }
}

