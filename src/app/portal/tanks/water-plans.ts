/** The two water offers, and "advise us" — shared by the page and the action. */
export type WaterPlan = "overflow" | "automation" | "advise";

export const WATER_PLAN_LABEL: Record<WaterPlan, string> = {
  overflow: "Tank monitoring & overflow control",
  automation: "Complete pump-room automation",
  advise: "Not sure — advise us",
};
