// src/hooks/lookupFilters.js
//
// Reusable client-side filter for board_relation lookup items.
//
// Filter shape (from field JSON config):
// {
//   "conditions": [
//     {
//       "id":       "rule1",
//       "boardId":  "5024227503",   // optional — scope to a specific linked board
//       "source":   "field",        // "field" = filter by item's own column value
//                                   // "form"  = compare against current form field value
//       "fieldId":  "color_mm0e1nq2", // column id on the linked board item
//       "operator": "==",
//       "value":    "Buyer"         // literal compare value (source:"field")
//                                   // OR columnId in formData (source:"form")
//     }
//   ],
//   "criteria": "ALL"  // "ALL" = AND, "ANY" = OR
// }
//
// Supported operators (shared with visibility / validation rule engine):
//   ==  !=  contains  not_contains  >  >=  <  <=
//
// Items from a board NOT referenced in any condition pass through unfiltered,
// so multi-board relations work correctly even when only one board has rules.

// ─── Operator registry ────────────────────────────────────────────────────────
const normalize = (v) => String(v ?? "").trim().toLowerCase();
const toNum    = (v) => parseFloat(String(v ?? "").replace(/,/g, "")) || 0;

const OPERATORS = {
    "==":           (a, b) => normalize(a) === normalize(b),
    "!=":           (a, b) => normalize(a) !== normalize(b),
    "contains":     (a, b) => normalize(a).includes(normalize(b)),
    "not_contains": (a, b) => !normalize(a).includes(normalize(b)),
    ">":            (a, b) => toNum(a)    >  toNum(b),
    ">=":           (a, b) => toNum(a)    >= toNum(b),
    "<":            (a, b) => toNum(a)    <  toNum(b),
    "<=":           (a, b) => toNum(a)    <= toNum(b),
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extract the display text for a column from a board item's column_values array.
 * Falls back to display_value (mirror / formula columns).
 */
const getColumnText = (item, fieldId) => {
    if (!Array.isArray(item.column_values)) return "";
    const col = item.column_values.find((cv) => cv.id === fieldId);
    if (!col) return "";
    return col.text || col.display_value || "";
};

/**
 * Evaluate a single condition against one item.
 *
 * source:"field" — compares item's fieldId column against the literal `value`.
 * source:"form"  — compares item's fieldId column against formData[value]
 *                  (value is treated as a columnId key in the current form).
 *
 * Unknown operators are treated as passing (fail-open) so new operators
 * don't silently block all records.
 */
const evaluateCondition = (item, condition, formData = {}) => {
    const { fieldId, operator, value, source } = condition;

    const fn = OPERATORS[operator];
    if (!fn) {
        console.warn(`[lookupFilters] Unknown operator "${operator}" — condition passes.`);
        return true;
    }

    const itemVal = getColumnText(item, fieldId);

    // Resolve the comparison value
    let compareVal;
    if (source === "form") {
        // Dynamic: pull the current form field's text representation
        const raw = formData[value];
        if (raw === null || raw === undefined) {
            compareVal = "";
        } else if (typeof raw === "object" && !Array.isArray(raw)) {
            // phone / link / email objects — use their primary string property
            compareVal = raw.phone || raw.email || raw.url || raw.text || "";
        } else if (Array.isArray(raw)) {
            // people / board_relation / dropdown — join names
            compareVal = raw.map((r) => (typeof r === "object" ? r.name || "" : String(r))).join(", ");
        } else {
            compareVal = String(raw);
        }
    } else {
        // Static literal (source:"field" or any other source value)
        compareVal = value ?? "";
    }

    return fn(itemVal, compareVal);
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Filter an array of board items using a lookup_filters config object.
 *
 * Items whose source board is NOT referenced by any condition are left
 * untouched — this ensures that in multi-board relations, only the
 * configured boards are filtered while others pass through freely.
 *
 * @param {Array}       items         - Items from retrieveMultipleBoardItems (each has .boardId)
 * @param {Object|null} lookupFilters - { conditions, criteria } from field JSON config
 * @param {Object}      [formData]    - Current form state, needed for source:"form" conditions
 * @returns {Array} Filtered items
 */
export function applyLookupFilters(items, lookupFilters, formData = {}) {
    if (
        !lookupFilters ||
        !Array.isArray(lookupFilters.conditions) ||
        lookupFilters.conditions.length === 0
    ) {
        return items; // nothing to filter
    }

    const { conditions, criteria } = lookupFilters;
    const matchAll = (criteria || "ALL").toUpperCase() !== "ANY"; // default AND

    return items.filter((item) => {
        // Only apply conditions that target this item's board (or have no boardId)
        const applicable = conditions.filter(
            (c) => !c.boardId || String(c.boardId) === String(item.boardId)
        );

        // No conditions target this board → let the item through
        if (applicable.length === 0) return true;

        return matchAll
            ? applicable.every((c) => evaluateCondition(item, c, formData))
            : applicable.some( (c) => evaluateCondition(item, c, formData));
    });
}