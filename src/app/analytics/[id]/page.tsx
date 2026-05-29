'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { urlApi } from '@/lib/api'
import { formatNumber, formatDate, getCountryFlag } from '@/lib/utils'
import { isAuthenticated } from '@/lib/auth'
import { ChevronLeft, MousePointerClick, Globe, Smartphone, Monitor, Tablet, Bot, ExternalLink } from 'lucide-react'

interface AnalyticsData {
  urlId: string
  shortCode: string
  customSlug: string | null
  totalClicks: number
  periodClicks: number
  periodUniqueClicks: number
  clicksByDay: { date: string; count: number }[]
  clicksByCountry: { country: string; count: number }[]
  clicksByDevice: { device_type: string; count: number }[]
  clicksByBrowser: { browser: string; count: number }[]
  clicksByOs: { os: string; count: number }[]
  referrers: { referrer_domain: string; count: number }[]
  recentClicks: any[]
}

const deviceIcons: Record<string, any> = {
  desktop: Monitor,
  mobile: Smartphone,
  tablet: Tablet,
  bot: Bot
}

export default function AnalyticsPage() {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [period, setPeriod] = useState('7')
  const params = useParams()
  const router = useRouter()

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/login')
      return
    }
    loadAnalytics()
  }, [params.id, period])

  const loadAnalytics = async () => {
    setIsLoading(true)
    try {
      const data = await urlApi.getAnalytics(params.id as string, { period })
      setAnalytics(data)
    } catch {
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  if (!analytics) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-500">Failed to load analytics</p>
          <Link href="/dashboard" className="text-blue-500 hover:underline mt-2 inline-block">
            Back to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16">
            <Link href="/dashboard" className="flex items-center gap-2 text-slate-500 hover:text-slate-700 transition-colors">
              <ChevronLeft className="w-5 h-5" />
              Back to Dashboard
            </Link>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Link Analytics</h1>
          <div className="flex items-center gap-3">
            <a
              href={`http://localhost:5000/${analytics.customSlug || analytics.shortCode}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline flex items-center gap-1"
            >
              short.link/{analytics.customSlug || analytics.shortCode}
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>

        <div className="flex gap-2 mb-6">
          {['7', '30', '90'].map((days) => (
            <button
              key={days}
              onClick={() => setPeriod(days)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                period === days
                  ? 'bg-blue-500 text-white'
                  : 'bg-white text-slate-700 hover:bg-slate-100'
              }`}
            >
              Last {days} days
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Total Clicks</p>
                <p className="text-3xl font-bold text-slate-900">{formatNumber(analytics.totalClicks)}</p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <MousePointerClick className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Period Clicks</p>
                <p className="text-3xl font-bold text-slate-900">{formatNumber(analytics.periodClicks)}</p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <MousePointerClick className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Unique Clicks</p>
                <p className="text-3xl font-bold text-slate-900">{formatNumber(analytics.periodUniqueClicks)}</p>
              </div>
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <Globe className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Top Countries</h2>
            {analytics.clicksByCountry.length === 0 ? (
              <p className="text-slate-500 text-center py-8">No data available</p>
            ) : (
              <div className="space-y-3">
                {analytics.clicksByCountry.map((item) => (
                  <div key={item.country} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{getCountryFlag(item.country)}</span>
                      <span className="text-slate-700">{item.country}</span>
                    </div>
                    <span className="font-semibold text-slate-900">{formatNumber(item.count)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Devices</h2>
            {analytics.clicksByDevice.length === 0 ? (
              <p className="text-slate-500 text-center py-8">No data available</p>
            ) : (
              <div className="space-y-3">
                {analytics.clicksByDevice.map((item) => {
                  const Icon = deviceIcons[item.device_type] || Monitor
                  return (
                    <div key={item.device_type} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon className="w-5 h-5 text-slate-400" />
                        <span className="text-slate-700 capitalize">{item.device_type}</span>
                      </div>
                      <span className="font-semibold text-slate-900">{formatNumber(item.count)}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Browsers</h2>
            {analytics.clicksByBrowser.length === 0 ? (
              <p className="text-slate-500 text-center py-8">No data available</p>
            ) : (
              <div className="space-y-3">
                {analytics.clicksByBrowser.map((item) => (
                  <div key={item.browser} className="flex items-center justify-between">
                    <span className="text-slate-700">{item.browser}</span>
                    <span className="font-semibold text-slate-900">{formatNumber(item.count)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Operating Systems</h2>
            {analytics.clicksByOs.length === 0 ? (
              <p className="text-slate-500 text-center py-8">No data available</p>
            ) : (
              <div className="space-y-3">
                {analytics.clicksByOs.map((item) => (
                  <div key={item.os} className="flex items-center justify-between">
                    <span className="text-slate-700">{item.os}</span>
                    <span className="font-semibold text-slate-900">{formatNumber(item.count)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {analytics.referrers.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mt-8">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Top Referrers</h2>
            <div className="space-y-3">
              {analytics.referrers.map((item) => (
                <div key={item.referrer_domain} className="flex items-center justify-between">
                  <span className="text-slate-700">{item.referrer_domain}</span>
                  <span className="font-semibold text-slate-900">{formatNumber(item.count)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
