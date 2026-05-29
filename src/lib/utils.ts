import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M'
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K'
  }
  return num.toString()
}

export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

export function formatDateTime(date: string | Date): string {
  return new Date(date).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function truncateUrl(url: string, maxLength: number = 50): string {
  if (url.length <= maxLength) return url
  return url.substring(0, maxLength) + '...'
}

export function copyToClipboard(text: string): Promise<boolean> {
  return new Promise((resolve) => {
    navigator.clipboard.writeText(text).then(() => resolve(true)).catch(() => resolve(false))
  })
}

export function getCountryFlag(countryCode: string): string {
  const flags: Record<string, string> = {
    US: '🇺🇸', GB: '🇬🇧', DE: '🇩🇪', FR: '🇫🇷', TR: '🇹🇷',
    CA: '🇨🇦', AU: '🇦🇺', JP: '🇯🇵', CN: '🇨🇳', IN: '🇮🇳',
    BR: '🇧🇷', RU: '🇷🇺', KR: '🇰🇷', IT: '🇮🇹', ES: '🇪🇸',
    NL: '🇳🇱', SE: '🇸🇪', NO: '🇳🇴', DK: '🇩🇰', FI: '🇫🇮',
    PL: '🇵🇱', CZ: '🇨🇿', AT: '🇦🇹', CH: '🇨🇭', BE: '🇧🇪'
  }
  return flags[countryCode] || '🌍'
}
