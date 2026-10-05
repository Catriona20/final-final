import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Platform, Text, ActivityIndicator } from 'react-native';
import { Clinic, LocationCoords } from '../types';
import { useThemeStore } from '../store/useThemeStore';
import { getThemeColors } from '../constants/theme';
import { mapService } from '../services/mapService';

/**
 * ============================================================
 * INTERACTIVE MAP COMPONENT (MapLibre / OpenStreetMap / Leaflet Engine)
 * ============================================================
 *
 * Current Active Provider: MapLibre / OpenStreetMap / CartoDB Tile Stack
 *
 * GOOGLE MAPS IMPLEMENTATION - PRESERVED FOR FUTURE USE:
 * React Native Maps / Google Maps provider implementation preserved in comments below.
 */

interface InteractiveMapProps {
  clinics: Clinic[];
  selectedClinicId: string | null;
  onSelectClinic: (clinic: Clinic) => void;
  centerCoords: LocationCoords;
  showRoute?: boolean;
  searchedLocation?: { name: string; latitude: number; longitude: number } | null;
}

declare global {
  interface Window {
    L: any;
    __onClinicMarkerClick: (clinicId: string) => void;
  }
}

export const InteractiveMap: React.FC<InteractiveMapProps> = ({
  clinics,
  selectedClinicId,
  onSelectClinic,
  centerCoords,
  showRoute = true,
  searchedLocation = null,
}) => {
  const { isDark } = useThemeStore();
  const theme = getThemeColors(isDark);
  const mapContainerId = useRef(`interactive-map-${Math.random().toString(36).substring(7)}`).current;
  const leafletMapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const userMarkerRef = useRef<any>(null);
  const searchMarkerRef = useRef<any>(null);
  const routePolylineRef = useRef<any>(null);
  const routeBadgeMarkerRef = useRef<any>(null);
  const clusterGroupRef = useRef<any>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Global listener for Leaflet HTML marker callbacks
  useEffect(() => {
    if (Platform.OS === 'web') {
      window.__onClinicMarkerClick = (clinicId: string) => {
        const found = clinics.find((c) => c.id === clinicId);
        if (found) {
          onSelectClinic(found);
        }
      };
    }
  }, [clinics, onSelectClinic]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const loadLeaflet = () => {
      if (window.L && window.L.markerClusterGroup) {
        initMap();
        return;
      }

      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link');
        link.id = 'leaflet-css';
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }

      if (!document.getElementById('leaflet-cluster-css')) {
        const clusterCss = document.createElement('link');
        clusterCss.id = 'leaflet-cluster-css';
        clusterCss.rel = 'stylesheet';
        clusterCss.href = 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css';
        document.head.appendChild(clusterCss);

        const clusterDefaultCss = document.createElement('link');
        clusterDefaultCss.id = 'leaflet-cluster-default-css';
        clusterDefaultCss.rel = 'stylesheet';
        clusterDefaultCss.href = 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css';
        document.head.appendChild(clusterDefaultCss);
      }

      if (!document.getElementById('leaflet-custom-styles')) {
        const style = document.createElement('style');
        style.id = 'leaflet-custom-styles';
        style.innerHTML = `
          .leaflet-container {
            width: 100% !important;
            height: 100% !important;
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            bottom: 0 !important;
            background: ${isDark ? '#06152F' : '#F8FAFC'} !important;
          }
          .dark-map-tiles .leaflet-tile {
            filter: brightness(0.6) invert(1) contrast(2.2) hue-rotate(200deg) saturate(0.35);
          }
          .leaflet-top, .leaflet-bottom {
            z-index: 950 !important;
          }
          @keyframes pulse-ring {
            0% { transform: scale(0.6); opacity: 0.9; }
            70% { transform: scale(1.5); opacity: 0; }
            100% { transform: scale(1.5); opacity: 0; }
          }
          .custom-cluster-icon {
            display: flex;
            align-items: center;
            justify-content: center;
          }
        `;
        document.head.appendChild(style);
      }

      const loadClusterScript = () => {
        if (!document.getElementById('leaflet-cluster-js')) {
          const clusterScript = document.createElement('script');
          clusterScript.id = 'leaflet-cluster-js';
          clusterScript.src = 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js';
          clusterScript.async = true;
          clusterScript.onload = () => {
            initMap();
          };
          document.head.appendChild(clusterScript);
        } else {
          initMap();
        }
      };

      if (!document.getElementById('leaflet-js')) {
        const script = document.createElement('script');
        script.id = 'leaflet-js';
        script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        script.async = true;
        script.onload = () => {
          loadClusterScript();
        };
        document.head.appendChild(script);
      } else if (window.L) {
        loadClusterScript();
      }
    };

    const initMap = () => {
      const container = document.getElementById(mapContainerId);
      if (!container || !window.L) return;

      if (!leafletMapRef.current) {
        const map = window.L.map(mapContainerId, {
          center: [centerCoords.latitude, centerCoords.longitude],
          zoom: 13,
          zoomControl: false,
          maxZoom: 19,
          minZoom: 9,
        });

        const tileConfig = mapService.getTileConfig(isDark);
        window.L.tileLayer(tileConfig.tileUrl, {
          maxZoom: tileConfig.maxZoom,
          minZoom: tileConfig.minZoom,
          attribution: tileConfig.attribution,
          className: isDark ? 'dark-map-tiles' : '',
        }).addTo(map);

        window.L.control.zoom({ position: 'topright' }).addTo(map);

        leafletMapRef.current = map;
        setIsLoaded(true);

        if (typeof ResizeObserver !== 'undefined') {
          const ro = new ResizeObserver(() => {
            if (leafletMapRef.current) {
              leafletMapRef.current.invalidateSize();
            }
          });
          ro.observe(container);
        }
      }

      renderMapContent();

      // Crucial: Invalidate size repeatedly so tiles load across entire container
      const currentMap = leafletMapRef.current;
      if (currentMap) {
        currentMap.invalidateSize();
        setTimeout(() => currentMap.invalidateSize(), 50);
        setTimeout(() => currentMap.invalidateSize(), 200);
        setTimeout(() => currentMap.invalidateSize(), 500);
      }
    };

    const renderMapContent = () => {
      const map = leafletMapRef.current;
      if (!map || !window.L) return;

      map.invalidateSize();

      // 1. Clear previous layers & clusters
      markersRef.current.forEach((m) => map.removeLayer(m));
      markersRef.current = [];
      if (clusterGroupRef.current) {
        map.removeLayer(clusterGroupRef.current);
        clusterGroupRef.current = null;
      }
      if (userMarkerRef.current) {
        map.removeLayer(userMarkerRef.current);
      }
      if (searchMarkerRef.current) {
        map.removeLayer(searchMarkerRef.current);
        searchMarkerRef.current = null;
      }
      if (routePolylineRef.current) {
        map.removeLayer(routePolylineRef.current);
        routePolylineRef.current = null;
      }
      if (routeBadgeMarkerRef.current) {
        map.removeLayer(routeBadgeMarkerRef.current);
        routeBadgeMarkerRef.current = null;
      }

      // 2. Add Current User Location Radar Pin
      const userPinHtml = `
        <div style="
          position: relative;
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
        ">
          <div style="
            position: absolute;
            width: 36px;
            height: 36px;
            border-radius: 50%;
            background: rgba(13, 71, 201, 0.25);
            animation: pulse-ring 1.8s infinite;
          "></div>
          <div style="
            width: 18px;
            height: 18px;
            background-color: #0D47C9;
            border: 3px solid #FFFFFF;
            border-radius: 50%;
            box-shadow: 0 0 10px rgba(13, 71, 201, 0.8);
            z-index: 2;
          "></div>
        </div>
      `;
      const userPinIcon = window.L.divIcon({
        html: userPinHtml,
        className: 'user-location-pin',
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });
      userMarkerRef.current = window.L.marker([centerCoords.latitude, centerCoords.longitude], {
        icon: userPinIcon,
        zIndexOffset: 1000,
      }).addTo(map);

      // 2b. Add Searched Location Target Pin if active
      if (searchedLocation && searchedLocation.latitude && searchedLocation.longitude) {
        const searchPinHtml = `
          <div style="
            display: flex;
            align-items: center;
            gap: 6px;
            background: #F59E0B;
            color: #FFFFFF;
            border: 2px solid #FFFFFF;
            padding: 4px 10px;
            border-radius: 16px;
            font-size: 11px;
            font-weight: 800;
            box-shadow: 0 4px 14px rgba(245, 158, 11, 0.6);
            white-space: nowrap;
          ">
            <span>📍</span>
            <span>${searchedLocation.name}</span>
          </div>
        `;
        const searchPinIcon = window.L.divIcon({
          html: searchPinHtml,
          className: 'searched-location-pin',
          iconSize: [120, 28],
          iconAnchor: [60, 14],
        });
        searchMarkerRef.current = window.L.marker([searchedLocation.latitude, searchedLocation.longitude], {
          icon: searchPinIcon,
          zIndexOffset: 950,
        }).addTo(map);
      }

      // 3. Add Clinic Markers (using cluster group where available to prevent visual clutter)
      const selectedClinic = clinics.find((c) => c.id === selectedClinicId);
      const useClustering = typeof window.L.markerClusterGroup === 'function';

      let clusterGroup: any = null;
      if (useClustering) {
        clusterGroup = window.L.markerClusterGroup({
          maxClusterRadius: 45,
          spiderfyOnMaxZoom: true,
          showCoverageOnHover: false,
          iconCreateFunction: (cluster: any) => {
            const count = cluster.getChildCount();
            return window.L.divIcon({
              html: `
                <div style="
                  width: 38px;
                  height: 38px;
                  border-radius: 50%;
                  background: #0D47C9;
                  border: 3px solid #FFFFFF;
                  color: #FFFFFF;
                  font-weight: 800;
                  font-size: 13px;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  box-shadow: 0 4px 14px rgba(13, 71, 201, 0.55);
                ">
                  ${count}
                </div>
              `,
              className: 'clinic-cluster-marker',
              iconSize: [38, 38],
              iconAnchor: [19, 19],
            });
          },
        });
        clusterGroupRef.current = clusterGroup;
      }

      clinics.forEach((clinic) => {
        const lat = clinic.latitude || centerCoords.latitude;
        const lng = clinic.longitude || centerCoords.longitude;
        const isSelected = clinic.id === selectedClinicId;
        const iconEmoji = mapService.getCategoryIcon(clinic.category);

        const markerBg = isSelected ? '#FF8A00' : '#0D47C9';
        const markerBorder = '#FFFFFF';
        const markerSize = isSelected ? 42 : 32;
        const glowStyle = isSelected
          ? 'box-shadow: 0 0 22px rgba(255, 138, 0, 0.95); transform: scale(1.15); z-index: 999;'
          : 'box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);';

        const iconHtml = `
          <div style="
            width: ${markerSize}px;
            height: ${markerSize}px;
            background-color: ${markerBg};
            border: ${isSelected ? '3px' : '2px'} solid ${markerBorder};
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #FFFFFF;
            font-size: ${isSelected ? '18px' : '14px'};
            cursor: pointer;
            transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
            ${glowStyle}
          ">
            ${iconEmoji}
          </div>
        `;

        const customIcon = window.L.divIcon({
          html: iconHtml,
          className: 'clinic-map-pin',
          iconSize: [markerSize, markerSize],
          iconAnchor: [markerSize / 2, markerSize / 2],
        });

        const marker = window.L.marker([lat, lng], {
          icon: customIcon,
          zIndexOffset: isSelected ? 900 : 100,
        });

        marker.on('click', () => {
          if (window.__onClinicMarkerClick) {
            window.__onClinicMarkerClick(clinic.id);
          }
        });

        if (isSelected) {
          // Keep selected marker directly on map with highest visibility
          marker.addTo(map);
          markersRef.current.push(marker);
        } else if (clusterGroup) {
          clusterGroup.addLayer(marker);
        } else {
          marker.addTo(map);
          markersRef.current.push(marker);
        }
      });

      if (clusterGroup) {
        map.addLayer(clusterGroup);
      }

      // 4. Draw Route line and Route Info Badge if a clinic is selected
      if (showRoute && selectedClinic && selectedClinic.latitude && selectedClinic.longitude) {
        const startLat = searchedLocation?.latitude || centerCoords.latitude;
        const startLng = searchedLocation?.longitude || centerCoords.longitude;
        const start = [startLat, startLng];
        const end = [selectedClinic.latitude, selectedClinic.longitude];

        // Smooth curve calculation for road trajectory representation
        const midLat = (start[0] + end[0]) / 2 + 0.0025;
        const midLng = (start[1] + end[1]) / 2 - 0.002;
        const routeCoords = [start, [midLat, midLng], end];

        // Route polyline (strong brand blue)
        const routeStyle = mapService.getRouteStyle(isDark);
        routePolylineRef.current = window.L.polyline(routeCoords, routeStyle).addTo(map);

        // Route Information Badge at path midpoint
        const badgeLabel = mapService.formatRouteBadge(selectedClinic.travelTime, selectedClinic.distance);
        const badgeHtml = `
          <div style="
            background-color: ${isDark ? '#06152F' : '#FFFFFF'};
            color: ${isDark ? '#FFFFFF' : '#0B1736'};
            border: 2px solid #0D47C9;
            border-radius: 20px;
            padding: 4px 10px;
            font-size: 11px;
            font-weight: 800;
            white-space: nowrap;
            box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4);
            display: flex;
            align-items: center;
            gap: 4px;
            pointer-events: none;
            z-index: 850;
          ">
            ${badgeLabel}
          </div>
        `;

        const badgeIcon = window.L.divIcon({
          html: badgeHtml,
          className: 'route-info-badge',
          iconSize: [125, 28],
          iconAnchor: [62, 14],
        });

        routeBadgeMarkerRef.current = window.L.marker([midLat, midLng], {
          icon: badgeIcon,
          zIndexOffset: 850,
        }).addTo(map);

        const bounds = window.L.latLngBounds([start, [midLat, midLng], end]);
        map.fitBounds(bounds, {
          paddingBottomRight: [30, 220],
          paddingTopLeft: [30, 30],
          animate: true,
          maxZoom: 15,
        });
      } else if (selectedClinic && selectedClinic.latitude && selectedClinic.longitude) {
        map.flyTo([selectedClinic.latitude, selectedClinic.longitude], 15, { animate: true, duration: 0.6 });
      } else if (searchedLocation && searchedLocation.latitude && searchedLocation.longitude) {
        map.setView([searchedLocation.latitude, searchedLocation.longitude], 14, { animate: true });
      } else {
        map.setView([centerCoords.latitude, centerCoords.longitude], 13, { animate: true });
      }
    };

    loadLeaflet();
  }, [clinics, selectedClinicId, centerCoords, isDark, showRoute, searchedLocation]);

  useEffect(() => {
    return () => {
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
    };
  }, []);

  if (Platform.OS !== 'web') {
    return (
      <View style={[styles.container, { backgroundColor: theme.backgroundSoft }]}>
        <Text style={[styles.fallbackTitle, { color: theme.textPrimary }]}>📍 Healthcare Map</Text>
        <Text style={[styles.fallbackSub, { color: theme.textMuted }]}>
          {clinics.length} clinics discovered around {centerCoords.latitude.toFixed(2)}, {centerCoords.longitude.toFixed(2)}.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <div
        id={mapContainerId}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: '100%',
          height: '100%',
          zIndex: 1,
        }}
      />
      {!isLoaded && (
        <View style={[styles.loaderOverlay, { backgroundColor: theme.background }]}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
            Loading Healthcare Map...
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  loaderOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    zIndex: 10,
  },
  loadingText: {
    fontSize: 12,
    fontWeight: '600',
  },
  fallbackTitle: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 40,
  },
  fallbackSub: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 6,
    paddingHorizontal: 20,
  },
});

/**
 * ============================================================
 * GOOGLE MAPS IMPLEMENTATION - PRESERVED FOR FUTURE USE
 * ============================================================
 * import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
 *
 * export const GoogleMapsInteractiveView = ({ clinics, centerCoords, selectedClinic }) => {
 *   return (
 *     <MapView
 *       provider={PROVIDER_GOOGLE}
 *       style={{ flex: 1 }}
 *       initialRegion={{
 *         latitude: centerCoords.latitude,
 *         longitude: centerCoords.longitude,
 *         latitudeDelta: 0.05,
 *         longitudeDelta: 0.05,
 *       }}
 *     >
 *       {clinics.map(clinic => (
 *         <Marker
 *           key={clinic.id}
 *           coordinate={{ latitude: clinic.latitude, longitude: clinic.longitude }}
 *           title={clinic.name}
 *           description={clinic.address}
 *         />
 *       ))}
 *     </MapView>
 *   );
 * };
 */
