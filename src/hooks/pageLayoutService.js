import mondaySdk from "monday-sdk-js";
import { useState, useEffect } from "react";
import { METADATA_BOARD_ID as METADATA_BOARD_ID_FROM_FILE } from "../metadataConfig";

const monday = mondaySdk();
const PAGELAYOUTSECTIONS_BOARD_ID = METADATA_BOARD_ID_FROM_FILE;

/**
 * Retrieve page layout information for a specific board
 *
 * HOW IT WORKS:
 * 1. Queries the PageLayout metadata board using Monday SDK
 * 2. The SDK uses the CURRENT USER'S permissions and context
 * 3. If user lacks permission to the PageLayout board → returns error
 * 4. Filters results to only items where "Board ID" column matches input boardId
 *
 * MONDAY SDK BEHAVIOR:
 * - Queries run in the LOGGED-IN USER's context
 * - User MUST have "viewer" access or higher to the PageLayout board
 * - If no access → GraphQL returns permission error
 * - SDK automatically handles authentication via session token
 *
 * @param {string} boardId - The target board ID to find layout for
 * @returns {Promise<Object>} { success, error, items }
 */
export async function retrievePageLayoutInfoForBoard(boardId) {
    console.log(`PageLayoutService.js Fetching layout for board ${boardId} from metadata board ${PAGELAYOUTSECTIONS_BOARD_ID}`);

    // Validate inputs
    if (!boardId) {
        return {
            success: false,
            error: "Board ID is required",
            items: [],
        };
    }

    if (!PAGELAYOUTSECTIONS_BOARD_ID) {
        return {
            success: false,
            error: "PageLayout metadata board ID is not configured. Check metadataConfig.js",
            items: [],
        };
    }

    try {
        console.log(`PageLayoutService.js Fetching layout for board ${boardId} from metadata board ${PAGELAYOUTSECTIONS_BOARD_ID}`);

        // STEP 1: Query the PageLayout board to get all items
        // This runs with CURRENT USER's permissions
        const query = `
            query ($boardId: [ID!]) {
                boards(ids: $boardId) {
                    items_page (limit: 500) {
                        items {
                            id
                            name
                            column_values {
                                id
                                ... on TextValue {
                                    text
                                }
                                ... on BoardRelationValue {
                                    display_value
                                }
                                # Add other fragments as needed
                            }
                        }
                    }
                }
            }
        `;

        // Execute with variables for better validation
        const response = await monday.api(query, { variables: { boardId: [PAGELAYOUTSECTIONS_BOARD_ID] } });

        // STEP 2: Check if query was successful
        if (!response || !response.data) {
            return {
                success: false,
                error: "No response from Monday API. Check network connection.",
                items: [],
            };
        }

        // STEP 3: Check for permission errors or missing board
        if (!response.data.boards || response.data.boards.length === 0) {
            return {
                success: false,
                error: `Cannot access PageLayout board (ID: ${PAGELAYOUTSECTIONS_BOARD_ID}). User may lack permissions or board doesn't exist.`,
                items: [],
            };
        }

        // STEP 4: Extract items from response
        const board = response.data.boards[0];
        const allItems = board.items_page?.items || [];
        console.log("PageLayoutService board records ", allItems);
        console.log(`PageLayoutService  Found ${allItems.length} total items in PageLayout board`);

        // STEP 5: Filter items where "Board ID" column matches our target boardId
        const matchingItems = allItems.filter((item) => {
            const boardIdColumn = item.column_values.find((col) => col.title && col.title.toLowerCase() === "board id");

            if (!boardIdColumn) {
                return false;
            }

            // Get the value from the column (try both .text and .value)
            const columnValue = String(boardIdColumn.text || boardIdColumn.value || "").trim();
            const targetValue = String(boardId).trim();

            return columnValue === targetValue;
        });

        console.log(`PageLayoutService.js Found ${matchingItems.length} items matching board ID ${boardId}`);

        // STEP 6: Return successful result
        return {
            success: true,
            error: "",
            items: matchingItems,
        };
    } catch (error) {
        // STEP 7: Handle errors (network, permissions, GraphQL errors)
        console.error("PageLayoutService.js Error:", error);

        // Check if it's a permission error
        const errorMessage = error.message || String(error);
        const isPermissionError =
            errorMessage.toLowerCase().includes("permission") ||
            errorMessage.toLowerCase().includes("unauthorized") ||
            errorMessage.toLowerCase().includes("forbidden");

        if (isPermissionError) {
            return {
                success: false,
                error: `Permission denied: User does not have access to PageLayout board (ID: ${PAGELAYOUTSECTIONS_BOARD_ID}). Contact admin to grant access.`,
                items: [],
            };
        }

        // Generic error
        return {
            success: false,
            error: `Failed to fetch page layout: ${errorMessage}`,
            items: [],
        };
    }
}

/**
 * React Hook wrapper for retrievePageLayoutInfoForBoard
 * Provides loading state and automatic refresh on boardId change
 */
export function usePageLayoutInfo(boardId) {
    const [data, setData] = useState({
        items: [],
        loading: true,
        error: null
    });

    useEffect(() => {
        if (!boardId) {
            setData({ items: [], loading: false, error: null });
            return;
        }

        setData(prev => ({ ...prev, loading: true, error: null }));

        retrievePageLayoutInfoForBoard(boardId)
            .then(result => {
                setData({
                    items: result.items,
                    loading: false,
                    error: result.success ? null : result.error
                });
            })
            .catch(err => {
                setData({
                    items: [],
                    loading: false,
                    error: err.message || "Unknown error"
                });
            });
    }, [boardId]);

    return data;
}
