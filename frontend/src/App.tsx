import { FormEvent, useEffect, useState, type ReactNode } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { useAuth, type User } from './auth'
import { api, message } from './api'
import { StudentDeliveryTracker } from './StudentDeliveryTracker'
import { AdminDeliveryDispatcher } from './AdminDeliveryDispatcher'
import { NotificationDrawer } from './NotificationDrawer'

type Meal = {
  id: number
  meal_type: 'LUNCH' | 'DINNER'
  meal_option_id: number | null
  status: 'SELECTED' | 'CANCELLED'
  selected_at?: string
  cancelled_at?: string | null
  date?: string
}

type Option = {
  id: number
  name: string
  meal_type: 'LUNCH' | 'DINNER'
  available: boolean
}

type StudentRecord = {
  user: User
  subscription: {
    id: number
    plan: 'STANDARD' | 'PREMIUM'
    start_date: string
    expiry_date: string
    status: 'ACTIVE' | 'EXPIRED' | 'SUSPENDED'
    expiring_soon?: boolean
  } | null
}

type AuditLogItem = {
  id: number
  user_id: number | null
  action: string
  entity_type: string
  entity_id: string
  metadata_?: any
  created_at: string
}

// Window Timing Helpers (Asia/Kolkata IST)
function getISTDate(): Date {
  const now = new Date()
  return new Date(now.getTime() + (now.getTimezoneOffset() + 330) * 60000)
}

function isLunchOpen(): boolean {
  const ist = getISTDate()
  const hours = ist.getHours()
  // Lunch window: 06:00 to 11:00 AM IST
  return hours >= 6 && hours < 11
}

function isDinnerOpen(): boolean {
  const ist = getISTDate()
  const hours = ist.getHours()
  // Dinner window: 16:00 (4 PM) to 19:00 (7 PM) IST
  return hours >= 16 && hours < 19
}

function getTodayIST(): string {
  const ist = getISTDate()
  const year = ist.getFullYear()
  const month = String(ist.getMonth() + 1).padStart(2, '0')
  const day = String(ist.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getFormattedISTTime(): string {
  const ist = getISTDate()
  return ist.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
}

/* =========================================================
   LOGIN & REGISTER COMPONENT
   ========================================================= */
function Login() {
  const { login, register } = useAuth()
  const nav = useNavigate()
  const [tab, setTab] = useState<'login' | 'register'>('login')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const f = new FormData(e.currentTarget)
    try {
      await login(String(f.get('email')), String(f.get('password')))
      nav('/')
    } catch (err) {
      setError(message(err))
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const f = new FormData(e.currentTarget)
    try {
      await register({
        student_id: String(f.get('student_id')),
        name: String(f.get('name')),
        email: String(f.get('email')),
        phone: String(f.get('phone')) || undefined,
        password: String(f.get('password')),
        plan: (f.get('plan') as 'STANDARD' | 'PREMIUM') || 'STANDARD',
      })
      setSuccess('Account created successfully!')
      nav('/')
    } catch (err) {
      setError(message(err))
    } finally {
      setLoading(false)
    }
  }

  const quickLogin = async (email: string, pass: string) => {
    setError('')
    setLoading(true)
    try {
      await login(email, pass)
      nav('/')
    } catch (err) {
      setError(message(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="login-container">
      <div className="login-wrapper">
        <div className="brand-section">
          <div className="brand-badge">
            <span className="logo-icon">AK</span>
            <span className="badge-pill">Campus Dining System</span>
          </div>
          <h1>Ayushman Kitchen</h1>
          <p className="brand-tagline">
            Smart campus dining with automated meal windows (Lunch: 6–11 AM, Dinner: 4–7 PM IST) and customized Veg & Chicken options for Premium subscribers.
          </p>

          <div className="quick-demo-box">
            <div className="quick-demo-header">
              <span className="sparkle">⚡</span>
              <strong>Quick Demo Access (1-Click Sign-in)</strong>
            </div>
            <p className="quick-demo-desc">Click any demo account to log in instantly:</p>
            <div className="demo-buttons-grid">
              <button
                type="button"
                className="demo-btn admin-demo"
                onClick={() => quickLogin('admin@ayushman.kitchen', 'AdminPass123!')}
              >
                <div className="demo-btn-role">👑 Kitchen Admin</div>
                <div className="demo-btn-email">admin@ayushman.kitchen</div>
              </button>

              <button
                type="button"
                className="demo-btn premium-demo"
                onClick={() => quickLogin('student.premium@ayushman.kitchen', 'PremiumPass123!')}
              >
                <div className="demo-btn-role">⭐ Premium Student (Veg / Chicken)</div>
                <div className="demo-btn-email">Priya Patel (STD-2026-002)</div>
              </button>

              <button
                type="button"
                className="demo-btn standard-demo"
                onClick={() => quickLogin('student.standard@ayushman.kitchen', 'StudentPass123!')}
              >
                <div className="demo-btn-role">🍱 Standard Student</div>
                <div className="demo-btn-email">Rahul Sharma (STD-2026-001)</div>
              </button>

              <button
                type="button"
                className="demo-btn expired-demo"
                onClick={() => quickLogin('student.expired@ayushman.kitchen', 'StudentPass123!')}
              >
                <div className="demo-btn-role">⚠️ Expired Student</div>
                <div className="demo-btn-email">Amit Verma (STD-2026-003)</div>
              </button>
            </div>
          </div>
        </div>

        <div className="auth-card">
          <div className="auth-tabs">
            <button
              type="button"
              className={`auth-tab ${tab === 'login' ? 'active' : ''}`}
              onClick={() => { setTab('login'); setError(''); setSuccess('') }}
            >
              Sign In
            </button>
            <button
              type="button"
              className={`auth-tab ${tab === 'register' ? 'active' : ''}`}
              onClick={() => { setTab('register'); setError(''); setSuccess('') }}
            >
              Create Account
            </button>
          </div>

          {error && <div className="alert alert-error">{error}</div>}
          {success && <div className="alert alert-success">{success}</div>}

          {tab === 'login' ? (
            <form onSubmit={handleLogin} className="form-stack">
              <h2>Welcome back</h2>
              <p className="form-subtitle">Enter your credentials to access your meal subscription</p>

              <label className="form-field">
                <span>Email Address</span>
                <input
                  name="email"
                  type="email"
                  placeholder="name@ayushman.kitchen"
                  required
                  defaultValue="admin@ayushman.kitchen"
                />
              </label>

              <label className="form-field">
                <span>Password</span>
                <input
                  name="password"
                  type="password"
                  minLength={8}
                  placeholder="••••••••"
                  required
                  defaultValue="AdminPass123!"
                />
              </label>

              <button type="submit" className="primary-btn" disabled={loading}>
                {loading ? 'Authenticating…' : 'Sign in to Kitchen'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="form-stack">
              <h2>Student Registration</h2>
              <p className="form-subtitle">Enroll with an automatic 30-day active meal plan</p>

              <div className="form-row">
                <label className="form-field">
                  <span>Student ID</span>
                  <input name="student_id" placeholder="e.g. STD-2026-101" required />
                </label>
                <label className="form-field">
                  <span>Full Name</span>
                  <input name="name" placeholder="e.g. Ananya Roy" required />
                </label>
              </div>

              <label className="form-field">
                <span>Email Address</span>
                <input name="email" type="email" placeholder="student@college.edu" required />
              </label>

              <div className="form-row">
                <label className="form-field">
                  <span>Phone Number</span>
                  <input name="phone" type="tel" placeholder="+91 9876543210" />
                </label>
                <label className="form-field">
                  <span>Meal Plan</span>
                  <select name="plan" defaultValue="STANDARD">
                    <option value="STANDARD">Standard Plan (Daily Nutritious Meal)</option>
                    <option value="PREMIUM">Premium Plan (Choice of Veg or Chicken)</option>
                  </select>
                </label>
              </div>

              <label className="form-field">
                <span>Password</span>
                <input name="password" type="password" minLength={8} placeholder="Min 8 characters" required />
              </label>

              <button type="submit" className="primary-btn" disabled={loading}>
                {loading ? 'Creating Account…' : 'Register & Start Subscription'}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  )
}

/* =========================================================
   STUDENT DASHBOARD & MEAL ACTIONS
   ========================================================= */
function MealActionCard({
  type,
  selection,
  plan,
  options,
  onDone,
}: {
  type: 'LUNCH' | 'DINNER'
  selection?: Meal
  plan: string
  options: Option[]
  onDone: () => void
}) {
  const isWindowOpen = type === 'LUNCH' ? isLunchOpen() : isDinnerOpen()
  const windowTime = type === 'LUNCH' ? '06:00 – 11:00 AM IST' : '04:00 – 07:00 PM IST'
  const choices = options.filter((o) => o.meal_type === type && o.available)

  // Default option to first available (e.g. Veg) or match selection
  const [selectedOptionId, setSelectedOptionId] = useState<number | ''>('')
  const [feedback, setFeedback] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (selection?.meal_option_id) {
      setSelectedOptionId(selection.meal_option_id)
    } else if (choices.length > 0) {
      // Find "Veg" option as default
      const vegOpt = choices.find(c => c.name.toLowerCase().includes('veg') && !c.name.toLowerCase().includes('non'))
      setSelectedOptionId(vegOpt ? vegOpt.id : choices[0].id)
    }
  }, [selection, choices.length])

  const handleSelect = async () => {
    setLoading(true)
    setFeedback('')
    try {
      await api.post('/student/meals/select', {
        meal_type: type,
        meal_option_id: plan === 'PREMIUM' && selectedOptionId ? Number(selectedOptionId) : undefined,
      })
      setFeedback('✓ Meal successfully confirmed!')
      onDone()
    } catch (e) {
      setFeedback(message(e))
    } finally {
      setLoading(false)
    }
  }

  const handleChangeChoice = async () => {
    setLoading(true)
    setFeedback('')
    try {
      await api.put('/student/meals/change', {
        meal_type: type,
        meal_option_id: selectedOptionId ? Number(selectedOptionId) : undefined,
      })
      setFeedback('✓ Choice updated!')
      onDone()
    } catch (e) {
      setFeedback(message(e))
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = async () => {
    if (!window.confirm(`Are you sure you want to cancel your ${type.toLowerCase()} for today? Once cancelled, it cannot be re-selected.`)) {
      return
    }
    setLoading(true)
    setFeedback('')
    try {
      await api.post('/student/meals/cancel', {
        meal_type: type,
      })
      setFeedback('Meal cancelled for today.')
      onDone()
    } catch (e) {
      setFeedback(message(e))
    } finally {
      setLoading(false)
    }
  }

  const selectedOptionObj = selection?.meal_option_id ? options.find(o => o.id === selection.meal_option_id) : null
  const isCancelled = selection?.status === 'CANCELLED'
  const isSelected = selection?.status === 'SELECTED'

  return (
    <div className={`meal-card ${isSelected ? 'meal-confirmed' : isCancelled ? 'meal-cancelled-card' : ''}`}>
      <div className="meal-card-top">
        <div className="meal-title-group">
          <h3>{type === 'LUNCH' ? '☀️ Lunch Service' : '🌙 Dinner Service'}</h3>
          <span className="window-time-tag">⏱ Window: {windowTime}</span>
        </div>
        <div className="badge-group">
          <span className={`status-pill ${isWindowOpen ? 'pill-open' : 'pill-closed'}`}>
            {isWindowOpen ? '● Window Open' : '○ Window Closed'}
          </span>
          <span className={`status-pill ${isSelected ? 'pill-active' : isCancelled ? 'pill-cancelled' : 'pill-neutral'}`}>
            {isSelected ? '✓ Confirmed' : isCancelled ? '✗ Cancelled' : 'Not Chosen'}
          </span>
        </div>
      </div>

      {/* STATE 1: MEAL CANCELLED */}
      {isCancelled ? (
        <div className="cancelled-state-box">
          <div className="cancelled-icon">🚫</div>
          <div className="cancelled-text">
            <strong>Cancelled for Today</strong>
            <p>You have cancelled your {type.toLowerCase()} for today. Once cancelled, this meal slot is closed and cannot be re-ordered or modified.</p>
          </div>
        </div>
      ) : isSelected ? (
        /* STATE 2: MEAL CONFIRMED / SELECTED */
        <div className="confirmed-state-box">
          <div className="meal-summary-row">
            <span className="summary-label">Confirmed Selection:</span>
            <strong className="summary-value">
              {plan === 'PREMIUM'
                ? selectedOptionObj?.name || 'Veg / Chicken Selection'
                : 'Standard Campus Meal'}
            </strong>
          </div>

          {plan === 'PREMIUM' && isWindowOpen && choices.length > 0 && (
            <div className="premium-choice-picker">
              <span className="choice-label">Change Choice (Veg or Chicken):</span>
              <div className="choice-chips">
                {choices.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={`choice-chip ${selectedOptionId === opt.id ? 'active' : ''}`}
                    onClick={() => setSelectedOptionId(opt.id)}
                  >
                    {opt.name.toLowerCase().includes('veg') && !opt.name.toLowerCase().includes('chicken') ? '🥗 Veg' : '🍗 Chicken'}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="meal-actions-row">
            {isWindowOpen ? (
              <>
                {plan === 'PREMIUM' && choices.length > 0 && selectedOptionId !== selection.meal_option_id && (
                  <button
                    type="button"
                    className="action-btn change-btn"
                    onClick={handleChangeChoice}
                    disabled={loading}
                  >
                    {loading ? 'Saving…' : 'Save New Choice'}
                  </button>
                )}
                <button
                  type="button"
                  className="action-btn cancel-btn"
                  onClick={handleCancel}
                  disabled={loading}
                >
                  {loading ? 'Cancelling…' : 'Cancel Meal'}
                </button>
              </>
            ) : (
              <p className="window-closed-msg">
                🔒 Modification and cancellation window closed at {type === 'LUNCH' ? '11:00 AM' : '7:00 PM'} IST.
              </p>
            )}
          </div>
        </div>
      ) : (
        /* STATE 3: NOT YET SELECTED */
        <div className="unselected-state-box">
          {isWindowOpen ? (
            <>
              {plan === 'PREMIUM' ? (
                <div className="premium-choice-picker">
                  <span className="choice-label">Select your meal option (Veg or Chicken):</span>
                  <div className="choice-chips">
                    {choices.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        className={`choice-chip ${selectedOptionId === opt.id ? 'active' : ''}`}
                        onClick={() => setSelectedOptionId(opt.id)}
                      >
                        {opt.name.toLowerCase().includes('veg') && !opt.name.toLowerCase().includes('chicken') ? '🥗 Veg' : '🍗 Chicken'}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="standard-plan-desc">Standard nutritious campus meal for today.</p>
              )}

              <button
                type="button"
                className="action-btn confirm-btn"
                onClick={handleSelect}
                disabled={loading || (plan === 'PREMIUM' && !selectedOptionId)}
              >
                {loading
                  ? 'Confirming…'
                  : `Confirm ${type === 'LUNCH' ? 'Lunch' : 'Dinner'}${plan === 'PREMIUM' && selectedOptionId ? ` (${choices.find(c => c.id === selectedOptionId)?.name || 'Option'})` : ''}`}
              </button>
            </>
          ) : (
            <p className="window-closed-msg">
              🔒 Selection window is closed. (Lunch opens 6–11 AM, Dinner opens 4–7 PM IST).
            </p>
          )}
        </div>
      )}

      {feedback && <div className="meal-feedback">{feedback}</div>}
    </div>
  )
}

function StudentDashboard() {
  const { user } = useAuth()
  const [data, setData] = useState<any>(null)
  const [history, setHistory] = useState<Meal[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = async () => {
    try {
      const [todayRes, historyRes] = await Promise.all([
        api.get('/student/meals/today'),
        api.get('/student/meals/history'),
      ])
      setData(todayRes.data)
      setHistory(historyRes.data)
    } catch (e) {
      setError(message(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  if (loading) return <div className="loading-state">Loading meal dashboard…</div>
  if (error) return <div className="alert alert-error">{error}</div>
  if (!data) return <div className="alert alert-error">Unable to load meal information.</div>

  const meals: Meal[] = data.selections || []
  const subStatus = data.subscription_status
  const isSubActive = subStatus === 'ACTIVE'

  return (
    <div className="student-dashboard">
      <header className="page-header">
        <div>
          <span className="eyebrow">CAMPUS DINING • STUDENT PORTAL</span>
          <h1>Welcome, {user?.name}</h1>
          <p className="header-subtitle">
            Student ID: <strong>{user?.student_id}</strong> • Today: <strong>{data.date}</strong> • IST Time: <strong>{getFormattedISTTime()}</strong>
          </p>
        </div>
      </header>

      {!isSubActive && (
        <div className="alert alert-warning">
          <strong>Subscription Notice: </strong>
          Your {data.plan} subscription is currently <strong>{subStatus}</strong>. Meal actions are disabled until renewal. Please contact the kitchen admin.
        </div>
      )}

      {/* SWIGGY / DOMINOS STYLE LIVE DELIVERY TRACKER */}
      <StudentDeliveryTracker
        mealType={isDinnerOpen() ? 'DINNER' : 'LUNCH'}
        onLocationUpdated={load}
      />

      <div className="dashboard-grid">
        {/* Subscription Info Card */}
        <div className="card subscription-summary-card">
          <h2>Subscription Details</h2>
          <div className="sub-badge-row">
            <span className={`plan-badge ${data.plan === 'PREMIUM' ? 'badge-premium' : 'badge-standard'}`}>
              {data.plan} PLAN
            </span>
            <span className={`status-pill ${isSubActive ? 'pill-active' : 'pill-expired'}`}>
              {subStatus}
            </span>
          </div>

          <div className="sub-info-list">
            <div className="info-item">
              <span className="info-label">Plan Benefits</span>
              <span className="info-val">
                {data.plan === 'PREMIUM' ? '🍗 Choice of Veg or Chicken Daily' : '🥗 Standard Nutritious Daily Meal'}
              </span>
            </div>
            <div className="info-item">
              <span className="info-label">Daily Windows</span>
              <span className="info-val">
                Lunch: 6:00 – 11:00 AM IST<br />
                Dinner: 4:00 – 7:00 PM IST
              </span>
            </div>
          </div>
        </div>

        {/* Meal Actions */}
        <div className="card meals-card">
          <h2>Today's Meal Actions</h2>
          {isSubActive ? (
            <div className="meal-actions-stack">
              <MealActionCard
                type="LUNCH"
                selection={meals.find((m) => m.meal_type === 'LUNCH')}
                plan={data.plan}
                options={data.options || []}
                onDone={load}
              />
              <MealActionCard
                type="DINNER"
                selection={meals.find((m) => m.meal_type === 'DINNER')}
                plan={data.plan}
                options={data.options || []}
                onDone={load}
              />
            </div>
          ) : (
            <p className="muted-text">Meal selection actions are locked while your subscription is not active.</p>
          )}
        </div>
      </div>

      {/* Meal History */}
      <div className="card history-card">
        <h2>Recent Meal History</h2>
        {history.length === 0 ? (
          <p className="muted-text">No previous meal selections found.</p>
        ) : (
          <div className="table-responsive">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Meal Slot</th>
                  <th>Status</th>
                  <th>Recorded At</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id}>
                    <td>{h.date}</td>
                    <td><strong>{h.meal_type}</strong></td>
                    <td>
                      <span className={`status-pill ${h.status === 'SELECTED' ? 'pill-active' : 'pill-cancelled'}`}>
                        {h.status === 'SELECTED' ? '✓ Confirmed' : '✗ Cancelled'}
                      </span>
                    </td>
                    <td>{h.selected_at ? new Date(h.selected_at).toLocaleTimeString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

/* =========================================================
   ADMIN DASHBOARD
   ========================================================= */
function AdminDashboard() {
  const [tab, setTab] = useState<'overview' | 'delivery' | 'students' | 'meals' | 'reports' | 'logs'>('overview')
  const [dash, setDash] = useState<any>(null)
  const [students, setStudents] = useState<StudentRecord[]>([])
  const [options, setOptions] = useState<Option[]>([])
  const [logs, setLogs] = useState<AuditLogItem[]>([])
  const [reportData, setReportData] = useState<any>(null)
  const [reportDate, setReportDate] = useState<string>(getTodayIST())
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [showAddStudent, setShowAddStudent] = useState(false)

  const load = async () => {
    try {
      const [a, b, c] = await Promise.all([
        api.get('/admin/dashboard'),
        api.get('/admin/students'),
        api.get('/admin/meal-options'),
      ])
      setDash(a.data)
      setStudents(b.data)
      setOptions(c.data)
    } catch (e) {
      setError(message(e))
    }
  }

  const loadReports = async (dt: string) => {
    try {
      const res = await api.get(`/admin/reports?report_date=${dt}`)
      setReportData(res.data)
    } catch (e) {
      setError(message(e))
    }
  }

  const loadLogs = async () => {
    try {
      const res = await api.get('/admin/audit-logs')
      setLogs(res.data)
    } catch (e) {
      setError(message(e))
    }
  }

  useEffect(() => {
    void load()
    void loadReports(reportDate)
    void loadLogs()
  }, [])

  const handleAddOption = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setFeedback('')
    const f = new FormData(e.currentTarget)
    try {
      await api.post('/admin/meal-options', {
        name: f.get('name'),
        meal_type: f.get('meal_type'),
        available: true,
      })
      setFeedback('Meal option added!')
      e.currentTarget.reset()
      load()
    } catch (e) {
      setError(message(e))
    }
  }

  const toggleOption = async (opt: Option) => {
    try {
      await api.put(`/admin/meal-options/${opt.id}`, {
        name: opt.name,
        meal_type: opt.meal_type,
        available: !opt.available,
      })
      load()
    } catch (e) {
      setError(message(e))
    }
  }

  const handleAddStudent = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setFeedback('')
    setError('')
    const f = new FormData(e.currentTarget)
    try {
      await api.post('/admin/students', {
        student_id: f.get('student_id'),
        name: f.get('name'),
        email: f.get('email'),
        phone: f.get('phone') || undefined,
        password: f.get('password'),
        plan: f.get('plan'),
        start_date: f.get('start_date'),
        expiry_date: f.get('expiry_date'),
      })
      setFeedback('Student created successfully!')
      setShowAddStudent(false)
      load()
    } catch (e) {
      setError(message(e))
    }
  }

  const handleRenewStudent = async (userId: number) => {
    const today = getTodayIST()
    const nextMonth = new Date()
    nextMonth.setDate(nextMonth.getDate() + 30)
    const expiry = nextMonth.toISOString().split('T')[0]
    try {
      await api.post(`/admin/students/${userId}/renew`, {
        start_date: today,
        expiry_date: expiry,
      })
      setFeedback('Subscription renewed for 30 days!')
      load()
    } catch (e) {
      setError(message(e))
    }
  }

  const handleTogglePlan = async (s: StudentRecord) => {
    if (!s.subscription) return
    const newPlan = s.subscription.plan === 'STANDARD' ? 'PREMIUM' : 'STANDARD'
    try {
      await api.put(`/admin/students/${s.user.id}/plan`, { plan: newPlan })
      setFeedback(`Plan updated to ${newPlan}!`)
      load()
    } catch (e) {
      setError(message(e))
    }
  }

  const handleSuspendStudent = async (userId: number) => {
    try {
      await api.post(`/admin/students/${userId}/suspend`)
      setFeedback('Subscription suspended!')
      load()
    } catch (e) {
      setError(message(e))
    }
  }

  const downloadReport = (format: 'pdf' | 'excel') => {
    api
      .get(`/admin/reports/${format}?report_date=${reportDate}`, { responseType: 'blob' })
      .then((res) => {
        const url = window.URL.createObjectURL(new Blob([res.data]))
        const link = document.createElement('a')
        link.href = url
        link.setAttribute('download', `kitchen-report-${reportDate}.${format === 'pdf' ? 'pdf' : 'xlsx'}`)
        document.body.appendChild(link)
        link.click()
        link.remove()
      })
      .catch((err) => setError(message(err)))
  }

  const filteredStudents = students.filter(
    (s) =>
      s.user.name.toLowerCase().includes(search.toLowerCase()) ||
      s.user.student_id.toLowerCase().includes(search.toLowerCase()) ||
      s.user.email.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="admin-dashboard">
      <header className="page-header">
        <div>
          <span className="eyebrow">ADMINISTRATION CONTROL PANEL</span>
          <h1>Kitchen Overview & Operations</h1>
          <p className="header-subtitle">Manage campus dining, meal options (Veg / Chicken), student subscriptions, and daily production reports.</p>
        </div>
      </header>

      {error && <div className="alert alert-error">{error}</div>}
      {feedback && <div className="alert alert-success">{feedback}</div>}

      {/* Admin Nav Tabs */}
      <div className="admin-tabs">
        <button
          type="button"
          className={`tab-btn ${tab === 'overview' ? 'active' : ''}`}
          onClick={() => setTab('overview')}
        >
          📊 Overview
        </button>
        <button
          type="button"
          className={`tab-btn ${tab === 'delivery' ? 'active' : ''}`}
          onClick={() => setTab('delivery')}
        >
          🛵 Live Delivery Run
        </button>
        <button
          type="button"
          className={`tab-btn ${tab === 'students' ? 'active' : ''}`}
          onClick={() => setTab('students')}
        >
          👥 Students ({students.length})
        </button>
        <button
          type="button"
          className={`tab-btn ${tab === 'meals' ? 'active' : ''}`}
          onClick={() => setTab('meals')}
        >
          🍽️ Meal Options ({options.length})
        </button>
        <button
          type="button"
          className={`tab-btn ${tab === 'reports' ? 'active' : ''}`}
          onClick={() => setTab('reports')}
        >
          📑 Daily Headcount Reports
        </button>
        <button
          type="button"
          className={`tab-btn ${tab === 'logs' ? 'active' : ''}`}
          onClick={() => { setTab('logs'); void loadLogs() }}
        >
          📜 Audit Logs
        </button>
      </div>

      {/* OVERVIEW TAB */}
      {tab === 'overview' && (
        <div className="tab-content">
          <div className="stats-row">
            <div className="stat-card">
              <div className="stat-icon">🎓</div>
              <div className="stat-meta">
                <span className="stat-title">Total Enrolled Students</span>
                <strong className="stat-value">{dash?.students ?? '—'}</strong>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon">⚡</div>
              <div className="stat-meta">
                <span className="stat-title">Active Subscriptions</span>
                <strong className="stat-value">{dash?.active_subscriptions ?? '—'}</strong>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon">🍱</div>
              <div className="stat-meta">
                <span className="stat-title">Confirmed Meals Today</span>
                <strong className="stat-value">{dash?.today_confirmed ?? '—'}</strong>
              </div>
            </div>
          </div>

          <div className="grid-2col">
            <div className="card">
              <h2>Quick Operations</h2>
              <div className="quick-actions-grid">
                <button
                  type="button"
                  className="quick-action-card"
                  onClick={() => setTab('delivery')}
                >
                  <span className="qa-icon">🛵</span>
                  <strong>Live Delivery Dispatcher</strong>
                  <span>Start run, GPS route & mark delivered</span>
                </button>
                <button
                  type="button"
                  className="quick-action-card"
                  onClick={() => { setTab('students'); setShowAddStudent(true) }}
                >
                  <span className="qa-icon">➕</span>
                  <strong>Enroll New Student</strong>
                  <span>Assign Standard or Premium plan</span>
                </button>
                <button
                  type="button"
                  className="quick-action-card"
                  onClick={() => setTab('meals')}
                >
                  <span className="qa-icon">🍲</span>
                  <strong>Meal Options (Veg / Chicken)</strong>
                  <span>Manage catalogue dish availability</span>
                </button>
                <button
                  type="button"
                  className="quick-action-card"
                  onClick={() => setTab('reports')}
                >
                  <span className="qa-icon">📥</span>
                  <strong>Export Headcount Report</strong>
                  <span>Download PDF/Excel for kitchen staff</span>
                </button>
              </div>
            </div>

            <div className="card">
              <h2>Live Kitchen Status</h2>
              <div className="kitchen-status-list">
                <div className="status-item">
                  <div className={`status-indicator-dot ${isLunchOpen() ? 'online' : 'offline'}`}></div>
                  <div>
                    <strong>Lunch Window (06:00 – 11:00 AM IST)</strong>
                    <p>{isLunchOpen() ? 'Currently OPEN for lunch selections' : 'Closed for lunch selection (closes at 11:00 AM)'}</p>
                  </div>
                </div>
                <div className="status-item">
                  <div className={`status-indicator-dot ${isDinnerOpen() ? 'online' : 'offline'}`}></div>
                  <div>
                    <strong>Dinner Window (04:00 – 07:00 PM IST)</strong>
                    <p>{isDinnerOpen() ? 'Currently OPEN for dinner selections' : 'Closed for dinner selection (closes at 7:00 PM)'}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DELIVERY TAB */}
      {tab === 'delivery' && (
        <div className="tab-content">
          <AdminDeliveryDispatcher />
        </div>
      )}

      {/* STUDENTS TAB */}
      {tab === 'students' && (
        <div className="tab-content">
          <div className="table-controls">
            <input
              type="text"
              placeholder="Search by student name, email, or ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="search-input"
            />
            <button
              type="button"
              className="primary-btn add-btn"
              onClick={() => setShowAddStudent(!showAddStudent)}
            >
              {showAddStudent ? 'Close Form' : '+ Enroll Student'}
            </button>
          </div>

          {showAddStudent && (
            <div className="card form-modal-card">
              <h2>Enroll New Student</h2>
              <form onSubmit={handleAddStudent} className="form-stack">
                <div className="form-row">
                  <label className="form-field">
                    <span>Student ID</span>
                    <input name="student_id" placeholder="e.g. STD-2026-050" required />
                  </label>
                  <label className="form-field">
                    <span>Full Name</span>
                    <input name="name" placeholder="Student Name" required />
                  </label>
                </div>
                <div className="form-row">
                  <label className="form-field">
                    <span>Email</span>
                    <input name="email" type="email" placeholder="student@ayushman.kitchen" required />
                  </label>
                  <label className="form-field">
                    <span>Phone</span>
                    <input name="phone" placeholder="+91 9876543210" />
                  </label>
                </div>
                <div className="form-row">
                  <label className="form-field">
                    <span>Plan Type</span>
                    <select name="plan" defaultValue="STANDARD">
                      <option value="STANDARD">Standard Plan (Daily Nutritious Meal)</option>
                      <option value="PREMIUM">Premium Plan (Choice of Veg or Chicken)</option>
                    </select>
                  </label>
                  <label className="form-field">
                    <span>Temporary Password</span>
                    <input name="password" type="password" minLength={8} defaultValue="StudentPass123!" required />
                  </label>
                </div>
                <div className="form-row">
                  <label className="form-field">
                    <span>Start Date</span>
                    <input name="start_date" type="date" defaultValue={getTodayIST()} required />
                  </label>
                  <label className="form-field">
                    <span>Expiry Date</span>
                    <input
                      name="expiry_date"
                      type="date"
                      defaultValue={new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]}
                      required
                    />
                  </label>
                </div>
                <button type="submit" className="primary-btn">Create & Activate Subscription</button>
              </form>
            </div>
          )}

          <div className="card">
            <div className="table-responsive">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>ID</th>
                    <th>Plan</th>
                    <th>Expiry</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map((s) => {
                    const sub = s.subscription
                    return (
                      <tr key={s.user.id}>
                        <td>
                          <div className="user-cell">
                            <strong>{s.user.name}</strong>
                            <small>{s.user.email}</small>
                          </div>
                        </td>
                        <td><code>{s.user.student_id}</code></td>
                        <td>
                          <span className={`plan-badge ${sub?.plan === 'PREMIUM' ? 'badge-premium' : 'badge-standard'}`}>
                            {sub?.plan || 'NONE'}
                          </span>
                        </td>
                        <td>{sub?.expiry_date || '—'}</td>
                        <td>
                          <span className={`status-pill ${sub?.status === 'ACTIVE' ? 'pill-active' : sub?.status === 'SUSPENDED' ? 'pill-cancelled' : 'pill-expired'}`}>
                            {sub?.status || 'NO SUB'}
                          </span>
                        </td>
                        <td>
                          <div className="table-actions">
                            <button
                              type="button"
                              className="btn-tiny"
                              title="Toggle Standard/Premium Plan"
                              onClick={() => handleTogglePlan(s)}
                            >
                              Toggle Plan
                            </button>
                            <button
                              type="button"
                              className="btn-tiny btn-renew"
                              title="Renew for 30 days"
                              onClick={() => handleRenewStudent(s.user.id)}
                            >
                              Renew
                            </button>
                            {sub?.status === 'ACTIVE' && (
                              <button
                                type="button"
                                className="btn-tiny btn-suspend"
                                title="Suspend subscription"
                                onClick={() => handleSuspendStudent(s.user.id)}
                              >
                                Suspend
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MEALS TAB */}
      {tab === 'meals' && (
        <div className="tab-content">
          <div className="grid-2col">
            <div className="card">
              <h2>Add Dish Option</h2>
              <form onSubmit={handleAddOption} className="form-stack">
                <label className="form-field">
                  <span>Dish Name</span>
                  <input name="name" placeholder="e.g. Veg or Chicken" required minLength={2} />
                </label>
                <label className="form-field">
                  <span>Meal Slot</span>
                  <select name="meal_type" defaultValue="LUNCH">
                    <option value="LUNCH">Lunch</option>
                    <option value="DINNER">Dinner</option>
                  </select>
                </label>
                <button type="submit" className="primary-btn">Add Option</button>
              </form>
            </div>

            <div className="card">
              <h2>Active Menu Options ({options.length})</h2>
              <div className="options-list">
                {options.map((o) => (
                  <div className="option-row" key={o.id}>
                    <div className="option-meta">
                      <strong>{o.name.toLowerCase().includes('chicken') ? '🍗' : '🥗'} {o.name}</strong>
                      <span className="slot-badge">{o.meal_type}</span>
                    </div>
                    <button
                      type="button"
                      className={`toggle-btn ${o.available ? 'available' : 'disabled'}`}
                      onClick={() => toggleOption(o)}
                    >
                      {o.available ? '✓ Active' : '✗ Disabled'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* REPORTS TAB */}
      {tab === 'reports' && (
        <div className="tab-content">
          <div className="card">
            <div className="reports-header-bar">
              <div>
                <h2>Daily Meal Preparation Report</h2>
                <p className="muted-text">Live headcounts for kitchen staff preparation based on confirmed student selections.</p>
              </div>

              <div className="report-controls">
                <input
                  type="date"
                  value={reportDate}
                  onChange={(e) => {
                    setReportDate(e.target.value)
                    void loadReports(e.target.value)
                  }}
                  className="date-input"
                />
                <button type="button" className="btn-secondary" onClick={() => downloadReport('pdf')}>
                  📄 Export PDF
                </button>
                <button type="button" className="btn-secondary" onClick={() => downloadReport('excel')}>
                  📊 Export Excel
                </button>
              </div>
            </div>

            <div className="report-summary-box">
              <h3>Headcount Breakdown for {reportDate}</h3>
              {reportData?.items?.length === 0 ? (
                <p className="muted-text">No confirmed meal selections recorded for {reportDate}.</p>
              ) : (
                <div className="table-responsive">
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>Meal Slot</th>
                        <th>Option / Dish</th>
                        <th>Confirmed Student Headcount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData?.items?.map((item: any, idx: number) => (
                        <tr key={idx}>
                          <td><strong>{item.meal_type}</strong></td>
                          <td>{item.meal}</td>
                          <td><strong className="count-badge">{item.count} meals</strong></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* LOGS TAB */}
      {tab === 'logs' && (
        <div className="tab-content">
          <div className="card">
            <h2>Kitchen Audit Trail</h2>
            <div className="table-responsive">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Action</th>
                    <th>Entity</th>
                    <th>Entity ID</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.slice(0, 50).map((log) => (
                    <tr key={log.id}>
                      <td><small>{new Date(log.created_at).toLocaleString()}</small></td>
                      <td><code>{log.action}</code></td>
                      <td>{log.entity_type}</td>
                      <td>{log.entity_id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* =========================================================
   MAIN APP LAYOUT & ROUTES
   ========================================================= */
function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth()

  return (
    <div className="app-shell">
      <nav className="top-nav">
        <div className="nav-brand">
          <div className="nav-logo">AK</div>
          <div className="nav-title-group">
            <span className="nav-title">Ayushman Kitchen</span>
            <span className="nav-subtitle">Campus Dining Portal</span>
          </div>
        </div>

        <div className="nav-spacer" />

        <NotificationDrawer />

        <div className="nav-user-meta">
          <div className="user-text">
            <strong>{user?.name}</strong>
            <span className="role-tag">{user?.role}</span>
          </div>
          <button type="button" className="signout-btn" onClick={() => logout()}>
            Sign out
          </button>
        </div>
      </nav>

      <main className="main-content">{children}</main>
    </div>
  )
}

function Protected() {
  const { user, loading } = useAuth()
  if (loading) return <div className="app-loading">Loading Ayushman Kitchen…</div>
  if (!user) return <Navigate to="/login" replace />

  return (
    <Layout>
      {user.role === 'ADMIN' ? <AdminDashboard /> : <StudentDashboard />}
    </Layout>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/*" element={<Protected />} />
    </Routes>
  )
}
