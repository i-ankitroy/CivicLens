/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from "react";
import { IssueReport, ReportStatus, IssueCategory } from "../types";
import { 
  TrendingUp, 
  CheckCircle, 
  Clock, 
  MapPin, 
  Search, 
  BarChart2, 
  AlertOctagon, 
  Loader2,
  Calendar
} from "lucide-react";

interface DashboardProps {
  reports: IssueReport[];
  onSelectReport: (report: IssueReport) => void;
  isAdmin?: boolean;
}

interface StatsData {
  totalReports: number;
  resolvedCount: number;
  avgResolutionHours: number;
  hotspots: Array<{ lat: number; lng: number; count: number; name: string }>;
}

export default function Dashboard({ reports, onSelectReport, isAdmin = false }: DashboardProps) {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedStatus, setSelectedStatus] = useState("All");
  const [duplicateFilter, setDuplicateFilter] = useState<"regular" | "duplicates" | "all">("regular");

  const calculateLocalStats = () => {
    const totalReports = reports.length;
    const resolvedCount = reports.filter(r => r.status === "Resolved").length;

    // Calculate average resolution time
    let resolutionTimeSum = 0;
    let resolvedWithDatesCount = 0;

    reports.forEach((r) => {
      if (r.status === "Resolved" && r.createdAt && r.updatedAt) {
        const start = new Date(r.createdAt).getTime();
        const end = new Date(r.updatedAt).getTime();
        if (end > start) {
          resolutionTimeSum += (end - start);
          resolvedWithDatesCount++;
        }
      }
    });

    const avgResolutionHours = resolvedWithDatesCount > 0 
      ? Math.round((resolutionTimeSum / resolvedWithDatesCount) / (1000 * 60 * 60)) 
      : 0;

    // Calculate simple hotspot locations based on last 30 days reports
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentReports = reports.filter(r => r.createdAt && new Date(r.createdAt) >= thirtyDaysAgo);

    const hotspotGroups: { [gridKey: string]: { lat: number; lng: number; count: number; name: string } } = {};

    recentReports.forEach((r) => {
      const latGrid = Math.round(r.lat * 100) / 100;
      const lngGrid = Math.round(r.lng * 100) / 100;
      const key = `${latGrid},${lngGrid}`;

      if (hotspotGroups[key]) {
        hotspotGroups[key].count++;
      } else {
        hotspotGroups[key] = {
          lat: latGrid,
          lng: lngGrid,
          count: 1,
          name: `Ward Area (${latGrid.toFixed(2)}, ${lngGrid.toFixed(2)})`
        };
      }
    });

    const hotspots = Object.values(hotspotGroups)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    setStats({
      totalReports,
      resolvedCount,
      avgResolutionHours,
      hotspots
    });
    setLoading(false);
  };

  useEffect(() => {
    calculateLocalStats();
  }, [reports]);

  // Search/Filter matching reports
  const filteredReports = reports.filter((report) => {
    // Duplicate status filtering
    if (duplicateFilter === "regular" && report.isDuplicate) return false;
    if (duplicateFilter === "duplicates" && !report.isDuplicate) return false;

    const matchQuery = 
      report.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      report.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (report.id && report.id.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchCategory = selectedCategory === "All" || report.category === selectedCategory;
    const matchStatus = selectedStatus === "All" || report.status === selectedStatus;

    return matchQuery && matchCategory && matchStatus;
  });

  const getSeverityBg = (score: number) => {
    switch (score) {
      case 5: return "bg-red-500 text-white";
      case 4: return "bg-orange-500 text-white";
      case 3: return "bg-amber-500 text-slate-800";
      case 2: return "bg-blue-500 text-white";
      default: return "bg-emerald-500 text-white";
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto" id="dashboard-container">
      {/* 1. IMPACT STATS BANNER */}
      {loading ? (
        <div className="h-48 flex items-center justify-center bg-white rounded-3xl border border-brand-border shadow-sm">
          <Loader2 className="h-8 w-8 text-brand-green animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6" id="stats-banner-grid">
          {/* Total Reports */}
          <div className="bg-white rounded-3xl border border-brand-border p-6 flex items-center gap-5 shadow-sm">
            <div className="h-14 w-14 bg-red-50 text-brand-orange rounded-2xl flex items-center justify-center">
              <AlertOctagon className="h-7 w-7" />
            </div>
            <div>
              <p className="text-xxs font-extrabold text-slate-400 uppercase tracking-widest">Total Reports</p>
              <h3 className="text-3xl font-extrabold text-brand-green mt-1">{stats?.totalReports || reports.length}</h3>
              <p className="text-[10px] text-slate-400 mt-1">Community filed alerts</p>
            </div>
          </div>

          {/* Resolved Count */}
          <div className="bg-white rounded-3xl border border-brand-border p-6 flex items-center gap-5 shadow-sm">
            <div className="h-14 w-14 bg-emerald-50 text-brand-green rounded-2xl flex items-center justify-center">
              <CheckCircle className="h-7 w-7" />
            </div>
            <div>
              <p className="text-xxs font-extrabold text-slate-400 uppercase tracking-widest">Resolved Problems</p>
              <h3 className="text-3xl font-extrabold text-brand-green mt-1">{stats?.resolvedCount || 0}</h3>
              <p className="text-[10px] text-slate-400 mt-1">
                {stats && stats.totalReports > 0 
                  ? `${Math.round((stats.resolvedCount / stats.totalReports) * 100)}% resolution efficiency`
                  : "0% resolved"
                }
              </p>
            </div>
          </div>

          {/* Resolution Velocity */}
          <div className="bg-white rounded-3xl border border-brand-border p-6 flex items-center gap-5 shadow-sm">
            <div className="h-14 w-14 bg-amber-50 text-brand-orange rounded-2xl flex items-center justify-center">
              <Clock className="h-7 w-7" />
            </div>
            <div>
              <p className="text-xxs font-extrabold text-slate-400 uppercase tracking-widest">Resolution Speed</p>
              <h3 className="text-3xl font-extrabold text-brand-green mt-1">
                {stats && stats.avgResolutionHours > 0 
                  ? `${Math.round(stats.avgResolutionHours / 24)}d ${stats.avgResolutionHours % 24}h`
                  : "N/A"
                }
              </h3>
              <p className="text-[10px] text-slate-400 mt-1">Average municipal closing time</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* 2. MAIN REPORTS TABLE / LIST */}
        <div className="lg:col-span-2 space-y-6">
          {/* Header Controls */}
          <div className="bg-white rounded-3xl border border-brand-border p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h4 className="font-bold text-brand-green text-md">Community Infrastructure Registry</h4>
                <p className="text-xxs text-slate-400 mt-0.5">Explore active community issues filed and tracked live</p>
              </div>
              
              {/* Search Bar */}
              <div className="relative max-w-xs w-full sm:w-64">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-slate-400" />
                </div>
                <input
                  id="dashboard-search-input"
                  type="text"
                  placeholder="Search complaints..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-4 py-2 w-full border border-brand-border rounded-xl focus:outline-none focus:ring-1 focus:ring-brand-green text-xs bg-brand-bg"
                />
              </div>
            </div>

            {/* Quick Filters */}
            <div className="flex flex-wrap gap-2 pt-2 border-t border-brand-beige items-center">
              {isAdmin && (
                <select
                  id="dash-filter-duplicates"
                  value={duplicateFilter}
                  onChange={(e: any) => setDuplicateFilter(e.target.value)}
                  className="text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200 px-3 py-1.5 rounded-xl focus:outline-none"
                >
                  <option value="regular">Regular Reports</option>
                  <option value="duplicates">Audit Merged Duplicates</option>
                  <option value="all">All Submissions</option>
                </select>
              )}

              <select
                id="dash-filter-category"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="text-xs font-bold text-brand-green bg-brand-bg border border-brand-border px-3 py-1.5 rounded-xl focus:outline-none"
              >
                <option value="All">All Categories</option>
                <option value="Pothole">Potholes</option>
                <option value="Water Leakage">Water Leakages</option>
                <option value="Streetlight">Damaged Streetlights</option>
                <option value="Garbage/Waste">Garbage/Waste</option>
                <option value="Other Infrastructure">Other Infrastructure</option>
              </select>

              <select
                id="dash-filter-status"
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="text-xs font-bold text-brand-green bg-brand-bg border border-brand-border px-3 py-1.5 rounded-xl focus:outline-none"
              >
                <option value="All">All Pipeline Stages</option>
                <option value="Reported">Reported</option>
                <option value="Verified">Verified</option>
                <option value="Escalated">Escalated</option>
                <option value="In Progress">In Progress</option>
                <option value="Resolved">Resolved</option>
              </select>
            </div>
          </div>

          {/* Table Container */}
          <div className="bg-white rounded-3xl border border-brand-border overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100 text-xs">
                <thead className="bg-brand-beige">
                  <tr>
                    <th className="px-6 py-4 text-left font-bold text-brand-green uppercase tracking-wider text-[10px]">ID / Category</th>
                    <th className="px-6 py-4 text-left font-bold text-brand-green uppercase tracking-wider text-[10px]">Description</th>
                    <th className="px-6 py-4 text-center font-bold text-brand-green uppercase tracking-wider text-[10px]">Severity</th>
                    <th className="px-6 py-4 text-left font-bold text-brand-green uppercase tracking-wider text-[10px]">Status</th>
                    <th className="px-6 py-4 text-center font-bold text-brand-green uppercase tracking-wider text-[10px]">Verified By</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {filteredReports.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-slate-400 font-semibold italic">
                        No community records found matching filter criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredReports.map((report) => (
                      <tr 
                        key={report.id} 
                        id={`report-row-${report.id}`}
                        onClick={() => onSelectReport(report)}
                        className="hover:bg-brand-beige/20 cursor-pointer transition"
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="block font-bold text-slate-800 uppercase tracking-wide text-xxs">#{report.id.slice(-6).toUpperCase()}</span>
                          <div className="flex flex-col gap-0.5 mt-0.5">
                            <span className="text-[10px] text-brand-orange font-semibold">{report.category}</span>
                            {report.isDuplicate && (
                              <span className="inline-block bg-amber-50 text-amber-800 font-extrabold text-[8px] px-1.5 py-0.5 rounded border border-amber-100 max-w-max uppercase tracking-wider">
                                Duplicate ({Math.round(report.similarityScore! * 100)}% Similarity)
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 max-w-xs truncate font-medium text-slate-500">
                          {report.description}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <span className={`px-2 py-0.5 text-[9px] font-extrabold rounded-full ${getSeverityBg(report.severityScore)}`}>
                            {report.severityScore} / 5
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                            {report.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center font-bold text-slate-600">
                          {report.confirmCount} citizens
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* 3. HOTSPOTS & DEMOGRAPHICS PANEL */}
        <div className="space-y-6">
          <div className="bg-white rounded-3xl border border-brand-border p-6 shadow-sm">
            <h4 className="font-bold text-brand-green text-sm flex items-center gap-1.5 border-b border-brand-border/40 pb-4 mb-4">
              <TrendingUp className="h-4 w-4 text-brand-orange" />
              <span>Hyperlocal 30-Day Hotspots</span>
            </h4>
            
            {loading ? (
              <div className="py-12 flex justify-center">
                <Loader2 className="h-6 w-6 text-brand-green animate-spin" />
              </div>
            ) : !stats?.hotspots || stats.hotspots.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-8 text-center">No cluster activity in the past 30 days.</p>
            ) : (
              <div className="space-y-4">
                {stats.hotspots.map((hotspot, idx) => (
                  <div 
                    key={idx} 
                    className="flex items-center justify-between p-3 rounded-2xl bg-brand-bg border border-brand-border/30"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-8 bg-brand-orange/10 text-brand-orange font-bold rounded-lg flex items-center justify-center text-xs">
                        #{idx + 1}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-brand-green">{hotspot.name}</p>
                        <p className="text-[9px] text-slate-400 font-medium">Grid: {hotspot.lat.toFixed(2)}, {hotspot.lng.toFixed(2)}</p>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold bg-brand-green text-white px-2.5 py-1 rounded-full">
                      {hotspot.count} cases
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Gamification summary inside sidebar */}
          <div className="bg-brand-green rounded-3xl p-6 text-white border border-white/10 space-y-4 shadow-sm">
            <div>
              <span className="text-[10px] uppercase font-extrabold tracking-widest text-brand-orange">Did you know?</span>
              <h4 className="text-lg font-bold mt-1">Community Incentives</h4>
              <p className="text-xxs text-white/70 mt-1 leading-relaxed">
                By reporting active public hazards, you earn 10 points. By verifying coordinates of active reports, you earn 5 points.
              </p>
            </div>
            
            <div className="border-t border-white/10 pt-4 flex justify-between items-center text-xxs font-bold uppercase text-brand-orange tracking-wider">
              <span>Earn badges & climb ranks</span>
              <Calendar className="h-4 w-4" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
