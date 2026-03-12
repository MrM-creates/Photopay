import type { EvaluatedSelection } from "@/types/domain";

export function evaluateSelection(args: {
  selectedCount: number;
  includedCount: number;
  allowExtra: boolean;
  basePriceCents: number;
  extraUnitPriceCents: number | null;
}): EvaluatedSelection {
  const { selectedCount, includedCount, allowExtra, basePriceCents, extraUnitPriceCents } = args;

  const missingCount = Math.max(0, includedCount - selectedCount);
  const extraCount = Math.max(0, selectedCount - includedCount);
  const safeExtraUnit = extraUnitPriceCents ?? 0;
  const extraCostCents = extraCount * safeExtraUnit;

  if (selectedCount < includedCount) {
    return {
      selectedCount,
      includedCount,
      allowExtra,
      missingCount,
      extraCount,
      extraCostCents,
      lineTotalCents: basePriceCents,
      selectionStatus: "INCOMPLETE",
      checkoutEligible: false,
      message: `${missingCount} Bild${missingCount === 1 ? "" : "er"} fehlt fuer dieses Paket.`,
    };
  }

  if (!allowExtra && selectedCount > includedCount) {
    return {
      selectedCount,
      includedCount,
      allowExtra,
      missingCount,
      extraCount,
      extraCostCents: 0,
      lineTotalCents: basePriceCents,
      selectionStatus: "EXTRA_BLOCKED",
      checkoutEligible: false,
      message: `Dieses Paket erlaubt maximal ${includedCount} Bilder.`,
    };
  }

  if (allowExtra && selectedCount > includedCount) {
    return {
      selectedCount,
      includedCount,
      allowExtra,
      missingCount,
      extraCount,
      extraCostCents,
      lineTotalCents: basePriceCents + extraCostCents,
      selectionStatus: "EXTRA_PRICED",
      checkoutEligible: true,
      message: `${extraCount} Zusatzbild${extraCount === 1 ? "" : "er"} wird zum Einzelpreis berechnet.`,
    };
  }

  return {
    selectedCount,
    includedCount,
    allowExtra,
    missingCount: 0,
    extraCount: 0,
    extraCostCents: 0,
    lineTotalCents: basePriceCents,
    selectionStatus: "EXACT",
    checkoutEligible: true,
    message: "Paket ist vollstaendig ausgewaehlt.",
  };
}
