export type SelectionStatus = "INCOMPLETE" | "EXACT" | "EXTRA_BLOCKED" | "EXTRA_PRICED";

export type EvaluatedSelection = {
  selectedCount: number;
  includedCount: number;
  allowExtra: boolean;
  missingCount: number;
  extraCount: number;
  extraCostCents: number;
  lineTotalCents: number;
  selectionStatus: SelectionStatus;
  checkoutEligible: boolean;
  message: string;
};
