/**
 * formValidationConfig.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Configuration for BOARD-LEVEL validation rules — stored in the separate
 * "Validation Rules" column in the PageLayoutSections board.
 *
 * These rules operate across multiple fields (e.g. fabric1 + fabric2 = 100,
 * or "Amount required when Rating = Hot") and are evaluated at form-submit time.
 *
 * Two authoring modes:
 *   • Simple  — structured row builder (field / operator / value|field)
 *               with an optional arithmetic left-hand side
 *   • Formula — free-form expression string using {fieldId} references
 *               evaluated via mathjs at runtime
 *
 * JSON shape (one entry in the Validation Rules array):
 * {
 *   "id":         "vr_001",
 *   "name":       "Fabric percentages must sum to 100",
 *   "mode":       "simple" | "formula",
 *   "trigger":    "always" | "conditional",
 *   "condition":  null | { fieldId, operator, value },
 *   "expression": "{numeric_fabric1} + {numeric_fabric2} == 100",
 *   "error":      "Fabric 1 and Fabric 2 percentages must add up to 100%.",
 *   "fields":     ["numeric_fabric1", "numeric_fabric2"]
 * }
 *
 * Simple mode additionally stores the structured rows so the editor can
 * reopen them for editing. These are NOT used by the evaluator.
 * {
 *   ...
 *   "simpleRows": [
 *     {
 *       "id":       "row_1",
 *       "lhsType":  "field" | "arithmetic",
 *       "lhsField": "numeric_fabric1",
 *       "lhsOp":    "+" | "-" | "*" | "/",          // only when lhsType = arithmetic
 *       "lhsField2":"numeric_fabric2",               // only when lhsType = arithmetic
 *       "operator": "==" | "!=" | ">" | ">=" | "<" | "<=" | "contains" | ...,
 *       "rhsType":  "value" | "field",
 *       "rhsValue": "100",                           // only when rhsType = value
 *       "rhsField": "numeric_fabric3"                // only when rhsType = field
 *     }
 *   ],
 *   "simpleCriteria": "1 AND 2"  // same free-form expression as visibility rules
 * }
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── Arithmetic operators (for LHS of simple rows) ───────────────────────────
export const ARITHMETIC_OPS = [
    { id: "+", label: "+" },
    { id: "-", label: "−" },
    { id: "*", label: "×" },
    { id: "/", label: "÷" },
];

// ─── Comparison operators (middle of each row) ───────────────────────────────
export const COMPARISON_OPS = [
    { id: "==",          label: "==",           numeric: true,  string: true  },
    { id: "!=",          label: "!=",           numeric: true,  string: true  },
    { id: ">",           label: ">",            numeric: true,  string: false },
    { id: ">=",          label: "≥",            numeric: true,  string: false },
    { id: "<",           label: "<",            numeric: true,  string: false },
    { id: "<=",          label: "≤",            numeric: true,  string: false },
    { id: "contains",    label: "contains",     numeric: false, string: true  },
    { id: "not_contains",label: "not contains", numeric: false, string: true  },
    { id: "starts_with", label: "starts with",  numeric: false, string: true  },
    { id: "ends_with",   label: "ends with",    numeric: false, string: true  },
];

// Numeric column types — used to decide which operators to show
export const NUMERIC_COL_TYPES = new Set(["numbers", "rating"]);
// Date column types
export const DATE_COL_TYPES    = new Set(["date", "timeline"]);
// String column types
export const STRING_COL_TYPES  = new Set(["text", "long_text", "email", "phone", "link", "name"]);

/**
 * Returns the subset of comparison operators applicable to a column type.
 * Used to populate the operator dropdown in simple rows.
 */
export function getComparisonOpsForType(colType) {
    if (NUMERIC_COL_TYPES.has(colType) || DATE_COL_TYPES.has(colType)) {
        return COMPARISON_OPS.filter((o) => o.numeric);
    }
    if (STRING_COL_TYPES.has(colType)) {
        return COMPARISON_OPS.filter((o) => o.string);
    }
    // status / dropdown / checkbox / people / board_relation — == and != only
    return COMPARISON_OPS.filter((o) => ["==", "!="].includes(o.id));
}

/**
 * All operators now require a value. Leave the value blank to compare against
 * an empty field: "==" + blank → field must be empty, "!=" + blank → must not be empty.
 */
export function comparisonOpNeedsValue(opId) {
    return true;
}

// ─── Date literals ────────────────────────────────────────────────────────────
// These appear as special options in the RHS value dropdown for date fields.
export const DATE_LITERALS = [
    { id: "TODAY",          label: "Today" },
    { id: "TOMORROW",       label: "Tomorrow" },
    { id: "YESTERDAY",      label: "Yesterday" },
    { id: "START_OF_WEEK",  label: "Start of week" },
    { id: "END_OF_WEEK",    label: "End of week" },
    { id: "START_OF_MONTH", label: "Start of month" },
    { id: "END_OF_MONTH",   label: "End of month" },
];

/**
 * Resolve a date literal to an actual Date (as ISO string YYYY-MM-DD).
 * Called by the evaluator at runtime.
 */
export function resolveDateLiteral(literal) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const iso = (d) => d.toISOString().slice(0, 10);

    switch (literal) {
        case "TODAY":          return iso(today);
        case "TOMORROW":       { const d = new Date(today); d.setDate(d.getDate() + 1); return iso(d); }
        case "YESTERDAY":      { const d = new Date(today); d.setDate(d.getDate() - 1); return iso(d); }
        case "START_OF_WEEK":  { const d = new Date(today); d.setDate(d.getDate() - d.getDay()); return iso(d); }
        case "END_OF_WEEK":    { const d = new Date(today); d.setDate(d.getDate() + (6 - d.getDay())); return iso(d); }
        case "START_OF_MONTH": { const d = new Date(today); d.setDate(1); return iso(d); }
        case "END_OF_MONTH":   { const d = new Date(today); d.setMonth(d.getMonth() + 1, 0); return iso(d); }
        default:               return literal;
    }
}

// ─── Simple row → expression fragment ────────────────────────────────────────

/**
 * Convert a single simple row to an expression fragment using {fieldId} syntax.
 * These fragments are joined by the criteria expression to form the final expression.
 *
 * @param {Object} row         — simple row object (see JSON shape above)
 * @param {Object} columnsMap  — { [id]: { type } }
 * @returns {string}  expression fragment, e.g. "{f1} + {f2} == 100"
 */
export function simpleRowToExprFragment(row, columnsMap) {
    const { lhsType, lhsField, lhsOp, lhsField2, operator, rhsType, rhsValue, rhsField } = row;

    // LHS
    let lhs = `{${lhsField}}`;
    if (lhsType === "arithmetic" && lhsField2 && lhsOp) {
        lhs = `({${lhsField}} ${lhsOp} {${lhsField2}})`;
    }

    // No-value operators removed — blank value means compare against null/empty
    // (handled downstream by the evaluator's null-check logic)

    // RHS
    let rhs;
    if (rhsType === "field") {
        rhs = `{${rhsField}}`;
    } else {
        const colType = columnsMap[lhsField]?.type;
        if (STRING_COL_TYPES.has(colType)) {
            // String ops need special handling — expression will use js string methods
            // We encode as a special marker; the evaluator handles these
            if (operator === "contains")     return `__contains({${lhsField}}, "${rhsValue}")`;
            if (operator === "not_contains") return `__not_contains({${lhsField}}, "${rhsValue}")`;
            if (operator === "starts_with")  return `__starts_with({${lhsField}}, "${rhsValue}")`;
            if (operator === "ends_with")    return `__ends_with({${lhsField}}, "${rhsValue}")`;
        }
        rhs = isNaN(rhsValue) || rhsValue === "" ? `"${rhsValue}"` : rhsValue;
    }

    return `${lhs} ${operator} ${rhs}`;
}

/**
 * Build the full expression string from simple rows + criteria expression.
 * This is called when saving a simple-mode rule to produce the stored expression.
 *
 * @param {Object[]} rows           — simple rows
 * @param {string}   criteriaExpr   — e.g. "1 AND 2", "1 AND (2 OR 3)"
 * @param {Object}   columnsMap
 * @returns {string}  full expression
 */
export function buildExpressionFromSimpleRows(rows, criteriaExpr, columnsMap) {
    const fragments = rows.map((r) => simpleRowToExprFragment(r, columnsMap));

    if (fragments.length === 0) return "";
    if (fragments.length === 1) return fragments[0];

    // Replace condition numbers with the actual fragment
    return criteriaExpr.replace(/\b(\d+)\b/g, (_, n) => {
        const idx = parseInt(n, 10) - 1;
        return idx >= 0 && idx < fragments.length ? `(${fragments[idx]})` : "false";
    }).replace(/\bAND\b/gi, "&&").replace(/\bOR\b/gi, "||");
}

// ─── Formula expression evaluator ────────────────────────────────────────────

/**
 * Resolve {fieldId} references in an expression to safe JS variable names,
 * and build a scope object mapping those names to actual field values.
 *
 * @param {string} expression   — e.g. "{fabric1_id} + {fabric2_id} == 100"
 * @param {Object} formValues   — { [columnId]: rawValue }
 * @param {Object} columnsMap   — { [columnId]: { type } }
 * @returns {{ resolvedExpr: string, scope: Object }}
 */
export function resolveExpression(expression, formValues, columnsMap) {
    const scope = {};

    const resolvedExpr = expression.replace(/\{([^}]+)\}/g, (_, fieldId) => {
        const alias   = `_f${fieldId.replace(/[^a-z0-9]/gi, "_")}`;
        const raw     = formValues[fieldId];
        const colType = columnsMap[fieldId]?.type || "text";

        let val;
        if (raw === null || raw === undefined || raw === "") {
            val = null;
        } else if (NUMERIC_COL_TYPES.has(colType)) {
            val = parseFloat(raw);
            if (isNaN(val)) val = null;
        } else if (DATE_COL_TYPES.has(colType)) {
            val = typeof raw === "string" ? raw : null;
        } else {
            val = String(raw);
        }

        scope[alias] = val;
        return alias;
    });

    return { resolvedExpr, scope };
}

/**
 * Normalize empty-string comparisons in a resolved expression.
 *
 * The expression author may write  != ""  or  == ""  to mean "field is filled / empty".
 * At runtime, empty fields resolve to JS null (not ""), so  != ""  would incorrectly
 * return true even for null fields. We rewrite these before evaluation.
 *
 *   someVar != ""   →   someVar != null
 *   someVar == ""   →   someVar == null
 *
 * Only rewrites where one side is a plain JS variable (starts with _f).
 * String literals like  someVar != "Active"  are left untouched.
 */
function normalizeEmptyStringComparisons(expr) {
    // Match:  _fSomeVar != ""  or  "" != _fSomeVar  (and == variants)
    return expr
        .replace(/(_f\w+)\s*(!=|==)\s*""/g, (_, v, op) => `${v} ${op} null`)
        .replace(/""\s*(!=|==)\s*(_f\w+)/g, (_, op, v) => `${v} ${op} null`);
}

/**
 * Evaluate a board-level validation rule against current form values.
 * Expression returning true = INVALID (Salesforce-style error condition).
 *
 * Returns the rule's error string if the expression is true (invalid).
 * Returns null if the expression is false (valid / passes).
 *
 * All rules run unconditionally — conditional logic belongs in the expression.
 *
 * @param {Object} rule        — full rule object from JSON
 * @param {Object} formValues  — { [columnId]: rawValue }
 * @param {Object} columnsMap  — { [columnId]: { type } }
 * @returns {null | string}    null = passes, string = error message
 */
export function evaluateValidationRule(rule, formValues, columnsMap) {
    // Skip inactive rules
    if (!rule.active) return null;

    // Skip rules that reference fields not present in this board's columnsMap.
    // This handles corrupt/stale JSON without blocking the user.
    if (Array.isArray(rule.fields) && rule.fields.length > 0) {
        const missingField = rule.fields.find((fId) => !columnsMap[fId]);
        if (missingField) {
            console.warn(`[formValidation] Rule "${rule.id}" references unknown field "${missingField}" — skipping.`);
            return null;
        }
    }

    // Evaluate expression
    const expression = rule.expression || "";
    if (!expression.trim()) return null;

    try {
        const { resolvedExpr, scope } = resolveExpression(expression, formValues, columnsMap);

        // Normalize  != ""  /  == ""  → != null / == null, then handle
        // string helpers and date literals in one chained pass.
        // (empty fields resolve to null at runtime, not "")
        let jsExpr = normalizeEmptyStringComparisons(resolvedExpr)
            .replace(/__contains\(([^,]+),\s*"([^"]*)"\)/g,    (_, v, s) => `(${v} != null && String(${v}).toLowerCase().includes("${s.toLowerCase()}"))`  )
            .replace(/__not_contains\(([^,]+),\s*"([^"]*)"\)/g, (_, v, s) => `(${v} == null || !String(${v}).toLowerCase().includes("${s.toLowerCase()}"))`  )
            .replace(/__starts_with\(([^,]+),\s*"([^"]*)"\)/g,  (_, v, s) => `(${v} != null && String(${v}).toLowerCase().startsWith("${s.toLowerCase()}"))`  )
            .replace(/__ends_with\(([^,]+),\s*"([^"]*)"\)/g,    (_, v, s) => `(${v} != null && String(${v}).toLowerCase().endsWith("${s.toLowerCase()}"))`    )
            .replace(/"(TODAY|TOMORROW|YESTERDAY|START_OF_WEEK|END_OF_WEEK|START_OF_MONTH|END_OF_MONTH)"/g,
                (_, lit) => `"${resolveDateLiteral(lit)}"`);

        // Build scope-injection prefix
        const scopeEntries = Object.entries(scope)
            .map(([k, v]) => `const ${k} = ${JSON.stringify(v)};`)
            .join(" ");

        // eslint-disable-next-line no-new-func
        const result = new Function(`${scopeEntries} return Boolean(${jsExpr});`)();
        // Expression true = INVALID (Salesforce-style error condition formula)
        return result ? (rule.error || "Validation failed.") : null;
    } catch (err) {
        console.warn("[formValidation] Expression error:", err, "in rule:", rule.id);
        return null; // Don't block submission on expression errors
    }
}

/**
 * Run all validation rules for a board layout.
 * Returns an array of { ruleId, error, fields } for each failing rule.
 *
 * @param {Object[]} rules       — array of rule objects from Validation Rules JSON
 * @param {Object}   formValues  — { [columnId]: rawValue }
 * @param {Object}   columnsMap  — { [columnId]: { type } }
 * @returns {{ ruleId: string, error: string, fields: string[] }[]}
 */
export function runAllValidationRules(rules, formValues, columnsMap) {
    if (!Array.isArray(rules) || rules.length === 0) return [];
    return rules
        .map((rule) => {
            const error = evaluateValidationRule(rule, formValues, columnsMap);
            return error ? { ruleId: rule.id, error, fields: rule.fields || [] } : null;
        })
        .filter(Boolean);
}

/**
 * Validate the syntax of an expression string.
 * Substitutes all {fieldId} references with the number 1 as a safe dummy value,
 * then attempts to evaluate the expression.
 *
 * Returns { valid: true } on success, or { valid: false, message: string } with
 * a human-readable description of the problem.
 *
 * @param {string} expression  — expression using {fieldId} references
 * @returns {{ valid: boolean, message?: string }}
 */
export function validateExpression(expression) {
    if (!expression || !expression.trim()) {
        return { valid: false, message: "Expression is empty." };
    }

    // Substitute {fieldId} → 1 (numeric dummy, safe for all operators)
    const substituted = expression.replace(/\{([^}]+)\}/g, "1");

    // Handle string helpers by replacing with true (they won't parse as math but are valid logic)
    const cleaned = substituted
        .replace(/__contains\([^)]+\)/g, "true")
        .replace(/__not_contains\([^)]+\)/g, "true")
        .replace(/__starts_with\([^)]+\)/g, "true")
        .replace(/__ends_with\([^)]+\)/g, "true")
        .replace(/"(TODAY|TOMORROW|YESTERDAY|START_OF_WEEK|END_OF_WEEK|START_OF_MONTH|END_OF_MONTH)"/g, '"2024-01-01"');

    // Check for balanced parentheses first — gives a clearer message than eval
    let depth = 0;
    for (const ch of cleaned) {
        if (ch === "(") depth++;
        if (ch === ")") depth--;
        if (depth < 0) return { valid: false, message: "Unmatched closing parenthesis ')' — check your brackets." };
    }
    if (depth !== 0) return { valid: false, message: `Missing ${depth} closing parenthesis ')'.` };

    // Attempt to evaluate
    try {
        // eslint-disable-next-line no-new-func
        new Function(`return Boolean(${cleaned});`)();
        return { valid: true };
    } catch (err) {
        // Translate common JS syntax error messages into friendlier ones
        const msg = err.message || "";
        if (/unexpected token/i.test(msg))      return { valid: false, message: "Unexpected token — check for missing operators or double operators (e.g. == ==)." };
        if (/unexpected end/i.test(msg))         return { valid: false, message: "Expression ends unexpectedly — it may be incomplete." };
        if (/invalid or unexpected/i.test(msg))  return { valid: false, message: "Invalid syntax — check operators and field references." };
        if (/is not defined/i.test(msg))         return { valid: false, message: "Unknown variable — make sure all fields use {fieldId} syntax." };
        return { valid: false, message: `Syntax error: ${msg}` };
    }
}

/**
 * Parse and pre-filter a raw Validation Rules JSON string from the PLS column.
 *
 * Called once at page layout load time — returns only the rules that are safe
 * to evaluate at submit time. Rules are excluded (logged, never thrown) if:
 *   • The entire JSON string is missing, blank, or unparseable
 *   • A rule has active !== true
 *   • A rule's expression fails syntax validation
 *   • A rule references a field that doesn't exist in columnsMap
 *
 * @param {string} rawJson      — raw text from the "Validation Rules" column
 * @param {Object} columnsMap   — { [columnId]: { type, ... } } for the target board
 * @returns {Object[]}          — array of clean, safe-to-evaluate rule objects
 */
export function loadValidationRules(rawJson, columnsMap) {
    if (!rawJson || !rawJson.trim()) return [];

    let parsed;
    try {
        parsed = JSON.parse(rawJson);
    } catch (_) {
        console.warn("[formValidation] Validation Rules column contains invalid JSON — no rules loaded.");
        return [];
    }

    if (!Array.isArray(parsed)) {
        console.warn("[formValidation] Validation Rules JSON is not an array — no rules loaded.");
        return [];
    }

    const activeRules = [];

    for (const rule of parsed) {
        // 1. Must be explicitly active
        if (!rule.active) continue;

        // 2. Must have a non-empty expression
        const expression = (rule.expression || "").trim();
        if (!expression) {
            console.warn(`[formValidation] Rule "${rule.id}" has no expression — skipping.`);
            continue;
        }

        // 3. Expression must pass syntax validation
        const syntaxCheck = validateExpression(expression);
        if (!syntaxCheck.valid) {
            console.warn(`[formValidation] Rule "${rule.id}" has invalid expression syntax: ${syntaxCheck.message} — skipping.`);
            continue;
        }

        // 4. All referenced fields must exist in the board's columnsMap
        const fields = Array.isArray(rule.fields) ? rule.fields : [];
        const missingField = fields.find((fId) => !columnsMap[fId]);
        if (missingField) {
            console.warn(`[formValidation] Rule "${rule.id}" references unknown field "${missingField}" — skipping.`);
            continue;
        }

        activeRules.push(rule);
    }

    console.log(`[formValidation] Loaded ${activeRules.length}/${parsed.length} active valid rules.`);
    return activeRules;
}

// ─── ID generators ────────────────────────────────────────────────────────────
let _vrc = 1;
export const makeRuleId = () => `vr_${Date.now()}_${_vrc++}`;
export const makeRowId  = () => `row_${Date.now()}_${_vrc++}`;