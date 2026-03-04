/**
 * fieldVisibility.js
 *
 * Evaluates field-level visibilityRules based on LIVE form values.
 *
 * ─── SEPARATION OF CONCERNS ────────────────────────────────────────────────
 *  sectionVisibility.js   → section show/hide based on USER PROFILE (static)
 *  fieldVisibility.js     → field show/hide based on OTHER FIELD VALUES (dynamic)
 *
 * ─── KEY DESIGN: DISPLAY-VALUE RESOLUTION ──────────────────────────────────
 *
 *  formData stores INTERNAL values (status indexes, people id arrays, etc.).
 *  Rules are authored against DISPLAY VALUES ("Label 1", "John Smith", etc.)
 *  because that is what a rule builder sees and understands.
 *
 *  Before evaluating any condition, the dependency field's raw formData value
 *  is resolved to its display string via resolveDisplayValue(). This means:
 *
 *    status / color  → label text  ("Label 1")        via settings_str labels map
 *    people          → names       ("John, Jane")      by joining item.name values
 *    board_relation  → names       ("Acme, Beta")      by joining item.name values
 *    dropdown        → label text  ("Option A")        via settings_str labels array
 *    checkbox        → "true"/"false"                  boolean → string
 *    link            → link text   (or url fallback)   from {url, text} object
 *    numbers         → "42"                            numeric string (numeric ops use Number())
 *    date            → "2024-01-15"                    ISO string (date ops use string compare)
 *    text/email/name → as-is                           already a plain string
 *
 * ─── HOW FIELD VISIBILITY WORKS ────────────────────────────────────────────
 *
 *  Step 1 – isVisible flag (static default)
 *    field.isVisible === false → hard-hide unconditionally.
 *
 *  Step 2 – visibilityRules (dynamic, evaluated against current formData)
 *    Conditions reference another field's display value via common operators.
 *
 *  Step 3 – Two-pass computation
 *    Pass 1 assumes all fields visible → produces first-cut visible set.
 *    Pass 2 uses pass-1 results as the dependency visibility filter.
 *    Handles 1-level dependency chains without infinite loops.
 *
 * ─── FAIL-OPEN (always default to SHOW) ────────────────────────────────────
 *  - visibilityRules missing / null / empty        → show
 *  - condition.fieldId not in layout               → skip (show)
 *  - dependency field is hidden                    → skip (show)
 *  - boardColumns missing / metadata not found     → treat value as plain string
 *  - any evaluation error                          → show
 *
 * ─── OPERATOR REFERENCE ────────────────────────────────────────────────────
 *
 *  TEXT operators (all fields treated as display string):
 *    equals           not_equals
 *    contains         not_contains
 *    starts_with      ends_with
 *    is_empty         is_not_empty
 *    =  ==  !=        (aliases)
 *
 *  NUMERIC operators (only meaningful on numbers-type fields):
 *    greater_than     greater_than_or_equal
 *    less_than        less_than_or_equal
 *    between          (value = [min, max])
 *    equals           not_equals
 *    >  >=  <  <=  =  ==  !=   (aliases)
 *    is_empty         is_not_empty
 *
 *  DATE operators (date-type fields, ISO string lexicographic compare):
 *    equals           not_equals
 *    before           after       (aliases: <  >)
 *    between          (value = ["2024-01-01", "2024-12-31"])
 *    is_empty         is_not_empty
 *
 *  CHECKBOX / BOOLEAN:
 *    Use equals / not_equals with value "true" or "false".
 *    is_empty / is_not_empty also supported.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Internal: build a column metadata lookup from boardColumns array
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a Map<columnId, columnMeta> from the boardColumns array.
 * Safe to call with null/undefined — returns empty Map.
 */
function buildColumnMetaMap(boardColumns) {
    const map = new Map();
    if (!Array.isArray(boardColumns)) return map;
    boardColumns.forEach((col) => {
        if (col && col.id) map.set(col.id, col);
    });
    return map;
}

/**
 * Parse settings_str safely. Returns {} on failure.
 */
function parseSettings(columnMeta) {
    if (!columnMeta || !columnMeta.settings_str) return {};
    try {
        return JSON.parse(columnMeta.settings_str);
    } catch (_) {
        return {};
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal: display value resolver
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve a raw formData value to its human-readable display string.
 *
 * @param {string}  fieldId       column id
 * @param {*}       rawValue      value from formData
 * @param {string}  fieldType     column type from the field definition
 * @param {Map}     colMetaMap    Map<columnId, columnMeta> from buildColumnMetaMap()
 * @returns {string|null}         display string, or null if empty/missing
 */
function resolveDisplayValue(fieldId, rawValue, fieldType, colMetaMap) {
    // Null / undefined / empty string → treat as empty
    if (rawValue === undefined || rawValue === null || rawValue === "") return null;

    switch (fieldType) {
        // ── Status / Color → look up label text from settings_str ────────────
        case "status":
        case "color": {
            // rawValue is the index stored as a string or number (e.g. "2" or 2)
            const indexStr = String(rawValue).trim();
            if (!indexStr || indexStr === "") return null;

            const meta = colMetaMap.get(fieldId);
            const settings = parseSettings(meta);
            const labels = settings.labels || {};
            // settings.labels is { "0": "Label 1", "1": "Label 2", ... }
            const labelText = labels[indexStr];
            if (labelText !== undefined) return String(labelText).trim() || null;
            // Fallback: return the index itself as a string (so is_empty still works)
            return indexStr;
        }

        // ── Dropdown → look up label name(s) from settings_str ───────────────
        case "dropdown": {
            const ids = Array.isArray(rawValue) ? rawValue : [rawValue];
            const meta = colMetaMap.get(fieldId);
            const settings = parseSettings(meta);
            // settings.labels is [{ id: 1, name: "Option A" }, ...]
            const labelsArr = Array.isArray(settings.labels) ? settings.labels : [];
            const labelMap = new Map(labelsArr.map((l) => [String(l.id), l.name]));
            const names = ids
                .map((id) => labelMap.get(String(id)))
                .filter(Boolean);
            return names.length > 0 ? names.join(", ") : null;
        }

        // ── People → join names ───────────────────────────────────────────────
        case "people": {
            if (!Array.isArray(rawValue) || rawValue.length === 0) return null;
            const names = rawValue
                .map((p) => (typeof p === "object" ? p.name || p.id : String(p)))
                .filter(Boolean);
            return names.length > 0 ? names.join(", ") : null;
        }

        // ── Board relation → join names ───────────────────────────────────────
        case "board_relation":
        case "connect_boards": {
            if (!Array.isArray(rawValue) || rawValue.length === 0) return null;
            const names = rawValue
                .map((r) => (typeof r === "object" ? r.name || r.id : String(r)))
                .filter(Boolean);
            return names.length > 0 ? names.join(", ") : null;
        }

        // ── Checkbox / Boolean → "true" or "false" ───────────────────────────
        case "checkbox":
        case "boolean": {
            const checked = rawValue === true || rawValue === "true" || rawValue === "v";
            return checked ? "true" : "false";
        }

        // ── Link → prefer text label, fall back to url ───────────────────────
        case "link": {
            if (typeof rawValue === "object" && rawValue !== null) {
                const text = (rawValue.text || "").trim();
                const url  = (rawValue.url  || "").trim();
                return text || url || null;
            }
            return String(rawValue).trim() || null;
        }

        // ── Numbers → numeric string (numeric ops will parse to Number) ───────
        case "numbers":
        case "numeric": {
            const s = String(rawValue).trim();
            return s === "" ? null : s;
        }

        // ── Date → ISO string as-is ───────────────────────────────────────────
        case "date": {
            const s = String(rawValue).trim();
            return s === "" ? null : s;
        }

        // ── Timeline → "YYYY-MM-DD → YYYY-MM-DD" display string ─────────────
        case "timerange":
        case "timeline": {
            if (!rawValue || typeof rawValue !== "object") return null;
            const from = (rawValue.from || "").trim();
            const to   = (rawValue.to   || "").trim();
            if (!from && !to) return null;
            if (from && to)   return `${from} → ${to}`;
            return from || to; // partial — one date set
        }

        // ── Phone → use the phone number string ───────────────────────────────
        case "phone": {
            if (typeof rawValue === "object" && rawValue !== null) {
                return String(rawValue.phone || "").trim() || null;
            }
            return String(rawValue).trim() || null;
        }

        // ── Everything else (text, long_text, email, name, formula…) ─────────
        default: {
            const s = String(rawValue).trim();
            return s === "" ? null : s;
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal: find a field's type from the visible sections
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a Map<columnId, fieldType> from all fields in all sections.
 * Used so we know which type-specific evaluator to call for a dependency field.
 */
function buildFieldTypeMap(visibleSections) {
    const map = new Map();
    visibleSections.forEach((section) => {
        const fields = section.fields ?? section.sectionData?.fields ?? [];
        fields.forEach((f) => {
            if (f.columnId && f.type) map.set(f.columnId, f.type);
        });
    });
    return map;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal: operator evaluators
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Evaluate a TEXT operator against a display string.
 * Both sides are lowercased for case-insensitive comparison.
 *
 * @param {string|null} displayValue  resolved display value (null = empty)
 * @param {string}      operator
 * @param {*}           ruleValue     the value from the condition definition
 * @returns {boolean|null}            null = skip (fail-open)
 */
function evaluateTextOp(displayValue, operator, ruleValue) {
    const isEmptyVal = displayValue === null || displayValue.trim() === "";

    switch (operator) {
        case "is_empty":
            return isEmptyVal;

        case "is_not_empty":
            return !isEmptyVal;

        default: {
            // An empty dependency value means the condition cannot be satisfied.
            // Return false (hide) rather than null (skip/show) so that fields with
            // visibility rules are hidden when their dependency has no value yet.
            if (isEmptyVal) return false;
            const haystack = displayValue.toLowerCase();
            const needle   = String(ruleValue ?? "").toLowerCase();

            switch (operator) {
                case "equals":
                case "=":
                case "==":
                    return haystack === needle;

                case "not_equals":
                case "!=":
                    return haystack !== needle;

                case "contains":
                    return haystack.includes(needle);

                case "not_contains":
                    return !haystack.includes(needle);

                case "starts_with":
                    return haystack.startsWith(needle);

                case "ends_with":
                    return haystack.endsWith(needle);

                default:
                    console.warn(`[fieldVisibility] Unknown text operator "${operator}" — skipping`);
                    return null;
            }
        }
    }
}

/**
 * Evaluate a NUMERIC operator.
 * displayValue is the string form of the number (e.g. "42").
 *
 * @param {string|null} displayValue
 * @param {string}      operator
 * @param {*}           ruleValue     single number, or [min,max] for between
 * @returns {boolean|null}
 */
function evaluateNumericOp(displayValue, operator, ruleValue) {
    const isEmptyVal = displayValue === null || displayValue.trim() === "";

    switch (operator) {
        case "is_empty":
            return isEmptyVal;
        case "is_not_empty":
            return !isEmptyVal;
        default: {
            // Empty dependency → condition fails → hide the dependent field
            if (isEmptyVal) return false;
            const num    = Number(displayValue);
            const cmpNum = Number(ruleValue);
            if (isNaN(num)) return null; // not a real number — skip

            switch (operator) {
                case "greater_than":
                case ">":
                    return num > cmpNum;

                case "greater_than_or_equal":
                case ">=":
                    return num >= cmpNum;

                case "less_than":
                case "<":
                    return num < cmpNum;

                case "less_than_or_equal":
                case "<=":
                    return num <= cmpNum;

                case "equals":
                case "=":
                case "==":
                    return !isNaN(cmpNum) ? num === cmpNum
                        : String(displayValue).toLowerCase() === String(ruleValue).toLowerCase();

                case "not_equals":
                case "!=":
                    return !isNaN(cmpNum) ? num !== cmpNum
                        : String(displayValue).toLowerCase() !== String(ruleValue).toLowerCase();

                case "between": {
                    const [lo, hi] = Array.isArray(ruleValue)
                        ? ruleValue.map(Number)
                        : [cmpNum, cmpNum];
                    return num >= lo && num <= hi;
                }

                default:
                    // Unknown numeric op — fall through to text evaluation
                    return evaluateTextOp(displayValue, operator, ruleValue);
            }
        }
    }
}

/**
 * Evaluate a DATE operator.
 * ISO date strings compare lexicographically correctly (YYYY-MM-DD).
 *
 * @param {string|null} displayValue  ISO date string or null
 * @param {string}      operator
 * @param {*}           ruleValue     ISO date string, or [from, to] for between
 * @returns {boolean|null}
 */
function evaluateDateOp(displayValue, operator, ruleValue) {
    const isEmptyVal = displayValue === null || displayValue.trim() === "";

    switch (operator) {
        case "is_empty":
            return isEmptyVal;
        case "is_not_empty":
            return !isEmptyVal;
        default: {
            // Empty dependency → condition fails → hide the dependent field
            if (isEmptyVal) return false;
            const d = displayValue.trim();

            switch (operator) {
                case "equals":
                case "=":
                case "==":
                    return d === String(ruleValue ?? "").trim();

                case "not_equals":
                case "!=":
                    return d !== String(ruleValue ?? "").trim();

                case "before":
                case "<":
                    return d < String(ruleValue ?? "").trim();

                case "after":
                case ">":
                    return d > String(ruleValue ?? "").trim();

                case "between": {
                    const [from, to] = Array.isArray(ruleValue)
                        ? ruleValue.map((v) => String(v ?? "").trim())
                        : [String(ruleValue ?? ""), String(ruleValue ?? "")];
                    return d >= from && d <= to;
                }

                default:
                    // Unknown date op — fall back to text evaluation
                    return evaluateTextOp(displayValue, operator, ruleValue);
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal: single condition evaluator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Evaluate ONE visibility condition.
 *
 * @returns {boolean|null}
 *   true  — condition passes → counts toward showing
 *   false — condition fails  → counts toward hiding
 *   null  — skip (dependency missing/hidden) → treated as "show"
 */
function evaluateOneCondition(condition, formData, allFieldIds, visibleFieldIds, fieldTypeMap, colMetaMap) {
    const { fieldId, operator, value: ruleValue } = condition;

    // Guard 1: dependency must exist in the layout
    if (!allFieldIds.has(fieldId)) {
        console.warn(`[fieldVisibility] Dependency "${fieldId}" not in layout — skipping condition "${condition.id}"`);
        return null;
    }

    // Guard 2: dependency must itself be visible
    if (!visibleFieldIds.has(fieldId)) {
        return null;
    }

    const rawValue   = formData[fieldId];
    const fieldType  = fieldTypeMap.get(fieldId) || "text";
    const displayVal = resolveDisplayValue(fieldId, rawValue, fieldType, colMetaMap);

    // Route to the correct evaluator based on field type
    switch (fieldType) {
        case "numbers":
        case "numeric":
            return evaluateNumericOp(displayVal, operator, ruleValue);

        case "date":
            return evaluateDateOp(displayVal, operator, ruleValue);

        default:
            // Everything else (status, people, relation, text, email,
            // checkbox, link, dropdown, phone…) → text ops on display value
            return evaluateTextOp(displayVal, operator, ruleValue);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public: single-field visibility decision
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Should this one field be shown?
 *
 * @param {Object} field            field definition from layout JSON
 * @param {Object} formData         live { columnId: value } map
 * @param {Set}    allFieldIds      all columnIds in the layout
 * @param {Set}    visibleFieldIds  currently-visible columnIds (for dependency checks)
 * @param {Map}    fieldTypeMap     Map<columnId, fieldType>
 * @param {Map}    colMetaMap       Map<columnId, columnMeta> for label resolution
 * @returns {boolean}
 */
export function isFieldVisible(field, formData, allFieldIds, visibleFieldIds, fieldTypeMap, colMetaMap) {
    try {
        // Step 1: explicit hard-hide flag
        if (field.isVisible === false) return false;

        // Step 1b: required fields are always visible — skip all visibility rules.
        // isRequired = true means the field is mandatory at the layout level and
        // must always be shown regardless of any visibilityRules defined on it.
        if (field.isRequired === true || field.isRequired === "true") return true;

        // Step 2: dynamic visibility rules
        const rules = field.visibilityRules;
        if (!rules || typeof rules !== "object") return true;

        const conditions = Array.isArray(rules.conditions) ? rules.conditions : [];
        if (conditions.length === 0) return true;

        // Only evaluate "field" source conditions
        const fieldConditions = conditions.filter((c) => !c.source || c.source === "field");
        if (fieldConditions.length === 0) return true;

        const results = fieldConditions.map((c) =>
            evaluateOneCondition(c, formData, allFieldIds, visibleFieldIds, fieldTypeMap, colMetaMap)
        );

        // Remove skipped (null) results — if ALL skipped, fail-open (show)
        const definite = results.filter((r) => r !== null);
        if (definite.length === 0) return true;

        const criteria = String(rules.criteria || "ALL").trim().toUpperCase();
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
 * Field B may depend on field A, which itself has a visibility rule.
 * Pass 1 assumes all fields visible → gets first-cut visible set.
 * Pass 2 uses pass-1 results so "is my dependency visible?" is correct.
 * Two fixed passes prevents infinite loops from circular dependencies.
 *
 * @param {Object[]} visibleSections  sections already filtered by sectionVisibility
 * @param {Object}   formData         live { columnId: value } map
 * @param {Object[]} boardColumns     full column metadata array (with settings_str)
 *                                    — pass App's boardColumns state here
 * @returns {Object} { [columnId]: boolean }
 */
export function computeFieldVisibility(visibleSections, formData, boardColumns) {
    // Build lookup structures once per call
    const colMetaMap  = buildColumnMetaMap(boardColumns);   // for label resolution
    const fieldTypeMap = buildFieldTypeMap(visibleSections); // for operator routing

    // Flatten all fields from all sections
    const allFields = [];
    visibleSections.forEach((section) => {
        const fields = section.fields ?? section.sectionData?.fields ?? [];
        fields.forEach((f) => allFields.push(f));
    });

    const allFieldIds = new Set(allFields.map((f) => f.columnId));

    // ── Pass 1: assume everything visible ────────────────────────────────────
    const pass1 = {};
    allFields.forEach((field) => {
        pass1[field.columnId] = isFieldVisible(
            field, formData, allFieldIds, allFieldIds, fieldTypeMap, colMetaMap
        );
    });

    const visibleAfterPass1 = new Set(
        Object.entries(pass1).filter(([, v]) => v).map(([k]) => k)
    );

    // ── Pass 2: use pass-1 results as dependency filter ───────────────────────
    const pass2 = {};
    allFields.forEach((field) => {
        pass2[field.columnId] = isFieldVisible(
            field, formData, allFieldIds, visibleAfterPass1, fieldTypeMap, colMetaMap
        );
    });

    return pass2;
}