/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { 
  signInWithPopup 
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, googleProvider, db } from "../lib/firebase";
import { UserProfile } from "../types";
import { Shield, Sparkles, AlertCircle, ExternalLink } from "lucide-react";
import firebaseConfig from "../../firebase-applet-config.json";

interface AuthScreenProps {
  onAuthSuccess: (profile: UserProfile) => void;
}

export default function AuthScreen({ onAuthSuccess }: AuthScreenProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Sync user authentication with a Firestore profile document
  const syncUserProfile = async (uid: string, userEmail: string, displayName: string) => {
    const userRef = doc(db, "users", uid);
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) {
      // Initialize new user with 0 points and empty badges
      const newProfile: UserProfile = {
        uid,
        displayName: displayName || "Citizen Responder",
        email: userEmail,
        points: 0,
        badges: []
      };
      await setDoc(userRef, newProfile);
      return newProfile;
    } else {
      return userDoc.data() as UserProfile;
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError("");
    try {
      const userCredential = await signInWithPopup(auth, googleProvider);
      const profile = await syncUserProfile(
        userCredential.user.uid,
        userCredential.user.email || "",
        userCredential.user.displayName || "Google Citizen"
      );
      onAuthSuccess(profile);
    } catch (err: any) {
      console.error(err);
      if (err.code === "auth/operation-not-allowed") {
        setError("The 'Google' Sign-In Provider is disabled in your Firebase Console.");
      } else {
        setError(err.message || "Google sign in failed.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="h-16 w-16 rounded-2xl bg-brand-green flex items-center justify-center shadow-md border-2 border-brand-orange/20">
            <Shield className="h-8 w-8 text-white" />
          </div>
        </div>
        <h2 className="mt-6 text-center text-4xl font-sans font-bold tracking-tight text-brand-green">
          CivicLens
        </h2>
        <p className="mt-2 text-center text-sm font-medium text-brand-orange">
          Hyperlocal Community Problem Solving
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md" id="auth-card">
        <div className="bg-white py-8 px-4 shadow-sm rounded-3xl border border-brand-border sm:px-10">
          <div className="space-y-6">
            {error && (
              <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-xl space-y-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs text-red-700 font-bold">Authentication Blocked</p>
                    <p className="text-xs text-red-600 mt-0.5 leading-relaxed">{error}</p>
                  </div>
                </div>
                {error.includes("disabled") && (
                  <div className="mt-2 pt-2.5 border-t border-red-100/70 text-[11px] text-red-800 space-y-2">
                    <p className="font-extrabold flex items-center gap-1">
                      <span>🛠️ How to enable sign-in in your project:</span>
                    </p>
                    <ol className="list-decimal list-inside space-y-1.5 text-red-700 font-medium pl-1">
                      <li>Go to your <strong className="font-bold">Firebase Console</strong></li>
                      <li>In the sidebar under Build, click <strong className="font-bold">Authentication</strong></li>
                      <li>Navigate to the <strong className="font-bold">Sign-in method</strong> tab</li>
                      <li>Click <strong className="font-bold">Add new provider</strong></li>
                      <li>Select <strong className="font-bold">Google</strong> and toggle <strong className="font-bold">Enable</strong></li>
                      <li>Click <strong className="font-bold">Save</strong> and refresh this page!</li>
                    </ol>
                    <div className="pt-2">
                      <a 
                        href={`https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/providers`}
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-100 text-red-700 hover:bg-red-200 hover:text-red-800 transition text-xxs font-extrabold tracking-wide uppercase border border-red-200"
                      >
                        <span>Open Sign-In Console</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="text-center space-y-4">
              <p className="text-sm text-slate-500 leading-relaxed">
                Connect with your Google Account to report community issues, confirm reports, and earn civic points.
              </p>

              <button
                id="auth-google-btn"
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="w-full flex items-center justify-center py-3.5 px-4 border border-brand-border rounded-2xl bg-white text-sm font-bold text-brand-green hover:bg-brand-bg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-green transition duration-150 shadow-sm active:scale-98 disabled:opacity-50"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-5 w-5 text-brand-green" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Signing you in...
                  </span>
                ) : (
                  <>
                    <svg className="h-5 w-5 mr-2 shrink-0" viewBox="0 0 24 24">
                      <path
                        fill="#EA4335"
                        d="M12 5.04c1.66 0 3.2.57 4.38 1.69l3.27-3.27C17.67 1.61 14.98 1 12 1 7.35 1 3.39 3.65 1.45 7.5l3.85 2.99C6.21 7.21 8.89 5.04 12 5.04z"
                      />
                      <path
                        fill="#4285F4"
                        d="M23.49 12.27c0-.81-.07-1.59-.2-2.34H12v4.43h6.46c-.28 1.47-1.11 2.71-2.36 3.55l3.66 2.84c2.14-1.97 3.39-4.88 3.39-8.48z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.3 14.91a7.22 7.22 0 010-4.38L1.45 7.54a11.95 11.95 0 000 10.37l3.85-3z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c3.24 0 5.97-1.07 7.96-2.92l-3.66-2.84c-1.01.68-2.3 1.08-4.3 1.08-3.11 0-5.79-2.17-6.7-5.46L1.45 15.85C3.39 19.7 7.35 23 12 23z"
                      />
                    </svg>
                    Continue with Google
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-8 text-center text-xs text-brand-green/50 flex items-center justify-center gap-1">
        <Sparkles className="h-3 w-3 text-brand-orange" />
        <span> Empowering local communities</span>
      </div>
    </div>
  );
}
