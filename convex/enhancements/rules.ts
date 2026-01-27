import type { EnhancementRule } from "./types";
import { temporalEnhancement, creatorEnhancement } from "./rules_identity";
import {
  technicalDocsEnhancement,
  academicEnhancement,
  codingEnhancement,
} from "./rules_technical";
import {
  currentEventsEnhancement,
  comparisonEnhancement,
  localInfoEnhancement,
  healthEnhancement,
} from "./rules_general";

/**
 * All enhancement rules
 */
export const ENHANCEMENT_RULES: EnhancementRule[] = [
  temporalEnhancement,
  creatorEnhancement,
  technicalDocsEnhancement,
  currentEventsEnhancement,
  academicEnhancement,
  comparisonEnhancement,
  localInfoEnhancement,
  codingEnhancement,
  healthEnhancement,
];
