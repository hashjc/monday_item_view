import mondaySdk from "monday-sdk-js";
import { useState, useEffect } from "react";
import { METADATA_BOARD_ID as METADATA_BOARD_ID_FROM_FILE } from "../metadataConfig";
import { getBoardColumns } from "./boardMetadata";
import { getChildBoards } from "./boardMetadata";

const monday = mondaySdk();
const PAGELAYOUTSECTIONS_BOARD_ID = METADATA_BOARD_ID_FROM_FILE;
const PAGELAYOUT_COL_TITLE_BOARDID = "Board Id";
const PAGELAYOUT_COL_TITLE_SECTIONS = "Sections";
const PAGELAYOUT_COL_TITLE_CHILD_BOARDS = "Child Boards";
const LIMIT = 500;

// ─── Utilities ────────────────────────────────────────────────────────────────

function int(val) {
    const parsed = parseInt(val, 10);
    return isNaN(parsed) ? 0 : parsed;
}

async function getBoardColumnIdsByTitles(boardId, titles) {
    const query = `
        query {
            boards(ids: [${boardId}]) {
                columns { id title }
            }
        }
    `;
    const response = await monday.api(query);
    const columns = response?.data?.boards?.[0]?.columns || [];
    const titleToIdMap = {};
    columns.forEach((col) => {
        if (titles.includes(col.title)) titleToIdMap[col.title] = col.id;
    });
    return titleToIdMap;
}

// ─── Sections parsing ─────────────────────────────────────────────────────────

/**
 * Parse the Sections column value from a monday long_text / text column.
 * Handles cv.text (raw string), cv.value (wrapper object), or cv.value as direct array.
 */
function parseSectionsColumnValue(cv) {
    if (!cv) return null;

    const rawText = cv.text?.trim();
    if (rawText && rawText.startsWith("[")) {
        try {
            const parsed = JSON.parse(rawText);
            if (Array.isArray(parsed)) return parsed;
        } catch (_) {}
    }

    if (cv.value) {
        try {
            const outer = JSON.parse(cv.value);
            if (outer && typeof outer.text === "string" && outer.text.trim().startsWith("[")) {
                const inner = JSON.parse(outer.text);
                if (Array.isArray(inner)) return inner;
            }
        } catch (_) {}
        try {
            const direct = JSON.parse(cv.value);
            if (Array.isArray(direct)) return direct;
        } catch (_) {}
    }

    return null;
}

/**
 * Parse a raw column value into a plain string for child board / sections columns.
 * Handles both { sections: [...] } wrapper and bare array / object stored in text/value.
 */
function parseRawColumnText(cv) {
    if (!cv) return null;
    const rawText = cv.text?.trim();
    if (rawText) return rawText;
    if (cv.value) {
        try {
            const outer = JSON.parse(cv.value);
            if (outer && typeof outer.text === "string") return outer.text.trim();
        } catch (_) {}
    }
    return null;
}

// ─── Sections validation ──────────────────────────────────────────────────────

async function checkPageLayoutColumnValidity(plsRecord, boardId) {
    console.log("[PageLayoutService] Validating sections for record:", plsRecord?.id);
    try {
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

        const sectionsCV = plsRecord.column_values.find(
            (cv) => cv.column && cv.column.title === PAGELAYOUT_COL_TITLE_SECTIONS
        );

        if (!sectionsCV) {
            return {
                success: false,
                error: `Column "${PAGELAYOUT_COL_TITLE_SECTIONS}" not found in PLS record "${plsRecord.name}"`,
                validatedSections: [],
            };
        }

        const rawSections = parseSectionsColumnValue(sectionsCV);
        if (!rawSections) {
            return {
                success: false,
                error: `Could not parse JSON from "${PAGELAYOUT_COL_TITLE_SECTIONS}" column in record "${plsRecord.name}"`,
                validatedSections: [],
            };
        }

        // Build cross-section duplicate map
        const columnIdUsageMap = {};
        rawSections.forEach((section) => {
            (section.fields || []).forEach((field) => {
                if (field.columnId) {
                    columnIdUsageMap[field.columnId] = (columnIdUsageMap[field.columnId] || 0) + 1;
                }
            });
        });

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

            const enrichedFields = rawFields.map((field) => {
                const columnId = field.columnId;
                const label = boardColumnMetadataMap.get(columnId) || columnId;
                const isValidColumnId = validColumnIds.has(columnId);
                const isDuplicate = columnIdUsageMap[columnId] > 1;
                return {
                    ...field,
                    label,
                    isValid: isValidColumnId,
                    duplicate: isDuplicate,
                    validationError: !isValidColumnId
                        ? `Column '${columnId}' does not exist in board`
                        : null,
                };
            });

            const hasInvalidFields = enrichedFields.some((f) => !f.isValid);
            const hasDuplicateFields = enrichedFields.some((f) => f.duplicate);

            return {
                ...section,
                fields: enrichedFields,
                isValid: true,
                isFullyValid: !hasInvalidFields && !hasDuplicateFields,
                hasInvalidFields,
                hasDuplicateFields,
            };
        });

        return {
            success: true,
            error: null,
            validatedSections,
            validationSummary: {
                totalSections: validatedSections.length,
                fullyValidSections: validatedSections.filter((s) => s.isFullyValid).length,
            },
        };
    } catch (error) {
        return {
            success: false,
            error: error.message || "Validation failed",
            validatedSections: [],
        };
    }
}

// ─── Child Boards validation ──────────────────────────────────────────────────

/**
 * Validate child board configuration stored in the "Child Boards" column.
 *
 * STORED JSON SHAPE (array):
 *   [
 *     {
 *       "boardId":  "5026698327",          // child board id
 *       "label":    "Contacts",             // display label for the related list
 *       "columnId": "board_relation_mm0pb871", // column on the child board that links back to parent
 *       "columns":  ["name", "status", ...]    // columns to display in the related list table
 *     },
 *     ...
 *   ]
 *
 * VALIDATION STEPS:
 *   1. Parse the "Child Boards" column JSON from the PLS record.
 *   2. Call getChildBoards(parentBoardId) to get the actual relationship map.
 *      Returns children[]: { boardId, boardName, columnId, columnLabel }
 *   3. For each configured child board: check that the (boardId + columnId) combination
 *      exists in the real relationship map. Skip if not found.
 *   4. For each validated child board: fetch its actual columns via getBoardColumns()
 *      and cross-check the configured display columns. Skip columns that don't exist.
 *
 * RETURNS:
 *   validatedChildBoards[]:
 *   {
 *     boardId:       string,   // child board id
 *     boardName:     string,   // resolved from getChildBoards
 *     label:         string,   // from config (or boardName as fallback)
 *     columnId:      string,   // relation column on child board linking to parent
 *     columns:       ValidatedColumn[],  // only columns that actually exist
 *     skippedColumns: string[], // column ids that were configured but don't exist
 *   }
 *
 *   ValidatedColumn: { id: string, title: string, type: string }
 */
async function validateChildBoards(plsRecord, parentBoardId) {
    console.log("[PageLayoutService] Validating child boards for parent:", parentBoardId);

    // ── Step 1: Find and parse the "Child Boards" column ─────────────────────
    const childBoardsCV = plsRecord.column_values.find(
        (cv) => cv.column && cv.column.title === PAGELAYOUT_COL_TITLE_CHILD_BOARDS
    );

    const rawText = parseRawColumnText(childBoardsCV);
    if (!rawText || !rawText.trim()) {
        // No child boards configured — not an error, just nothing to show
        console.log("[PageLayoutService] No child boards configured for this board.");
        return { success: true, validatedChildBoards: [] };
    }

    let configuredChildBoards;
    try {
        configuredChildBoards = JSON.parse(rawText);
        if (!Array.isArray(configuredChildBoards)) {
            console.warn("[PageLayoutService] Child Boards JSON is not an array — skipping.");
            return { success: true, validatedChildBoards: [] };
        }
    } catch (e) {
        console.warn("[PageLayoutService] Could not parse Child Boards JSON:", e.message);
        return { success: true, validatedChildBoards: [] };
    }

    if (configuredChildBoards.length === 0) {
        return { success: true, validatedChildBoards: [] };
    }

    // ── Step 2: Get actual child board relationships ──────────────────────────
    let actualChildren = [];
    try {
        const childResult = await getChildBoards(parentBoardId);
        if (childResult.success) {
            actualChildren = childResult.children || [];
        } else {
            console.warn("[PageLayoutService] getChildBoards failed:", childResult.error);
            // Non-fatal: proceed with empty list (all boards will fail validation)
        }
    } catch (e) {
        console.warn("[PageLayoutService] getChildBoards threw:", e.message);
    }

    // Build a lookup set: "boardId::columnId" → child entry
    // This is the authoritative "does this relationship actually exist?" check.
    const actualRelationshipMap = new Map();
    actualChildren.forEach((child) => {
        const key = `${child.boardId}::${child.columnId}`;
        actualRelationshipMap.set(key, child);
    });

    // ── Step 3 + 4: Validate each configured child board ─────────────────────
    // We may need to call getBoardColumns for multiple child boards.
    // Deduplicate by boardId so we don't fetch the same board twice.
    const boardColumnCache = new Map(); // boardId → { id, title, type }[]

    const fetchChildBoardColumns = async (boardId) => {
        if (boardColumnCache.has(boardId)) return boardColumnCache.get(boardId);
        const result = await getBoardColumns(boardId);
        const cols = result.success ? result.columns : [];
        boardColumnCache.set(boardId, cols);
        return cols;
    };

    const validatedChildBoards = [];

    for (const config of configuredChildBoards) {
        const { boardId, label, columnId, columns: configuredColumns = [] } = config;

        if (!boardId || !columnId) {
            console.warn("[PageLayoutService] Child board config missing boardId or columnId — skipping:", config);
            continue;
        }

        // Step 3: Validate (boardId + columnId) combo against actual relationships
        const relationshipKey = `${boardId}::${columnId}`;
        const actualChild = actualRelationshipMap.get(relationshipKey);

        if (!actualChild) {
            console.warn(
                `[PageLayoutService] Child board ${boardId} with columnId ${columnId} ` +
                `not found in actual board relationships — skipping.`
            );
            continue;
        }

        // Step 4: Fetch the child board's actual columns and validate configured columns
        const actualColumns = await fetchChildBoardColumns(boardId);
        const actualColumnMap = new Map(actualColumns.map((c) => [c.id, c]));

        // "name" is always the item name column — treat it as always valid
        // (monday returns it in column_values but its id is literally "name")
        const validColumns = [];
        const skippedColumns = [];

        for (const colId of configuredColumns) {
            if (colId === "name") {
                // "name" is the item name — always include it
                validColumns.push({ id: "name", title: "Name", type: "name" });
            } else if (actualColumnMap.has(colId)) {
                const col = actualColumnMap.get(colId);
                validColumns.push({ id: col.id, title: col.title, type: col.type });
            } else {
                console.warn(
                    `[PageLayoutService] Column "${colId}" does not exist on child board ${boardId} — skipping column.`
                );
                skippedColumns.push(colId);
            }
        }

        if (validColumns.length === 0) {
            console.warn(
                `[PageLayoutService] Child board ${boardId} has no valid display columns after validation — skipping.`
            );
            continue;
        }

        validatedChildBoards.push({
            boardId,
            boardName: actualChild.boardName,
            label: label || actualChild.boardName,
            columnId,                // relation column on child board that links to the parent
            columns: validColumns,   // only the columns that actually exist
            skippedColumns,          // informational — columns that were skipped
        });
    }

    console.log(
        `[PageLayoutService] Child board validation complete: ` +
        `${validatedChildBoards.length}/${configuredChildBoards.length} valid.`
    );

    return { success: true, validatedChildBoards };
}

// ─── Main retrieval function ──────────────────────────────────────────────────

/**
 * Retrieve and validate the page layout for a given board.
 *
 * Queries the PageLayoutSections board for the ONE record that matches boardId,
 * then parses + validates:
 *   (a) its Sections column JSON  → validatedSections
 *   (b) its Child Boards column JSON → validatedChildBoards
 *
 * @param {string} boardId
 * @returns {Promise<{
 *   success, error, items,
 *   validatedSections, validationSummary,
 *   validatedChildBoards
 * }>}
 */
export async function retrievePageLayoutInfoForBoard(boardId) {
    if (!boardId || !PAGELAYOUTSECTIONS_BOARD_ID) {
        return {
            success: false,
            error: "Missing Board IDs",
            items: [],
            validatedSections: [],
            validationSummary: null,
            validatedChildBoards: [],
        };
    }

    try {
        // Step 1: Resolve filter column ID
        const colMap = await getBoardColumnIdsByTitles(PAGELAYOUTSECTIONS_BOARD_ID, [
            PAGELAYOUT_COL_TITLE_BOARDID,
        ]);
        const boardIdColId = colMap[PAGELAYOUT_COL_TITLE_BOARDID];

        if (!boardIdColId) {
            throw new Error(
                `Filter column "${PAGELAYOUT_COL_TITLE_BOARDID}" not found in PageLayout board`
            );
        }

        // Step 2: Fetch the PLS record for this board
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
                validatedChildBoards: [],
                error: null,
            };
        }

        if (items.length > 1) {
            console.warn(
                `[PageLayoutService] Expected 1 PLS record for board ${boardId}, ` +
                `found ${items.length}. Using first.`
            );
        }
        const plsRecord = items[0];

        // Step 3: Validate sections (existing logic)
        const [sectionsResult, childBoardsResult] = await Promise.all([
            checkPageLayoutColumnValidity(plsRecord, boardId),
            validateChildBoards(plsRecord, boardId),
        ]);

        if (!sectionsResult.success) {
            console.warn("[PageLayoutService] Section validation failed:", sectionsResult.error);
            return {
                success: true,
                items,
                validatedSections: [],
                validationSummary: null,
                validatedChildBoards: childBoardsResult.validatedChildBoards || [],
                validationError: sectionsResult.error,
                error: null,
            };
        }

        return {
            success: true,
            items,
            validatedSections: sectionsResult.validatedSections,
            validationSummary: sectionsResult.validationSummary,
            validatedChildBoards: childBoardsResult.validatedChildBoards || [],
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
            validatedChildBoards: [],
        };
    }
}

// ─── React hook ───────────────────────────────────────────────────────────────

/**
 * React hook — wraps retrievePageLayoutInfoForBoard with loading state.
 *
 * NOW ALSO RETURNS: validatedChildBoards
 *
 * Usage in App.jsx:
 *   const {
 *     items, validatedSections, validationSummary,
 *     validatedChildBoards,           ← NEW
 *     loading, error
 *   } = usePageLayoutInfo(boardId);
 */
export function usePageLayoutInfo(boardId) {
    const [data, setData] = useState({
        items: [],
        validatedSections: [],
        validationSummary: null,
        validatedChildBoards: [],   // ← NEW
        loading: true,
        error: null,
    });

    useEffect(() => {
        if (!boardId) {
            setData({
                items: [],
                validatedSections: [],
                validationSummary: null,
                validatedChildBoards: [],
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
                    validatedChildBoards: result.validatedChildBoards || [],
                    loading: false,
                    error: result.success ? null : result.error,
                });
            })
            .catch((err) => {
                setData({
                    items: [],
                    validatedSections: [],
                    validationSummary: null,
                    validatedChildBoards: [],
                    loading: false,
                    error: err.message || `Unknown error for board ${boardId}`,
                });
            });
    }, [boardId]);

    return data;
}
// EOF marker