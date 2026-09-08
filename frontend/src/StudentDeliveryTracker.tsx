import React, { useEffect, useState } from 'react'
import { api, message } from './api'
import { DeliveryMap } from './DeliveryMap'
import { useAuth } from './auth'

type DeliveryNotification = {
  id: number
  title: string
  message: string
  type: string
  is_read: boolean
  created_at: string
}

type TrackingData = {
  meal_id: number | null
  date: string
  meal_type: 'LUNCH' | 'DINNER'
  delivery_status: 'CONFIRMED' | 'PREPARING' | 'OUT_FOR_DELIVERY' | 'DELIVERED'
  option_name: string
  delivery_address: string | null
  student_lat: number | null
  student_lng: number | null
  kitchen_lat: number
  kitchen_lng: number
  driver_lat: number | null
  driver_lng: number | null
  driver_name: string | null
  driver_phone: string | null
  is_out_for_delivery: boolean
  distance_meters: number | null
  eta_minutes: number | null
  delivered_at: string | null
  notifications: DeliveryNotification[]
}

export function StudentDeliveryTracker({
  mealType = 'LUNCH',
  onLocationUpdated,
}: {
  mealType?: 'LUNCH' | 'DINNER'
  onLocationUpdated?: () => void
}) {
  const { user, refreshUser } = useAuth()
  const [data, setData] = useState<TrackingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [locLoading, setLocLoading] = useState(false)
  const [addressInput, setAddressInput] = useState('')
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')
  const [showCelebration, setShowCelebration] = useState(false)
  const [celebrationSeen, setCelebrationSeen] = useState(false)

  const fetchTracking = async () => {
    try {
      const res = await api.get(`/delivery/track/student?meal_type=${mealType}`)
      const prevStatus = data?.delivery_status
      const newStatus = res.data.delivery_status
      setData(res.data)

      // Trigger celebration when order transitions to DELIVERED or is currently DELIVERED and not yet dismissed
      if (newStatus === 'DELIVERED' && (!celebrationSeen || prevStatus !== 'DELIVERED')) {
        setShowCelebration(true)
      }
    } catch (e) {
      console.error('Tracking fetch error:', e)
    } finally {
      setLoading(false)
    }
  }

  // Poll tracking every 4 seconds for live GPS updates
  useEffect(() => {
    void fetchTracking()
    const timer = setInterval(() => {
      void fetchTracking()
    }, 4000)
    return () => clearInterval(timer)
  }, [mealType])

  useEffect(() => {
    if (user?.delivery_address) {
      setAddressInput(user.delivery_address)
    }
  }, [user?.delivery_address])

  const handleAutoDetectLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.')
      return
    }

    setLocLoading(true)
    setError('')
    setFeedback('📍 Detecting your GPS location…')

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        const currentAddr = addressInput.trim() || user?.delivery_address || `Hostel Campus (${lat.toFixed(4)}, ${lng.toFixed(4)})`

        try {
          await api.post('/delivery/student/location', {
            latitude: lat,
            longitude: lng,
            address: currentAddr,
          })
          setFeedback('✓ Location detected & saved successfully!')
          if (refreshUser) await refreshUser()
          if (onLocationUpdated) onLocationUpdated()
          void fetchTracking()
        } catch (e) {
          setError(message(e))
        } finally {
          setLocLoading(false)
        }
      },
      (err) => {
        setLocLoading(false)
        setError(`Unable to retrieve GPS: ${err.message}. Please enter address manually.`)
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    )
  }

  const handleSaveAddress = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!addressInput.trim()) return

    setLocLoading(true)
    setError('')
    setFeedback('')
    try {
      const lat = user?.latitude || data?.student_lat || 28.6185
      const lng = user?.longitude || data?.student_lng || 77.2130
      await api.post('/delivery/student/location', {
        latitude: lat,
        longitude: lng,
        address: addressInput.trim(),
      })
      setFeedback('✓ Delivery address saved!')
      if (refreshUser) await refreshUser()
      if (onLocationUpdated) onLocationUpdated()
      void fetchTracking()
    } catch (e) {
      setError(message(e))
    } finally {
      setLocLoading(false)
    }
  }

  if (loading && !data) {
    return <div className="loading-state">Loading live delivery status…</div>
  }

  const status = data?.delivery_status || 'CONFIRMED'
  const isOut = data?.is_out_for_delivery || status === 'OUT_FOR_DELIVERY'
  const isDelivered = status === 'DELIVERED'

  return (
    <div className="delivery-tracker-card card">
      {/* DELIVERY ARRIVAL CELEBRATION MODAL */}
      {showCelebration && (
        <div className="celebration-overlay">
          <div className="celebration-modal">
            <div className="celebration-icon">🎉 🍱 🛵</div>
            <h2>Delivery Aa Gaya Hai!</h2>
            <p className="celebration-highlight">
              Your <strong>{data?.meal_type}</strong> meal has just been delivered by the kitchen team!
            </p>
            <p className="celebration-address">
              Delivered at: <strong>{data?.delivery_address || 'Your room / hostel'}</strong>
            </p>
            <div className="celebration-dish">
              <span>Dish: <strong>{data?.option_name}</strong></span>
            </div>
            <button
              type="button"
              className="primary-btn celebration-close-btn"
              onClick={() => {
                setShowCelebration(false)
                setCelebrationSeen(true)
              }}
            >
              ✓ Awesome! Got my food
            </button>
          </div>
        </div>
      )}

      <div className="tracker-header">
        <div className="tracker-header-left">
          <div className="live-pulse-badge">
            <span className="live-dot"></span>
            LIVE TRACKER
          </div>
          <h2>Live Meal Delivery</h2>
          <p className="muted-text">
            Slot: <strong>{data?.meal_type}</strong> • Item: <strong>{data?.option_name}</strong>
          </p>
        </div>

        {isOut && !isDelivered && (
          <div className="eta-badge-pill">
            <span className="eta-time">⏱ ~{data?.eta_minutes || 3} mins</span>
            <span className="eta-dist">
              {data?.distance_meters ? `${data.distance_meters > 1000 ? (data.distance_meters / 1000).toFixed(2) + ' km' : Math.round(data.distance_meters) + ' m'} away` : 'Approaching'}
            </span>
          </div>
        )}

        {isDelivered && (
          <div className="delivered-badge-pill">
            <span>🎉 Food Arrived & Delivered</span>
          </div>
        )}
      </div>

      {/* SWIGGY / DOMINOS STYLE STEPPER */}
      <div className="delivery-stepper">
        <div className={`step-item ${status ? 'completed' : ''}`}>
          <div className="step-circle">1</div>
          <div className="step-content">
            <strong>Order Confirmed</strong>
            <small>Selection recorded</small>
          </div>
        </div>

        <div className={`step-divider ${status === 'PREPARING' || isOut || isDelivered ? 'active' : ''}`} />

        <div className={`step-item ${status === 'PREPARING' || isOut || isDelivered ? 'completed' : ''}`}>
          <div className="step-circle">2</div>
          <div className="step-content">
            <strong>Kitchen Prep</strong>
            <small>Cooking in Central Kitchen</small>
          </div>
        </div>

        <div className={`step-divider ${isOut || isDelivered ? 'active' : ''}`} />

        <div className={`step-item ${isOut || isDelivered ? 'completed current-step' : ''}`}>
          <div className="step-circle">3</div>
          <div className="step-content">
            <strong>Out for Delivery</strong>
            <small>{isOut ? '🛵 Live GPS Moving' : 'Waiting for dispatch'}</small>
          </div>
        </div>

        <div className={`step-divider ${isDelivered ? 'active' : ''}`} />

        <div className={`step-item ${isDelivered ? 'completed' : ''}`}>
          <div className="step-circle">4</div>
          <div className="step-content">
            <strong>Delivered</strong>
            <small>{isDelivered ? '🎉 Received & Enjoy' : 'Destination stop'}</small>
          </div>
        </div>
      </div>

      {/* INTERACTIVE LEAFLET MAP */}
      <div className="tracker-map-box">
        <DeliveryMap
          kitchenLat={data?.kitchen_lat}
          kitchenLng={data?.kitchen_lng}
          driverLat={data?.driver_lat}
          driverLng={data?.driver_lng}
          driverName={data?.driver_name || 'Delivery Partner'}
          studentLat={data?.student_lat}
          studentLng={data?.student_lng}
          studentAddress={data?.delivery_address || 'Your Room/Hostel'}
          height="320px"
          showRouteLine={true}
        />
      </div>

      {/* RIDER & DELIVERY LOCATION BAR */}
      <div className="tracker-footer-grid">
        {/* Rider Card */}
        <div className="rider-card">
          <div className="rider-avatar">🛵</div>
          <div className="rider-info">
            <span className="rider-label">Delivery Partner</span>
            <strong>{data?.driver_name || 'Kitchen Dispatch Team'}</strong>
            <small className="rider-phone">📞 {data?.driver_phone || '+91 9876543210'}</small>
          </div>
          {isOut && !isDelivered && (
            <div className="rider-status-tag">
              <span className="radar-pulse"></span>
              On Route
            </div>
          )}
        </div>

        {/* Student Location Setup / Auto Detect */}
        <div className="location-setup-card">
          <div className="location-setup-header">
            <strong>📍 Delivery Spot & Auto GPS</strong>
            <button
              type="button"
              className="btn-tiny auto-gps-btn"
              onClick={handleAutoDetectLocation}
              disabled={locLoading}
              title="Detect live GPS coordinates automatically"
            >
              {locLoading ? 'Locating…' : '📍 Auto-Detect My GPS'}
            </button>
          </div>

          <form onSubmit={handleSaveAddress} className="location-edit-form">
            <input
              type="text"
              value={addressInput}
              onChange={(e) => setAddressInput(e.target.value)}
              placeholder="e.g. Hostel 3, Room 204 / North Gate"
              className="location-input"
              required
            />
            <button type="submit" className="btn-tiny btn-save-addr" disabled={locLoading}>
              Save
            </button>
          </form>

          {data?.student_lat && data?.student_lng && (
            <span className="coords-text">
              GPS: {data.student_lat.toFixed(4)}, {data.student_lng.toFixed(4)}
            </span>
          )}

          {feedback && <div className="feedback-small success">{feedback}</div>}
          {error && <div className="feedback-small error">{error}</div>}
        </div>
      </div>
    </div>
  )
}
