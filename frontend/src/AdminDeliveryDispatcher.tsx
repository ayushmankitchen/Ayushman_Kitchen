import React, { useEffect, useState, useRef } from 'react'
import { api, message } from './api'
import { DeliveryMap, type MapStop } from './DeliveryMap'

type DeliveryStop = {
  selection_id: number
  student_id: string
  student_name: string
  student_phone: string | null
  meal_type: 'LUNCH' | 'DINNER'
  option_name: string
  delivery_address: string | null
  delivery_lat: number | null
  delivery_lng: number | null
  delivery_status: 'CONFIRMED' | 'PREPARING' | 'OUT_FOR_DELIVERY' | 'DELIVERED'
  delivered_at: string | null
  distance_meters: number | null
  eta_minutes: number | null
}

type AdminSessionData = {
  session_id: number | null
  date: string
  meal_type: 'LUNCH' | 'DINNER'
  is_active: boolean
  driver_name: string
  driver_phone: string
  current_lat: number
  current_lng: number
  started_at: string | null
  stops: DeliveryStop[]
  total_stops: number
  pending_stops: number
  delivered_stops: number
}

export function AdminDeliveryDispatcher() {
  const [mealType, setMealType] = useState<'LUNCH' | 'DINNER'>('LUNCH')
  const [data, setData] = useState<AdminSessionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')
  const [isBroadcastingGPS, setIsBroadcastingGPS] = useState(false)
  const watchIdRef = useRef<number | null>(null)

  const loadSession = async () => {
    try {
      const res = await api.get(`/delivery/admin/session?meal_type=${mealType}`)
      setData(res.data)
    } catch (e) {
      setError(message(e))
    } finally {
      setLoading(false)
    }
  }

  // Poll for updates every 4 seconds
  useEffect(() => {
    void loadSession()
    const timer = setInterval(() => {
      void loadSession()
    }, 4000)
    return () => clearInterval(timer)
  }, [mealType])

  // Clean up GPS watcher on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
      }
    }
  }, [])

  const handleStartDelivery = async () => {
    setActionLoading(true)
    setError('')
    setFeedback('')
    try {
      const res = await api.post('/delivery/admin/session/start', {
        meal_type: mealType,
        driver_name: 'Kitchen Delivery Partner',
        driver_phone: '+91 9876543210',
        current_lat: data?.current_lat || 28.6139,
        current_lng: data?.current_lng || 77.2090,
      })
      setData(res.data)
      setFeedback('🚀 Delivery run started! All students with confirmed meals are now notified that food is out for delivery.')
    } catch (e) {
      setError(message(e))
    } finally {
      setActionLoading(false)
    }
  }

  const handleStopDelivery = async () => {
    if (!window.confirm('Are you sure you want to end this delivery run?')) return
    setActionLoading(true)
    setError('')
    setFeedback('')
    try {
      await api.post(`/delivery/admin/session/stop?meal_type=${mealType}`)
      setFeedback('Delivery run stopped.')
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        setIsBroadcastingGPS(false)
      }
      void loadSession()
    } catch (e) {
      setError(message(e))
    } finally {
      setActionLoading(false)
    }
  }

  const toggleGPSBroadcast = () => {
    if (isBroadcastingGPS) {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
      setIsBroadcastingGPS(false)
      setFeedback('Live GPS broadcast paused.')
    } else {
      if (!navigator.geolocation) {
        setError('Browser does not support geolocation.')
        return
      }
      setError('')
      setFeedback('📡 Live GPS broadcast active! Updating location every few seconds.')
      setIsBroadcastingGPS(true)

      watchIdRef.current = navigator.geolocation.watchPosition(
        async (pos) => {
          try {
            await api.post(`/delivery/admin/session/location?meal_type=${mealType}`, {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
            })
          } catch (err) {
            console.error('Location broadcast error:', err)
          }
        },
        (err) => {
          console.warn('GPS error:', err.message)
        },
        { enableHighAccuracy: true, maximumAge: 0 }
      )
    }
  }

  // Simulation: Move driver step towards the first pending stop
  const handleSimulateStep = async () => {
    if (!data) return
    const pendingStops = data.stops.filter((s) => s.delivery_status !== 'DELIVERED')
    const target = pendingStops[0]
    if (!target || target.delivery_lat == null || target.delivery_lng == null) {
      setFeedback('All stops have already been delivered!')
      return
    }

    // Move 25% closer to target stop
    const currentLat = data.current_lat
    const currentLng = data.current_lng
    const nextLat = currentLat + (target.delivery_lat - currentLat) * 0.35
    const nextLng = currentLng + (target.delivery_lng - currentLng) * 0.35

    try {
      await api.post(`/delivery/admin/session/location?meal_type=${mealType}`, {
        latitude: nextLat,
        longitude: nextLng,
      })
      setFeedback(`🛵 Rider moved closer to Stop: ${target.student_name}!`)
      void loadSession()
    } catch (e) {
      setError(message(e))
    }
  }

  const handleMarkDelivered = async (selectionId: number, studentName: string) => {
    try {
      await api.post(`/delivery/admin/orders/${selectionId}/deliver`)
      setFeedback(`✓ Marked delivered for ${studentName}! Instant arrival notification dispatched.`)
      void loadSession()
    } catch (e) {
      setError(message(e))
    }
  }

  const mapStops: MapStop[] = (data?.stops || []).map((s, idx) => ({
    id: s.selection_id,
    lat: s.delivery_lat || 28.6185,
    lng: s.delivery_lng || 77.2130,
    title: s.student_name,
    subtitle: `${s.delivery_address || 'Campus'} • ${s.option_name}`,
    status: s.delivery_status,
    stopNumber: idx + 1,
  }))

  const isActive = Boolean(data?.is_active)

  return (
    <div className="admin-delivery-dispatcher">
      <div className="dispatcher-header">
        <div>
          <span className="eyebrow">LIVE DELIVERY & ROUTE DISPATCHER</span>
          <h2>Campus Meal Route Dispatcher</h2>
          <p className="muted-text">
            Start delivery runs ("Out for Delivery"), track the live vehicle GPS, view student route stops, and confirm arrival with 1-click.
          </p>
        </div>

        {/* Slot Selector */}
        <div className="slot-toggle-group">
          <button
            type="button"
            className={`slot-pill ${mealType === 'LUNCH' ? 'active' : ''}`}
            onClick={() => setMealType('LUNCH')}
          >
            ☀️ Lunch Delivery
          </button>
          <button
            type="button"
            className={`slot-pill ${mealType === 'DINNER' ? 'active' : ''}`}
            onClick={() => setMealType('DINNER')}
          >
            🌙 Dinner Delivery
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {feedback && <div className="alert alert-success">{feedback}</div>}

      {/* TRIP STATUS BAR */}
      <div className="trip-control-bar card">
        <div className="trip-status-info">
          <div className="trip-indicator">
            <span className={`status-dot ${isActive ? 'online' : 'offline'}`}></span>
            <div>
              <strong>{isActive ? '🚀 Active Delivery Run (Out For Delivery)' : '⏸️ Delivery Standby / Not Dispatched'}</strong>
              <small>
                {isActive
                  ? `Started at ${data?.started_at ? new Date(data.started_at).toLocaleTimeString() : 'Recently'} • ${data?.pending_stops || 0} stops remaining`
                  : 'Start the run when rider leaves the central kitchen.'}
              </small>
            </div>
          </div>
        </div>

        <div className="trip-actions-row">
          {!isActive ? (
            <button
              type="button"
              className="primary-btn start-run-btn"
              onClick={handleStartDelivery}
              disabled={actionLoading || (data?.total_stops || 0) === 0}
            >
              🚀 Start Delivery Run (Out for Delivery)
            </button>
          ) : (
            <>
              <button
                type="button"
                className={`btn-secondary ${isBroadcastingGPS ? 'btn-active-gps' : ''}`}
                onClick={toggleGPSBroadcast}
                title="Broadcast your device's actual GPS to students"
              >
                {isBroadcastingGPS ? '📡 GPS Broadcasting (ON)' : '📍 Broadcast My GPS'}
              </button>

              <button
                type="button"
                className="btn-secondary simulate-step-btn"
                onClick={handleSimulateStep}
                title="Move rider icon closer to next pending stop"
              >
                ⚡ Move Rider (Simulate Step)
              </button>

              <button
                type="button"
                className="btn-danger stop-run-btn"
                onClick={handleStopDelivery}
                disabled={actionLoading}
              >
                ⏹ Complete / End Run
              </button>
            </>
          )}
        </div>
      </div>

      {/* DISPATCH METRICS */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-icon">🍱</div>
          <div className="stat-meta">
            <span className="stat-title">Total Orders on Route</span>
            <strong className="stat-value">{data?.total_stops || 0}</strong>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">⏳</div>
          <div className="stat-meta">
            <span className="stat-title">Pending Delivery Stops</span>
            <strong className="stat-value">{data?.pending_stops || 0}</strong>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">✅</div>
          <div className="stat-meta">
            <span className="stat-title">Delivered Meals</span>
            <strong className="stat-value">{data?.delivered_stops || 0}</strong>
          </div>
        </div>
      </div>

      {/* INTERACTIVE ROUTE MAP */}
      <div className="card dispatcher-map-card">
        <div className="map-card-header">
          <h3>📍 Live Delivery Route Map (Campus Route)</h3>
          <span className="map-legend-tag">
            🍳 Central Kitchen ➔ 🛵 Moving Rider ➔ 📦 Student Stops (#1, #2, #3)
          </span>
        </div>
        <DeliveryMap
          kitchenLat={28.6139}
          kitchenLng={77.2090}
          driverLat={data?.current_lat}
          driverLng={data?.current_lng}
          driverName={data?.driver_name || 'Kitchen Delivery Rider'}
          stops={mapStops}
          height="380px"
          showRouteLine={true}
        />
      </div>

      {/* STOPS QUEUE TABLE */}
      <div className="card stops-table-card">
        <div className="stops-table-header">
          <h3>📦 Student Delivery Stops Queue ({data?.stops?.length || 0})</h3>
          <p className="muted-text">Sorted by optimal route sequence. Click "Mark Delivered (OK)" when food is delivered.</p>
        </div>

        {(!data?.stops || data.stops.length === 0) ? (
          <div className="empty-stops-box">
            <p>No confirmed meal orders for {mealType} today.</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="custom-table dispatcher-table">
              <thead>
                <tr>
                  <th>Stop #</th>
                  <th>Student Info</th>
                  <th>Meal Choice</th>
                  <th>Delivery Address / Room</th>
                  <th>Distance & ETA</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {data.stops.map((stop, idx) => {
                  const isDelivered = stop.delivery_status === 'DELIVERED'
                  return (
                    <tr key={stop.selection_id} className={isDelivered ? 'row-delivered' : 'row-pending'}>
                      <td>
                        <span className={`stop-number-badge ${isDelivered ? 'badge-done' : 'badge-active'}`}>
                          #{idx + 1}
                        </span>
                      </td>
                      <td>
                        <div className="student-meta-cell">
                          <strong>{stop.student_name}</strong>
                          <small><code>{stop.student_id}</code> {stop.student_phone ? `• ${stop.student_phone}` : ''}</small>
                        </div>
                      </td>
                      <td>
                        <span className="dish-pill">
                          {stop.option_name.toLowerCase().includes('chicken') ? '🍗' : '🥗'} {stop.option_name}
                        </span>
                      </td>
                      <td>
                        <div className="address-meta-cell">
                          <strong>{stop.delivery_address || 'Campus Hostel'}</strong>
                          {stop.delivery_lat && stop.delivery_lng && (
                            <small className="coords-text">
                              ({stop.delivery_lat.toFixed(4)}, {stop.delivery_lng.toFixed(4)})
                            </small>
                          )}
                        </div>
                      </td>
                      <td>
                        {!isDelivered ? (
                          <div className="distance-cell">
                            <span className="dist-val">
                              {stop.distance_meters != null
                                ? stop.distance_meters > 1000
                                  ? `${(stop.distance_meters / 1000).toFixed(2)} km`
                                  : `${Math.round(stop.distance_meters)} m`
                                : '—'}
                            </span>
                            <small className="eta-val">~{stop.eta_minutes || 2} mins</small>
                          </div>
                        ) : (
                          <small className="delivered-timestamp">
                            ✓ Delivered {stop.delivered_at ? new Date(stop.delivered_at).toLocaleTimeString() : ''}
                          </small>
                        )}
                      </td>
                      <td>
                        <span className={`status-pill ${isDelivered ? 'pill-active' : isActive ? 'pill-open' : 'pill-neutral'}`}>
                          {isDelivered ? '✓ Delivered' : isActive ? '🛵 Out for Delivery' : 'Confirmed'}
                        </span>
                      </td>
                      <td>
                        {!isDelivered ? (
                          <button
                            type="button"
                            className="primary-btn btn-mark-ok"
                            onClick={() => handleMarkDelivered(stop.selection_id, stop.student_name)}
                          >
                            ✅ Mark Delivered (OK)
                          </button>
                        ) : (
                          <span className="delivered-check">✓ OK</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
