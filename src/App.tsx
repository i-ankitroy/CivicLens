/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut, User as FirebaseUser } from "firebase/auth";
import { collection, onSnapshot, query, orderBy, doc, getDoc } from "firebase/firestore";
import { auth, db } from "./lib/firebase";
import { UserProfile, IssueReport, ReportSubmitResponse } from "./types";
import AuthScreen from "./components/AuthScreen";
import TriageForm from "./components/TriageForm";
import CivicMap from "./components/CivicMap";
import ReportDetail from "./components/ReportDetail";
import Dashboard from "./components/Dashboard";
import Gamification from "./components/Gamification";
import { 
  Map, 
  PlusCircle, 
  BarChart2, 
  Award, 
  Shield, 
  LogOut, 
  User, 
  Sparkles,
  AlertCircle
} from "lucide-react";

export default function App() {
  // Auth & Profile states
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // App settings & roles
  const [isAdmin, setIsAdmin] = useState(false); // Interactive toggle for hackathon judges
  const [currentTab, setCurrentTab] = useState<"map" | "report" | "dashboard" | "leaderboard">("map");

  // Database records
  const [reports, setReports] = useState<IssueReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<IssueReport | null>(null);

  // Submit states
  const [submitSuccessResult, setSubmitSuccessResult] = useState<ReportSubmitResponse | null>(null);

  // 1. Listen to Firebase Authentication State
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        // Fetch Firestore profile values (points, badges)
        try {
          const userDoc = await getDoc(doc(db, "users", user.uid));
          if (userDoc.exists()) {
            setUserProfile(userDoc.data() as UserProfile);
          } else {
            setUserProfile({
              uid: user.uid,
              displayName: user.displayName || "Citizen Responder",
              email: user.email || "",
              points: 0,
              badges: []
            });
          }
        } catch (err) {
          console.error("Failed to load profile details:", err);
        }
      } else {
        setUserProfile(null);
      }
      setAuthLoading(false);
    });

    return () => unsubscribeAuth();
  }, []);

  // 2. Sync Reports collection in real-time from Firestore
  useEffect(() => {
    if (!firebaseUser) return;

    const reportsQuery = query(
      collection(db, "reports"),
      orderBy("createdAt", "desc")
    );

    const unsubscribeReports = onSnapshot(reportsQuery, (snapshot) => {
      const list: IssueReport[] = [];
      snapshot.forEach((docSnap) => {
        list.push(docSnap.data() as IssueReport);
      });
      setReports(list);
    }, (error) => {
      console.error("Error reading reports snapshot:", error);
    });

    return () => unsubscribeReports();
  }, [firebaseUser]);

  const handleAuthSuccess = (profile: UserProfile) => {
    setUserProfile(profile);
  };

  const handleLogout = async () => {
    await signOut(auth);
    setSelectedReport(null);
    setSubmitSuccessResult(null);
  };

  const handleReportSuccess = (result: ReportSubmitResponse) => {
    setSubmitSuccessResult(result);
    // Reload profile points in state if available
    if (userProfile) {
      setUserProfile({
        ...userProfile,
        points: userProfile.points + result.pointsEarned
      });
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-brand-bg flex flex-col items-center justify-center p-4">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-brand-green border-t-transparent mb-4"></div>
        <p className="text-xs font-bold text-brand-green uppercase tracking-widest font-display">Loading CivicLens Platform...</p>
      </div>
    );
  }

  if (!firebaseUser || !userProfile) {
    return <AuthScreen onAuthSuccess={handleAuthSuccess} />;
  }

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col font-sans text-brand-charcoal">
      {/* ====================================================================
          TOP NAVIGATION HEADER (Floating & Glassmorphic)
          ==================================================================== */}
      <header className="sticky top-2 sm:top-3 z-[2000] mx-2 sm:mx-6 my-2 shrink-0 bg-white/80 backdrop-blur-md border border-brand-border/40 rounded-2xl sm:rounded-3xl shadow-md transition-all duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 bg-brand-green rounded-xl flex items-center justify-center shadow-sm">
              <Shield className="h-5 sm:h-5.5 w-5 sm:w-5.5 text-white" />
            </div>
            <div>
              <h1 className="text-lg sm:text-2xl font-black tracking-tight text-brand-green">CivicLens</h1>
              <p className="text-[8px] sm:text-[9px] text-brand-orange font-black uppercase tracking-widest hidden sm:block">Municipal OS v1.0.4</p>
            </div>
          </div>

          {/* Hackathon Role Switcher & User Widget */}
          <div className="flex items-center gap-2 sm:gap-4">
            {/* ROLE TOGGLE CHIP (Explicitly documented in guideline) */}
            <button
              id="hackathon-role-switcher"
              onClick={() => setIsAdmin(!isAdmin)}
              className={`hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-extrabold uppercase border tracking-wider transition ${
                isAdmin 
                  ? "bg-amber-100 text-amber-800 border-amber-300 shadow-inner" 
                  : "bg-brand-beige text-brand-green border-brand-border"
              }`}
              title="Toggle Role for Demo Testing"
            >
              <Shield className="h-3.5 w-3.5" />
              <span>Role: {isAdmin ? "Moderator/Admin" : "Citizen"}</span>
            </button>

            {/* Profile points bubble */}
            <div className="flex items-center gap-1.5 bg-brand-beige px-3 py-1 sm:px-4 sm:py-1.5 rounded-full border border-brand-border">
              <span className="text-[9px] font-extrabold uppercase tracking-wider text-slate-500 hidden sm:inline">Points</span>
              <span className="text-sm sm:text-md font-bold text-brand-orange flex items-center gap-1">
                <Award className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                {userProfile.points}
              </span>
            </div>

            {/* User details */}
            <div className="hidden sm:flex items-center gap-3 border-l border-brand-border pl-4">
              <div className="text-right">
                <p className="text-xs font-bold text-brand-charcoal">{userProfile.displayName}</p>
                <p className="text-[9px] uppercase font-extrabold text-brand-green tracking-wider">
                  {userProfile.badges && userProfile.badges.length > 0 
                    ? `🎖️ ${userProfile.badges[0]}` 
                    : "Active Citizen 🎖️"}
                </p>
              </div>
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-brand-beige border border-brand-border flex items-center justify-center font-bold text-brand-green text-xs sm:text-sm shadow-sm uppercase">
                {userProfile.displayName.charAt(0)}
              </div>
            </div>

            {/* Logout */}
            <button
              id="header-logout-btn"
              onClick={handleLogout}
              className="p-1.5 sm:p-2 bg-brand-beige text-slate-500 rounded-xl hover:bg-red-50 hover:text-red-700 hover:border-red-200 transition active:scale-95 border border-brand-border"
              title="Logout"
            >
              <LogOut className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile-only Role Switcher header bar */}
      <div className="sm:hidden bg-amber-50/80 backdrop-blur-sm border border-amber-200/60 mx-2 mb-2 py-1.5 px-4 flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wide text-amber-800 rounded-xl shadow-sm">
        <span className="flex items-center gap-1"><Shield className="h-3 w-3" /> DEMO MODE:</span>
        <button
          id="mobile-role-switcher"
          onClick={() => setIsAdmin(!isAdmin)}
          className="bg-brand-orange text-white px-2 py-0.5 rounded-md hover:scale-105 active:scale-95 transition"
        >
          Switch to {isAdmin ? "Admin" : "Citizen"}
        </button>
      </div>

      {/* ====================================================================
          CORE WORKSPACE CONTAINER
          ==================================================================== */}
      <main className="flex-grow p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto pb-24">
        {/* Render Tab Contents */}
        {currentTab === "map" && (
          <div className="h-[60vh] sm:h-[600px] w-full relative rounded-3xl overflow-hidden border border-brand-border shadow-sm">
            <CivicMap
              reports={reports}
              selectedReportId={selectedReport?.id}
              onSelectReport={(r) => setSelectedReport(r)}
            />
          </div>
        )}

        {currentTab === "report" && (
          <div>
            {submitSuccessResult ? (
              // SUBMIT COMPLETED LANDING (Bento Styled Card)
              <div className="bg-white rounded-3xl border border-brand-border p-8 text-center max-w-md mx-auto shadow-sm space-y-6 animate-fade-in" id="report-success-panel">
                <div className="h-16 w-16 bg-brand-beige rounded-full flex items-center justify-center mx-auto text-brand-green border border-brand-border">
                  <PlusCircle className="h-8 w-8 text-brand-green" />
                </div>
                
                <div className="space-y-2">
                  <h3 className="text-xl font-bold text-brand-green">
                    {submitSuccessResult.isDuplicate ? "Coordinate Match Linked!" : "Civic Complaint Filed!"}
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    {submitSuccessResult.isDuplicate 
                      ? "A similar complaint was already reported here. To avoid municipal spam, we've matched your report and registered your confirmation to the original complaint!"
                      : "We've created a unique record on our public database. Nearby citizens can now verify the issue status."
                    }
                  </p>
                </div>

                <div className="bg-brand-green text-white p-4 rounded-2xl border border-white/5 flex items-center justify-between gap-4">
                  <div className="text-left">
                    <p className="text-[10px] font-bold text-white/60 uppercase tracking-wider">Rewards Granted</p>
                    <p className="text-sm font-extrabold mt-0.5">+{submitSuccessResult.pointsEarned} Points</p>
                  </div>
                  <Sparkles className="h-6 w-6 text-brand-orange fill-brand-orange/20 animate-pulse" />
                </div>

                <div className="flex gap-3">
                  <button
                    id="success-new-report-btn"
                    onClick={() => setSubmitSuccessResult(null)}
                    className="flex-1 py-3 px-4 border border-brand-border text-xs font-bold rounded-2xl text-brand-green hover:bg-brand-beige transition"
                  >
                    Report Another Issue
                  </button>
                  <button
                    id="success-goto-map-btn"
                    onClick={() => {
                      setSubmitSuccessResult(null);
                      setCurrentTab("map");
                    }}
                    className="flex-1 py-3 px-4 text-xs font-bold rounded-2xl text-white bg-brand-green hover:bg-brand-green/90 shadow transition"
                  >
                    View Map
                  </button>
                </div>
              </div>
            ) : (
              // ACTIVE TRIAGE FORM
              <TriageForm
                reporterUid={userProfile.uid}
                reporterName={userProfile.displayName}
                reporterEmail={userProfile.email}
                reports={reports}
                userPoints={userProfile.points || 0}
                userBadges={userProfile.badges || []}
                onSuccess={handleReportSuccess}
              />
            )}
          </div>
        )}

        {currentTab === "dashboard" && (
          <Dashboard 
            reports={reports} 
            onSelectReport={(r) => setSelectedReport(r)} 
            isAdmin={isAdmin}
          />
        )}

        {currentTab === "leaderboard" && (
          <Gamification currentUserUid={userProfile.uid} />
        )}
      </main>

      {/* ====================================================================
          FLOATING REPORT DETAIL OVERLAY / DIALOG
          ==================================================================== */}
      {selectedReport && (
        <div className="fixed inset-0 bg-brand-charcoal/40 backdrop-blur-sm z-[3000] flex items-center justify-center p-4">
          <div className="max-h-[90vh] overflow-y-auto w-full max-w-5xl rounded-3xl shadow-2xl">
            <ReportDetail
              report={selectedReport}
              reports={reports}
              currentUserUid={userProfile.uid}
              currentUserName={userProfile.displayName}
              isAdmin={isAdmin}
              onUpdateReport={(updated) => {
                setSelectedReport(updated);
                // Also update matching row in current local reports state for snappiness
                setReports(prev => prev.map(r => r.id === updated.id ? updated : r));
              }}
              onClose={() => setSelectedReport(null)}
            />
          </div>
        </div>
      )}

      {/* ====================================================================
          BENTO INTERACTION RAIL FOOTER (Floating & Glassmorphic)
          ==================================================================== */}
      <footer className="fixed bottom-4 left-1/2 -translate-x-1/2 w-[calc(100%-1rem)] sm:w-[calc(100%-3rem)] max-w-4xl bg-white/80 backdrop-blur-md border border-brand-border/60 py-2 px-3 sm:px-6 rounded-2xl sm:rounded-3xl shadow-xl z-[2000] flex items-center justify-between transition-all duration-300">
        <div className="hidden md:flex gap-4 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
          <span className="text-brand-green flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-brand-green animate-pulse inline-block"></span>
            Server: Online
          </span>
          <span>Last Synced: Just now</span>
        </div>

        {/* Tab Switcher - Centered on mobile and responsive */}
        <div className="flex justify-around md:justify-end items-center gap-1 sm:gap-4 w-full md:w-auto">
          {/* Map Tab */}
          <button
            id="tab-btn-map"
            onClick={() => setCurrentTab("map")}
            className={`flex items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl transition-all duration-300 ${
              currentTab === "map" 
                ? "bg-brand-green text-white shadow-md scale-105" 
                : "text-slate-500 hover:text-brand-green hover:bg-brand-beige/50"
            }`}
          >
            <Map className={`h-4 w-4 ${currentTab === "map" ? "stroke-[2.5]" : "stroke-[1.5]"}`} />
            <span className="text-[10px] font-bold uppercase tracking-wider">Map</span>
          </button>

          {/* Submit/Triage Tab */}
          <button
            id="tab-btn-report"
            onClick={() => setCurrentTab("report")}
            className={`flex items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl transition-all duration-300 ${
              currentTab === "report" 
                ? "bg-brand-green text-white shadow-md scale-105" 
                : "text-slate-500 hover:text-brand-green hover:bg-brand-beige/50"
            }`}
          >
            <PlusCircle className={`h-4 w-4 ${currentTab === "report" ? "stroke-[2.5]" : "stroke-[1.5]"}`} />
            <span className="text-[10px] font-bold uppercase tracking-wider">Report</span>
          </button>

          {/* Analytics/Stats Tab */}
          <button
            id="tab-btn-dashboard"
            onClick={() => setCurrentTab("dashboard")}
            className={`flex items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl transition-all duration-300 ${
              currentTab === "dashboard" 
                ? "bg-brand-green text-white shadow-md scale-105" 
                : "text-slate-500 hover:text-brand-green hover:bg-brand-beige/50"
            }`}
          >
            <BarChart2 className={`h-4 w-4 ${currentTab === "dashboard" ? "stroke-[2.5]" : "stroke-[1.5]"}`} />
            <span className="text-[10px] font-bold uppercase tracking-wider">Impact</span>
          </button>

          {/* Leaderboard/Gamification Tab */}
          <button
            id="tab-btn-leaderboard"
            onClick={() => setCurrentTab("leaderboard")}
            className={`flex items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl transition-all duration-300 ${
              currentTab === "leaderboard" 
                ? "bg-brand-green text-white shadow-md scale-105" 
                : "text-slate-500 hover:text-brand-green hover:bg-brand-beige/50"
            }`}
          >
            <Award className={`h-4 w-4 ${currentTab === "leaderboard" ? "stroke-[2.5]" : "stroke-[1.5]"}`} />
            <span className="text-[10px] font-bold uppercase tracking-wider">Honor</span>
          </button>
        </div>

        <div className="hidden lg:block text-[10px] font-bold uppercase tracking-wider text-slate-400">
          v1.0.4
        </div>
      </footer>
    </div>
  );
}
