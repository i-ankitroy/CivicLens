/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";
import { IssueReport, ReportStatus } from "../types";
import { doc, updateDoc, increment, arrayUnion, getDoc, setDoc, deleteField, collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { 
  Check, 
  MapPin, 
  AlertTriangle, 
  Calendar, 
  CheckCircle, 
  Users, 
  ShieldAlert, 
  ArrowRight,
  Sparkles,
  Clock,
  Send,
  AlertCircle,
  Edit2,
  Save,
  History,
  ChevronDown,
  ChevronUp
} from "lucide-react";

interface ReportDetailProps {
  report: IssueReport;
  reports?: IssueReport[];
  currentUserUid: string;
  currentUserName: string;
  isAdmin: boolean;
  onUpdateReport: (updatedReport: IssueReport) => void;
  onClose: () => void;
}

export default function ReportDetail({
  report,
  reports = [],
  currentUserUid,
  currentUserName,
  isAdmin,
  onUpdateReport,
  onClose
}: ReportDetailProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [escalations, setEscalations] = useState<any[]>([]);
  const [escalating, setEscalating] = useState(false);
  const [editingEscId, setEditingEscId] = useState<string | null>(null);
  const [editedDraftText, setEditedDraftText] = useState("");
  const [expandedEscId, setExpandedEscId] = useState<string | null>(null);

  // Synchronize escalations history timeline
  useEffect(() => {
    const q = query(
      collection(db, "escalations"),
      where("reportId", "==", report.id)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });
      // Sort client-side by sentAt to bypass any compound index requirements
      list.sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime());
      setEscalations(list);
      if (list.length > 0) {
        // Expand the most recent escalation by default
        setExpandedEscId((prev) => prev || list[list.length - 1].id);
      }
    }, (err) => {
      console.error("Error listening to escalations:", err);
    });
    return () => unsubscribe();
  }, [report.id]);

  const mergedDuplicates = reports.filter(r => r.isDuplicate && r.parentReportId === report.id);

  const hasAlreadyConfirmed = report.confirmedBy?.includes(currentUserUid) || false;

  const getSeverityLabel = (score: number) => {
    switch (score) {
      case 5: return "Urgent/Hazardous";
      case 4: return "Serious/Impeding";
      case 3: return "Moderate/Uncomfortable";
      case 2: return "Minor/Irritant";
      default: return "Negligible";
    }
  };

  const getSeverityBg = (score: number) => {
    switch (score) {
      case 5: return "bg-red-100 text-red-800 border-red-200";
      case 4: return "bg-orange-100 text-orange-800 border-orange-200";
      case 3: return "bg-amber-100 text-amber-800 border-amber-200";
      case 2: return "bg-blue-100 text-blue-800 border-blue-200";
      default: return "bg-emerald-100 text-emerald-800 border-emerald-200";
    }
  };

  // Status Stepper Array
  const statuses = [
    ReportStatus.REPORTED,
    ReportStatus.VERIFIED,
    ReportStatus.ESCALATED,
    ReportStatus.IN_PROGRESS,
    ReportStatus.RESOLVED
  ];

  const currentStatusIndex = statuses.indexOf(report.status);

  // Helper to trigger stateless server-side complaint drafting, and write results to Firestore client-side securely
  const triggerEscalationAgent = async (simulateFollowUp = false, confirmCountOverride?: number) => {
    const activeConfirmCount = confirmCountOverride !== undefined ? confirmCountOverride : (report.confirmCount || 1);
    
    // Call our stateless backend to draft the complaint letter with Gemini
    const res = await fetch("/api/reports/escalate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reportId: report.id,
        category: report.category,
        severity: report.severityScore,
        description: report.description,
        confirmCount: activeConfirmCount,
        lat: report.lat,
        lng: report.lng,
        simulateFollowUp
      })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || "Failed to trigger escalation agent.");
    }

    const { draftedComplaintText, targetDepartment, action } = data;

    // Create the escalation record on the client side
    const escId = action === "followup" 
      ? `esc-${report.id}-followup-${Date.now()}`
      : `esc-${report.id}-init`;

    const escalationRef = doc(db, "escalations", escId);
    await setDoc(escalationRef, {
      id: escId,
      reportId: report.id,
      draftedComplaintText,
      targetDepartment,
      sentAt: new Date().toISOString(),
      status: action === "followup" ? "FollowUp" : "Sent",
      urgency: action === "followup" ? "Critical" : "High"
    });

    // Update the report's status and timestamps on the client side
    const reportRef = doc(db, "reports", report.id);
    const updatePayload: any = {
      updatedAt: new Date().toISOString()
    };
    if (action === "escalated") {
      updatePayload.status = ReportStatus.ESCALATED;
      updatePayload.escalatedAt = new Date().toISOString();
    }
    await updateDoc(reportRef, updatePayload);

    return { draftedComplaintText, targetDepartment, action };
  };

  // Citizen Verification Action
  const handleVerifyReport = async () => {
    if (hasAlreadyConfirmed) return;
    setLoading(true);
    setError("");
    setSuccessMsg("");

    try {
      const reportRef = doc(db, "reports", report.id);
      const updatedConfirmedBy = [...(report.confirmedBy || []), currentUserUid];
      const newConfirmCount = (report.confirmCount || 0) + 1;

      // Auto verify threshold
      let newStatus = report.status;
      if (newStatus === ReportStatus.REPORTED && newConfirmCount >= 5) {
        newStatus = ReportStatus.VERIFIED;
      }

      await updateDoc(reportRef, {
        confirmCount: newConfirmCount,
        confirmedBy: updatedConfirmedBy,
        status: newStatus,
        updatedAt: new Date().toISOString()
      });

      // Update user points in DB
      const userRef = doc(db, "users", currentUserUid);
      const userDoc = await getDoc(userRef);
      if (userDoc.exists()) {
        const currentPoints = userDoc.data().points || 0;
        await updateDoc(userRef, {
          points: currentPoints + 2
        });
      }

      // Check auto-escalation criteria (status is Verified with severity >= 4 OR confirmCount >= 10 at any severity)
      const isEligibleForEscalation = 
        (newStatus === ReportStatus.VERIFIED && report.severityScore >= 4) || 
        (newConfirmCount >= 10);

      let finalStatus = newStatus;
      let finalMsg = "Verification logged! You earned +2 points.";

      if (isEligibleForEscalation && report.status !== ReportStatus.ESCALATED && report.status !== ReportStatus.IN_PROGRESS && report.status !== ReportStatus.RESOLVED) {
        try {
          await triggerEscalationAgent(false, newConfirmCount);
          finalStatus = ReportStatus.ESCALATED;
          finalMsg = "Verification logged! Escalation criteria met: Escalation Agent activated and drafted official complaint autonomously!";
        } catch (escalateErr) {
          console.error("Auto escalation trigger failed:", escalateErr);
        }
      }

      setSuccessMsg(finalMsg);
      onUpdateReport({
        ...report,
        confirmCount: newConfirmCount,
        confirmedBy: updatedConfirmedBy,
        status: finalStatus,
        updatedAt: new Date().toISOString()
      });
    } catch (err: any) {
      console.error(err);
      setError("Failed to record verification.");
    } finally {
      setLoading(false);
    }
  };

  // Admin Status Transition Action
  const handleAdminStatusChange = async (newStatus: ReportStatus) => {
    setLoading(true);
    setError("");
    setSuccessMsg("");

    try {
      const reportRef = doc(db, "reports", report.id);
      const updateData: any = {
        status: newStatus,
        updatedAt: new Date().toISOString()
      };

      if (newStatus === ReportStatus.ESCALATED) {
        updateData.escalatedAt = new Date().toISOString();
      }

      await updateDoc(reportRef, updateData);

      // Create Escalation doc via backend if moving to Escalated
      if (newStatus === ReportStatus.ESCALATED) {
        try {
          await triggerEscalationAgent(false);
          setSuccessMsg(`Status updated to Escalated! Escalation Agent drafted complaint autonomously.`);
        } catch (escErr) {
          console.error("Manual escalation API trigger failed:", escErr);
          // Fallback static complaint if backend fails
          const escalationRef = doc(db, "escalations", `esc-${report.id}-init`);
          await setDoc(escalationRef, {
            id: `esc-${report.id}-init`,
            reportId: report.id,
            draftedComplaintText: `OFFICIAL COMPLAINT: ${report.category} reported at location. ${report.description}`,
            targetDepartment: `${report.category} Control Division`,
            sentAt: new Date().toISOString(),
            status: "Sent",
            urgency: "High"
          });
        }
      } else {
        setSuccessMsg(`Status updated to ${newStatus}!`);
      }

      onUpdateReport({
        ...report,
        status: newStatus,
        updatedAt: new Date().toISOString()
      });
    } catch (err: any) {
      console.error(err);
      setError("Failed to update report status.");
    } finally {
      setLoading(false);
    }
  };

  // Simulate 7 Days Passing in Escalated State (Drafts urgent follow-up)
  const handleSimulateSevenDays = async () => {
    setLoading(true);
    setEscalating(true);
    setError("");
    setSuccessMsg("");
    try {
      await triggerEscalationAgent(true);
      setSuccessMsg("Simulation complete! 7 simulated days of unresolved status checked. Autonomous Follow-Up Escalation letter drafted and sent with critical urgency!");
      onUpdateReport({
        ...report,
        updatedAt: new Date().toISOString()
      });
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to run 7-day simulation.");
    } finally {
      setLoading(false);
      setEscalating(false);
    }
  };

  // Demo Override: Force Escalate complaint to test the agent immediately
  const handleForceEscalate = async () => {
    setLoading(true);
    setEscalating(true);
    setError("");
    setSuccessMsg("");
    try {
      await triggerEscalationAgent(false);
      setSuccessMsg("Demo Override: Autonomous Escalation Agent triggered successfully! Official civic complaint drafted.");
      onUpdateReport({
        ...report,
        status: ReportStatus.ESCALATED,
        updatedAt: new Date().toISOString()
      });
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to force escalate report.");
    } finally {
      setLoading(false);
      setEscalating(false);
    }
  };

  // Direct editing/finalization of drafted complaints
  const handleEditEscalation = (escId: string, text: string) => {
    setEditingEscId(escId);
    setEditedDraftText(text);
  };

  const handleSaveEscalation = async (escId: string) => {
    setLoading(true);
    setError("");
    setSuccessMsg("");
    try {
      const escRef = doc(db, "escalations", escId);
      await updateDoc(escRef, {
        draftedComplaintText: editedDraftText
      });
      setSuccessMsg("Complaint draft successfully edited and saved!");
      setEditingEscId(null);
    } catch (err: any) {
      console.error("Error editing escalation:", err);
      setError("Failed to save changes to the draft.");
    } finally {
      setLoading(false);
    }
  };

  const handleUnmergeReport = async () => {
    setLoading(true);
    setError("");
    setSuccessMsg("");
    try {
      // Perform local client-side unmerge operations
      const targetId = report.id;
      if (!targetId) throw new Error("Report ID is missing.");

      const dupReportRef = doc(db, "reports", targetId);
      const dupReportSnap = await getDoc(dupReportRef);
      if (!dupReportSnap.exists()) {
        throw new Error("Duplicate report not found.");
      }

      const dupData = dupReportSnap.data();
      if (!dupData.isDuplicate || !dupData.parentReportId) {
        throw new Error("This report is not a merged duplicate.");
      }

      const parentReportId = dupData.parentReportId;
      const parentReportRef = doc(db, "reports", parentReportId);
      const parentReportSnap = await getDoc(parentReportRef);

      // 1. Restore duplicate report as a primary report
      await updateDoc(dupReportRef, {
        isDuplicate: false,
        parentReportId: deleteField(),
        similarityScore: deleteField(),
        status: "Reported",
        confirmCount: 1,
        confirmedBy: [dupData.reporterUid],
        updatedAt: new Date().toISOString()
      });

      // 2. Adjust parent report's confirmations if the parent exists
      if (parentReportSnap.exists()) {
        const parentData = parentReportSnap.data();
        const updatedConfirmedBy = (parentData.confirmedBy || []).filter((uid: string) => uid !== dupData.reporterUid);
        const newConfirmCount = Math.max(0, (parentData.confirmCount || 0) - 1);

        let newStatus = parentData.status;
        if (newStatus === "Verified" && newConfirmCount < 5) {
          newStatus = "Reported";
        }

        await updateDoc(parentReportRef, {
          confirmCount: newConfirmCount,
          confirmedBy: updatedConfirmedBy,
          status: newStatus,
          updatedAt: new Date().toISOString()
        });
      }

      setSuccessMsg("Report unmerged successfully! Restored as a primary complaint.");
      
      // Update local report object to trigger parent re-renders
      onUpdateReport({
        ...report,
        isDuplicate: false,
        parentReportId: undefined,
        similarityScore: undefined,
        status: ReportStatus.REPORTED,
        updatedAt: new Date().toISOString()
      });
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to unmerge report.");
    } finally {
      setLoading(false);
    }
  };

  const handleUnmergeDuplicate = async (dupId: string) => {
    setLoading(true);
    setError("");
    setSuccessMsg("");
    try {
      // Perform local client-side duplicate unmerge operations
      const dupReportRef = doc(db, "reports", dupId);
      const dupReportSnap = await getDoc(dupReportRef);
      if (!dupReportSnap.exists()) {
        throw new Error("Duplicate report not found.");
      }

      const dupData = dupReportSnap.data();
      if (!dupData.isDuplicate || !dupData.parentReportId) {
        throw new Error("This report is not a merged duplicate.");
      }

      const parentReportId = dupData.parentReportId;
      const parentReportRef = doc(db, "reports", parentReportId);
      const parentReportSnap = await getDoc(parentReportRef);

      // 1. Restore duplicate report as a primary report
      await updateDoc(dupReportRef, {
        isDuplicate: false,
        parentReportId: deleteField(),
        similarityScore: deleteField(),
        status: "Reported",
        confirmCount: 1,
        confirmedBy: [dupData.reporterUid],
        updatedAt: new Date().toISOString()
      });

      // 2. Adjust parent report's confirmations if the parent exists
      if (parentReportSnap.exists()) {
        const parentData = parentReportSnap.data();
        const updatedConfirmedBy = (parentData.confirmedBy || []).filter((uid: string) => uid !== dupData.reporterUid);
        const newConfirmCount = Math.max(0, (parentData.confirmCount || 0) - 1);

        let newStatus = parentData.status;
        if (newStatus === "Verified" && newConfirmCount < 5) {
          newStatus = "Reported";
        }

        await updateDoc(parentReportRef, {
          confirmCount: newConfirmCount,
          confirmedBy: updatedConfirmedBy,
          status: newStatus,
          updatedAt: new Date().toISOString()
        });
      }

      setSuccessMsg("Duplicate report successfully unmerged!");
      
      const updatedConfirmedBy = (report.confirmedBy || []).filter(uid => {
        const dupReport = (reports || []).find(r => r.id === dupId);
        return dupReport ? uid !== dupReport.reporterUid : true;
      });
      
      onUpdateReport({
        ...report,
        confirmCount: Math.max(1, report.confirmCount - 1),
        confirmedBy: updatedConfirmedBy,
        updatedAt: new Date().toISOString()
      });
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to unmerge duplicate.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-[#1B4332]/10 overflow-hidden shadow-xl shadow-[#1B4332]/5 flex flex-col md:flex-row max-w-5xl mx-auto" id="report-detail-modal">
      {/* Photo Column */}
      <div className="w-full md:w-1/2 aspect-video md:aspect-auto md:min-h-[400px] bg-slate-900 relative">
        {report.photoUrl ? (
          <img 
            src={report.photoUrl} 
            alt={report.category} 
            className="w-full h-full object-cover" 
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center p-6 text-slate-500">
            <AlertTriangle className="h-16 w-16 text-[#E76F51]/40 mb-2" />
            <span className="text-xs font-semibold text-slate-400">No Photo Submitted</span>
          </div>
        )}
        <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-md text-white text-[11px] font-bold px-3 py-1.5 rounded-xl border border-white/10 flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 text-[#E76F51]" />
          <span>Lat: {report.lat.toFixed(4)}, Lng: {report.lng.toFixed(4)}</span>
        </div>
      </div>

      {/* Details Column */}
      <div className="w-full md:w-1/2 p-6 sm:p-8 flex flex-col justify-between space-y-6">
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="text-[10px] font-extrabold text-[#E76F51] uppercase tracking-widest block mb-1">
                {report.category}
              </span>
              <h3 className="text-xl font-bold text-[#1B4332] line-clamp-2">
                Civic Record #{report.id.slice(-6).toUpperCase()}
              </h3>
            </div>
            <button
              id="report-detail-close-btn"
              onClick={onClose}
              className="p-1.5 hover:bg-slate-50 rounded-xl text-slate-400 hover:text-slate-600 transition"
            >
              ✕
            </button>
          </div>

          {/* Severity and confirmations */}
          <div className="flex flex-wrap gap-2">
            <span className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border flex items-center gap-1.5 ${getSeverityBg(report.severityScore)}`}>
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>{getSeverityLabel(report.severityScore)} (Level {report.severityScore})</span>
            </span>
            <span className="text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-slate-100 bg-slate-50 text-slate-600 flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-slate-400" />
              <span>{report.confirmCount} Confirmations</span>
            </span>
          </div>

          {/* Description */}
          <div className="bg-[#FDFBF7] p-4 rounded-2xl border border-[#1B4332]/5">
            <h4 className="text-[10px] font-bold text-[#1B4332]/50 uppercase tracking-wider mb-2 flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-[#E76F51]" /> Official Complaint Draft
            </h4>
            <p className="text-xs text-slate-700 leading-relaxed font-sans">
              {report.description}
            </p>
          </div>

          {/* If duplicate warning panel */}
          {report.isDuplicate && (
            <div className="bg-amber-50/75 border border-amber-200/60 p-4 rounded-2xl space-y-2.5">
              <div className="flex items-center gap-1.5 text-amber-800 text-xs font-bold">
                <AlertTriangle className="h-4 w-4 text-[#E76F51]" />
                <span>Merged Duplicate ({Math.round((report.similarityScore || 0) * 100)}% Similarity)</span>
              </div>
              <p className="text-[11px] text-amber-700/90 leading-relaxed font-medium">
                This report was automatically merged into its parent civic issue because it was filed within 150 meters and shares highly similar visual and textual details.
              </p>
              {isAdmin && (
                <button
                  id="admin-override-unmerge-btn"
                  type="button"
                  onClick={handleUnmergeReport}
                  disabled={loading}
                  className="w-full bg-white hover:bg-amber-100 border border-amber-200 text-amber-900 font-extrabold text-[10px] py-2 px-3 rounded-xl transition uppercase tracking-wide flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-50"
                >
                  {loading ? "Processing unmerge..." : "Override Merge / Restore as Primary"}
                </button>
              )}
            </div>
          )}

          {/* List of associated duplicates if current report is parent */}
          {mergedDuplicates.length > 0 && (
            <div className="space-y-2.5 bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
              <h4 className="text-[10px] font-bold text-[#1B4332]/60 uppercase tracking-wider flex items-center gap-1">
                <Users className="h-3.5 w-3.5 text-brand-orange" /> Merged Duplicate Reports ({mergedDuplicates.length})
              </h4>
              <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                {mergedDuplicates.map((dup) => (
                  <div key={dup.id} className="p-2.5 bg-white border border-slate-100 rounded-xl flex items-center justify-between gap-3 text-xxs">
                    <div className="space-y-0.5 flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-extrabold text-slate-700 uppercase">#{dup.id.slice(-6)}</span>
                        <span className="bg-amber-50 text-amber-800 font-extrabold px-1.5 py-0.5 rounded text-[8px] border border-amber-100">
                          {Math.round((dup.similarityScore || 0) * 100)}% Sim
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 font-medium truncate italic">"{dup.description}"</p>
                      <p className="text-[9px] text-slate-400">By {dup.reporterName || "Anonymous"} • {new Date(dup.createdAt).toLocaleDateString()}</p>
                    </div>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => handleUnmergeDuplicate(dup.id)}
                        disabled={loading}
                        className="bg-slate-50 hover:bg-red-50 text-red-600 border border-slate-200 hover:border-red-100 font-extrabold px-2 py-1 rounded-lg transition text-[9px] uppercase active:scale-95 shrink-0 disabled:opacity-50"
                      >
                        Unmerge
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Autonomous Escalation Agent Hub */}
          <div className="bg-[#1B4332]/5 p-4 rounded-2xl border border-[#1B4332]/10 space-y-3" id="escalation-hub-section">
            <div className="flex items-center justify-between">
              <h4 className="text-[10px] font-extrabold text-[#1B4332] uppercase tracking-wider flex items-center gap-1.5">
                <History className="h-4 w-4 text-[#E76F51]" />
                <span>Autonomous Escalation Hub</span>
              </h4>
              <span className="bg-[#E76F51]/10 text-[#E76F51] font-extrabold text-[8px] px-2 py-0.5 rounded-full border border-[#E76F51]/20 uppercase tracking-widest flex items-center gap-1 shrink-0">
                <Sparkles className="h-2 w-2" /> Multi-Step Agent
              </span>
            </div>

            {escalations.length > 0 ? (
              <div className="space-y-4 relative pl-3 border-l border-[#1B4332]/15 ml-2 mt-2">
                {escalations.map((esc, index) => {
                  const isFollowUp = esc.status === "FollowUp";
                  const isExpanded = expandedEscId === esc.id;
                  const isEditing = editingEscId === esc.id;

                  return (
                    <div key={esc.id} className="relative space-y-1.5">
                      {/* Circle Dot Connector */}
                      <div className={`absolute -left-[18.5px] top-1.5 h-3 w-3 rounded-full border flex items-center justify-center ${
                        isFollowUp 
                          ? "bg-[#E76F51] border-[#E76F51] text-white" 
                          : "bg-[#1B4332] border-[#1B4332] text-white"
                      } shadow-sm`}>
                        {isFollowUp ? (
                          <AlertCircle className="h-1.5 w-1.5" />
                        ) : (
                          <Send className="h-1.5 w-1.5" />
                        )}
                      </div>

                      {/* Header info */}
                      <div className="flex items-start justify-between gap-2 min-w-0">
                        <div className="space-y-0.5">
                          <p className="text-[11px] font-extrabold text-[#1B4332] uppercase tracking-wide">
                            {isFollowUp 
                              ? `Follow-Up Escalation` 
                              : `Initial Civic Escalation`}
                          </p>
                          <p className="text-[9px] text-slate-500 font-medium">
                            To: <span className="font-semibold text-slate-700 text-xxs">{esc.targetDepartment}</span>
                          </p>
                          <p className="text-[9px] text-slate-400">
                            Sent: {new Date(esc.sentAt).toLocaleString()}
                          </p>
                        </div>

                        {/* Urgency Badge */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className={`text-[8px] font-extrabold px-1.5 py-0.5 rounded border uppercase tracking-wider ${
                            esc.urgency === "Critical"
                              ? "bg-red-50 text-red-700 border-red-200"
                              : "bg-amber-50 text-amber-700 border-amber-200"
                          }`}>
                            {esc.urgency || "High"}
                          </span>
                          <button
                            type="button"
                            onClick={() => setExpandedEscId(isExpanded ? null : esc.id)}
                            className="p-1 hover:bg-[#1B4332]/5 rounded-lg text-slate-400 hover:text-slate-600 transition"
                          >
                            {isExpanded ? (
                              <ChevronUp className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronDown className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Collapsible details pane */}
                      {isExpanded && (
                        <div className="bg-white rounded-xl border border-[#1B4332]/10 p-3 shadow-inner space-y-2 mt-1">
                          <div className="flex items-center justify-between text-[9px] border-b border-slate-100 pb-1.5">
                            <span className="text-slate-400 font-bold flex items-center gap-1">
                              <Sparkles className="h-2.5 w-2.5 text-amber-500" />
                              🤖 AI-Assisted Complaint (Editable)
                            </span>
                            {!isEditing && (
                              <button
                                type="button"
                                onClick={() => handleEditEscalation(esc.id, esc.draftedComplaintText)}
                                className="text-emerald-700 hover:text-emerald-800 font-extrabold flex items-center gap-1 uppercase tracking-wide"
                              >
                                <Edit2 className="h-2.5 w-2.5" /> Edit Draft
                              </button>
                            )}
                          </div>

                          {isEditing ? (
                            <div className="space-y-2">
                              <textarea
                                value={editedDraftText}
                                onChange={(e) => setEditedDraftText(e.target.value)}
                                className="w-full h-44 text-[10px] font-mono border border-slate-200 rounded-lg p-2 focus:ring-1 focus:ring-emerald-500 focus:outline-none leading-relaxed bg-slate-50"
                              />
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setEditingEscId(null)}
                                  className="px-2.5 py-1 text-[9px] font-extrabold border border-slate-200 text-slate-500 rounded-lg hover:bg-slate-50 uppercase tracking-wide"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleSaveEscalation(esc.id)}
                                  className="px-2.5 py-1 text-[9px] font-extrabold bg-[#1B4332] text-white rounded-lg hover:bg-[#143225] uppercase tracking-wide flex items-center gap-1"
                                >
                                  <Save className="h-2.5 w-2.5" /> Save Changes
                                </button>
                              </div>
                            </div>
                          ) : (
                            <p className="text-[10px] text-slate-700 font-sans leading-relaxed whitespace-pre-line max-h-48 overflow-y-auto pr-1">
                              {esc.draftedComplaintText}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-white/80 border border-[#1B4332]/10 p-3 rounded-xl text-center space-y-2">
                <div className="flex justify-center text-[#1B4332]/40">
                  <ShieldAlert className="h-8 w-8 text-[#E76F51]/60 animate-pulse" />
                </div>
                <div className="space-y-1">
                  <p className="text-xxs font-extrabold text-[#1B4332] uppercase tracking-wider">
                    Agent Monitoring Status: Idle
                  </p>
                  <p className="text-[9px] text-slate-500 font-medium leading-relaxed max-w-xs mx-auto">
                    Escalation requires status <span className="font-bold text-slate-700">Verified</span> & severity <span className="font-bold text-slate-700">≥ 4</span>, OR <span className="font-bold text-slate-700">10+ citizens</span> confirmed on this complaint.
                  </p>
                </div>

                {/* Eligibility Checks status bar */}
                <div className="grid grid-cols-2 gap-2 text-[8px] bg-[#1B4332]/5 p-2 rounded-lg text-left">
                  <div>
                    <span className="text-slate-400 font-bold block">CURRENT STATUS</span>
                    <span className="font-extrabold text-slate-700 uppercase">{report.status}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-bold block">CONFIRMATIONS / SEVERITY</span>
                    <span className="font-extrabold text-[#E76F51] uppercase">{report.confirmCount} citizens / {report.severityScore || 3}★</span>
                  </div>
                </div>

                {/* Interactive Demo override button */}
                <button
                  type="button"
                  onClick={handleForceEscalate}
                  disabled={loading || escalating}
                  className="w-full bg-[#1B4332] hover:bg-[#143225] text-white font-extrabold text-[9px] py-2 px-3 rounded-lg transition uppercase tracking-wide flex items-center justify-center gap-1 shadow-sm active:scale-95 disabled:opacity-50"
                >
                  <Sparkles className="h-3 w-3 text-[#E76F51]" />
                  {escalating ? "Invoking Escalation Agent..." : "Force Trigger Escalation Agent (Demo Mode)"}
                </button>
              </div>
            )}

            {/* Delay simulation is displayed below when the report has transitioned to Escalated */}
            {report.status === ReportStatus.ESCALATED && (
              <div className="bg-amber-50/50 border border-amber-200/50 p-3 rounded-xl space-y-2 mt-2">
                <div className="flex items-center gap-1.5 text-xxs text-amber-800 font-bold">
                  <Clock className="h-3.5 w-3.5 text-[#E76F51]" />
                  <span>Civic Delay Simulation Panel</span>
                </div>
                <p className="text-[9px] text-amber-700/90 leading-relaxed font-medium">
                  Simulate 7 days of unresolved status in 'Escalated' mode to trigger the agent's autonomous follow-up letter with critical urgency.
                </p>
                <button
                  type="button"
                  onClick={handleSimulateSevenDays}
                  disabled={loading || escalating}
                  className="w-full bg-[#E76F51] hover:bg-[#d85d3f] text-white font-extrabold text-[9px] py-1.5 px-3 rounded-lg transition uppercase tracking-wide flex items-center justify-center gap-1 shadow-sm"
                >
                  {escalating ? "Drafting Urgent Follow-Up..." : "Simulate 7 Days (Trigger Follow-Up)"}
                </button>
              </div>
            )}
          </div>

          {/* Meta Info */}
          <div className="grid grid-cols-2 gap-4 text-[11px] border-b border-slate-100 pb-4">
            <div className="flex items-center gap-2 text-slate-500">
              <Calendar className="h-3.5 w-3.5 text-slate-400" />
              <div>
                <p className="font-bold text-[#1B4332]">Reported On</p>
                <p>{new Date(report.createdAt).toLocaleDateString()}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-slate-500">
              <Users className="h-3.5 w-3.5 text-slate-400" />
              <div>
                <p className="font-bold text-[#1B4332]">Reporter</p>
                <p className="line-clamp-1">{report.reporterName || "Anonymous Citizen"}</p>
              </div>
            </div>
          </div>

          {/* Status Pipeline Visual Stepper */}
          <div className="space-y-3 pt-2">
            <h4 className="text-[10px] font-bold text-[#1B4332]/50 uppercase tracking-wider">
              Resolution Pipeline Status
            </h4>
            <div className="flex items-center justify-between relative px-2" id="status-pipeline-stepper">
              {/* Stepper Connecting Line */}
              <div className="absolute top-[13px] left-8 right-8 h-1.5 bg-slate-100 -z-10 rounded">
                <div 
                  className="h-full bg-emerald-500 transition-all duration-300 rounded"
                  style={{ width: `${(currentStatusIndex / (statuses.length - 1)) * 100}%` }}
                />
              </div>

              {statuses.map((status, index) => {
                const isActive = index <= currentStatusIndex;
                const isCurrent = index === currentStatusIndex;

                return (
                  <div key={status} className="flex flex-col items-center">
                    <div 
                      className={`h-7.5 w-7.5 rounded-full border-2 flex items-center justify-center text-[10px] font-bold transition-all duration-300 ${
                        isActive 
                          ? "bg-emerald-500 border-emerald-600 text-white shadow-md shadow-emerald-500/10" 
                          : "bg-white border-slate-200 text-slate-400"
                      } ${isCurrent ? "ring-4 ring-emerald-100 scale-110" : ""}`}
                    >
                      {isActive ? <Check className="h-3 w-3" /> : index + 1}
                    </div>
                    <span className={`text-[9px] font-semibold mt-1.5 ${isActive ? "text-[#1B4332]" : "text-slate-400"} ${isCurrent ? "font-bold text-emerald-600" : ""}`}>
                      {status}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Action / Error Area */}
        <div className="space-y-3 pt-4 border-t border-slate-100">
          {error && <p className="text-xs text-red-600 font-semibold">{error}</p>}
          {successMsg && <p className="text-xs text-emerald-600 font-semibold">{successMsg}</p>}

          {/* Citizen upvote verification */}
          {!isAdmin ? (
            <button
              id="citizen-verify-btn"
              type="button"
              disabled={hasAlreadyConfirmed || loading}
              onClick={handleVerifyReport}
              className={`w-full flex items-center justify-center py-3 px-4 rounded-2xl text-xs font-bold border shadow-sm transition gap-2 ${
                hasAlreadyConfirmed
                  ? "bg-slate-50 border-slate-100 text-slate-400 cursor-not-allowed"
                  : "bg-emerald-500 hover:bg-emerald-600 border-emerald-600 text-white hover:scale-101"
              }`}
            >
              {hasAlreadyConfirmed ? (
                <>
                  <CheckCircle className="h-4 w-4" />
                  <span>You have verified this issue</span>
                </>
              ) : (
                <>
                  <Users className="h-4 w-4" />
                  <span>I See This Too (+5 Points)</span>
                </>
              )}
            </button>
          ) : (
            // Admin Controls
            <div className="bg-[#1B4332]/5 p-4 rounded-2xl border border-[#1B4332]/10 space-y-3" id="admin-controls-card">
              <div className="flex items-center gap-1.5 text-xs text-[#1B4332] font-bold">
                <ShieldAlert className="h-4 w-4 text-[#E76F51]" />
                <span>Administrative Status Controls</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {statuses.map((status) => {
                  const isCurrent = report.status === status;
                  return (
                    <button
                      key={status}
                      type="button"
                      onClick={() => handleAdminStatusChange(status)}
                      disabled={loading || isCurrent}
                      className={`text-[10px] font-bold py-2 px-2.5 rounded-xl border text-center transition ${
                        isCurrent 
                          ? "bg-[#1B4332] border-[#143225] text-white" 
                          : "bg-white border-slate-100 text-slate-600 hover:bg-slate-50 active:scale-95"
                      }`}
                    >
                      {status}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
