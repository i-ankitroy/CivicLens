/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export enum IssueCategory {
  POTHOLE = "Pothole",
  WATER_LEAKAGE = "Water Leakage",
  STREETLIGHT = "Streetlight",
  GARBAGE_WASTE = "Garbage/Waste",
  OTHER_INFRASTRUCTURE = "Other Infrastructure"
}

export enum ReportStatus {
  REPORTED = "Reported",
  VERIFIED = "Verified",
  ESCALATED = "Escalated",
  IN_PROGRESS = "In Progress",
  RESOLVED = "Resolved"
}

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  points: number;
  badges: string[];
}

export interface IssueReport {
  id: string;
  category: IssueCategory;
  severityScore: number; // 1 to 5
  description: string;
  photoUrl?: string;
  lat: number;
  lng: number;
  status: ReportStatus;
  confirmCount: number;
  confirmedBy: string[]; // array of user uids who confirmed
  reporterUid: string;
  reporterName?: string;
  descriptionEmbedding?: number[];
  isDuplicate?: boolean;
  parentReportId?: string;
  similarityScore?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Escalation {
  id: string;
  reportId: string;
  draftedComplaintText: string;
  targetDepartment: string;
  sentAt: string;
  status: string;
}

export interface LeaderboardUser {
  uid: string;
  displayName: string;
  points: number;
  badges: string[];
}

export interface TriageResponse {
  category: IssueCategory;
  severityScore: number;
  description: string;
}

export interface ReportSubmitResponse {
  action: "created" | "merged";
  reportId: string;
  isDuplicate: boolean;
  pointsEarned: number;
}
