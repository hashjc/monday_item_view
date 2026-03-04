/**
 * fieldValidation.js
 *
 * Evaluates field-level validityRules at form-submit time.
 *
 * ─── WHAT THIS HANDLES ─────────────────────────────────────────────────────
 *
 *  A) Self-referencing numeric range rules  (source: "self_ref")
 *     e.g. "Age must be > 0 and <= 100"
 *     The rule checks the field's OWN value against a threshold.
 *
 *  B) isRequired  (handled here as well, separately from form-level required)
 *     If field.isRequired === "true" | true and the value is empty → error.
 *
 *  C) (Extensible) cross-field validation can be added later by adding
 *     source: "field" conditions, following the same pattern as fieldVisibility.
 *
 * ─── ONLY VALIDATED WHEN VISIBLE ───────────────────────────────────────────
 *  validateVisibleFields() receives the fieldVisibilityMap computed by
 *  computeFieldVisibility() and skips any field that is currently hidden.
 *  A hidden field can never produce a validation error.
 *
 * ─── FAIL-OPEN ─────────────────────────────────────────────────────────────
 *  If validityRules is missing, null, or empty → no validation errors.
 *  If a condition throws → skip that condition, no error.
 *
 * ─── JSON SHAPE ────────────────────────────────────────────────────────────
 *  field.validityRules = {
 *    conditions: [
 *      {
 *        id:       "val_1",
 *        source:   "self_ref",   // checks this field's own value
 *        operator: ">",          // or "min" / "max" shorthand
 *        value:    0
 *      },
 *      {
 *        id:       "val_2",
 *        operator: "max",        // shorthand: equivalent to "<="
 *        value:    100
 *      }
 *    ],
 *    criteria: "ALL",
 *    message:  "Range (0-100)"  // optional custom error message
 *  }
 *
 * ─── SUPPORTED OPERATORS (self_ref / numeric) ──────────────────────────────
 *   min / >=        value must be >= threshold
 *   max / <=        value must be <= threshold
 *   >               value must be > threshold
 *   <               value must be < threshold
 *   equals / =      value must equal threshold
 *   not_equals / != value must not equal threshold
 *   between         value must be in [min, max]  (value = [min, max])
 *
 * ─── RETURN SHAPE ──────────────────────────────────────────────────────────
 *  validateVisibleFields() returns an array of error objects:
 *  [
 *    {
 *      columnId: "numeric_mm0x48fv",
 *      label:    "Age",
 *      message:  "Range (0-100)",       // custom message, or auto-generated
 *      type:     "VALIDITY_RULE"
 *    },
 *    {
 *      columnId: "numeric_mm0x48fv",
 *      label:    "Age",
 *      message:  "Age is required",
 *      type:     "REQUIRED_FIELD"
 *    }
 *  ]
 */

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function isEmpty(value) {
    return (
        value === null ||
        value === undefined ||
        value === "" ||
        (Array.isArray(value) && value.length === 0)
    );
}

function toNumber(value) {
    if (value === null || value === undefined || value === "") return null;
    const n = Number(value);
    return isNaN(n) ? null : n;
}

/**
 * Evaluate one self_ref validity condition against the field's own value.
 *
 * @param {Object}         condition  – one entry from validityRules.conditions
 * @param {number|string}  fieldValue – the field's current value
 * @returns {boolean}  true = passes (value is valid), false = fails (error)
 */
function evaluateValidityCondition(condition, fieldValue) {
    console.log("Condition ", condition, "field value = ", fieldValue);
    try {
        const { operator, value: threshold } = condition;
        const numFieldVal = toNumber(fieldValue);
        const numThreshold = toNumber(threshold);

        switch (operator) {
            // "min" and ">=" mean the same thing: value must be AT LEAST threshold
            case "min":
            case ">=":
            case "greater_than_or_equal":
                return numFieldVal !== null && numFieldVal >= numThreshold;

            // "max" and "<=" mean the same thing: value must be AT MOST threshold
            case "max":
            case "<=":
            case "less_than_or_equal":
                return numFieldVal !== null && numFieldVal <= numThreshold;

            case ">":
            case "greater_than":
                return numFieldVal !== null && numFieldVal > numThreshold;

            case "<":
            case "less_than":
                return numFieldVal !== null && numFieldVal < numThreshold;

            case "equals":
            case "=":
            case "==":
                return numFieldVal !== null && numFieldVal === numThreshold;

            case "not_equals":
            case "!=":
                return numFieldVal !== null && numFieldVal !== numThreshold;

            case "between": {
                const [lo, hi] = Array.isArray(threshold) ? threshold : [threshold, threshold];
                return numFieldVal !== null && numFieldVal >= Number(lo) && numFieldVal <= Number(hi);
            }

            default:
                console.warn(`[fieldValidation] Unknown operator "${operator}" — skipping`);
                return true; // unknown operator → skip → no error
        }
    } catch (err) {
        console.error("[fieldValidation] Error in condition:", condition, err);
        return true; // fail-open: don't block submission on an evaluation error
    }
}
/**
 * Validates a field's validity rules.
 *
 * Each condition in validityRules.conditions must have:
 *   - fieldId: the columnId of the field whose value to test
 *              (use this field's own columnId to validate against itself)
 *   - operator: one of >=, <=, >, <, equals, not_equals, etc.
 *   - value: the threshold/comparison value
 *
 * @param {Object}   field           - the field definition object
 * @param {*}        fieldValue      - current value of this field
 * @param {Function} getFieldValue   - (columnId) => value  — resolves any other field's current value
 *                                     (can be omitted if all conditions are self-referencing)
 */
function validateFieldRules(field, fieldValue, getFieldValue = () => null) {
    console.log("Validate field rules ", fieldValue);
    console.log("Validate field rules field> ", field);
    const rules = field.validityRules;
    if (!rules || typeof rules !== "object") return { valid: true, message: null };

    const conditions = Array.isArray(rules.conditions) ? rules.conditions : [];
    if (conditions.length === 0) return { valid: true, message: null };

    const results = conditions.map((c) => {
        // Resolve whose value we're testing
        const targetValue = c.fieldId === field.columnId ? fieldValue : getFieldValue(c.columnId);
        
        return evaluateValidityCondition(c, targetValue);
    });

    console.log("Field conditions Reuslts ", results);

    const criteria = String(rules.criteria || "ALL")
        .trim()
        .toUpperCase();
    const passed = criteria === "ANY" ? results.some(Boolean) : results.every(Boolean);

    if (passed) return { valid: true, message: null };

    const message = rules.message || buildAutoMessage(field.label || field.columnId, conditions);
    return { valid: false, message };
}

/**
 * Auto-generate a human-readable error message from the conditions.
 * Used when validityRules.message is not set.
 */
function buildAutoMessage(label, conditions) {
    const parts = conditions.map(({ operator, value }) => {
        switch (operator) {
            case "min":
            case ">=":
            case "greater_than_or_equal":
                return `≥ ${value}`;
            case "max":
            case "<=":
            case "less_than_or_equal":
                return `≤ ${value}`;
            case ">":
            case "greater_than":
                return `> ${value}`;
            case "<":
            case "less_than":
                return `< ${value}`;
            case "equals":
            case "=":
            case "==":
                return `= ${value}`;
            case "not_equals":
            case "!=":
                return `≠ ${value}`;
            case "between": {
                const [lo, hi] = Array.isArray(value) ? value : [value, value];
                return `between ${lo} and ${hi}`;
            }
            default:
                return `${operator} ${value}`;
        }
    });
    return `${label} must be: ${parts.join(", ")}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public: validate all visible fields
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run all validity checks for fields that are currently visible.
 *
 * Hidden fields are completely skipped — a user can't fill a field they
 * can't see, so it should never produce a validation error.
 *
 * Checks performed (in this order):
 *  1. isRequired  — error if visible + required + empty
 *  2. validityRules — error if value violates self_ref conditions
 *
 * @param {Object[]} visibleSections      sections passing sectionVisibility
 * @param {Object}   formData             live { columnId: value } map
 * @param {Object}   fieldVisibilityMap   output of computeFieldVisibility()
 *                                        { [columnId]: boolean }
 * @returns {Array}  array of error objects (empty = form is valid)
 *                   Each error: { columnId, label, message, type }
 */
export function validateVisibleFields(visibleSections, formData, fieldVisibilityMap) {
    const errors = [];

    visibleSections.forEach((section) => {
        const fields = section.fields ?? section.sectionData?.fields ?? [];

        fields.forEach((field) => {
            console.log("Field validation in loop ", field);
            // Skip layout-invalid fields (e.g. duplicate columnIds caught by pageLayoutService)
            if (field.isValid === false || field.duplicate === true) return;

            // Skip fields that are currently hidden by fieldVisibility rules
            const isVisible = fieldVisibilityMap[field.columnId] !== false;
            if (!isVisible) return;

            const value = formData[field.columnId];
            const label = field.label || field.columnId;
            const required = field.isRequired === true || field.isRequired === "true";

            // ── Check 1: required ───────────────────────────────────────────
            if (required && isEmpty(value)) {
                errors.push({
                    columnId: field.columnId,
                    label,
                    message: `${label} is required`,
                    type: "REQUIRED_FIELD",
                });
                return; // no point running validity rules on an empty required field
            }

            // ── Check 2: validityRules ──────────────────────────────────────
            const { valid, message } = validateFieldRules(field, value, (colId) => formData[colId]);
            console.log("Field Rule ", valid);
            if (!valid) {
                errors.push({
                    columnId: field.columnId,
                    label,
                    message,
                    type: "VALIDITY_RULE",
                });
            }
        });
    });

    return errors;
}