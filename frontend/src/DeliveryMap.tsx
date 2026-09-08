import React, { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

export type MapStop = {
  id: number | string
  lat: number
  lng: number
  title: string
  subtitle?: string
  status?: 'CONFIRMED' | 'PREPARING' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | string
  isCurrent?: boolean
  stopNumber?: number
}

type DeliveryMapProps = {
  kitchenLat?: number
  kitchenLng?: number
  driverLat?: number | null
  driverLng?: number | null
  driverName?: string
  studentLat?: number | null
  studentLng?: number | null
  studentAddress?: string
  stops?: MapStop[]
  height?: string
  className?: string
  showRouteLine?: boolean
}

export function DeliveryMap({
  kitchenLat = 28.6139,
  kitchenLng = 77.2090,
  driverLat,
  driverLng,
  driverName = 'Delivery Partner',
  studentLat,
  studentLng,
  studentAddress = 'Delivery Location',
  stops,
  height = '360px',
  className = '',
  showRouteLine = true,
}: DeliveryMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)
  const layerGroupRef = useRef<L.LayerGroup | null>(null)

  useEffect(() => {
    if (!mapContainerRef.current) return

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [kitchenLat, kitchenLng],
        zoom: 15,
        zoomControl: true,
        scrollWheelZoom: true,
      })

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map)

      layerGroupRef.current = L.layerGroup().addTo(map)
      mapInstanceRef.current = map
    }

    const map = mapInstanceRef.current
    const layerGroup = layerGroupRef.current
    if (!map || !layerGroup) return

    layerGroup.clearLayers()

    const allPoints: [number, number][] = []

    // 1. Kitchen Marker
    if (kitchenLat && kitchenLng) {
      allPoints.push([kitchenLat, kitchenLng])
      const kitchenIcon = L.divIcon({
        className: 'custom-map-marker kitchen-marker',
        html: `
          <div class="map-pin-badge kitchen-pin">
            <span class="pin-icon">🍳</span>
            <span class="pin-label">Kitchen HQ</span>
          </div>
        `,
        iconSize: [80, 40],
        iconAnchor: [40, 36],
      })

      L.marker([kitchenLat, kitchenLng], { icon: kitchenIcon })
        .bindPopup(`<strong>Central Kitchen HQ</strong><br/><small>Campus Meal Distribution</small>`)
        .addTo(layerGroup)
    }

    // 2. Driver Marker (if driver location exists)
    const hasDriver = driverLat != null && driverLng != null
    if (hasDriver) {
      allPoints.push([driverLat, driverLng])
      const driverIcon = L.divIcon({
        className: 'custom-map-marker driver-marker',
        html: `
          <div class="map-pin-badge driver-pin">
            <div class="pulse-ring"></div>
            <span class="pin-icon">🛵</span>
            <span class="pin-label">${driverName.split(' ')[0]}</span>
          </div>
        `,
        iconSize: [84, 44],
        iconAnchor: [42, 38],
      })

      L.marker([driverLat, driverLng], { icon: driverIcon, zIndexOffset: 1000 })
        .bindPopup(`<strong>🛵 ${driverName}</strong><br/><small>Live GPS Location</small>`)
        .addTo(layerGroup)
    }

    // 3. Single Student Destination (Student view mode)
    if (studentLat != null && studentLng != null) {
      allPoints.push([studentLat, studentLng])
      const studentIcon = L.divIcon({
        className: 'custom-map-marker destination-marker',
        html: `
          <div class="map-pin-badge student-pin">
            <span class="pin-icon">📍</span>
            <span class="pin-label">You</span>
          </div>
        `,
        iconSize: [70, 36],
        iconAnchor: [35, 34],
      })

      L.marker([studentLat, studentLng], { icon: studentIcon })
        .bindPopup(`<strong>Your Delivery Spot</strong><br/><small>${studentAddress}</small>`)
        .addTo(layerGroup)
    }

    // 4. Admin Multiple Stops (Admin Dispatcher view mode)
    if (stops && stops.length > 0) {
      stops.forEach((stop, index) => {
        if (stop.lat == null || stop.lng == null) return
        allPoints.push([stop.lat, stop.lng])

        const isDelivered = stop.status === 'DELIVERED'
        const stopNumber = stop.stopNumber || index + 1

        const stopIcon = L.divIcon({
          className: `custom-map-marker stop-marker ${isDelivered ? 'stop-delivered' : 'stop-pending'}`,
          html: `
            <div class="map-pin-badge stop-pin ${isDelivered ? 'delivered' : 'pending'}">
              <span class="pin-icon">${isDelivered ? '✅' : '📦'}</span>
              <span class="pin-label">#${stopNumber} ${stop.title.split(' ')[0]}</span>
            </div>
          `,
          iconSize: [75, 36],
          iconAnchor: [37, 34],
        })

        L.marker([stop.lat, stop.lng], { icon: stopIcon })
          .bindPopup(`
            <strong>Stop #${stopNumber}: ${stop.title}</strong><br/>
            ${stop.subtitle ? `<small>${stop.subtitle}</small><br/>` : ''}
            <span class="badge ${isDelivered ? 'badge-delivered' : 'badge-pending'}">${isDelivered ? 'Delivered' : 'Pending'}</span>
          `)
          .addTo(layerGroup)
      })
    }

    // 5. Draw Polyline Route if requested
    if (showRouteLine && allPoints.length >= 2) {
      const routePoints = [...allPoints]
      // Add dashed dynamic polyline
      L.polyline(routePoints, {
        color: '#4f46e5',
        weight: 4,
        opacity: 0.8,
        dashArray: '8, 8',
        lineCap: 'round',
      }).addTo(layerGroup)
    }

    // Fit map bounds if points exist
    if (allPoints.length > 0) {
      const bounds = L.latLngBounds(allPoints)
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 })
    }

    setTimeout(() => {
      map.invalidateSize()
    }, 200)
  }, [kitchenLat, kitchenLng, driverLat, driverLng, driverName, studentLat, studentLng, studentAddress, stops, showRouteLine])

  return (
    <div
      ref={mapContainerRef}
      className={`delivery-map-container ${className}`}
      style={{ height, width: '100%', borderRadius: '14px', overflow: 'hidden', zIndex: 1 }}
    />
  )
}
