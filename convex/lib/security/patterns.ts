/**
 * Comprehensive injection pattern library
 * This module contains patterns for detecting and preventing various injection attacks
 * Patterns are organized by attack type for maintainability and testing
 */

/**
 * Main injection patterns organized by category
 */
export const INJECTION_PATTERNS = {
  /**
   * System command injection attempts
   * These try to make the AI think it's receiving system-level instructions
   */
  systemCommands: [
    /sys[\s\-_]*tem[\s\-_]*[:：]/gi,
    /assistant[\s\-_]*[:：]/gi,
    /system[\s\-_]*prompt[\s\-_]*[:：]/gi,
    /system[\s\-_]*message[\s\-_]*[:：]/gi,
    /\[system\]/gi,
    /<<SYS>>/gi,
    /<<<[\s]*SYS[\s]*>>>/gi,
    /\{\{system\}\}/gi,
    /##[\s]*System/gi,
    /###[\s]*System/gi,
  ],

  /**
   * Instruction override attempts
   * These try to make the AI ignore previous instructions
   */
  instructionOverrides: [
    /ignore[\s\-_]*previous/gi,
    /ignore[\s\-_]*above/gi,
    /ignore[\s\-_]*all[\s\-_]*previous/gi,
    /disregard[\s\-_]*above/gi,
    /disregard[\s\-_]*previous/gi,
    /disregard[\s\-_]*all/gi,
    /forget[\s\-_]*everything/gi,
    /forget[\s\-_]*previous/gi,
    /forget[\s\-_]*all/gi,
    /reset[\s\-_]*instructions/gi,
    /clear[\s\-_]*instructions/gi,
    /override[\s\-_]*instructions/gi,
    /new[\s\-_]*instructions[\s\-_]*:/gi,
    /revised[\s\-_]*instructions[\s\-_]*:/gi,
  ],

  /**
   * Role escalation attempts
   * These try to change the AI's role or behavior
   */
  roleEscalation: [
    /you[\s\-_]*are[\s\-_]*now/gi,
    /you[\s\-_]*are[\s\-_]*a/gi,
    /act[\s\-_]*as[\s\-_]*a/gi,
    /act[\s\-_]*like/gi,
    /pretend[\s\-_]*to[\s\-_]*be/gi,
    /pretend[\s\-_]*you[\s\-_]*are/gi,
    /behave[\s\-_]*as/gi,
    /behave[\s\-_]*like/gi,
    /switch[\s\-_]*to/gi,
    /change[\s\-_]*to/gi,
    /become[\s\-_]*a/gi,
    /transform[\s\-_]*into/gi,
    /roleplay[\s\-_]*as/gi,
    /simulate[\s\-_]*being/gi,
  ],

  /**
   * Template injection attempts
   * These try to inject code through template syntax
   */
  templateInjection: [
    /\{\{.*?\}\}/g,
    /\${.*?}/g,
    /<%.*?%>/g,
    /\[%.*?%\]/g,
    /#\{.*?\}/g,
    /\$\(.*?\)/g,
    /`.*?`/g, // Backticks for template literals
  ],

  /**
   * HTML and Script injection attempts
   */
  htmlScripts: [
    /<script[^>]*>.*?<\/script>/gi,
    /<iframe[^>]*>.*?<\/iframe>/gi,
    /<object[^>]*>.*?<\/object>/gi,
    /<embed[^>]*>/gi,
    /<applet[^>]*>.*?<\/applet>/gi,
    /<link[^>]*>/gi,
    /<meta[^>]*>/gi,
    /<form[^>]*>/gi,
    /<input[^>]*>/gi,
  ],

  /**
   * Event handler injection attempts
   */
  eventHandlers: [
    /\bon\w+\s*=/gi, // Any on* event handler
    /onclick\s*=/gi,
    /onload\s*=/gi,
    /onerror\s*=/gi,
    /onmouseover\s*=/gi,
    /onfocus\s*=/gi,
    /onblur\s*=/gi,
    /onchange\s*=/gi,
    /onsubmit\s*=/gi,
  ],

  /**
   * Protocol-based injection attempts
   */
  protocolInjection: [
    /javascript:/gi,
    /data:text\/html/gi,
    /data:text\/javascript/gi,
    /vbscript:/gi,
    /file:\/\//gi,
    /about:/gi,
    /chrome:/gi,
    /ms-its:/gi,
  ],

  /**
   * SQL injection patterns (for completeness, though less relevant for LLMs)
   */
  sqlInjection: [
    /\bOR\s+1\s*=\s*1/gi,
    /\bAND\s+1\s*=\s*1/gi,
    /\bUNION\s+SELECT/gi,
    /\bDROP\s+TABLE/gi,
    /\bDELETE\s+FROM/gi,
    /\bINSERT\s+INTO/gi,
    /\bUPDATE\s+\w+\s+SET/gi,
    /--\s*$/gm, // SQL comment at end of line
    /\/\*.*?\*\//g, // SQL block comment
  ],

  /**
   * Command injection patterns (shell commands)
   */
  commandInjection: [
    /;\s*ls\b/gi,
    /;\s*cat\b/gi,
    /;\s*rm\b/gi,
    /;\s*wget\b/gi,
    /;\s*curl\b/gi,
    /\|\s*bash\b/gi,
    /\|\s*sh\b/gi,
    /&&\s*\w+/g,
    /\|\|\s*\w+/g,
    /`[^`]+`/g, // Command substitution
    /\$\([^)]+\)/g, // Command substitution
  ],

  /**
   * LLM-specific delimiter injection
   */
  delimiterInjection: [
    /\[INST\]/gi,
    /\[\/INST\]/gi,
    /\[START\]/gi,
    /\[END\]/gi,
    /\[SYSTEM\]/gi,
    /\[USER\]/gi,
    /\[ASSISTANT\]/gi,
    /Human:/gi,
    /Assistant:/gi,
    /User:/gi,
    /###[\s]*Human/gi,
    /###[\s]*Assistant/gi,
    /###[\s]*Instruction/gi,
    /###[\s]*Response/gi,
  ],

  /**
   * Unicode and encoding attacks
   */
  unicodeAttacks: [
    /[\u200B-\u200D\uFEFF]/g, // Zero-width characters
    /[\uFF01-\uFF5E]/g, // Fullwidth characters
    /[\u0400-\u04FF]/g, // Cyrillic lookalikes
    /[\u0391-\u03C9]/g, // Greek lookalikes
    /[\u3000-\u303F]/g, // CJK symbols
  ],

  /**
   * Prompt leaking attempts
   */
  promptLeaking: [
    /repeat[\s\-_]*your[\s\-_]*instructions/gi,
    /show[\s\-_]*your[\s\-_]*instructions/gi,
    /reveal[\s\-_]*your[\s\-_]*instructions/gi,
    /what[\s\-_]*are[\s\-_]*your[\s\-_]*instructions/gi,
    /print[\s\-_]*your[\s\-_]*prompt/gi,
    /display[\s\-_]*your[\s\-_]*prompt/gi,
    /output[\s\-_]*your[\s\-_]*system[\s\-_]*prompt/gi,
  ],

  /**
   * Jailbreak attempts
   */
  jailbreakAttempts: [
    /DAN[\s\-_]*mode/gi,
    /developer[\s\-_]*mode/gi,
    /unlock[\s\-_]*mode/gi,
    /bypass[\s\-_]*restrictions/gi,
    /ignore[\s\-_]*safety/gi,
    /disable[\s\-_]*filters/gi,
    /turn[\s\-_]*off[\s\-_]*filters/gi,
    /no[\s\-_]*restrictions/gi,
    /unlimited[\s\-_]*mode/gi,
  ],
};

function isInjectionCategory(
  key: string,
): key is keyof typeof INJECTION_PATTERNS {
  return key in INJECTION_PATTERNS;
}

/**
 * Get all patterns as a flat array for comprehensive checking
 */
export function getAllPatterns(): RegExp[] {
  const allPatterns: RegExp[] = [];

  for (const key of Object.keys(INJECTION_PATTERNS)) {
    if (isInjectionCategory(key)) {
      allPatterns.push(...INJECTION_PATTERNS[key]);
    }
  }

  return allPatterns;
}

/**
 * Check if text matches any injection pattern
 * @param text - Text to check
 * @param categories - Optional array of categories to check (defaults to all)
 * @returns Object with match status and matched categories
 */
export function checkForInjection(
  text: string,
  categories?: (keyof typeof INJECTION_PATTERNS)[],
): {
  hasInjection: boolean;
  matchedCategories: string[];
  matchedPatterns: string[];
} {
  const matchedCategories: string[] = [];
  const matchedPatterns: string[] = [];

  const categoriesToCheck: (keyof typeof INJECTION_PATTERNS)[] =
    categories || Object.keys(INJECTION_PATTERNS).filter(isInjectionCategory);

  for (const category of categoriesToCheck) {
    const patterns = INJECTION_PATTERNS[category];

    for (const pattern of patterns) {
      if (pattern.test(text)) {
        if (!matchedCategories.includes(category)) {
          matchedCategories.push(category);
        }
        matchedPatterns.push(pattern.toString());
        // Reset the pattern's lastIndex for global patterns
        if (pattern.global) {
          pattern.lastIndex = 0;
        }
      }
    }
  }

  return {
    hasInjection: matchedCategories.length > 0,
    matchedCategories,
    matchedPatterns,
  };
}

/**
 * Pattern severity levels for risk assessment
 */
export const PATTERN_SEVERITY = {
  critical: [
    "systemCommands",
    "instructionOverrides",
    "roleEscalation",
    "jailbreakAttempts",
  ],
  high: ["delimiterInjection", "promptLeaking", "commandInjection"],
  medium: [
    "templateInjection",
    "htmlScripts",
    "eventHandlers",
    "protocolInjection",
  ],
  low: ["sqlInjection", "unicodeAttacks"],
};

/**
 * Assess the risk level of detected injections
 */
export function assessRisk(
  matchedCategories: string[],
): "critical" | "high" | "medium" | "low" | "none" {
  const levels = ["critical", "high", "medium"] as const;
  for (const level of levels) {
    if (matchedCategories.some((c) => PATTERN_SEVERITY[level].includes(c))) {
      return level;
    }
  }
  return matchedCategories.length > 0 ? "low" : "none";
}
