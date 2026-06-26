/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import admin from "firebase-admin";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

// Load environment variables
dotenv.config();

console.log("[DEBUG] Starting CivicLens Backend server with native Firebase Admin SDK...");

const appInstance = admin.initializeApp({
  projectId: "vital-ace-6jkjx"
});

const db = getFirestore(appInstance, "ai-studio-77ea6c46-164f-4c08-8fd8-b4b6351fe6c3");

// Initialize Gemini Client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

/**
 * Robust helper: Calls Gemini with exponential backoff and dynamic failover to gemini-3.1-flash-lite if gemini-3.5-flash experiences high demand
 */
async function generateContentWithRetry(params: any, retries = 4, delayMs = 1000): Promise<any> {
  let modelToUse = params.model || "gemini-3.5-flash";
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await ai.models.generateContent({
        ...params,
        model: modelToUse
      });
    } catch (error: any) {
      const isTransient = 
        error.status === "UNAVAILABLE" || 
        error.status === 503 ||
        error.status === 429 ||
        error.message?.includes("503") || 
        error.message?.includes("temporarily unavailable") ||
        error.message?.includes("high demand") ||
        error.message?.includes("UNAVAILABLE");
      
      if (isTransient && attempt < retries) {
        if (attempt >= 2 && modelToUse === "gemini-3.5-flash") {
          console.warn(`[Gemini API] Switching to fallback model gemini-3.1-flash-lite due to high demand on gemini-3.5-flash`);
          modelToUse = "gemini-3.1-flash-lite";
        }
        console.warn(`[Gemini API] Transient error on attempt ${attempt}/${retries} with ${modelToUse}: ${error.message || error}. Retrying in ${delayMs}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        delayMs *= 2.5; // Exponential backoff
      } else {
        throw error;
      }
    }
  }
}

const app = express();
const PORT = 3000;

// Set body limit higher for base64 image triage uploads
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

/**
 * Helper: Haversine distance in meters between two lat/lng coordinates
 */
function getDistanceInMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371e3; // Earth's radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLng = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) *
    Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Helper: Cosine similarity between two vectors
 */
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dotProduct = 0.0;
  let normA = 0.0;
  let normB = 0.0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ============================================================================
// API ROUTES
// ============================================================================

/**
 * 1. AI Triage Route (Multimodal image + description analysis with retry handling)
 */
app.post("/api/triage", async (req, res) => {
  try {
    const { photoBase64, mimeType, userDescription } = req.body;
    
    if (!photoBase64 && !userDescription) {
      return res.status(400).json({ error: "Either a photo or a text description is required for triage." });
    }

    const parts: any[] = [];

    // Add photo component if present
    if (photoBase64) {
      parts.push({
        inlineData: {
          mimeType: mimeType || "image/jpeg",
          data: photoBase64,
        },
      });
    }

    // Add user's notes and the triage prompt instructions
    const promptText = `
      You are an expert public infrastructure inspector working on the CivicLens community app.
      Analyze the provided visual issue (from photo or description) and triage it.
      
      User-provided notes: "${userDescription || 'No description provided.'}"
      
      Please categorize and score this issue.
      1. Category: Must be strictly one of: "Pothole", "Water Leakage", "Streetlight", "Garbage/Waste", "Other Infrastructure".
      2. Severity: Score from 1 (minor/inconvenience) to 5 (extremely urgent, hazardous, or high risk to life and property).
      3. Description: Draft a structured, objective, and detailed one-paragraph complaint description suitable for submission to local municipal authorities. Describe the visual evidence, possible impact, and urgent need for repair.
    `;
    parts.push({ text: promptText });

    // Call Gemini with structured JSON output schema and resilient retry logic
    const response = await generateContentWithRetry({
      model: "gemini-3.5-flash",
      contents: { parts },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            category: {
              type: Type.STRING,
              enum: ["Pothole", "Water Leakage", "Streetlight", "Garbage/Waste", "Other Infrastructure"],
              description: "The primary category of the civic issue.",
            },
            severityScore: {
              type: Type.INTEGER,
              description: "An estimated severity score from 1 (minor) to 5 (urgent/hazardous) based on visual cues.",
            },
            description: {
              type: Type.STRING,
              description: "A clean, structured one-paragraph municipal complaint description.",
            },
          },
          required: ["category", "severityScore", "description"],
        },
      },
    });

    const resultText = response.text;
    if (!resultText) {
      throw new Error("Empty response from Gemini Triage.");
    }

    const triagedData = JSON.parse(resultText.trim());
    return res.json(triagedData);
  } catch (error: any) {
    console.error("Error in AI Triage:", error);
    return res.status(500).json({ error: error.message || "Failed to perform AI Triage." });
  }
});

/**
 * 2. Submit Report (With Server-Side Duplicate Check & Gamification using Firebase Admin)
 */
app.post("/api/reports/submit", async (req, res) => {
  try {
    const { 
      category, 
      severityScore, 
      description, 
      photoUrl, 
      lat, 
      lng, 
      reporterUid,
      reporterName,
      reporterEmail,
      existingReports = [],
      userPoints = 0,
      userBadges = []
    } = req.body;

    if (lat === undefined || lng === undefined || !reporterUid) {
      return res.status(400).json({ error: "Missing required report fields (lat, lng, reporterUid)." });
    }

    let finalCategory = category;
    let finalSeverity = severityScore;
    let finalDescription = description;

    // A. Perform Gemini triage on-the-fly if description or category/severity is missing, or verify photo
    if (photoUrl) {
      try {
        console.log("[DEBUG] Performing on-the-fly Gemini triage for submission...");
        // Strip base64 header if present
        let photoBase64 = photoUrl;
        let mimeType = "image/jpeg";
        if (photoUrl.startsWith("data:")) {
          const parts = photoUrl.split(",");
          photoBase64 = parts[1];
          const mimeMatch = parts[0].match(/data:(.*?);/);
          if (mimeMatch) mimeType = mimeMatch[1];
        }

        const parts: any[] = [];
        parts.push({
          inlineData: {
            mimeType,
            data: photoBase64,
          },
        });

        const promptText = `
          You are an expert public infrastructure inspector working on the CivicLens community app.
          Analyze the provided visual issue and triage it.
          
          Please categorize and score this issue.
          1. Category: Must be strictly one of: "Pothole", "Water Leakage", "Streetlight", "Garbage/Waste", "Other Infrastructure".
          2. Severity: Score from 1 (minor/inconvenience) to 5 (extremely urgent, hazardous, or high risk to life and property).
          3. Description: Draft a structured, objective, and detailed one-paragraph complaint description suitable for submission to local municipal authorities. Describe the visual evidence, possible impact, and urgent need for repair.
        `;
        parts.push({ text: promptText });

        const triageResponse = await generateContentWithRetry({
          model: "gemini-3.5-flash",
          contents: { parts },
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                category: {
                  type: Type.STRING,
                  enum: ["Pothole", "Water Leakage", "Streetlight", "Garbage/Waste", "Other Infrastructure"],
                },
                severityScore: {
                  type: Type.INTEGER,
                },
                description: {
                  type: Type.STRING,
                },
              },
              required: ["category", "severityScore", "description"],
            },
          },
        });

        const triagedData = JSON.parse(triageResponse.text.trim());
        // Use AI values if client-side did not provide them (or let edited values override if present)
        if (!finalCategory) finalCategory = triagedData.category;
        if (!finalSeverity) finalSeverity = triagedData.severityScore;
        if (!finalDescription) finalDescription = triagedData.description;
        
        console.log("[DEBUG] Completed on-submit Gemini triage:", triagedData);
      } catch (geminiErr: any) {
        console.error("On-submit Gemini triage failed (falling back to user data):", geminiErr);
      }
    }

    // Strict Fallback Defaults
    if (!finalCategory) finalCategory = "Other Infrastructure";
    if (!finalSeverity) finalSeverity = 3;
    if (!finalDescription) finalDescription = "A civic issue has been reported at this location.";

    // B. Generate embedding of the final complaint description using gemini-embedding-2-preview
    let descriptionEmbedding: number[] = [];
    try {
      const embedResponse = await ai.models.embedContent({
        model: "gemini-embedding-2-preview",
        contents: finalDescription,
      }) as any;
      
      if (embedResponse.embedding?.values) {
        descriptionEmbedding = embedResponse.embedding.values;
      }
    } catch (embedError) {
      console.error("Error generating text embedding:", embedError);
    }

    // C. Compare against existingReports passed by the client
    let duplicateFound = false;
    let duplicateReportId = "";
    let duplicateReportData: any = null;
    let maxSimilarity = 0;

    // Radius boundary and similarity thresholds (Explicit & commented for Hackathon Demo)
    const MATCH_RADIUS_METERS = 150; 
    const SIMILARITY_THRESHOLD = 0.85;

    for (const existingReport of existingReports) {
      if (existingReport.isDuplicate) continue;
      
      // Calculate distance between new report and existing open report
      const distance = getDistanceInMeters(lat, lng, existingReport.lat, existingReport.lng);
      
      if (distance <= MATCH_RADIUS_METERS) {
        // Calculate description cosine similarity if embedding is available
        if (descriptionEmbedding.length > 0 && existingReport.descriptionEmbedding) {
          const similarity = cosineSimilarity(descriptionEmbedding, existingReport.descriptionEmbedding);
          
          if (similarity >= SIMILARITY_THRESHOLD && similarity > maxSimilarity) {
            duplicateFound = true;
            duplicateReportId = existingReport.id;
            duplicateReportData = existingReport;
            maxSimilarity = similarity;
          }
        }
      }
    }

    // D. Perform points and badges update for user
    let currentPoints = userPoints;
    let currentBadges = [...userBadges];
    let pointsAwarded = 0;

    if (duplicateFound) {
      // Award verification points (+2) if user hasn't confirmed before
      const updatedConfirmedBy = [...(duplicateReportData.confirmedBy || [])];
      if (!updatedConfirmedBy.includes(reporterUid)) {
        updatedConfirmedBy.push(reporterUid);
        currentPoints += 2;
        pointsAwarded = 2;
      }

      // Prepare duplicate report data
      const dupReportData = {
        category: finalCategory,
        severityScore: finalSeverity,
        description: finalDescription,
        photoUrl: photoUrl || "",
        lat,
        lng,
        status: "Duplicate",
        isDuplicate: true,
        parentReportId: duplicateReportId,
        similarityScore: Number(maxSimilarity.toFixed(4)),
        confirmCount: 0,
        confirmedBy: [],
        reporterUid,
        reporterName: reporterName || "Anonymous Citizen",
        reporterEmail: reporterEmail || "",
        descriptionEmbedding,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Prepare parent updates
      const newConfirmCount = (duplicateReportData.confirmCount || 0) + 1;
      let newStatus = duplicateReportData.status;
      if (newStatus === "Reported" && newConfirmCount >= 5) {
        newStatus = "Verified";
      }

      const parentReportUpdates = {
        confirmCount: newConfirmCount,
        confirmedBy: updatedConfirmedBy,
        status: newStatus,
        updatedAt: new Date().toISOString()
      };

      return res.json({
        action: "merged",
        isDuplicate: true,
        parentReportId: duplicateReportId,
        parentReportUpdates,
        dupReportData,
        similarityScore: maxSimilarity,
        pointsEarned: pointsAwarded,
        userUpdates: {
          points: currentPoints,
          badges: currentBadges
        }
      });

    } else {
      // Award reporting points (+10)
      currentPoints += 10;
      pointsAwarded = 10;

      // Prepare brand new report
      const newReportData = {
        category: finalCategory,
        severityScore: finalSeverity,
        description: finalDescription,
        photoUrl: photoUrl || "",
        lat,
        lng,
        status: "Reported",
        confirmCount: 1,
        confirmedBy: [reporterUid],
        reporterUid,
        reporterName: reporterName || "Anonymous Citizen",
        descriptionEmbedding,
        isDuplicate: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Calculate badges locally based on user's reports passed
      const categoryCounts: { [key: string]: number } = {
        "Pothole": 0,
        "Streetlight": 0,
        "Water Leakage": 0,
        "Garbage/Waste": 0,
        "Other Infrastructure": 0
      };

      existingReports.forEach((r: any) => {
        if (r.reporterUid === reporterUid) {
          if (r.category === "Pothole") categoryCounts["Pothole"]++;
          if (r.category === "Streetlight") categoryCounts["Streetlight"]++;
          if (r.category === "Water Leakage") categoryCounts["Water Leakage"]++;
          if (r.category === "Garbage/Waste" || r.category === "Garbage") categoryCounts["Garbage/Waste"]++;
          if (r.category === "Other Infrastructure") categoryCounts["Other Infrastructure"]++;
        }
      });

      // Add the current submission
      if (finalCategory === "Pothole") categoryCounts["Pothole"]++;
      if (finalCategory === "Streetlight") categoryCounts["Streetlight"]++;
      if (finalCategory === "Water Leakage") categoryCounts["Water Leakage"]++;
      if (finalCategory === "Garbage/Waste") categoryCounts["Garbage/Waste"]++;
      if (finalCategory === "Other Infrastructure") categoryCounts["Other Infrastructure"]++;

      // Check badge triggers
      const newBadges = [...currentBadges];
      if (categoryCounts["Pothole"] >= 5 && !newBadges.includes("Pothole Patrol")) {
        newBadges.push("Pothole Patrol");
      }
      if (categoryCounts["Streetlight"] >= 5 && !newBadges.includes("Streetlight Sentinel")) {
        newBadges.push("Streetlight Sentinel");
      }
      if (categoryCounts["Water Leakage"] >= 5 && !newBadges.includes("Water Warden")) {
        newBadges.push("Water Warden");
      }
      if (categoryCounts["Garbage/Waste"] >= 5 && !newBadges.includes("Garbage Guardian")) {
        newBadges.push("Garbage Guardian");
      }
      if (categoryCounts["Other Infrastructure"] >= 5 && !newBadges.includes("Infrastructure Inspector")) {
        newBadges.push("Infrastructure Inspector");
      }

      return res.json({
        action: "created",
        isDuplicate: false,
        newReportData,
        pointsEarned: pointsAwarded,
        userUpdates: {
          points: currentPoints,
          badges: newBadges
        }
      });
    }
  } catch (error: any) {
    console.error("Error in report submission:", error);
    return res.status(500).json({ error: error.message || "Failed to submit report." });
  }
});

/**
 * 2b. Unmerge/Override Duplicate Report (Admin Only)
 */
app.post("/api/reports/unmerge", async (req, res) => {
  try {
    const { reportId } = req.body;
    if (!reportId) {
      return res.status(400).json({ error: "Missing reportId to unmerge." });
    }

    const dupReportRef = db.collection("reports").doc(reportId);
    const dupReportDoc = await dupReportRef.get();
    if (!dupReportDoc.exists) {
      return res.status(404).json({ error: "Duplicate report not found." });
    }

    const dupData = dupReportDoc.data() || {};
    if (!dupData.isDuplicate || !dupData.parentReportId) {
      return res.status(400).json({ error: "This report is not a merged duplicate." });
    }

    const parentReportId = dupData.parentReportId;
    const parentReportRef = db.collection("reports").doc(parentReportId);
    const parentReportDoc = await parentReportRef.get();

    // 1. Restore duplicate report as a primary report
    await dupReportRef.update({
      isDuplicate: false,
      parentReportId: FieldValue.delete(),
      similarityScore: FieldValue.delete(),
      status: "Reported",
      confirmCount: 1,
      confirmedBy: [dupData.reporterUid],
      updatedAt: new Date().toISOString()
    });

    // 2. Adjust parent report's confirmations if the parent exists
    if (parentReportDoc.exists) {
      const parentData = parentReportDoc.data() || {};
      const updatedConfirmedBy = (parentData.confirmedBy || []).filter((uid: string) => uid !== dupData.reporterUid);
      const newConfirmCount = Math.max(0, (parentData.confirmCount || 0) - 1);

      let newStatus = parentData.status;
      if (newStatus === "Verified" && newConfirmCount < 5) {
        newStatus = "Reported";
      }

      await parentReportRef.update({
        confirmCount: newConfirmCount,
        confirmedBy: updatedConfirmedBy,
        status: newStatus,
        updatedAt: new Date().toISOString()
      });
    }

    return res.json({
      success: true,
      message: "Report successfully unmerged and restored as a primary civic complaint."
    });
  } catch (error: any) {
    console.error("Error unmerging report:", error);
    return res.status(500).json({ error: error.message || "Failed to unmerge report." });
  }
});

/**
 * Helper: Infer department from issue category
 */
function getDepartment(category: string): string {
  const cat = category || "";
  if (cat === "Pothole" || cat === "Streetlight") {
    return "Municipal Engineering Department";
  } else if (cat === "Water Leakage") {
    return "Water Supply and Sewerage Board";
  } else if (cat === "Garbage/Waste" || cat === "Garbage") {
    return "Sanitation and Waste Management Department";
  } else {
    return "Public Works and Infrastructure Department";
  }
}

/**
 * 2c. Escalation Agent Route (AI-assisted Multi-step Autonomous Civic Escalation)
 * Completely stateless to avoid server-side Firestore credential / permission issues.
 */
app.post("/api/reports/escalate", async (req, res) => {
  try {
    const { 
      reportId, 
      category = "Infrastructure", 
      severity = 3, 
      description = "No description provided.", 
      confirmCount = 1, 
      lat = 0, 
      lng = 0, 
      simulateFollowUp 
    } = req.body;

    if (!reportId) {
      return res.status(400).json({ error: "Missing reportId." });
    }

    const targetDepartment = getDepartment(category);

    if (simulateFollowUp) {
      // -------------------------------------------------------------
      // 2. SIMULATE FOLLOW-UP ESCALATION (7+ Days Unresolved)
      // -------------------------------------------------------------
      console.log(`[Escalation Agent] Triggering stateless 7-day follow-up escalation for report ${reportId}`);
      
      const prevRef = `REF-CIVIC-${reportId.substring(0, 6).toUpperCase()}`;
      const prompt = `Draft a highly urgent, firm, but professional follow-up escalation letter to the head of the "${targetDepartment}" department.
Subject: SECOND NOTICE & ESCALATION: Unresolved Public Safety Issue - ${category} (Complaint Ref: ${prevRef})
Details:
- Issue Category: ${category}
- Location coordinates: Latitude ${lat}, Longitude ${lng}
- Severity level: ${severity}/5
- Citizen confirmations: ${confirmCount} local residents verified this issue
- Original complaint description: "${description}"

This critical public service issue was escalated 7 days ago and remains entirely unresolved (status is still 'Escalated', has not transitioned to 'In Progress').
The local community is highly dissatisfied with the municipal delay and lack of action. Citing public safety, demand immediate deployment of a repair crew and request a formal status update within 24 hours. Keep the tone extremely firm, authoritative, and community-centered, yet professional. Begin with a formal letter header and address.`;

      const aiResponse = await generateContentWithRetry({
        model: "gemini-3.5-flash",
        contents: prompt
      });

      const draftText = aiResponse.text || "Failed to generate follow-up draft.";

      return res.json({
        success: true,
        action: "followup",
        message: "7-day follow-up escalation letter drafted autonomously with critical urgency!",
        draftedComplaintText: draftText,
        targetDepartment
      });

    } else {
      // -------------------------------------------------------------
      // 1. INITIAL ESCALATION
      // -------------------------------------------------------------
      console.log(`[Escalation Agent] Running stateless initial escalation for report ${reportId}`);
      const refCode = `REF-CIVIC-${reportId.substring(0, 6).toUpperCase()}`;
      const prompt = `Draft a formal, highly professional civic complaint letter addressed to the "${targetDepartment}".
Subject: OFFICIAL CIVIC COMPLAINT & ESCALATION: ${category} Issue - Ref Code ${refCode}
Details:
- Category of complaint: ${category}
- Geographic Location: Latitude ${lat}, Longitude ${lng}
- Severity score of the problem: ${severity}/5
- Verified and supported by: ${confirmCount} local citizens who also clicked 'I see this too'
- Description of issue from citizens: "${description}"

Please write a structured, elegant, and persuasive letter demanding attention to this issue. State that the issue has passed the civic consensus threshold for urgent municipal action. Propose immediate inspection and remediation. Maintain a formal, constructive, and public-spirited tone. Begin with a formal letter header and address.`;

      const aiResponse = await generateContentWithRetry({
        model: "gemini-3.5-flash",
        contents: prompt
      });

      const draftText = aiResponse.text || "Failed to generate complaint draft.";

      return res.json({
        success: true,
        action: "escalated",
        message: "Issue has reached escalation threshold! Autonomous civic complaint drafted successfully.",
        draftedComplaintText: draftText,
        targetDepartment
      });
    }
  } catch (error: any) {
    console.error("Error in escalation agent route:", error);
    return res.status(500).json({ error: error.message || "Failed to process escalation." });
  }
});

/**
 * 3. Stats and Hotspot Route for Dashboard using Admin SDK
 */
app.get("/api/stats", async (req, res) => {
  try {
    const querySnapshot = await db.collection("reports").get();
    const reports: any[] = [];
    querySnapshot.forEach((docSnap) => {
      reports.push(docSnap.data());
    });

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

    // Group reports geographically into grid zones of ~1km
    const hotspotGroups: { [gridKey: string]: { lat: number, lng: number, count: number, name: string } } = {};

    recentReports.forEach((r) => {
      // Grid round to ~0.01 precision (~1km)
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

    return res.json({
      totalReports,
      resolvedCount,
      avgResolutionHours,
      hotspots
    });
  } catch (error: any) {
    console.error("Error in calculating stats:", error);
    return res.status(500).json({ error: error.message || "Failed to retrieve statistics." });
  }
});




// ============================================================================
// VITE CLIENT INTEGRATION
// ============================================================================

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
  });
}

startServer();
