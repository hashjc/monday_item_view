// Query records of a Monday board
import mondaySdk from "monday-sdk-js";

const monday = mondaySdk();

/**
 * Retrieve Board Columns
 * @param {string} boardId - The board ID to fetch columns from
 * @returns {Promise<Object>} { success, error, columns }
 */
export async function getBoardColumns(boardId) {
    console.log(`boardMetadata.js Fetching columns for board: ${boardId}`);

    // Validate input
    if (!boardId) {
        return {
            success: false,
            error: "Board ID is required",
            columns: [],
        };
    }

    try {
        // Build the GraphQL query string
        const query = `
            query ($boardIds: [ID!]) {
                boards(ids: $boardIds) {
                    id,
                    name,
                    columns {
                        id
                        title
                        type
                        settings_str
                    }
                }
            }
        `;

        const variables = { boardIds: [boardId] };

        // Execute the API call
        const response = await monday.api(query, { variables });

        // Check for GraphQL errors
        if (response.errors) {
            throw new Error(response.errors[0].message);
        }

        const board = response?.data?.boards?.[0];

        if (!board) {
            throw new Error("Board not found or access denied.");
        }

        return {
            success: true,
            error: null,
            boardName: board.name,
            columns: board.columns || [],
        };
    } catch (error) {
        console.error("boardMetadata.js Error:", error);
        return {
            success: false,
            error: error.message || "Failed to fetch board columns",
            columns: [],
        };
    }
}
