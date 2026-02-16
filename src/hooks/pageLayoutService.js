import mondaySdk from "monday-sdk-js";
import { useState, useEffect } from "react";
import { METADATA_BOARD_ID as METADATA_BOARD_ID_FROM_FILE } from "../metadataConfig";
import { getBoardColumns } from "./boardMetadata";

const monday = mondaySdk();
const PAGELAYOUTSECTIONS_BOARD_ID = METADATA_BOARD_ID_FROM_FILE;
const PAGELAYOUT_COL_TITLE_BOARDID = "Board Id";
const PAGELAYOUT_COL_TITLE_SECTIONORDER = "Section Order";
const PAGELAYOUT_COL_TITLE_SECTIONS = "Sections";
const LIMIT = 500;

/**
 * Helper to fetch the actual column IDs for a board based on their titles.
 * This ensures the app doesn't break if internal IDs change but titles remain consistent.
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
 * Validate page layout sections against board's column metadata
 *
 * @param {Array} pageLayoutSectionRecords - Raw records from PageLayout board
 * @param {string} boardId - Target board ID
 * @returns {Promise<Object>} { success, error, validatedSections }
 */
async function checkPageLayoutColumnValidity(pageLayoutSectionRecords, boardId) {
    console.log(`PageLayoutService Validating ${pageLayoutSectionRecords.length} section records for board ${boardId}`);

    try {
        // Step 1: Get board's actual column metadata
        const boardColumnsResult = await getBoardColumns(boardId);

        if (!boardColumnsResult?.success || !boardColumnsResult?.columns || !Array.isArray(boardColumnsResult.columns)) {
            console.error("[checkPageLayoutColumnValidity] Failed to fetch board columns");
            return {
                success: false,
                error: "Could not fetch board column metadata",
                validatedSections: [],
            };
        }

        const boardColumns = boardColumnsResult.columns;
        console.log("PageLayoutService : Board columns ", boardColumns);

        // --- NEW LOGIC: Create a Map for quick title/label lookup by column ID ---
        const boardColumnMetadataMap = new Map(
            boardColumns.map((col) => [col.id, col.title])
        );

        const validColumnIds = new Set(boardColumns.map((col) => col.id));
        const columnIdUsageMap = {};
        const validatedSections = [];

        // Step 3: Parse and validate each section record
        for (const record of pageLayoutSectionRecords) {
            try {
                const sectionsColumn = record.column_values.find((cv) => cv.column && cv.column.title === PAGELAYOUT_COL_TITLE_SECTIONS);

                if (!sectionsColumn || !sectionsColumn.text) continue;

                let sectionData;
                try {
                    sectionData = JSON.parse(sectionsColumn.text);
                } catch (parseError) {
                    validatedSections.push({
                        recordId: record.id,
                        recordName: record.name,
                        error: "Invalid JSON format",
                        isValid: false,
                        originalData: record,
                    });
                    continue;
                }

                if (!sectionData.id || !sectionData.title || !Array.isArray(sectionData.fields)) {
                    validatedSections.push({
                        recordId: record.id,
                        recordName: record.name,
                        error: "Invalid section structure",
                        isValid: false,
                        originalData: record,
                    });
                    continue;
                }

                // Track column usage
                sectionData.fields.forEach((field) => {
                    if (field.columnId) {
                        columnIdUsageMap[field.columnId] = (columnIdUsageMap[field.columnId] || 0) + 1;
                    }
                });

                validatedSections.push({
                    recordId: record.id,
                    recordName: record.name,
                    sectionData: sectionData,
                    originalData: record,
                    isValid: true,
                });
            } catch (error) {
                validatedSections.push({
                    recordId: record.id,
                    recordName: record.name,
                    error: error.message,
                    isValid: false,
                    originalData: record,
                });
            }
        }

        // Step 4: Validate each field's columnId, mark duplicates, and APPLY DEFAULT LABELS
        console.log("Applying default column/field title labels");
        for (const section of validatedSections) {
            if (!section.sectionData || !section.sectionData.fields) continue;

            section.sectionData.fields = section.sectionData.fields.map((field) => {
                const columnId = field.columnId;
                let currentLabel = field.label;

                // --- NEW LOGIC: Apply default column label if label is blank ---
                if (!currentLabel || currentLabel.trim() === "") {
                    // Lookup the original title from board metadata using the columnId
                    const defaultTitle = boardColumnMetadataMap.get(columnId);
                    if (defaultTitle) {
                        currentLabel = defaultTitle;
                        console.log(`Defaulting blank label for field ID ${columnId} to "${defaultTitle}"`);
                    }
                }

                const isValidColumnId = validColumnIds.has(columnId);
                const isDuplicate = columnIdUsageMap[columnId] > 1;

                return {
                    ...field,
                    label: currentLabel, // Use the potentially updated label
                    isValid: isValidColumnId,
                    duplicate: isDuplicate,
                    validationError: !isValidColumnId ? `Column '${columnId}' does not exist in board` : null,
                };
            });

            const hasInvalidFields = section.sectionData.fields.some((f) => !f.isValid);
            const hasDuplicateFields = section.sectionData.fields.some((f) => f.duplicate);

            section.hasInvalidFields = hasInvalidFields;
            section.hasDuplicateFields = hasDuplicateFields;
            section.isFullyValid = !hasInvalidFields && !hasDuplicateFields;
        }

        return {
            success: true,
            error: null,
            validatedSections: validatedSections,
            validationSummary: {
                totalSections: validatedSections.length,
                fullyValidSections: validatedSections.filter((s) => s.isFullyValid).length,
            },
        };
    } catch (error) {
        console.error("[checkPageLayoutColumnValidity] Validation error:", error);
        return {
            success: false,
            error: error.message || "Validation failed",
            validatedSections: [],
        };
    }
}

/*
async function checkPageLayoutColumnValidity(pageLayoutSectionRecords, boardId) {
    console.log(`PageLayoutService Validating ${pageLayoutSectionRecords.length} section records for board ${boardId}`);
    console.log(`PageLayoutService Validating ${pageLayoutSectionRecords}`);

    try {
        // Step 1: Get board's actual column metadata
        const boardColumnsResult = await getBoardColumns(boardId);

        if (!boardColumnsResult?.success || !boardColumnsResult?.columns || !Array.isArray(boardColumnsResult.columns)) {
            console.error("[checkPageLayoutColumnValidity] Failed to fetch board columns");
            return {
                success: false,
                error: "Could not fetch board column metadata",
                validatedSections: [],
            };
        }

        const boardColumns = boardColumnsResult.columns;
        console.log("PageLayoutService : Board columns ", boardColumns);
        console.log(`PageLayoutService [checkPageLayoutColumnValidity] Found ${boardColumns.length} columns in board metadata`);

        // Create a map of valid column IDs for quick lookup
        const validColumnIds = new Set(boardColumns.map((col) => col.id));

        // Also include 'name' as it's always valid (built-in column)
        //validColumnIds.add("name");

        // Step 2: Track all column IDs across all sections to detect duplicates
        const columnIdUsageMap = {}; // { columnId: count }

        // Step 3: Parse and validate each section record
        const validatedSections = [];

        for (const record of pageLayoutSectionRecords) {
            try {
                // Find the "Sections" column in the record
                const sectionsColumn = record.column_values.find((cv) => cv.column && cv.column.title === PAGELAYOUT_COL_TITLE_SECTIONS);

                if (!sectionsColumn || !sectionsColumn.text) {
                    //console.warn(`[checkPageLayoutColumnValidity] Record ${record.id} has no Sections data, skipping`);
                    continue;
                }

                // Parse the JSON from the Sections column
                let sectionData;
                try {
                    sectionData = JSON.parse(sectionsColumn.text);
                } catch (parseError) {
                    //console.error(`[checkPageLayoutColumnValidity] Invalid JSON in record ${record.id}:`, parseError);
                    // Store invalid section with error flag
                    validatedSections.push({
                        recordId: record.id,
                        recordName: record.name,
                        error: "Invalid JSON format",
                        isValid: false,
                        originalData: record,
                    });
                    continue;
                }

                // Validate the section structure
                if (!sectionData.id || !sectionData.title || !Array.isArray(sectionData.fields)) {
                    //console.warn(`[checkPageLayoutColumnValidity] Invalid section structure in record ${record.id}`);
                    validatedSections.push({
                        recordId: record.id,
                        recordName: record.name,
                        error: "Invalid section structure (missing id, title, or fields)",
                        isValid: false,
                        originalData: record,
                    });
                    continue;
                }

                // Track column usage for duplicate detection
                sectionData.fields.forEach((field) => {
                    if (field.columnId) {
                        columnIdUsageMap[field.columnId] = (columnIdUsageMap[field.columnId] || 0) + 1;
                    }
                });

                validatedSections.push({
                    recordId: record.id,
                    recordName: record.name,
                    sectionData: sectionData,
                    originalData: record,
                    isValid: true, // Will be updated in next step
                });
            } catch (error) {
                //console.error(`[checkPageLayoutColumnValidity] Error processing record ${record.id}:`, error);
                validatedSections.push({
                    recordId: record.id,
                    recordName: record.name,
                    error: error.message,
                    isValid: false,
                    originalData: record,
                });
            }
        }

        // Step 4: Validate each field's columnId and mark duplicates
        console.log("Apply default column/field title label ");
        for (const section of validatedSections) {
            if (!section.sectionData || !section.sectionData.fields) continue;

            section.sectionData.fields = section.sectionData.fields.map((field) => {
                const columnId = field.columnId;
                let currentLabel = field.label;
                //Apply default column label if label is blank.

                // Check if column exists in board metadata
                const isValidColumnId = validColumnIds.has(columnId);

                // Check if column is duplicated
                const isDuplicate = columnIdUsageMap[columnId] > 1;

                // Return enhanced field object
                return {
                    ...field,
                    isValid: isValidColumnId,
                    duplicate: isDuplicate,
                    validationError: !isValidColumnId ? `Column '${columnId}' does not exist in board` : null,
                };
            });

            // Update section-level validity
            const hasInvalidFields = section.sectionData.fields.some((f) => !f.isValid);
            const hasDuplicateFields = section.sectionData.fields.some((f) => f.duplicate);

            section.hasInvalidFields = hasInvalidFields;
            section.hasDuplicateFields = hasDuplicateFields;
            section.isFullyValid = !hasInvalidFields && !hasDuplicateFields;
        }

        console.log(`[checkPageLayoutColumnValidity] Validation complete. ${validatedSections.length} sections processed`);

        // Log validation summary
        const invalidFieldsCount = validatedSections.filter((s) => s.hasInvalidFields).length;
        const duplicateFieldsCount = validatedSections.filter((s) => s.hasDuplicateFields).length;

        if (invalidFieldsCount > 0) {
            console.warn(`[checkPageLayoutColumnValidity] Found ${invalidFieldsCount} sections with invalid column IDs`);
        }
        if (duplicateFieldsCount > 0) {
            console.warn(`[checkPageLayoutColumnValidity] Found ${duplicateFieldsCount} sections with duplicate column IDs`);
        }

        return {
            success: true,
            error: null,
            validatedSections: validatedSections,
            validationSummary: {
                totalSections: validatedSections.length,
                sectionsWithInvalidFields: invalidFieldsCount,
                sectionsWithDuplicates: duplicateFieldsCount,
                fullyValidSections: validatedSections.filter((s) => s.isFullyValid).length,
            },
        };
    } catch (error) {
        console.error("[checkPageLayoutColumnValidity] Validation error:", error);
        return {
            success: false,
            error: error.message || "Validation failed",
            validatedSections: [],
        };
    }
}
*/

/**
 * Retrieve page layout information for a specific board using server-side filtering
 * WITH VALIDATION
 *
 * @param {string} boardId - The target board ID to find layout for
 * @returns {Promise<Object>} { success, error, items, validatedSections, validationSummary }
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
        console.log(`[retrievePageLayoutInfoForBoard] Fetching layout for board ${boardId}`);

        // Step 1: Get dynamic Column ID for the filter
        const colMap = await getBoardColumnIdsByTitles(PAGELAYOUTSECTIONS_BOARD_ID, [PAGELAYOUT_COL_TITLE_BOARDID]);
        const boardIdColId = colMap[PAGELAYOUT_COL_TITLE_BOARDID];

        if (!boardIdColId) {
            throw new Error("Filter column 'Board Id' not found in PageLayout board");
        }

        // Step 2: Build Query using Template Literals
        const query = `
            query {
                boards(ids: [${PAGELAYOUTSECTIONS_BOARD_ID}]) {
                    items_page (
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
            throw new Error(response.errors[0].message);
        }

        const pageLayoutSectionRecords = response?.data?.boards?.[0]?.items_page?.items || [];

        console.log(`[retrievePageLayoutInfoForBoard] Found ${pageLayoutSectionRecords.length} raw records`);

        // Step 3: Apply validations
        const validationResult = await checkPageLayoutColumnValidity(pageLayoutSectionRecords, boardId);
        console.log("pageLayoutService -> Validation Result ", validationResult);
        if (!validationResult.success) {
            console.warn("[retrievePageLayoutInfoForBoard] Validation failed, returning raw data");
            return {
                success: true,
                items: pageLayoutSectionRecords,
                validatedSections: [],
                validationSummary: null,
                validationError: validationResult.error,
            };
        }

        // Step 4: Return both raw items and validated sections
        return {
            success: true,
            items: pageLayoutSectionRecords, // Raw records
            validatedSections: validationResult.validatedSections, // Validated & enhanced
            validationSummary: validationResult.validationSummary,
            error: null,
        };
    } catch (error) {
        console.error("[retrievePageLayoutInfoForBoard] Error:", error);
        return {
            success: false,
            error: error.message,
            items: [],
            validatedSections: [],
            validationSummary: null,
        };
    }
}

// Utility to ensure integers
function int(val) {
    const parsed = parseInt(val, 10);
    return isNaN(parsed) ? 0 : parsed;
}

/**
 * React Hook wrapper for retrievePageLayoutInfoForBoard
 * Provides loading state and automatic refresh on boardId change
 * NOW INCLUDES VALIDATION DATA
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
                    items: result.items,
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
                    error: err.message || `Unknown error while retrieving page layouts for board ${boardId}`,
                });
            });
    }, [boardId]);

    return data;
}