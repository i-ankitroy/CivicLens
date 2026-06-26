/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { IssueReport, IssueCategory, ReportStatus } from "../types";
import { Filter, MapPin, Navigation } from "lucide-react";

interface CivicMapProps {
  reports: IssueReport[];
  selectedReportId?: string;
  onSelectReport?: (report: IssueReport) => void;
  // If provided, we are in "Placement Mode"
  placementMode?: boolean;
  onLocationSelect?: (lat: number, lng: number) => void;
  initialLat?: number;
  initialLng?: number;
}

export default function CivicMap({
  reports,
  selectedReportId,
  onSelectReport,
  placementMode = false,
  onLocationSelect,
  initialLat = 37.7749, // Default: SF
  initialLng = -122.4194
}: CivicMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersGroupRef = useRef<L.LayerGroup | null>(null);
  const placementMarkerRef = useRef<L.Marker | null>(null);

  // Use refs to prevent stale closure bugs in Leaflet event listeners
  const placementModeRef = useRef(placementMode);
  const onLocationSelectRef = useRef(onLocationSelect);

  useEffect(() => {
    placementModeRef.current = placementMode;
  }, [placementMode]);

  useEffect(() => {
    onLocationSelectRef.current = onLocationSelect;
  }, [onLocationSelect]);

  const [filterCategory, setFilterCategory] = useState<string>("All");
  const [filterStatus, setFilterStatus] = useState<string>("All");
  const [currentLat, setCurrentLat] = useState(initialLat);
  const [currentLng, setCurrentLng] = useState(initialLng);

  const [hoveredCoordKey, setHoveredCoordKey] = useState<string | null>(null);
  const hoverTimeoutRef = useRef<any>(null);

  // Clear any active timeouts on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  // Center on user's current device geolocation
  const handleLocateMe = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setCurrentLat(latitude);
          setCurrentLng(longitude);
          if (mapRef.current) {
            mapRef.current.setView([latitude, longitude], 15);
          }
          if (placementMode && onLocationSelect) {
            onLocationSelect(latitude, longitude);
          }
        },
        (error) => {
          console.error("Error fetching location", error);
        }
      );
    }
  };

  // 1. Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Create Map
    const map = L.map(mapContainerRef.current, {
      center: [currentLat, currentLng],
      zoom: 13,
      zoomControl: true,
    });

    // Add Tile Layer (OpenStreetMap)
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    mapRef.current = map;
    markersGroupRef.current = L.layerGroup().addTo(map);

    // Setup map click in placement mode
    map.on("click", (e: L.LeafletMouseEvent) => {
      if (placementModeRef.current && onLocationSelectRef.current) {
        const { lat, lng } = e.latlng;
        // Instantly move the marker for a snappy UI response
        if (placementMarkerRef.current) {
          placementMarkerRef.current.setLatLng([lat, lng]);
        }
        onLocationSelectRef.current(lat, lng);
      }
    });

    // Run initial locate to center nearby
    handleLocateMe();

    // Recalculate container bounds after mount to ensure accurate click events
    setTimeout(() => {
      map.invalidateSize();
    }, 150);

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // 2. Handle Placement Mode changes (draggable selector pin)
  useEffect(() => {
    if (!mapRef.current || !markersGroupRef.current) return;

    if (placementMode) {
      // Clear reports markers
      markersGroupRef.current.clearLayers();

      // Setup placement marker
      if (placementMarkerRef.current) {
        placementMarkerRef.current.setLatLng([initialLat, initialLng]);
      } else {
        const placementIcon = L.divIcon({
          html: `
            <div class="relative flex items-center justify-center">
              <div class="absolute h-10 w-10 rounded-full bg-[#E76F51]/30 animate-ping"></div>
              <div class="relative bg-[#E76F51] border-2 border-white p-2.5 rounded-full shadow-lg text-white">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-map-pin"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.54 20.193 4 14.993 4 10a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>
              </div>
            </div>
          `,
          className: "placement-marker-icon",
          iconSize: [40, 40],
          iconAnchor: [20, 20]
        });

        const marker = L.marker([initialLat, initialLng], {
          draggable: true,
          icon: placementIcon
        }).addTo(mapRef.current);

        marker.on("dragend", (event) => {
          const m = event.target;
          const position = m.getLatLng();
          if (onLocationSelectRef.current) {
            onLocationSelectRef.current(position.lat, position.lng);
          }
        });

        placementMarkerRef.current = marker;
      }

      mapRef.current.setView([initialLat, initialLng]);
      setTimeout(() => {
        if (mapRef.current) {
          mapRef.current.invalidateSize();
        }
      }, 100);
    } else {
      // Remove placement marker if switching off
      if (placementMarkerRef.current) {
        placementMarkerRef.current.remove();
        placementMarkerRef.current = null;
      }
    }
  }, [placementMode, initialLat, initialLng]);

  // Helper for severity color
  const getSeverityColor = (score: number) => {
    switch (score) {
      case 5: return "#EF4444"; // Urgent - Red
      case 4: return "#F97316"; // Serious - Orange
      case 3: return "#F59E0B"; // Moderate - Yellow
      case 2: return "#3B82F6"; // Minor - Blue
      default: return "#10B981"; // Low - Green
    }
  };

  // 3. Render Issue Pins (with Filters, Grouping and Spiderfying Overlaps)
  useEffect(() => {
    if (placementMode || !mapRef.current || !markersGroupRef.current) return;

    markersGroupRef.current.clearLayers();

    // Filter reports (hide merged duplicates from the map)
    const filteredReports = reports.filter((report) => {
      if (report.isDuplicate) return false;
      const matchCat = filterCategory === "All" || report.category === filterCategory;
      const matchStat = filterStatus === "All" || report.status === filterStatus;
      return matchCat && matchStat;
    });

    // Group reports by exact or near-identical coordinates (5 decimal places, ~1 meter precision)
    const coordinateGroups: { [key: string]: IssueReport[] } = {};
    filteredReports.forEach((report) => {
      const key = `${report.lat.toFixed(5)},${report.lng.toFixed(5)}`;
      if (!coordinateGroups[key]) {
        coordinateGroups[key] = [];
      }
      coordinateGroups[key].push(report);
    });

    // Plot each group
    Object.entries(coordinateGroups).forEach(([key, groupReports]) => {
      const count = groupReports.length;

      if (count === 1) {
        // Normal single marker plotting
        const report = groupReports[0];
        const color = getSeverityColor(report.severityScore);
        const initial = report.category ? report.category.charAt(0) : "I";

        const pinIcon = L.divIcon({
          html: `
            <div style="background-color: ${color}; width: 34px; height: 34px; border-radius: 50%; border: 3px solid white; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 8px rgba(0,0,0,0.25); cursor: pointer; transition: transform 0.15s ease-in-out;" class="hover:scale-110">
              <span style="font-size: 11px; font-weight: 800; color: white; text-transform: uppercase;">${initial}</span>
            </div>
          `,
          className: "report-pin-marker",
          iconSize: [34, 34],
          iconAnchor: [17, 17]
        });

        const marker = L.marker([report.lat, report.lng], { icon: pinIcon });

        // Add Popup
        const popupContent = `
          <div class="p-2 text-slate-800 font-sans max-w-xs">
            <div class="flex items-center justify-between gap-2 border-b pb-1.5 mb-1.5">
              <span class="text-xs font-bold uppercase tracking-wide text-slate-500">${report.category}</span>
              <span class="text-xs font-bold px-1.5 py-0.5 rounded text-white" style="background-color: ${color}">Severity ${report.severityScore}</span>
            </div>
            ${report.photoUrl ? `<img src="${report.photoUrl}" class="w-full h-24 object-cover rounded-lg mb-1.5" />` : ""}
            <p class="text-xs line-clamp-2 text-slate-600 mb-2">${report.description}</p>
            <div class="flex items-center justify-between">
              <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">${report.status}</span>
              <span class="text-[10px] text-slate-400 font-medium">${report.confirmCount} confirmations</span>
            </div>
          </div>
        `;

        marker.bindPopup(popupContent);

        marker.on("click", () => {
          if (onSelectReport) {
            onSelectReport(report);
          }
        });

        markersGroupRef.current?.addLayer(marker);
      } else {
        // Multi-marker coordinate group (spiderfy on hover)
        const isHovered = hoveredCoordKey === key;
        const centerLat = groupReports[0].lat;
        const centerLng = groupReports[0].lng;

        if (isHovered) {
          // Render group in fanned out configuration
          const zoom = mapRef.current ? mapRef.current.getZoom() : 13;
          // Calculate fan radius dynamically so on-screen distance is appropriate at any zoom level
          const radius = 0.0035 / Math.pow(1.5, zoom - 10);

          groupReports.forEach((report, index) => {
            const angle = (index * 2 * Math.PI) / count;
            const fanLat = centerLat + Math.sin(angle) * radius;
            const fanLng = centerLng + Math.cos(angle) * radius;

            const color = getSeverityColor(report.severityScore);
            const initial = report.category ? report.category.charAt(0) : "I";

            const pinIcon = L.divIcon({
              html: `
                <div style="background-color: ${color}; width: 34px; height: 34px; border-radius: 50%; border: 3px solid white; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 10px rgba(0,0,0,0.3); cursor: pointer; transition: transform 0.15s ease-in-out;" class="hover:scale-115">
                  <span style="font-size: 11px; font-weight: 800; color: white; text-transform: uppercase;">${initial}</span>
                </div>
              `,
              className: "report-pin-marker fanned-marker",
              iconSize: [34, 34],
              iconAnchor: [17, 17]
            });

            const marker = L.marker([fanLat, fanLng], { icon: pinIcon });

            const popupContent = `
              <div class="p-2 text-slate-800 font-sans max-w-xs">
                <div class="flex items-center justify-between gap-2 border-b pb-1.5 mb-1.5">
                  <span class="text-xs font-bold uppercase tracking-wide text-slate-500">${report.category}</span>
                  <span class="text-xs font-bold px-1.5 py-0.5 rounded text-white" style="background-color: ${color}">Severity ${report.severityScore}</span>
                </div>
                ${report.photoUrl ? `<img src="${report.photoUrl}" class="w-full h-24 object-cover rounded-lg mb-1.5" />` : ""}
                <p class="text-xs line-clamp-2 text-slate-600 mb-2">${report.description}</p>
                <div class="flex items-center justify-between">
                  <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">${report.status}</span>
                  <span class="text-[10px] text-slate-400 font-medium">${report.confirmCount} confirmations</span>
                </div>
              </div>
            `;

            marker.bindPopup(popupContent);

            marker.on("click", () => {
              if (onSelectReport) {
                onSelectReport(report);
              }
            });

            // Prevent closing the group while the mouse traverses fanned items
            marker.on("mouseover", () => {
              if (hoverTimeoutRef.current) {
                clearTimeout(hoverTimeoutRef.current);
                hoverTimeoutRef.current = null;
              }
              setHoveredCoordKey(key);
            });

            marker.on("mouseout", () => {
              if (hoverTimeoutRef.current) {
                clearTimeout(hoverTimeoutRef.current);
              }
              hoverTimeoutRef.current = setTimeout(() => {
                setHoveredCoordKey(null);
              }, 400);
            });

            // Subtle connecting line from fanned-out pin to the original report location
            const line = L.polyline([[centerLat, centerLng], [fanLat, fanLng]], {
              color: "#E76F51",
              weight: 2,
              dashArray: "4, 4",
              opacity: 0.8
            });

            line.on("mouseover", () => {
              if (hoverTimeoutRef.current) {
                clearTimeout(hoverTimeoutRef.current);
                hoverTimeoutRef.current = null;
              }
              setHoveredCoordKey(key);
            });

            line.on("mouseout", () => {
              if (hoverTimeoutRef.current) {
                clearTimeout(hoverTimeoutRef.current);
              }
              hoverTimeoutRef.current = setTimeout(() => {
                setHoveredCoordKey(null);
              }, 400);
            });

            markersGroupRef.current?.addLayer(line);
            markersGroupRef.current?.addLayer(marker);
          });

          // Draw a small central base ring indicating the exact coordinate
          const centerIcon = L.divIcon({
            html: `
              <div class="relative flex items-center justify-center">
                <div style="height: 12px; width: 12px; border-radius: 50%; background-color: rgba(231, 111, 81, 0.25); border: 1.5px solid #E76F51; display: flex; align-items: center; justify-content: center;">
                  <div style="height: 4px; width: 4px; border-radius: 50%; background-color: #E76F51;"></div>
                </div>
              </div>
            `,
            className: "center-anchor-marker",
            iconSize: [12, 12],
            iconAnchor: [6, 6]
          });
          const centerMarker = L.marker([centerLat, centerLng], { icon: centerIcon });
          markersGroupRef.current?.addLayer(centerMarker);

        } else {
          // Render as a stacked, badges-accented composite marker
          const highestSeverityReport = groupReports.reduce((prev, curr) => 
            curr.severityScore > prev.severityScore ? curr : prev
          , groupReports[0]);

          const color = getSeverityColor(highestSeverityReport.severityScore);
          const initial = highestSeverityReport.category ? highestSeverityReport.category.charAt(0) : "I";

          const pinIcon = L.divIcon({
            html: `
              <div style="background-color: ${color}; width: 34px; height: 34px; border-radius: 50%; border: 3px solid white; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 8px rgba(0,0,0,0.25); cursor: pointer; position: relative; transition: transform 0.15s ease-in-out;" class="hover:scale-110">
                <span style="font-size: 11px; font-weight: 800; color: white; text-transform: uppercase;">${initial}</span>
                <div style="position: absolute; top: -6px; right: -6px; background-color: #E76F51; color: white; border: 1.5px solid white; border-radius: 50%; width: 18px; height: 18px; display: flex; align-items: center; justify-content: center; font-size: 8px; font-weight: 900; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">
                  +${count}
                </div>
              </div>
            `,
            className: "report-pin-marker stacked-marker",
            iconSize: [34, 34],
            iconAnchor: [17, 17]
          });

          const marker = L.marker([centerLat, centerLng], { icon: pinIcon });

          marker.on("mouseover", () => {
            if (hoverTimeoutRef.current) {
              clearTimeout(hoverTimeoutRef.current);
              hoverTimeoutRef.current = null;
            }
            setHoveredCoordKey(key);
          });

          marker.on("mouseout", () => {
            if (hoverTimeoutRef.current) {
              clearTimeout(hoverTimeoutRef.current);
            }
            hoverTimeoutRef.current = setTimeout(() => {
              setHoveredCoordKey(null);
            }, 400);
          });

          marker.on("click", () => {
            if (onSelectReport) {
              onSelectReport(highestSeverityReport);
            }
          });

          markersGroupRef.current?.addLayer(marker);
        }
      }
    });

    // If a report is selected externally, pan to it
    if (selectedReportId) {
      const selected = reports.find(r => r.id === selectedReportId);
      if (selected) {
        mapRef.current.setView([selected.lat, selected.lng], 16);
      }
    }

  }, [reports, filterCategory, filterStatus, selectedReportId, placementMode, hoveredCoordKey]);

  return (
    <div className="relative w-full h-full rounded-3xl overflow-hidden border border-brand-border bg-slate-50 shadow-inner flex flex-col">
      {/* Search / Filter Overlay */}
      {!placementMode && (
        <div className="absolute top-3 left-14 right-4 sm:left-12 sm:right-12 z-[1000] mx-auto max-w-lg bg-white/90 backdrop-blur-md p-2 sm:px-4 sm:py-2.5 rounded-2xl shadow-lg border border-brand-border/60 flex flex-col xs:flex-row gap-2 items-stretch xs:items-center justify-between transition-all duration-300">
          <div className="flex items-center gap-1.5 text-[10px] sm:text-xs text-brand-green font-bold shrink-0">
            <Filter className="h-3.5 w-3.5 text-brand-orange" />
            <span className="uppercase tracking-wider">Map Filters</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5 flex-grow xs:flex-grow-0">
            <select
              id="map-filter-category"
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="text-[10px] sm:text-xs bg-brand-bg border border-brand-border/80 rounded-xl px-1.5 py-1 text-brand-green font-semibold focus:outline-none focus:ring-1 focus:ring-brand-green transition-all"
            >
              <option value="All">All Categories</option>
              <option value="Pothole">Pothole</option>
              <option value="Water Leakage">Water Leakage</option>
              <option value="Streetlight">Streetlight</option>
              <option value="Garbage/Waste">Garbage/Waste</option>
              <option value="Other Infrastructure">Other Infrastructure</option>
            </select>
            <select
              id="map-filter-status"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="text-[10px] sm:text-xs bg-brand-bg border border-brand-border/80 rounded-xl px-1.5 py-1 text-brand-green font-semibold focus:outline-none focus:ring-1 focus:ring-brand-green transition-all"
            >
              <option value="All">All Statuses</option>
              <option value="Reported">Reported</option>
              <option value="Verified">Verified</option>
              <option value="Escalated">Escalated</option>
              <option value="In Progress">In Progress</option>
              <option value="Resolved">Resolved</option>
            </select>
          </div>
        </div>
      )}

      {/* Locate Me button */}
      <button
        id="map-locate-btn"
        type="button"
        onClick={handleLocateMe}
        className="absolute bottom-4 right-4 z-[1000] bg-white p-3 rounded-full shadow-lg border border-brand-border text-brand-green hover:bg-brand-bg transition active:scale-95"
        title="Locate my current position"
      >
        <Navigation className="h-5 w-5" />
      </button>

      {/* Leaflet container */}
      <div ref={mapContainerRef} className="w-full flex-grow z-0 min-h-0 h-full" id="leaflet-map-element" />

      {/* Map Helper overlay for Placement Mode */}
      {placementMode && (
        <div className="absolute bottom-4 left-4 z-[1000] bg-brand-green text-white text-[11px] font-semibold px-3.5 py-2 rounded-xl shadow-lg border border-white/10 flex items-center gap-1.5 animate-bounce">
          <MapPin className="h-3.5 w-3.5 text-brand-orange" />
          <span>Drag pin or click map to set issue coordinates</span>
        </div>
      )}
    </div>
  );
}
