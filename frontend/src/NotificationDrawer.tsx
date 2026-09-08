import React, { useEffect, useState, useRef } from 'react'
import { api } from './api'

type Notification = {
  id: number
  title: string
  message: string
  type: string
  is_read: boolean
  created_at: string
}

export function NotificationDrawer() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const fetchNotifications = async () => {
    try {
      const res = await api.get('/delivery/notifications')
      setNotifications(res.data || [])
    } catch (e) {
      console.error('Notification error:', e)
    }
  }

  useEffect(() => {
    void fetchNotifications()
    const timer = setInterval(() => {
      void fetchNotifications()
    }, 5000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const markAllRead = async () => {
    try {
      await api.post('/delivery/notifications/mark-read')
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
    } catch (e) {
      console.error(e)
    }
  }

  const unreadCount = notifications.filter((n) => !n.is_read).length

  return (
    <div className="notification-wrapper" ref={menuRef}>
      <button
        type="button"
        className={`notification-bell-btn ${unreadCount > 0 ? 'has-unread' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        title="Delivery Notifications"
      >
        <span className="bell-icon">🔔</span>
        {unreadCount > 0 && <span className="unread-badge">{unreadCount}</span>}
      </button>

      {isOpen && (
        <div className="notification-dropdown">
          <div className="notification-header">
            <strong>Delivery Alerts & Updates</strong>
            {unreadCount > 0 && (
              <button type="button" className="btn-mark-read" onClick={markAllRead}>
                Mark read
              </button>
            )}
          </div>

          <div className="notification-list">
            {notifications.length === 0 ? (
              <div className="notification-empty">No delivery alerts yet.</div>
            ) : (
              notifications.map((n) => (
                <div key={n.id} className={`notification-item ${n.is_read ? 'read' : 'unread'}`}>
                  <div className="notif-icon">
                    {n.type === 'DELIVERED' ? '🎉' : n.type === 'OUT_FOR_DELIVERY' ? '🛵' : 'ℹ️'}
                  </div>
                  <div className="notif-body">
                    <strong>{n.title}</strong>
                    <p>{n.message}</p>
                    <small>{new Date(n.created_at).toLocaleTimeString()}</small>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
