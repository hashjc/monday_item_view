/**
 * sectionVisibility.js
 *
 * Pure utility — evaluates section visibility rules against a user profile value.
 *
 * Supported operators:
 *   equals          — exact match (null/undefined/"" treated as blank)
 *   not_equals      — inverse of equals
 *   contains        — substring match (case-insensitive)
 *   not_contains    — inverse of contains
 *
 * Supported criteria:
 *   "ALL"               — every rule must pass (logical AND of all)
 *   "ANY"               — at least one rule must pass (logical OR of all)
 *   "1 AND (2 OR 3)"    — expression string; numbers are 1-based rule indices
 *
 * Section JSON shape expected:
 *   {
 *     id, title, fields, order,
 *     rules: {
 *       conditions: [{ id, field, operator, value }, ...],
 *       criteria: "ALL" | "ANY" | "1 AND (2 OR 3)"
 *     }
 *   }
 *
 * rules: {}  (empty object)  → no rules → always visible
 * rules absent / null        → always visible
 *
 * Null/undefined/"" are all treated as the same blank value throughout.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Normalise a value so that null, undefined and "" are all treated as "". */
function normalise(val) {
    if (val === null || val === undefined) return "";
    return String(val).trim();
}

/**
 * Evaluate a single rule against the user's profile value.
 *
 * @param {Object} rule     - { id, field, operator, value }
 * @param {string} profile  - The current user's profile string (may be null/undefined)
 * @returns {boolean}
 */
function evaluateSingleRule(rule, profile) {
    const profileNorm   = normalise(profile);
    const ruleValueNorm = normalise(rule.value);

    switch (rule.operator) {
        case "equals":
            return profileNorm === ruleValueNorm;

        case "not_equals":
            return profileNorm !== ruleValueNorm;

        case "contains":
            // If ruleValue is blank, treat as "profile is blank"
            if (ruleValueNorm === "") return profileNorm === "";
            return profileNorm.toLowerCase().includes(ruleValueNorm.toLowerCase());

        case "not_contains":
            if (ruleValueNorm === "") return profileNorm !== "";
            return !profileNorm.toLowerCase().includes(ruleValueNorm.toLowerCase());

        default:
            console.warn(`[sectionVisibility] Unknown operator "${rule.operator}" — defaulting to false`);
            return false;
    }
}

// ---------------------------------------------------------------------------
// Expression parser  (handles "1 AND (2 OR 3)" style criteria)
// ---------------------------------------------------------------------------

/**
 * Tokenise an expression string into tokens.
 * e.g. "1 AND (2 OR 3)"  →  ["1", "AND", "(", "2", "OR", "3", ")"]
 */
function tokenise(expr) {
    return expr
        .replace(/\(/g, " ( ")
        .replace(/\)/g, " ) ")
        .trim()
        .split(/\s+/)
        .filter(Boolean);
}

/**
 * Recursive-descent parser for boolean expressions.
 * Grammar:
 *   expr   := term  ( "OR"  term )*
 *   term   := factor ( "AND" factor )*
 *   factor := "(" expr ")" | NUMBER
 */
function parseExpr(tokens, results) {
    let left = parseTerm(tokens, results);
    while (tokens.length > 0 && tokens[0].toUpperCase() === "OR") {
        tokens.shift();
        const right = parseTerm(tokens, results);
        left = left || right;
    }
    return left;
}

function parseTerm(tokens, results) {
    let left = parseFactor(tokens, results);
    while (tokens.length > 0 && tokens[0].toUpperCase() === "AND") {
        tokens.shift();
        const right = parseFactor(tokens, results);
        left = left && right;
    }
    return left;
}

function parseFactor(tokens, results) {
    if (tokens.length === 0) return true;
    const token = tokens.shift();
    if (token === "(") {
        const val = parseExpr(tokens, results);
        if (tokens.length > 0 && tokens[0] === ")") tokens.shift();
        return val;
    }
    // 1-based rule number
    const index = parseInt(token, 10);
    if (!isNaN(index) && index >= 1 && index <= results.length) {
        return results[index - 1];
    }
    console.warn(`[sectionVisibility] Unexpected token "${token}" in criteria expression`);
    return true;
}

function evaluateExpression(expr, results) {
    try {
        const tokens = tokenise(expr);
        return parseExpr(tokens, results);
    } catch (err) {
        console.error("[sectionVisibility] Expression parse error:", err, "expr:", expr);
        return true; // fail-open: show section if expression can't be evaluated
    }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Determine whether a section should be visible for the given user profile.
 *
 * The section object is the RAW section from the Sections JSON (with id, title,
 * fields, rules, order) — NOT the validatedSection wrapper from pageLayoutService.
 *
 * @param {Object}      section     - Raw section object with a .rules property
 * @param {string|null} userProfile - Current user's profile (from getUsersProfileName)
 * @returns {boolean}  true = show, false = hide
 */
export function isSectionVisible(section, userProfile) {
    const rulesConfig = section.rules;

    // No rules property at all, or explicitly null/undefined → always visible
    if (rulesConfig === null || rulesConfig === undefined) return true;

    let rulesList = [];
    let criteria  = "ALL";

    if (Array.isArray(rulesConfig)) {
        // Edge case: someone stored the conditions array directly as rules
        rulesList = rulesConfig;
        criteria  = "ALL";

    } else if (typeof rulesConfig === "object") {
        // Primary shape: { conditions: [...], criteria: "ALL" | "ANY" | "1 AND (2 OR 3)" }
        if (Array.isArray(rulesConfig.conditions) && rulesConfig.conditions.length > 0) {
            rulesList = rulesConfig.conditions;
            criteria  = rulesConfig.criteria ?? "ALL";

        // Legacy fallback: { rules: [...], criteria: "..." }
        } else if (Array.isArray(rulesConfig.rules) && rulesConfig.rules.length > 0) {
            rulesList = rulesConfig.rules;
            criteria  = rulesConfig.criteria ?? "ALL";

        } else {
            // Empty object {} or object with no recognised array key → no rules → visible
            return true;
        }
    }

    // No actual rules after parsing → always visible
    if (rulesList.length === 0) return true;

    // Evaluate each individual rule
    const ruleResults = rulesList.map((rule) => evaluateSingleRule(rule, userProfile));

    console.log(
        `[sectionVisibility] Section "${section.id}" — profile: "${normalise(userProfile)}"`,
        ruleResults.map((r, i) => `rule${i + 1}(${rulesList[i].operator} "${rulesList[i].value}"): ${r}`)
    );

    // Apply criteria
    const criteriaUpper = String(criteria).trim().toUpperCase();

    if (criteriaUpper === "ALL") return ruleResults.every(Boolean);
    if (criteriaUpper === "ANY") return ruleResults.some(Boolean);

    // Expression string e.g. "1 AND (2 OR 3)"
    return evaluateExpression(criteria, ruleResults);
}

/**
 * Filter an array of validated sections to only those visible for the user.
 *
 * Works with BOTH shapes that may appear in validatedSections:
 *   - Flat:    { id, title, fields, rules, ... }            (pageLayoutService new format)
 *   - Wrapped: { sectionData: { id, title, fields, rules }, ... } (legacy format)
 *
 * @param {Object[]}    sections    - validatedSections array from usePageLayoutInfo
 * @param {string|null} userProfile - Current user's profile string
 * @returns {Object[]}  Sections that pass their visibility rules
 */
export function filterVisibleSections(sections, userProfile) {
    if (!Array.isArray(sections)) return [];

    return sections.filter((section) => {
        const rawSection = (section.rules !== undefined) ? section : (section.sectionData ?? section);
        const visible = isSectionVisible(rawSection, userProfile);
        return visible;
    });
}