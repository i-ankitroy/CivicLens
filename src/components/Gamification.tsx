/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from "react";
import { collection, query, orderBy, limit, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { LeaderboardUser } from "../types";
import { Trophy, Award, Star, Loader2, Sparkles, Shield, Eye } from "lucide-react";

interface GamificationProps {
  currentUserUid: string;
}

export default function Gamification({ currentUserUid }: GamificationProps) {
  const [leaderboard, setLeaderboard] = useState<LeaderboardUser[]>([]);
  const [loading, setLoading] = useState(true);

  // Read leaderboard users directly from Firestore ordered by points
  useEffect(() => {
    const usersQuery = query(
      collection(db, "users"),
      orderBy("points", "desc"),
      limit(10)
    );

    const unsubscribe = onSnapshot(usersQuery, (snapshot) => {
      const ulist: LeaderboardUser[] = [];
      snapshot.forEach((docSnap) => {
        const u = docSnap.data();
        ulist.push({
          uid: docSnap.id,
          displayName: u.displayName || "Anonymous Citizen",
          points: u.points || 0,
          badges: u.badges || []
        });
      });
      setLeaderboard(ulist);
      setLoading(false);
    }, (error) => {
      console.error("Error reading leaderboard:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Find current user's profile in the leaderboard list or default if not found
  const currentUserStats = leaderboard.find(u => u.uid === currentUserUid) || {
    uid: currentUserUid,
    displayName: "Citizen Responder",
    points: 0,
    badges: []
  };

  // Static Badge Cabinet List
  const badgesCabinet = [
    {
      name: "Pothole Patrol",
      description: "Reported 5 or more Potholes successfully",
      icon: "🕳️",
      condition: "5+ Pothole reports"
    },
    {
      name: "Streetlight Sentinel",
      description: "Reported 5 or more broken Streetlights successfully",
      icon: "💡",
      condition: "5+ Streetlight reports"
    },
    {
      name: "Water Warden",
      description: "Reported 5 or more Water Leakage issues successfully",
      icon: "💧",
      condition: "5+ Water reports"
    },
    {
      name: "Garbage Guardian",
      description: "Reported 5 or more Garbage/Waste hazards successfully",
      icon: "🗑️",
      condition: "5+ Garbage reports"
    },
    {
      name: "Infrastructure Inspector",
      description: "Reported 5 or more General Infrastructure issues successfully",
      icon: "🚧",
      condition: "5+ General reports"
    }
  ];

  return (
    <div className="space-y-8 max-w-5xl mx-auto" id="gamification-view">
      {/* 1. MY SCOREBOARD BANNER */}
      <div className="bg-brand-green text-white rounded-3xl p-6 sm:p-8 border border-white/10 relative overflow-hidden shadow-sm flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 h-48 w-48 rounded-full bg-white/5 pointer-events-none" />
        <div className="space-y-2 text-center sm:text-left">
          <span className="text-[10px] uppercase font-extrabold tracking-widest text-brand-orange bg-white/10 px-3 py-1 rounded-full">
            Active Citizen Level
          </span>
          <h3 className="text-2xl font-bold tracking-tight mt-2">
            {currentUserStats.displayName}
          </h3>
          <p className="text-xs text-white/70">
            Co-operating to build responsive, hazard-free municipal roads and streets.
          </p>
        </div>

        {/* Big points card */}
        <div className="bg-white/10 backdrop-blur-md border border-white/10 px-8 py-5 rounded-3xl text-center min-w-[150px]">
          <span className="text-4xl font-extrabold block text-white">{currentUserStats.points}</span>
          <span className="text-[10px] uppercase font-bold tracking-wider text-brand-orange">Total Points</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* 2. LEADERBOARD LIST */}
        <div className="md:col-span-2 bg-white rounded-3xl border border-brand-border p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-brand-border/40 pb-4">
            <Trophy className="h-5 w-5 text-amber-500" />
            <div>
              <h4 className="font-bold text-brand-green text-sm">Citizen Honor Roll</h4>
              <p className="text-xxs text-slate-400">Top-performing local solvers ranked by community activity</p>
            </div>
          </div>

          {loading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="h-6 w-6 text-brand-green animate-spin" />
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {leaderboard.map((user, idx) => {
                const isMe = user.uid === currentUserUid;
                const medalColors = ["text-yellow-500", "text-slate-400", "text-amber-600"];
                
                return (
                  <div 
                    key={user.uid} 
                    id={`leaderboard-row-${user.uid}`}
                    className={`flex items-center justify-between py-3.5 px-2 rounded-2xl transition ${
                      isMe ? "bg-emerald-50/75 border-l-4 border-brand-green" : "hover:bg-brand-bg/50"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {/* Rank badge */}
                      <div className="w-6 text-center font-bold text-xs text-slate-400">
                        {idx < 3 ? (
                          <Star className={`h-4.5 w-4.5 mx-auto ${medalColors[idx]} fill-current`} />
                        ) : (
                          idx + 1
                        )}
                      </div>
                      
                      {/* Avatar */}
                      <div className="h-9 w-9 bg-brand-beige rounded-full flex items-center justify-center font-bold text-brand-green text-xs">
                        {user.displayName.charAt(0).toUpperCase()}
                      </div>

                      {/* Display name and badges count */}
                      <div>
                        <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          {user.displayName}
                          {isMe && <span className="text-[9px] font-extrabold bg-brand-green text-white px-1.5 py-0.5 rounded-full">Me</span>}
                        </span>
                        
                        {/* Display list of active badges */}
                        <div className="flex gap-1 mt-1">
                          {user.badges.map((badge, bIdx) => (
                            <span 
                              key={bIdx} 
                              className="text-[9px] font-semibold bg-amber-50 text-amber-700 border border-amber-100 px-1.5 py-0.25 rounded-md"
                            >
                              {badge}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <span className="text-xs font-extrabold text-brand-green">
                      {user.points} pts
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 3. BADGES CABINET */}
        <div className="bg-white rounded-3xl border border-brand-border p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-brand-border/40 pb-4">
            <Award className="h-5 w-5 text-brand-orange" />
            <div>
              <h4 className="font-bold text-brand-green text-sm">Badges Cabinet</h4>
              <p className="text-xxs text-slate-400">Incentive milestone achievements</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-1 gap-4" id="badges-cabinet-grid">
            {badgesCabinet.map((badge, idx) => {
              const isUnlocked = currentUserStats.badges.includes(badge.name);

              return (
                <div 
                  key={idx} 
                  id={`cabinet-badge-${idx}`}
                  className={`p-4 rounded-2xl border text-center transition flex flex-col items-center relative ${
                    isUnlocked 
                      ? "bg-brand-bg border-brand-border shadow-sm" 
                      : "bg-slate-50 border-slate-100 grayscale opacity-60"
                  }`}
                >
                  {isUnlocked && (
                    <span className="absolute top-2 right-2 bg-emerald-500 text-white rounded-full p-0.5 shadow">
                      <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" className="lucide lucide-check"><path d="M20 6 9 17l-5-5"/></svg>
                    </span>
                  )}
                  <span className="text-4xl block mb-2">{badge.icon}</span>
                  <h5 className="text-xs font-bold text-brand-green">{badge.name}</h5>
                  <p className="text-[10px] text-slate-400 mt-1 max-w-[180px] leading-relaxed">{badge.description}</p>
                  
                  <div className="mt-3 text-[9px] font-bold text-brand-orange uppercase tracking-wide bg-brand-orange/5 border border-brand-orange/10 px-2.5 py-0.75 rounded-full">
                    {badge.condition}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
