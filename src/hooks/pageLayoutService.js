import mondaySdk from "monday-sdk-js";
import { useState, useEffect } from "react";
import { METADATA_BOARD_ID as METADATA_BOARD_ID_FROM_FILE } from "../metadataConfig";
import { getBoardColumns } from "./boardMetadata";

const monday = mondaySdk();
const PAGELAYOUTSECTIONS_BOARD_ID = METADATA_BOARD_ID_FROM_FILE;
const PAGELAYOUT_COL_TITLE_BOARDID = "Board Id";
const PAGELAYOUT_COL_TITLE_SECTIONS = "Sections"; // ← the column storing the sections JSON array
const LIMIT = 500;

// Utility to ensure integers
function int(val) {
    const parsed = parseInt(val, 10);
    return isNaN(parsed) ? 0 : parsed;
}

/**
 * Helper to fetch column ID for a given column title in a board.
 */
async function getBoardColumnIdsByTitles(boardId, titles) {
    const query = `
        query {
            boards(ids: [${boardId}]) {
                columns {
                    id
                    title
                }
            }
        }
    `;
    const response = await monday.api(query);
    const columns = response?.data?.boards?.[0]?.columns || [];
    const titleToIdMap = {};
    columns.forEach((col) => {
        if (titles.includes(col.title)) {
            titleToIdMap[col.title] = col.id;
        }
    });
    return titleToIdMap;
}

/**
 * Parse the Sections column value from a monday long_text / text column.
 *
 * monday long_text columns return:
 *   cv.text  = the raw stored string (most reliable)
 *   cv.value = '{"text":"[...]","changed_at":"..."}' (wrapper object)
 *
 * The stored string is a JSON array of section objects:
 *   [{ Id, Title, fields: [...], rules, order }, ...]
 *
 * @param {Object} cv - column_value object { id, text, value, column }
 * @returns {Array|null} Parsed sections array or null on failure
 */
function parseSectionsColumnValue(cv) {
    if (!cv) return null;

    // Strategy 1: cv.text is the raw stored string
    const rawText = cv.text?.trim();
    if (rawText && rawText.startsWith("[")) {
        try {
            const parsed = JSON.parse(rawText);
            if (Array.isArray(parsed)) return parsed;
        } catch (_) {}
    }

    // Strategy 2: cv.value is the monday wrapper object { text: "[...]", changed_at: "..." }
    if (cv.value) {
        try {
            const outer = JSON.parse(cv.value);
            if (outer && typeof outer.text === "string" && outer.text.trim().startsWith("[")) {
                const inner = JSON.parse(outer.text);
                if (Array.isArray(inner)) return inner;
            }
        } catch (_) {}

        // Strategy 3: cv.value itself is the array string (no wrapper)
        try {
            const direct = JSON.parse(cv.value);
            if (Array.isArray(direct)) return direct;
        } catch (_) {}
    }

    return null;
}

/**
 * Validate sections parsed from the Sections column against the target board's columns.
 *
 * NEW STRUCTURE (one PLS record, Sections column holds):
 *   [
 *     { Id: "sec1", Title: "Sec 1", fields: [{columnId, type, isRequired}, ...], rules: {}, order: "1" },
 *     { Id: "sec2", Title: "Sec 2", fields: [...], rules: {}, order: "2" },
 *     ...
 *   ]
 *
 * Returns validatedSections in the same shape the rest of the app expects:
 *   [{
 *     recordId,       // the PLS monday item id
 *     recordName,     // the PLS monday item name
 *     sectionData: {  // mirrors old sectionData shape used in App.jsx
 *       id, title, fields: [{ columnId, type, isRequired, label, isValid, duplicate, ... }]
 *     },
 *     fields,         // same array (convenience reference)
 *     isValid,
 *     isFullyValid,
 *     hasInvalidFields,
 *     hasDuplicateFields,
 *   }]
 */
async function checkPageLayoutColumnValidity(plsRecord, boardId) {
    console.log("Pls record ", plsRecord);
    try {
        // Step 1: Get board's actual column metadata
        const plsRecordId = plsRecord?.id ?? null;
        const plsRecordName = plsRecord.name ?? null;
        const boardColumnsResult = await getBoardColumns(boardId);

        if (!boardColumnsResult?.success || !Array.isArray(boardColumnsResult?.columns)) {
            return {
                success: false,
                error: `Could not fetch target board column metadata. Board Id: ${boardId}`,
                validatedSections: [],
            };
        }

        const boardColumns = boardColumnsResult.columns;
        const boardColumnMetadataMap = new Map(boardColumns.map((col) => [col.id, col.title]));
        const validColumnIds = new Set(boardColumns.map((col) => col.id));

        // Step 2: Find and parse the Sections column from the PLS record
        const sectionsCV = plsRecord.column_values.find((cv) => cv.column && cv.column.title === PAGELAYOUT_COL_TITLE_SECTIONS);

        if (!sectionsCV) {
            return {
                success: false,
                error: `Column "${PAGELAYOUT_COL_TITLE_SECTIONS}" not found in PLS record "${plsRecord.name}"`,
                validatedSections: [],
            };
        }
        console.log("Raw sections ", sectionsCV);
        console.log("Raw sections text ", sectionsCV?.text);
        console.log("Raw sections value = ", sectionsCV?.value);
        const jsonObject = JSON.parse(sectionsCV?.text ?? null);

        console.log("Raw sections value = ", jsonObject);
        const rawSections = parseSectionsColumnValue(sectionsCV);
        console.log("Raw sections ", rawSections);
        if (!rawSections) {
            return {
                success: false,
                error: `Could not parse JSON from "${PAGELAYOUT_COL_TITLE_SECTIONS}" column in record "${plsRecord.name}"`,
                validatedSections: [],
            };
        }

        // Step 3: Build a columnId usage map across ALL sections (for cross-section duplicate detection)
        const columnIdUsageMap = {};
        rawSections.forEach((section) => {
            (section.fields || []).forEach((field) => {
                if (field.columnId) {
                    columnIdUsageMap[field.columnId] = (columnIdUsageMap[field.columnId] || 0) + 1;
                }
            });
        });

        // Step 4: Sort sections by order, then validate each one
        const sortedSections = [...rawSections].sort((a, b) => {
            const oA = parseInt(a.order ?? a.Order ?? "0", 10);
            const oB = parseInt(b.order ?? b.Order ?? "0", 10);
            return oA - oB;
        });

        const validatedSections = sortedSections.map((section) => {
            const rawFields = section.fields || [];

            if (rawFields.length === 0) {
                return {
                    ...section,
                    fields: [],
                    isValid: true,
                    isFullyValid: true,
                    hasInvalidFields: false,
                    hasDuplicateFields: false,
                };
            }

            // Enrich each field with label, validity, duplicate flag
            const enrichedFields = rawFields.map((field) => {
                const columnId = field.columnId;

                // Use board column title as label (new schema has no stored label)
                const label = boardColumnMetadataMap.get(columnId) || columnId;

                const isValidColumnId = validColumnIds.has(columnId);
                const isDuplicate = columnIdUsageMap[columnId] > 1;

                return {
                    ...field,
                    label,
                    isValid: isValidColumnId,
                    duplicate: isDuplicate,
                    validationError: !isValidColumnId ? `Column '${columnId}' does not exist in board` : null,
                };
            });

            const hasInvalidFields = enrichedFields.some((f) => !f.isValid);
            const hasDuplicateFields = enrichedFields.some((f) => f.duplicate);

            return {
                ...section,
                fields: enrichedFields, // convenience reference
                isValid: true,
                isFullyValid: !hasInvalidFields && !hasDuplicateFields,
                hasInvalidFields,
                hasDuplicateFields,
            };
        });

        const summary = {
            totalSections: validatedSections.length,
            fullyValidSections: validatedSections.filter((s) => s.isFullyValid).length,
        };

        console.log("[PageLayoutService] Validated sections", { validatedSections, summary });

        return {
            success: true,
            error: null,
            validatedSections,
            validationSummary: summary,
        };
    } catch (error) {
        console.error("[PageLayoutService] checkPageLayoutColumnValidity error:", error);
        return {
            success: false,
            error: error.message || "Validation failed",
            validatedSections: [],
        };
    }
}

/**
 * Retrieve and validate the page layout for a given board.
 *
 * Queries the PageLayoutSections board for the ONE record that matches boardId,
 * then parses + validates its Sections column JSON.
 *
 * @param {string} boardId
 * @returns {Promise<{ success, error, items, validatedSections, validationSummary }>}
 */
export async function retrievePageLayoutInfoForBoard(boardId) {
    if (!boardId || !PAGELAYOUTSECTIONS_BOARD_ID) {
        return {
            success: false,
            error: "Missing Board IDs",
            items: [],
            validatedSections: [],
            validationSummary: null,
        };
    }

    try {
        // Step 1: Resolve the column ID for the Board Id filter column
        const colMap = await getBoardColumnIdsByTitles(PAGELAYOUTSECTIONS_BOARD_ID, [PAGELAYOUT_COL_TITLE_BOARDID]);
        const boardIdColId = colMap[PAGELAYOUT_COL_TITLE_BOARDID];

        if (!boardIdColId) {
            throw new Error(`Filter column "${PAGELAYOUT_COL_TITLE_BOARDID}" not found in PageLayout board`);
        }

        // Step 2: Query the PLS board — filter to the single record for this board
        const query = `
            query {
                boards(ids: [${PAGELAYOUTSECTIONS_BOARD_ID}]) {
                    items_page(
                        limit: ${int(LIMIT)},
                        query_params: {
                            rules: [{
                                column_id: "${boardIdColId}",
                                compare_value: ["${boardId}"],
                                operator: any_of
                            }]
                        }
                    ) {
                        cursor
                        items {
                            id
                            name
                            column_values {
                                id
                                text
                                value
                                column { title type }
                                ... on BoardRelationValue { linked_item_ids display_value }
                                ... on MirrorValue { display_value }
                            }
                        }
                    }
                }
            }
        `;

        const response = await monday.api(query);

        if (response.errors) {
            throw new Error(response.errors[0]?.message || "GraphQL error");
        }

        const items = response?.data?.boards?.[0]?.items_page?.items || [];
        console.log("[PageLayoutService] PLS records fetched:", items.length);

        if (items.length === 0) {
            return {
                success: true,
                items: [],
                validatedSections: [],
                validationSummary: { totalSections: 0, fullyValidSections: 0 },
                error: null,
            };
        }

        // Step 3: Use the FIRST matching record (new model = one record per board)
        // If somehow multiple records exist, log a warning but continue with the first.
        if (items.length > 1) {
            console.warn(`[PageLayoutService] Expected 1 PLS record for board ${boardId}, found ${items.length}. Using first.`);
        }
        const plsRecord = items[0];

        // Step 4: Validate and enrich sections from the Sections column JSON
        const validationResult = await checkPageLayoutColumnValidity(plsRecord, boardId);

        if (!validationResult.success) {
            console.warn("[PageLayoutService] Validation failed:", validationResult.error);
            return {
                success: true, // data was fetched, validation just found issues
                items,
                validatedSections: [],
                validationSummary: null,
                validationError: validationResult.error,
                error: null,
            };
        }

        return {
            success: true,
            items,
            validatedSections: validationResult.validatedSections,
            validationSummary: validationResult.validationSummary,
            error: null,
        };
    } catch (error) {
        console.error("[PageLayoutService] retrievePageLayoutInfoForBoard error:", error);
        return {
            success: false,
            error: error.message,
            items: [],
            validatedSections: [],
            validationSummary: null,
        };
    }
}

/**
 * React hook — wraps retrievePageLayoutInfoForBoard with loading state.
 * API is unchanged so App.jsx requires no edits.
 *
 * Usage (unchanged in App.jsx):
 *   const { items, validatedSections, validationSummary, loading, error } = usePageLayoutInfo(boardId);
 */
export function usePageLayoutInfo(boardId) {
    const [data, setData] = useState({
        items: [],
        validatedSections: [],
        validationSummary: null,
        loading: true,
        error: null,
    });

    useEffect(() => {
        if (!boardId) {
            setData({
                items: [],
                validatedSections: [],
                validationSummary: null,
                loading: false,
                error: null,
            });
            return;
        }

        setData((prev) => ({ ...prev, loading: true, error: null }));

        retrievePageLayoutInfoForBoard(boardId)
            .then((result) => {
                setData({
                    items: result.items || [],
                    validatedSections: result.validatedSections || [],
                    validationSummary: result.validationSummary || null,
                    loading: false,
                    error: result.success ? null : result.error,
                });
            })
            .catch((err) => {
                setData({
                    items: [],
                    validatedSections: [],
                    validationSummary: null,
                    loading: false,
                    error: err.message || `Unknown error for board ${boardId}`,
                });
            });
    }, [boardId]);

    return data;
}