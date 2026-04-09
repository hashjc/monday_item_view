// src/hooks/lookupFilters.js
//
// Runtime client-side filter for board_relation lookup items.
//
// lookup_filters is an ARRAY of per-board entries:
// [
//   {
//     "boardId": "5024227503",
//     "conditions": [
//       { "id": "rule1", "source": "field", "fieldId": "color_mm0e1nq2", "operator": "==", "value": "Buyer" }
//     ],
//     "criteria": "ALL"
//   }
// ]
//
// Filtering rules:
//   - lookup_filters null / empty → return all items unchanged.
//   - A board NOT present in lookup_filters → its items pass through unchanged.
//   - Error A: filter boardId no longer connected → no items from it appear, no-op.
//   - Error B: any condition references a fieldId missing from the board's columns
//              → skip ALL filters for that board, return its items untouched.
//
// Supported operators: ==  !=  contains  not_contains  >  >=  <  <=

// ─── Operator registry ─────────────────────────────────────────────────────────
const normalize = (v) => String(v ?? "").trim().toLowerCase();
const toNum     = (v) => parseFloat(String(v ?? "").replace(/,/g, "")) || 0;

const OPERATORS = {
    "==":           (a, b) => normalize(a) === normalize(b),
    "!=":           (a, b) => normalize(a) !== normalize(b),
    "contains":     (a, b) => normalize(a).includes(normalize(b)),
    "not_contains": (a, b) => !normalize(a).includes(normalize(b)),
    ">":            (a, b) => toNum(a) >  toNum(b),
    ">=":           (a, b) => toNum(a) >= toNum(b),
    "<":            (a, b) => toNum(a) <  toNum(b),
    "<=":           (a, b) => toNum(a) <= toNum(b),
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

const getColumnText = (item, fieldId) => {
    if (!Array.isArray(item.column_values)) return "";
    const col = item.column_values.find((cv) => cv.id === fieldId);
    if (!col) return "";
    return col.text || col.display_value || "";
};

const fieldExists = (item, fieldId) => {
    if (!fieldId || !Array.isArray(item.column_values)) return false;
    return item.column_values.some((cv) => cv.id === fieldId);
};

const evaluateCondition = (item, condition, formData = {}) => {
    const { fieldId, operator, value, source } = condition;
    const fn = OPERATORS[operator];
    if (!fn) {
        console.warn(`[lookupFilters] Unknown operator "${operator}" — condition passes.`);
        return true;
    }
    const itemVal = getColumnText(item, fieldId);
    let compareVal;
    if (source === "form") {
        const raw = formData[value];
        if (raw === null || raw === undefined) {
            compareVal = "";
        } else if (typeof raw === "object" && !Array.isArray(raw)) {
            compareVal = raw.phone || raw.email || raw.url || raw.text || "";
        } else if (Array.isArray(raw)) {
            compareVal = raw.map((r) => (typeof r === "object" ? r.name || "" : String(r))).join(", ");
        } else {
            compareVal = String(raw);
        }
    } else {
        compareVal = value ?? "";
    }
    return fn(itemVal, compareVal);
};

/**
 * Evaluate all conditions in a board filter entry against one item.
 * Error case B: if ANY condition references a missing fieldId, the item passes (filter skipped).
 */
const evaluateBoardFilter = (item, boardFilter, formData) => {
    const { conditions = [], criteria = "ALL" } = boardFilter;
    if (conditions.length === 0) return true;

    // Error case B — missing field → skip filter for this board
    const hasMissingField = conditions.some((c) => c.fieldId && !fieldExists(item, c.fieldId));
    if (hasMissingField) {
        console.warn(
            `[lookupFilters] Board ${boardFilter.boardId}: filter field(s) missing on item — skipping filter for this board.`
        );
        return true;
    }

    const results = conditions.map((c) => evaluateCondition(item, c, formData));
    const matchAll = (criteria || "ALL").toUpperCase() !== "ANY";
    return matchAll ? results.every(Boolean) : results.some(Boolean);
};

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Filter board items using the per-board lookup_filters array.
 *
 * @param {Array}      items         Items from retrieveMultipleBoardItems (each has .boardId)
 * @param {Array|null} lookupFilters Array of { boardId, conditions, criteria }
 * @param {Object}     [formData]    Current form state (for source:"form" conditions)
 * @returns {Array} Filtered items
 */
export function applyLookupFilters(items, lookupFilters, formData = {}) {
    if (!lookupFilters || !Array.isArray(lookupFilters) || lookupFilters.length === 0) {
        return items;
    }

    // Build boardId → filter entry map
    const filterMap = {};
    lookupFilters.forEach((entry) => {
        if (entry && entry.boardId) filterMap[String(entry.boardId)] = entry;
    });

    return items.filter((item) => {
        const itemBoardId = String(item.boardId || "");
        const filterEntry = filterMap[itemBoardId];
        // No filter for this board (or board no longer connected) → pass through
        if (!filterEntry) return true;
        return evaluateBoardFilter(item, filterEntry, formData);
    });
}