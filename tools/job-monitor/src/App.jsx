import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'

// Hardcoded for local dev - these are project public keys
const SUPABASE_URL = 'https://eidcegehaswbtzrwzvfa.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZGNlZ2VoYXN3YnR6cnd6dmZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzM2NzI0MTksImV4cCI6MjA0OTI0ODQxOX0.4A3T5GLH-1nV0mtT6y-PgYwxOmq1xfchPMlM3W8rFpc'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

const POLL_INTERVAL = 2000

function formatDuration(start, end) {
  const startDate = new Date(start)
  const endDate = end ? new Date(end) : new Date()
  const diff = Math.floor((endDate.getTime() - startDate.getTime()) / 1000)
  
  if (diff < 60) return `${diff}s`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ${diff % 60}s`
  return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`
}

function StatusBadge({ status }) {
  const colors = {
    queued: { bg: '#fef3c7', text: '#92400e', icon: '⏳' },
    in_progress: { bg: '#dbeafe', text: '#1e40af', icon: '🔄' },
    done: { bg: '#d1fae5', text: '#065f46', icon: '✅' },
    failed: { bg: '#fee2e2', text: '#991b1b', icon: '❌' }
  }
  const c = colors[status] || { bg: '#e5e7eb', text: '#374151', icon: '❓' }
  
  return (
    <span className="status-badge" style={{ background: c.bg, color: c.text }}>
      {c.icon} {status}
    </span>
  )
}

function JobCard({ job }) {
  const [expanded, setExpanded] = useState(false)
  const topic = job.payload?.topic || job.payload?.payload?.topic || 'N/A'
  const chIdx = job.payload?.chapterIndex ?? job.payload?.payload?.chapterIndex
  const secIdx = job.payload?.sectionIndex ?? job.payload?.payload?.sectionIndex
  const idx = chIdx !== undefined ? `Ch${chIdx}${secIdx !== undefined ? `.${secIdx}` : ''}` : ''
  const type = job.job_type.replace('book_generate_', '')
  
  return (
    <div className={`job-card ${job.status}`} onClick={() => setExpanded(!expanded)}>
      <div className="job-header">
        <span className="job-type">{type}</span>
        <span className="job-idx">{idx}</span>
        <StatusBadge status={job.status} />
        <span className="job-duration">{formatDuration(job.created_at, job.updated_at)}</span>
      </div>
      <div className="job-topic">{topic}</div>
      {expanded && (
        <div className="job-details">
          <div className="job-id">ID: {job.id}</div>
          {job.error && <div className="job-error">Error: {job.error}</div>}
          <div className="job-created">Created: {new Date(job.created_at).toLocaleString()}</div>
        </div>
      )}
    </div>
  )
}

function StatsBar({ stats }) {
  const total = stats.queued + stats.in_progress + stats.done + stats.failed
  
  return (
    <div className="stats-bar">
      <div className="stat">
        <span className="stat-icon">⏳</span>
        <span className="stat-label">Queued</span>
        <span className="stat-value">{stats.queued}</span>
      </div>
      <div className="stat">
        <span className="stat-icon">🔄</span>
        <span className="stat-label">In Progress</span>
        <span className="stat-value">{stats.in_progress}</span>
      </div>
      <div className="stat">
        <span className="stat-icon">✅</span>
        <span className="stat-label">Done</span>
        <span className="stat-value">{stats.done}</span>
      </div>
      <div className="stat">
        <span className="stat-icon">❌</span>
        <span className="stat-label">Failed</span>
        <span className="stat-value">{stats.failed}</span>
      </div>
      <div className="stat total">
        <span className="stat-label">Total</span>
        <span className="stat-value">{total}</span>
      </div>
    </div>
  )
}

function ProgressRing({ progress }) {
  const circumference = 2 * Math.PI * 45
  const offset = circumference - (progress / 100) * circumference
  
  return (
    <div className="progress-ring-container">
      <svg className="progress-ring" viewBox="0 0 100 100">
        <circle className="progress-ring-bg" cx="50" cy="50" r="45" />
        <circle 
          className="progress-ring-fill" 
          cx="50" cy="50" r="45"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="progress-text">{Math.round(progress)}%</div>
    </div>
  )
}

export default function App() {
  const [jobs, setJobs] = useState([])
  const [stats, setStats] = useState({ queued: 0, in_progress: 0, done: 0, failed: 0 })
  const [lastUpdate, setLastUpdate] = useState(new Date())
  const [filter, setFilter] = useState('all')
  const [bookFilter, setBookFilter] = useState('')

  const fetchJobs = useCallback(async () => {
    try {
      const { data: allJobs, error } = await supabase
        .from('ai_agent_jobs')
        .select('id, job_type, status, created_at, updated_at, payload, error')
        .in('job_type', ['book_generate_chapter', 'book_generate_section', 'book_generate_full'])
        .order('created_at', { ascending: false })
        .limit(100)

      if (error) throw error

      // Calculate stats
      const newStats = {
        queued: allJobs.filter(j => j.status === 'queued').length,
        in_progress: allJobs.filter(j => j.status === 'in_progress').length,
        done: allJobs.filter(j => j.status === 'done').length,
        failed: allJobs.filter(j => j.status === 'failed').length,
      }

      setStats(newStats)
      setJobs(allJobs)
      setLastUpdate(new Date())
    } catch (err) {
      console.error('Fetch error:', err)
    }
  }, [])

  useEffect(() => {
    fetchJobs()
    const interval = setInterval(fetchJobs, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [fetchJobs])

  const filteredJobs = jobs.filter(job => {
    if (filter !== 'all' && job.status !== filter) return false
    if (bookFilter) {
      const topic = job.payload?.topic || job.payload?.payload?.topic || ''
      if (!topic.toLowerCase().includes(bookFilter.toLowerCase())) return false
    }
    return true
  })

  const progress = stats.done + stats.failed > 0 
    ? ((stats.done) / (stats.queued + stats.in_progress + stats.done + stats.failed)) * 100 
    : 0

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <h1>📚 BookGen Monitor</h1>
          <span className="last-update">
            Last update: {lastUpdate.toLocaleTimeString()}
          </span>
        </div>
        <ProgressRing progress={progress} />
      </header>

      <StatsBar stats={stats} />

      <div className="filters">
        <input
          type="text"
          placeholder="Filter by book name..."
          value={bookFilter}
          onChange={(e) => setBookFilter(e.target.value)}
          className="filter-input"
        />
        <div className="filter-buttons">
          {['all', 'queued', 'in_progress', 'done', 'failed'].map(f => (
            <button
              key={f}
              className={`filter-btn ${filter === f ? 'active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'All' : f.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      <div className="job-sections">
        {stats.in_progress > 0 && (
          <section className="job-section active-section">
            <h2>🔄 Active Jobs</h2>
            <div className="job-list">
              {filteredJobs.filter(j => j.status === 'in_progress' || j.status === 'queued').map(job => (
                <JobCard key={job.id} job={job} />
              ))}
            </div>
          </section>
        )}

        <section className="job-section">
          <h2>📋 Recent Jobs</h2>
          <div className="job-list">
            {filteredJobs.slice(0, 30).map(job => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

