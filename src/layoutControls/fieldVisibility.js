/**
 * fieldVisibility.js
 *
 * Evaluates field-level visibilityRules based on LIVE form values.
 *
 * ─── SEPARATION OF CONCERNS ────────────────────────────────────────────────
 *  sectionVisibility.js   → section show/hide based on USER PROFILE (static)
 *  fieldVisibility.js     → field show/hide based on OTHER FIELD VALUES (dynamic)
 *
 * The two modules are completely independent. sectionVisibility has no
 * dependency on this file, and this file has no dependency on sectionVisibility.
 *
 * ─── HOW FIELD VISIBILITY WORKS ────────────────────────────────────────────
 *
 *  Step 1 – "isVisible" flag (static default)
 *    Each field may carry `isVisible: false` to hard-hide it unconditionally.
 *    If missing or true → proceed to step 2.
 *
 *  Step 2 – visibilityRules (dynamic, depends on other fields)
 *    If field.visibilityRules has conditions, they are evaluated against
 *    the current formData. Each condition references another field by fieldId.
 *
 *  Step 3 – Two-pass computation
 *    Because field A may depend on field B which itself depends on field C,
 *    we run TWO passes. Pass 1 assumes all fields visible. Pass 2 uses
 *    pass-1 results. Two passes handles 1-level dependency chains,
 *    which covers all practical cases.
 *
 * ─── FAIL-OPEN RULES (always default to SHOW) ──────────────────────────────
 *  - visibilityRules missing / null / empty object         → show
 *  - condition.fieldId not found anywhere in the layout    → skip condition
 *  - the depended-on field is itself hidden                → skip condition
 *  - any evaluation error                                  → show
 *
 * ─── JSON SHAPE ────────────────────────────────────────────────────────────
 *  field.visibilityRules = {
 *    conditions: [
 *      {
 *        id:       "vis_1",
 *        source:   "field",              // must be "field" for field-level rules
 *        fieldId:  "numeric_mm0x48fv",   // the column this rule depends on
 *        operator: "greater_than",
 *        value:    10
 *      }
 *    ],
 *    criteria: "ALL"   // "ALL" = every condition must pass, "ANY" = at least one
 *  }
 *
 * ─── SUPPORTED OPERATORS ───────────────────────────────────────────────────
 *  Numeric:  greater_than  greater_than_or_equal  less_than  less_than_or_equal
 *            equals  not_equals  between  (value=[min,max] for between)
 *  Text:     equals  not_equals  contains  not_contains  is_empty  is_not_empty
 *  Aliases:  >  >=  <  <=  =  ==  !=
 */

// ─────────────────────────────────────────────────────────────────────────────
// Internal: value coercion
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Read a field's value from formData and coerce it to a number if possible.
 * Returns null when the field has no meaningful value.
 */
function readFieldValue(fieldId, formData) {
    const raw = formData[fieldId];
    if (raw === undefined || raw === null || raw === "") return null;
    const asNum = Number(raw);
    if (!isNaN(asNum)) return asNum;
    return String(raw).trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal: single condition evaluator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Evaluate ONE visibility condition.
 *
 * Returns:
 *   true  — condition passes → counts toward showing the field
 *   false — condition fails  → counts toward hiding the field
 *   null  — skip this condition (dependency missing/hidden) → treated as "show"
 */
function evaluateOneCondition(condition, formData, allFieldIds, visibleFieldIds) {
    const { fieldId, operator, value } = condition;
    //console.log("Evaluate one condition, Field value ", condition);
    // Guard 1: dependency field must exist in the layout
    // If the column was deleted after the rule was saved, skip the rule.
    if (!allFieldIds.has(fieldId)) {
        console.warn(`[fieldVisibility] Dependency "${fieldId}" not in layout — ` + `skipping condition "${condition.id}"`);
        return null;
    }

    // Guard 2: dependency field must itself be visible
    // "Show Profit if Age > 10" should NOT keep Profit visible when Age
    // is itself hidden by its own visibility rule.
    if (!visibleFieldIds.has(fieldId)) {
        return null;
    }

    const fieldValue = readFieldValue(fieldId, formData);
    const numVal = typeof fieldValue === "number" ? fieldValue : null;
    const cmpNum = Number(value);

    // Empty dependency value: only is_empty can pass; others skip (fail-open)
    if (fieldValue === null) {
        console.log("Field value ", fieldValue);
        if (operator === "is_empty") return true;
        if (operator === "is_not_empty") return false;
        //return null; // empty dep → skip → show
    }

    switch (operator) {
        case "greater_than":
        case ">":
            return numVal !== null && numVal > cmpNum;

        case "greater_than_or_equal":
        case ">=":
            return numVal !== null && numVal >= cmpNum;

        case "less_than":
        case "<":
            return numVal !== null && numVal < cmpNum;

        case "less_than_or_equal":
        case "<=":
            return numVal !== null && numVal <= cmpNum;

        case "between": {
            const [lo, hi] = Array.isArray(value) ? value : [value, value];
            return numVal !== null && numVal >= Number(lo) && numVal <= Number(hi);
        }

        case "equals":
        case "=":
        case "==":
            if (numVal !== null && !isNaN(cmpNum)) return numVal === cmpNum;
            return String(fieldValue).toLowerCase() === String(value).toLowerCase();

        case "not_equals":
        case "!=":
            if (numVal !== null && !isNaN(cmpNum)) return numVal !== cmpNum;
            return String(fieldValue).toLowerCase() !== String(value).toLowerCase();

        case "contains":
            return String(fieldValue).toLowerCase().includes(String(value).toLowerCase());

        case "not_contains":
            return !String(fieldValue).toLowerCase().includes(String(value).toLowerCase());

        case "is_empty":
            return String(fieldValue).trim() === "";

        case "is_not_empty":
            return String(fieldValue).trim() !== "";

        default:
            console.warn(`[fieldVisibility] Unknown operator "${operator}" — skipping`);
            return null;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public: single-field visibility decision
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Should this one field be shown?
 *
 * Checks in order:
 *   1. field.isVisible === false  → hard-hide, return false
 *   2. field.visibilityRules      → evaluate conditions
 *   3. No rules / empty rules     → return true (show)
 *
 * @param {Object} field            field definition from layout JSON
 * @param {Object} formData         live { columnId: value } map
 * @param {Set}    allFieldIds      all columnIds in the layout
 * @param {Set}    visibleFieldIds  currently-visible columnIds (for dependency checks)
 * @returns {boolean}
 */
export function isFieldVisible(field, formData, allFieldIds, visibleFieldIds) {
    try {
        //console.log('Isfieldvisible method ', field);
        // Step 1: explicit hard-hide flag
        if (field.isVisible === false) return false;

        // Step 2: dynamic visibility rules
        const rules = field.visibilityRules;
        if (!rules || typeof rules !== "object") return true;

        const conditions = Array.isArray(rules.conditions) ? rules.conditions : [];
        if (conditions.length === 0) return true;

        // Only evaluate "field" source conditions
        const fieldConditions = conditions.filter((c) => !c.source || c.source === "field");
        if (fieldConditions.length === 0) return true;

        const results = fieldConditions.map((c) => evaluateOneCondition(c, formData, allFieldIds, visibleFieldIds));

        // Remove skipped (null) results — if ALL are skipped, fail-open (show)
        const definite = results.filter((r) => r !== null);
        if (definite.length === 0) return true;

        const criteria = String(rules.criteria || "ALL")
            .trim()
            .toUpperCase();
        return criteria === "ANY" ? definite.some(Boolean) : definite.every(Boolean);
    } catch (err) {
        console.error("[fieldVisibility] Error for field:", field.columnId, err);
        return true; // fail-open on any error
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public: compute visibility map for ALL fields across visible sections
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a { [columnId]: boolean } map for every field in the given sections.
 *
 * WHY TWO PASSES?
 * ───────────────
 * Field B may have a visibilityRule that depends on field A.
 * Field A itself may have a visibilityRule.
 *
 * If we only do one pass, when we evaluate B we don't yet know whether A
 * ended up visible or hidden (because A comes after B in the list).
 *
 * Pass 1 – evaluate all fields assuming ALL siblings are visible.
 *          → gets a first-cut "visible" set.
 * Pass 2 – evaluate all fields using the pass-1 "visible" set as the
 *          dependency filter. Now "is my dependency visible?" is correct.
 *
 * Circular dependencies can't cause infinite loops because we only do
 * two fixed passes. They resolve to "show" because pass-1 starts with
 * everything visible (fail-open).
 *
 * @param {Object[]} visibleSections  sections already filtered by sectionVisibility
 * @param {Object}   formData         live { columnId: value } map
 * @returns {Object} { [columnId]: boolean }
 */
export function computeFieldVisibility(visibleSections, formData) {
    // Flatten all fields from all sections
    const allFields = [];
    visibleSections.forEach((section) => {
        const fields = section.fields ?? section.sectionData?.fields ?? [];
        fields.forEach((f) => allFields.push(f));
    });

    const allFieldIds = new Set(allFields.map((f) => f.columnId));

    // Pass 1: assume everything visible
    const pass1 = {};
    allFields.forEach((field) => {
        pass1[field.columnId] = isFieldVisible(field, formData, allFieldIds, allFieldIds);
    });

    const visibleAfterPass1 = new Set(
        Object.entries(pass1).filter(([, v]) => v).map(([k]) => k)
    );

    // Pass 2: use pass-1 results as dependency filter
    const pass2 = {};
    allFields.forEach((field) => {
        pass2[field.columnId] = isFieldVisible(field, formData, allFieldIds, visibleAfterPass1);
    });

    return pass2;
}