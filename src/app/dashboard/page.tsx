'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { urlApi, dashboardApi, authApi } from '@/lib/api'
import { formatNumber, formatDate, truncateUrl, copyToClipboard } from '@/lib/utils'
import { isAuthenticated, removeToken } from '@/lib/auth'
import { Link2, Copy, Check, BarChart3, Globe, ExternalLink, Trash2, Plus, LogOut, MousePointerClick, TrendingUp, Calendar } from 'lucide-react'

interface Url {
  id: string
  original_url: string
  short_code: string
  custom_slug: string | null
  title: string | null
  clicks: number
  unique_clicks: number
  created_at: string
}

interface Stats {
  totalUrls: number
  totalClicks: number
  urlsLast24h: number
  clicksLast24h: number
  topUrls: Url[]
  recentUrls: Url[]
  clicksByDay: { date: string; count: number }[]
}

export default function DashboardPage() {
  const [urls, setUrls] = useState<Url[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const router = useRouter()

  const [newUrl, setNewUrl] = useState({
    originalUrl: '',
    customSlug: '',
    title: ''
  })

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/login')
      return
    }
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [urlsData, statsData] = await Promise.all([
        urlApi.getAll(),
        dashboardApi.getStats()
      ])
      setUrls(urlsData.urls)
      setStats(statsData)
    } catch {
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await urlApi.create({
        originalUrl: newUrl.originalUrl,
        customSlug: newUrl.customSlug || undefined,
        title: newUrl.title || undefined
      })
      setShowCreateModal(false)
      setNewUrl({ originalUrl: '', customSlug: '', title: '' })
      loadData()
    } catch {
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this URL?')) return
    try {
      await urlApi.delete(id)
      loadData()
    } catch {
    }
  }

  const handleCopy = async (shortUrl: string, id: string) => {
    const success = await copyToClipboard(shortUrl)
    if (success) {
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    }
  }

  const handleLogout = () => {
    removeToken()
    router.push('/')
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
                <Link2 className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold text-slate-900">ShortLink</span>
            </Link>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setShowCreateModal(true)}
                className="bg-blue-500 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-600 transition-colors flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                New Link
              </button>
              <button
                onClick={handleLogout}
                className="text-slate-500 hover:text-slate-700 transition-colors"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Total URLs</p>
                <p className="text-2xl font-bold text-slate-900">{formatNumber(stats?.totalUrls || 0)}</p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <Link2 className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Total Clicks</p>
                <p className="text-2xl font-bold text-slate-900">{formatNumber(stats?.totalClicks || 0)}</p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <MousePointerClick className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">New URLs (24h)</p>
                <p className="text-2xl font-bold text-slate-900">{formatNumber(stats?.urlsLast24h || 0)}</p>
              </div>
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <Calendar className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Clicks (24h)</p>
                <p className="text-2xl font-bold text-slate-900">{formatNumber(stats?.clicksLast24h || 0)}</p>
              </div>
              <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-orange-600" />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          <div className="p-6 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Your Links</h2>
            <span className="text-sm text-slate-500">{urls.length} total</span>
          </div>
          
          {urls.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Link2 className="w-8 h-8 text-slate-400" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">No links yet</h3>
              <p className="text-slate-500 mb-4">Create your first shortened URL</p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="bg-blue-500 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-600 transition-colors"
              >
                Create Link
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {urls.map((url) => (
                <div key={url.id} className="p-6 hover:bg-slate-50 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <a
                          href={`http://localhost:5000/${url.custom_slug || url.short_code}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-blue-600 hover:underline flex items-center gap-1"
                        >
                          short.link/{url.custom_slug || url.short_code}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                        <button
                          onClick={() => handleCopy(`http://localhost:5000/${url.custom_slug || url.short_code}`, url.id)}
                          className="text-slate-400 hover:text-slate-600"
                        >
                          {copiedId === url.id ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                        </button>
                      </div>
                      <p className="text-sm text-slate-500 truncate">{truncateUrl(url.original_url, 60)}</p>
                      {url.title && <p className="text-sm font-medium text-slate-700 mt-1">{url.title}</p>}
                      <div className="flex items-center gap-4 mt-3 text-sm text-slate-500">
                        <span className="flex items-center gap-1">
                          <MousePointerClick className="w-4 h-4" />
                          {formatNumber(url.clicks)} clicks
                        </span>
                        <span>{formatDate(url.created_at)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <Link
                        href={`/analytics/${url.id}`}
                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        <BarChart3 className="w-5 h-5" />
                      </Link>
                      <button
                        onClick={() => handleDelete(url.id)}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-4">Create New Link</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Original URL</label>
                <input
                  type="url"
                  value={newUrl.originalUrl}
                  onChange={(e) => setNewUrl({ ...newUrl, originalUrl: e.target.value })}
                  required
                  className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  placeholder="https://example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Custom Slug (optional)</label>
                <input
                  type="text"
                  value={newUrl.customSlug}
                  onChange={(e) => setNewUrl({ ...newUrl, customSlug: e.target.value })}
                  className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  placeholder="my-link"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Title (optional)</label>
                <input
                  type="text"
                  value={newUrl.title}
                  onChange={(e) => setNewUrl({ ...newUrl, title: e.target.value })}
                  className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  placeholder="My Link"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 px-4 py-3 border border-slate-200 rounded-lg font-medium hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-blue-500 text-white px-4 py-3 rounded-lg font-medium hover:bg-blue-600 transition-colors"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
