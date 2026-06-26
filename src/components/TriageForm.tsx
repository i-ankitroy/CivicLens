/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { IssueCategory, TriageResponse, ReportSubmitResponse, IssueReport } from "../types";
import { Camera, MapPin, Upload, Sparkles, Edit2, CheckCircle, AlertTriangle, User } from "lucide-react";
import CivicMap from "./CivicMap";
import { collection, addDoc, doc, updateDoc, setDoc } from "firebase/firestore";
import { db } from "../lib/firebase";

interface TriageFormProps {
  reporterUid: string;
  reporterName: string;
  reporterEmail: string;
  reports: IssueReport[];
  userPoints: number;
  userBadges: string[];
  onSuccess: (submitResult: ReportSubmitResponse) => void;
}

export default function TriageForm({
  reporterUid,
  reporterName,
  reporterEmail,
  reports,
  userPoints,
  userBadges,
  onSuccess
}: TriageFormProps) {
  // Input states
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoMimeType, setPhotoMimeType] = useState<string>("image/jpeg");
  const [userDescription, setUserDescription] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);

  // Flow states
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState("");
  const [error, setError] = useState("");
  
  // Triage state
  const [triageResult, setTriageResult] = useState<TriageResponse | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  // Edited values
  const [finalCategory, setFinalCategory] = useState<IssueCategory>(IssueCategory.POTHOLE);
  const [finalSeverity, setFinalSeverity] = useState<number>(3);
  const [finalDescription, setFinalDescription] = useState("");

  // Map selection flag
  const [showLocationPicker, setShowLocationPicker] = useState(false);

  // Convert File to Base64
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPhotoMimeType(file.type);
    const reader = new FileReader();
    reader.onloadend = () => {
      setPhoto(reader.result as string);
    };
    reader.readAsDataURL(file);

    // Try to auto-grab geolocation when they attach a photo
    grabGeolocation();
  };

  const grabGeolocation = () => {
    if (navigator.geolocation) {
      setLoadingStep("Capturing device coordinates...");
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLat(position.coords.latitude);
          setLng(position.coords.longitude);
          setLoadingStep("");
        },
        (err) => {
          console.error("Geolocation failed", err);
          setError("Failed to fetch coordinates automatically. Please drop a pin on the map instead.");
          setLoadingStep("");
        }
      );
    }
  };

  // Trigger server-side Gemini triage
  const handlePerformTriage = async () => {
    if (!photo && !userDescription.trim()) {
      setError("Please upload/take a photo or describe the issue first.");
      return;
    }

    setLoading(true);
    setError("");
    setLoadingStep("AI is inspecting photo details & classifying issue...");

    try {
      // Strip standard base64 data url header before sending
      let photoBase64 = null;
      if (photo) {
        photoBase64 = photo.split(",")[1];
      }

      const response = await fetch("/api/triage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          photoBase64,
          mimeType: photoMimeType,
          userDescription
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Triage service returned an error.");
      }

      const data: TriageResponse = await response.json();
      setTriageResult(data);
      
      // Seed editable values
      setFinalCategory(data.category);
      setFinalSeverity(data.severityScore);
      setFinalDescription(data.description);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to analyze the issue. Please fill the fields manually.");
      
      // Fallback: seed empty values so they can manually fill if AI fails
      setTriageResult({
        category: IssueCategory.OTHER_INFRASTRUCTURE,
        severityScore: 3,
        description: userDescription
      });
      setFinalCategory(IssueCategory.OTHER_INFRASTRUCTURE);
      setFinalSeverity(3);
      setFinalDescription(userDescription);
    } finally {
      setLoading(false);
      setLoadingStep("");
    }
  };

  // Submit report to server (with final coordinates and user's changes)
  const handleSubmitReport = async () => {
    if (lat === null || lng === null) {
      setError("Please drop a pin on the map to specify the issue's location.");
      return;
    }

    setLoading(true);
    setLoadingStep("Generating text embeddings & checking for nearby duplicates...");
    setError("");

    try {
      const response = await fetch("/api/reports/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: finalCategory,
          severityScore: finalSeverity,
          description: finalDescription,
          photoUrl: photo, // We send base64 string to keep simple without storage uploads on demo
          lat,
          lng,
          reporterUid,
          reporterName,
          reporterEmail,
          existingReports: reports,
          userPoints,
          userBadges
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Submission failed.");
      }

      const serverRes = await response.json();
      let finalizedReportId = "";

      // Perform actual Firestore write/update operations from the authenticated client-side
      if (serverRes.action === "merged") {
        setLoadingStep("Duplicate found! Merging into existing civic complaint...");
        
        // 1. Update parent report's confirmCount and confirmedBy fields
        const parentReportRef = doc(db, "reports", serverRes.parentReportId);
        await updateDoc(parentReportRef, serverRes.parentReportUpdates);

        // Trigger auto-escalation check for parent report
        try {
          const parentReport = reports.find((r: any) => r.id === serverRes.parentReportId);
          if (parentReport) {
            const nextConfirmCount = serverRes.parentReportUpdates.confirmCount;
            const nextStatus = serverRes.parentReportUpdates.status;
            
            // Auto-escalation criteria (status is Verified with severity >= 4 OR confirmCount >= 10 at any severity)
            const isEligible = 
              (nextStatus === "Verified" && parentReport.severityScore >= 4) || 
              (nextConfirmCount >= 10);

            if (isEligible && parentReport.status !== "Escalated" && parentReport.status !== "In Progress" && parentReport.status !== "Resolved") {
              const escRes = await fetch("/api/reports/escalate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  reportId: parentReport.id,
                  category: parentReport.category,
                  severity: parentReport.severityScore,
                  description: parentReport.description,
                  confirmCount: nextConfirmCount,
                  lat: parentReport.lat,
                  lng: parentReport.lng,
                  simulateFollowUp: false
                })
              });
              
              const escData = await escRes.json();
              if (escRes.ok && escData.success) {
                // Write escalation doc client-side
                const initEscId = `esc-${parentReport.id}-init`;
                await setDoc(doc(db, "escalations", initEscId), {
                  id: initEscId,
                  reportId: parentReport.id,
                  draftedComplaintText: escData.draftedComplaintText,
                  targetDepartment: escData.targetDepartment,
                  sentAt: new Date().toISOString(),
                  status: "Sent",
                  urgency: "High"
                });

                // Update parent report to escalated status
                await updateDoc(parentReportRef, {
                  status: "Escalated",
                  escalatedAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString()
                });
              }
            }
          }
        } catch (escErr) {
          console.error("Auto escalation trigger on merge failed:", escErr);
        }

        // 2. Add duplicate report as its own document
        const dupDocRef = await addDoc(collection(db, "reports"), serverRes.dupReportData);
        finalizedReportId = dupDocRef.id;
        await updateDoc(dupDocRef, { id: finalizedReportId });

        // 3. Update user profile
        const userRef = doc(db, "users", reporterUid);
        await setDoc(userRef, {
          uid: reporterUid,
          displayName: reporterName || "Anonymous Citizen",
          email: reporterEmail || "",
          points: serverRes.userUpdates.points,
          badges: serverRes.userUpdates.badges
        }, { merge: true });

      } else {
        setLoadingStep("Unique report! Publishing brand new civic complaint...");

        // 1. Add unique report document
        const newDocRef = await addDoc(collection(db, "reports"), serverRes.newReportData);
        finalizedReportId = newDocRef.id;
        await updateDoc(newDocRef, { id: finalizedReportId });

        // 2. Update user profile
        const userRef = doc(db, "users", reporterUid);
        await setDoc(userRef, {
          uid: reporterUid,
          displayName: reporterName || "Anonymous Citizen",
          email: reporterEmail || "",
          points: serverRes.userUpdates.points,
          badges: serverRes.userUpdates.badges
        }, { merge: true });
      }

      const submitResult: ReportSubmitResponse = {
        action: serverRes.action,
        reportId: finalizedReportId,
        isDuplicate: serverRes.isDuplicate,
        pointsEarned: serverRes.pointsEarned
      };

      onSuccess(submitResult);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to finalize and submit report.");
    } finally {
      setLoading(false);
      setLoadingStep("");
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-[#1B4332]/10 p-6 sm:p-8 shadow-xl shadow-[#1B4332]/5 max-w-3xl mx-auto" id="triage-form-container">
      {/* Title */}
      <div className="flex items-center gap-3 border-b border-slate-100 pb-5 mb-6">
        <div className="h-10 w-10 bg-[#1B4332]/5 rounded-xl flex items-center justify-center text-[#1B4332]">
          <Camera className="h-5 w-5 text-[#E76F51]" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-[#1B4332]">Report a Civic Issue</h3>
          <p className="text-xs text-slate-400">Our server-side AI categorizes and triages reports automatically</p>
        </div>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border-l-4 border-red-500 p-4 rounded-r-2xl">
          <p className="text-xs text-red-700 font-medium">{error}</p>
        </div>
      )}

      {/* Loading overlay for AI and embeddings */}
      {loading && (
        <div className="fixed inset-0 bg-[#1B4332]/40 backdrop-blur-sm z-[9999] flex flex-col items-center justify-center p-6 text-center">
          <div className="bg-white p-8 rounded-3xl shadow-2xl border border-[#1B4332]/10 max-w-sm flex flex-col items-center">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#1B4332] border-t-transparent mb-4"></div>
            <h4 className="font-bold text-slate-800 text-sm">Processing Civic Data</h4>
            <p className="text-xs text-[#E76F51] mt-2 font-medium">{loadingStep}</p>
            <p className="text-[10px] text-slate-400 mt-4 italic">Please wait while our models parse visual & text vectors</p>
          </div>
        </div>
      )}

      {!triageResult ? (
        // ====================================================================
        // STEP 1: UPLOAD & GEOLOCATION
        // ====================================================================
        <div className="space-y-6">
          {/* File input / camera */}
          <div>
            <label className="block text-xs font-bold text-[#1B4332] uppercase tracking-wider mb-2">
              Issue Photo (Takes photo on mobile)
            </label>
            <div className="mt-1">
              {photo ? (
                <div className="relative w-full aspect-video rounded-2xl overflow-hidden group border-2 border-[#1B4332]/15">
                  <img src={photo} alt="Issue upload preview" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                    <button
                      id="change-photo-btn"
                      type="button"
                      onClick={() => setPhoto(null)}
                      className="bg-white text-[#1B4332] px-4 py-2 rounded-xl text-xs font-bold shadow-md hover:scale-105 transition"
                    >
                      Change Photo
                    </button>
                  </div>
                </div>
              ) : (
                <label
                  htmlFor="photo-upload-input"
                  className="flex flex-col items-center justify-center px-6 pt-5 pb-6 border-2 border-dashed border-[#1B4332]/15 rounded-3xl hover:border-[#1B4332]/30 cursor-pointer transition bg-[#FDFBF7]/50 relative overflow-hidden text-center space-y-2"
                >
                  <div className="flex justify-center text-[#1B4332]/40">
                    <Upload className="h-10 w-10 text-[#E76F51]/60" />
                  </div>
                  <div className="flex text-sm text-slate-600 justify-center">
                    <span className="font-semibold text-[#1B4332] hover:text-[#143225]">
                      Upload an image
                    </span>
                    <p className="pl-1">or drag and drop</p>
                  </div>
                  <p className="text-xxs text-slate-400">PNG, JPG up to 10MB (accepts camera streams)</p>
                  <input
                    id="photo-upload-input"
                    name="photo-upload-input"
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="sr-only"
                    onChange={handlePhotoUpload}
                  />
                </label>
              )}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-bold text-[#1B4332] uppercase tracking-wider mb-2">
              Citizen Notes & Description (Optional)
            </label>
            <textarea
              id="citizen-notes-input"
              rows={3}
              value={userDescription}
              onChange={(e) => setUserDescription(e.target.value)}
              className="appearance-none block w-full px-4 py-3 border border-[#1B4332]/10 rounded-2xl shadow-sm placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-[#1B4332] focus:border-[#1B4332] text-sm"
              placeholder="e.g. Broken streetlamp right outside the grocery store. It has been flickering all week."
            />
          </div>

          {/* Location Picker */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-[#1B4332] uppercase tracking-wider">
                Geographical Coordinates
              </label>
              <button
                id="toggle-picker-btn"
                type="button"
                onClick={() => setShowLocationPicker(!showLocationPicker)}
                className="text-xs font-bold text-[#E76F51] hover:underline flex items-center gap-1"
              >
                <MapPin className="h-3.5 w-3.5" />
                {showLocationPicker ? "Hide Map Selector" : "Drop pin on Map"}
              </button>
            </div>

            {showLocationPicker ? (
              <div className="h-64 w-full relative">
                <CivicMap
                  reports={[]}
                  placementMode={true}
                  initialLat={lat || 37.7749}
                  initialLng={lng || -122.4194}
                  onLocationSelect={(selectedLat, selectedLng) => {
                    setLat(selectedLat);
                    setLng(selectedLng);
                  }}
                />
              </div>
            ) : (
              <div className="flex gap-2 items-center">
                <div className="flex-grow bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 text-xs text-slate-500 font-mono flex items-center gap-1.5 justify-between">
                  {lat !== null && lng !== null ? (
                    <span>Lat: {lat.toFixed(5)}, Lng: {lng.toFixed(5)}</span>
                  ) : (
                    <span className="text-slate-400">Coordinates not captured yet</span>
                  )}
                  {lat !== null && (
                    <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                  )}
                </div>
                <button
                  id="trigger-locate-btn"
                  type="button"
                  onClick={grabGeolocation}
                  className="bg-slate-50 border border-[#1B4332]/10 p-3 rounded-2xl hover:bg-[#FDFBF7] text-[#1B4332] active:scale-95 transition"
                  title="Capture current location"
                >
                  <MapPin className="h-4 w-4 text-[#E76F51]" />
                </button>
              </div>
            )}
          </div>

          {/* Action */}
          <div className="pt-4">
            <button
              id="triage-analyze-btn"
              type="button"
              onClick={handlePerformTriage}
              className="w-full flex items-center justify-center py-3.5 px-4 border border-transparent rounded-2xl shadow-md text-sm font-bold text-white bg-[#1B4332] hover:bg-[#143225] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#1B4332] transition duration-150 gap-2"
            >
              <Sparkles className="h-4 w-4 text-[#E76F51] fill-[#E76F51]/20" />
              Analyze with Gemini AI Triage
            </button>
          </div>
        </div>
      ) : (
        // ====================================================================
        // STEP 2: AI REVIEW & EDIT (LITERAL REQUIREMENT)
        // ====================================================================
        <div className="space-y-6 animate-fade-in">
          <div className="bg-emerald-50/70 border border-emerald-100 p-4 rounded-2xl flex items-start gap-3">
            <Sparkles className="h-5 w-5 text-[#E76F51] fill-[#E76F51]/20 mt-0.5" />
            <div>
              <h4 className="text-xs font-bold text-[#1B4332] uppercase tracking-wider">AI-Assisted Triage Completed</h4>
              <p className="text-xs text-[#1B4332]/70 mt-1">Review and modify the parsed parameters below before submitting to local records.</p>
            </div>
          </div>

          {/* Editable Category */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-[#1B4332] uppercase tracking-wider flex items-center gap-1.5">
                Issue Category
              </label>
              <span className="text-[10px] font-semibold text-[#E76F51] bg-[#E76F51]/10 px-2 py-0.5 rounded flex items-center gap-1">
                <Sparkles className="h-3 w-3" /> AI Suggested
              </span>
            </div>
            <select
              id="triage-edit-category"
              value={finalCategory}
              onChange={(e) => setFinalCategory(e.target.value as IssueCategory)}
              className="appearance-none block w-full px-4 py-3 border border-[#1B4332]/10 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#1B4332] text-sm font-medium bg-[#FDFBF7]"
            >
              <option value={IssueCategory.POTHOLE}>{IssueCategory.POTHOLE}</option>
              <option value={IssueCategory.WATER_LEAKAGE}>{IssueCategory.WATER_LEAKAGE}</option>
              <option value={IssueCategory.STREETLIGHT}>{IssueCategory.STREETLIGHT}</option>
              <option value={IssueCategory.GARBAGE_WASTE}>{IssueCategory.GARBAGE_WASTE}</option>
              <option value={IssueCategory.OTHER_INFRASTRUCTURE}>{IssueCategory.OTHER_INFRASTRUCTURE}</option>
            </select>
          </div>

          {/* Editable Severity */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-[#1B4332] uppercase tracking-wider">
                Severity Score (1 - 5)
              </label>
              <span className="text-[10px] font-semibold text-[#E76F51] bg-[#E76F51]/10 px-2 py-0.5 rounded flex items-center gap-1">
                <Sparkles className="h-3 w-3" /> AI Calculated
              </span>
            </div>
            
            <div className="grid grid-cols-5 gap-2" id="severity-score-grid">
              {[1, 2, 3, 4, 5].map((score) => {
                const colors = [
                  "bg-emerald-100 text-emerald-800 border-emerald-200",
                  "bg-blue-100 text-blue-800 border-blue-200",
                  "bg-amber-100 text-amber-800 border-amber-200",
                  "bg-orange-100 text-orange-800 border-orange-200",
                  "bg-red-100 text-red-800 border-red-200"
                ];
                const label = ["Minor", "Low", "Moderate", "Serious", "Urgent"][score - 1];
                const activeColor = [
                  "bg-emerald-500 text-white border-emerald-600 ring-2 ring-emerald-300",
                  "bg-blue-500 text-white border-blue-600 ring-2 ring-blue-300",
                  "bg-amber-500 text-white border-amber-600 ring-2 ring-amber-300",
                  "bg-orange-500 text-white border-orange-600 ring-2 ring-orange-300",
                  "bg-red-500 text-white border-red-600 ring-2 ring-red-300"
                ][score - 1];

                const isSelected = finalSeverity === score;

                return (
                  <button
                    key={score}
                    type="button"
                    onClick={() => setFinalSeverity(score)}
                    className={`p-3 rounded-2xl border text-center transition ${
                      isSelected ? activeColor : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <span className="block text-sm font-extrabold">{score}</span>
                    <span className="text-[9px] font-bold tracking-tight uppercase block mt-1">{label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Editable Draft Text */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-[#1B4332] uppercase tracking-wider flex items-center gap-1.5">
                Structured Municipal Complaint Text
              </label>
              <span className="text-[10px] font-semibold text-[#E76F51] bg-[#E76F51]/10 px-2 py-0.5 rounded flex items-center gap-1">
                <Sparkles className="h-3 w-3" /> AI Generated
              </span>
            </div>
            <textarea
              id="triage-edit-description"
              rows={4}
              value={finalDescription}
              onChange={(e) => setFinalDescription(e.target.value)}
              className="appearance-none block w-full px-4 py-3 border border-[#1B4332]/10 rounded-2xl shadow-sm focus:outline-none focus:ring-2 focus:ring-[#1B4332] focus:border-[#1B4332] text-sm"
              placeholder="Structured description of the problem..."
            />
          </div>

          {/* Confirm Coordinates */}
          <div className="bg-[#FDFBF7] p-4 rounded-2xl border border-[#1B4332]/5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-slate-700">
              <MapPin className="h-5 w-5 text-[#E76F51] flex-shrink-0" />
              <div>
                <p className="text-xs font-bold text-[#1B4332]">Target Geolocation</p>
                <p className="text-xxs text-slate-400 font-mono mt-0.5">Lat: {lat?.toFixed(5)}, Lng: {lng?.toFixed(5)}</p>
              </div>
            </div>
            <button
              id="triage-edit-location-btn"
              type="button"
              onClick={() => setShowLocationPicker(!showLocationPicker)}
              className="text-xxs font-bold text-[#E76F51] uppercase tracking-wider border border-[#E76F51]/20 px-2.5 py-1.5 rounded-xl hover:bg-white transition"
            >
              Adjust Pin
            </button>
          </div>

          {showLocationPicker && (
            <div className="h-64 w-full relative rounded-2xl overflow-hidden border border-slate-100">
              <CivicMap
                reports={[]}
                placementMode={true}
                initialLat={lat || 37.7749}
                initialLng={lng || -122.4194}
                onLocationSelect={(selectedLat, selectedLng) => {
                  setLat(selectedLat);
                  setLng(selectedLng);
                }}
              />
            </div>
          )}

          {/* Action Group */}
          <div className="flex gap-3 pt-4">
            <button
              id="triage-back-btn"
              type="button"
              onClick={() => setTriageResult(null)}
              className="flex-1 py-3 px-4 border border-[#1B4332]/15 rounded-2xl text-sm font-semibold text-[#1B4332] hover:bg-slate-50 focus:outline-none active:scale-98 transition"
            >
              Back to Photo
            </button>
            <button
              id="triage-submit-btn"
              type="button"
              onClick={handleSubmitReport}
              className="flex-1 py-3 px-4 border border-transparent rounded-2xl shadow-md text-sm font-bold text-white bg-[#1B4332] hover:bg-[#143225] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#1B4332] active:scale-98 transition"
            >
              Submit Civic Complaint
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
