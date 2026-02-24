import mondaySdk from "monday-sdk-js";
import { useState, useEffect } from "react";
import { METADATA_BOARD_ID as METADATA_BOARD_ID_FROM_FILE } from "../metadataConfig";
import { getBoardColumns } from "./boardMetadata";

const monday = mondaySdk();
const PAGELAYOUTSECTIONS_BOARD_ID = METADATA_BOARD_ID_FROM_FILE;
const PAGELAYOUT_COL_TITLE_BOARDID = "Board Id";
const PAGELAYOUT_COL_TITLE_SECTIONORDER = "Section Order";
const PAGELAYOUT_COL_TITLE_SECTIONS = "Sections";
const PAGELAYOUT_COL_TITLE_FIELDS_JSON = "Fields";
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
    try {
        // Step 1: Get board's actual column metadata
        const boardColumnsResult = await getBoardColumns(boardId);

        if (!boardColumnsResult?.success || !boardColumnsResult?.columns || !Array.isArray(boardColumnsResult.columns)) {
            return {
                success: false,
                error: "Could not fetch target board column metadata. Target Board Id: ", boardId,
                validatedSections: [],
            };
        }

        const boardColumns = boardColumnsResult.columns;
        console.log("PageLayoutService : Board columns ", boardColumns);

        const boardColumnMetadataMap = new Map(boardColumns.map((col) => [col.id, col.title]));
        const validColumnIds = new Set(boardColumns.map((col) => col.id));
        const columnIdUsageMap = {};
        const validatedSections = [];

        // Step 3: Parse and validate each section record
        for (const record of pageLayoutSectionRecords) {
            try {
                console.log("Record id ", record.id);
                const sectionsColumn = record.column_values.find((cv) => cv.column && cv.column.title === PAGELAYOUT_COL_TITLE_FIELDS_JSON);
                const fieldsInfoJsonObj = JSON.parse(JSON.stringify(sectionsColumn.text));
                console.log("Record id json obj00 ", fieldsInfoJsonObj);
                console.log("Record id json obj typeof ", typeof fieldsInfoJsonObj);
                console.log("Record id json obj fields ", fieldsInfoJsonObj?.fields);
                if (!sectionsColumn) {
                    validatedSections.push({
                        recordId: record.id,
                        recordName: record.name,
                        error: "Fields JSON column not found in record",
                        isValid: false,
                    });
                    continue;
                }

                //console.log("fields json cv object", sectionsColumn);
                const fieldsInfoJsonStr = JSON.parse(fieldsInfoJsonObj);
                const fieldsInfoJsonParsed = fieldsInfoJsonStr?.fields ?? [];
                //console.log("fields json str (cv.text) ", fieldsInfoJsonStr);
                console.log("fields json val (cv.value)1 ", fieldsInfoJsonStr);
                console.log("fields json val (cv.value)1  type ", typeof fieldsInfoJsonStr);
                console.log("fields json val (cv.value)", fieldsInfoJsonParsed);



                // Track column usage across all sections (for duplicate detection)
                fieldsInfoJsonParsed.forEach((field) => {
                    if (field.columnId) {
                        columnIdUsageMap[field.columnId] = (columnIdUsageMap[field.columnId] || 0) + 1;
                    }
                });

                validatedSections.push({
                    recordId: record.id,
                    recordName: record.name,
                    fields: fieldsInfoJsonParsed, // validated + enriched in Step 4
                    sectionData: fieldsInfoJsonParsed, // raw array (kept for compatibility)
                    isValid: true,
                });
            } catch (error) {
                validatedSections.push({
                    recordId: record.id,
                    recordName: record.name,
                    error: error.message,
                    isValid: false,
                });
            }
        }

        // Step 4: Validate each field's columnId, mark duplicates, apply default labels
        for (const section of validatedSections) {
            if (!section.fields) continue;

            section.fields = section.fields.map((field) => {
                const columnId = field.columnId;

                // Apply board column title as label if label is blank (new JSON schema removed labels)
                let currentLabel = field.label;
                if (!currentLabel || currentLabel.trim() === "") {
                    currentLabel = boardColumnMetadataMap.get(columnId) || columnId;
                }

                const isValidColumnId = validColumnIds.has(columnId);
                const isDuplicate = columnIdUsageMap[columnId] > 1;

                return {
                    ...field,
                    label: currentLabel,
                    isValid: isValidColumnId,
                    duplicate: isDuplicate,
                    validationError: !isValidColumnId ? `Column '${columnId}' does not exist in board` : null,
                };
            });

            // BUG FIX: was section.sectionData.fields — sectionData IS the array, has no .fields property
            // Correct reference is section.fields (the mapped array above)
            const hasInvalidFields = section.fields.some((f) => !f.isValid);
            const hasDuplicateFields = section.fields.some((f) => f.duplicate);

            section.hasInvalidFields = hasInvalidFields;
            section.hasDuplicateFields = hasDuplicateFields;
            section.isFullyValid = !hasInvalidFields && !hasDuplicateFields;
        }

        console.log("Page Layout Section records validated sections", {
            validatedSections,
            validationSummary: {
                totalSections: validatedSections.length,
                fullyValidSections: validatedSections.filter((s) => s.isFullyValid).length,
            },
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
        console.log("Page Layout Section records", pageLayoutSectionRecords);
        // Step 3: Apply validations
        const validationResult = await checkPageLayoutColumnValidity(pageLayoutSectionRecords, boardId);
        if (!validationResult.success) {
            return {
                success: true,
                items: pageLayoutSectionRecords,
                validatedSections: [],
                validationSummary: null,
                validationError: validationResult.error,
            };
        }
        console.log("Page Layout Section records validated sections ", validationResult);
        // Step 4: Return both raw items and validated sections
        return {
            success: true,
            items: pageLayoutSectionRecords, // Raw records
            validatedSections: validationResult.validatedSections, // Validated & enhanced
            validationSummary: validationResult.validationSummary,
            error: null,
        };
    } catch (error) {
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