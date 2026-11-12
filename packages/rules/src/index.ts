/**
 * NFS hub roster engine — shared by Gateline now and Rampline after the back-end merge.
 * Rule modules with manager-editable settings, 15-minute coverage, a week optimiser,
 * ranked gap fixes and a staffing outlook.
 */
export * from "./shifts";
export * from "./config";
export * from "./coverage";
export * from "./eligibility";
export * from "./check";
export * from "./optimise";
export * from "./fixes";
export * from "./outlook";
export { SHIFTS } from "@nfs/db";
