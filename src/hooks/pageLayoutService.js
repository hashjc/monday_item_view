import mondaySdk from "monday-sdk-js";
import { useState, useEffect } from "react";
import { METADATA_BOARD_ID as METADATA_BOARD_ID_FROM_FILE } from "../metadataConfig";

const monday = mondaySdk();
const PAGELAYOUTSECTIONS_BOARD_ID = METADATA_BOARD_ID_FROM_FILE;
const PAGELAYOUT_COL_TITLE_BOARDID = "Board Id";
const PAGELAYOUT_COL_TITLE_SECTIONORDER = "Section Order";
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
 * Retrieve page layout information for a specific board using server-side filtering
 * * @param {string} boardId - The target board ID to find layout for
 * @returns {Promise<Object>} { success, error, items }
 */
export async function retrievePageLayoutInfoForBoard(boardId) {
    if (!boardId || !PAGELAYOUTSECTIONS_BOARD_ID) {
        return { success: false, error: "Missing Board IDs", items: [] };
    }

    try {
        // 1. Get dynamic Column ID for the filter
        const colMap = await getBoardColumnIdsByTitles(PAGELAYOUTSECTIONS_BOARD_ID, [PAGELAYOUT_COL_TITLE_BOARDID]);
        const boardIdColId = colMap[PAGELAYOUT_COL_TITLE_BOARDID];

        if (!boardIdColId) throw new Error("Filter column not found.");

        // 2. Build Query using Template Literals (Like Python f-strings)
        // Note: Using any_of operator requires the compare_value to be a stringified array
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

        if (response.errors) throw new Error(response.errors[0].message);

        return {
            success: true,
            items: response?.data?.boards?.[0]?.items_page?.items || [],
        };
    } catch (error) {
        return { success: false, error: error.message, items: [] };
    }
}

// Utility to ensure integers (matching your Python logic)
function int(val) {
    const parsed = parseInt(val, 10);
    return isNaN(parsed) ? 0 : parsed;
}

/**
 * React Hook wrapper for retrievePageLayoutInfoForBoard
 * Provides loading state and automatic refresh on boardId change
 */
export function usePageLayoutInfo(boardId) {
    const [data, setData] = useState({
        items: [],
        loading: true,
        error: null,
    });

    useEffect(() => {
        if (!boardId) {
            setData({ items: [], loading: false, error: null });
            return;
        }

        setData((prev) => ({ ...prev, loading: true, error: null }));

        retrievePageLayoutInfoForBoard(boardId)
            .then((result) => {
                setData({
                    items: result.items,
                    loading: false,
                    error: result.success ? null : result.error,
                });
            })
            .catch((err) => {
                setData({
                    items: [],
                    loading: false,
                    error: err.message || `Unknown error while retrieving page layouts for board ${boardId}`,
                });
            });
    }, [boardId]);

    return data;
}
