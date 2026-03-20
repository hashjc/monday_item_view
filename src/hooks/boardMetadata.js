//boardMetadata
// Query records of a Monday board
import mondaySdk from "monday-sdk-js";
const monday = mondaySdk();

/**
 * Retrieve Board Columns
 * @param {string} boardId - The board ID to fetch columns from
 * @returns {Promise<Object>} { success, error, columns }
 */
export async function getBoardColumns(boardId) {
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


/**
 * Finds all child boards that link to a specific Parent Board.
 * Handles: Multiple link columns, and columns linking to multiple boards.
 * * @param {string} parentBoardId - The ID of the board you want to find children for.
 * @returns {Promise<Object>} { success, children, error }
 */
export async function getChildBoards(parentBoardId) {
    if (!parentBoardId) {
        return { success: false, error: "Parent Board ID is required", children: [] };
    }

    try {
        // 1. Fetch all boards including their column metadata
        // Note: You may need to update getAllBoards in boards.js to include 'columns'
        const response = await getAllBoardsWithColumns();

        if (!response.success) {
            throw new Error(response.error);
        }

        const childBoards = [];
        const targetIdStr = parentBoardId.toString();

        // 2. Iterate through all boards to find relationships
        response.boards.forEach(board => {
            // Usually, a board doesn't count as its own child in this context
            if (board.id === targetIdStr) return;

            board.columns.forEach(col => {
                // We only care about Connect Boards columns
                if (col.type === "board_relation") {
                    try {
                        const settings = JSON.parse(col.settings_str || "{}");

                        // Extract linked IDs from both old and new Monday settings formats
                        const linkedBoardIds = [];
                        if (settings.boardId) linkedBoardIds.push(settings.boardId.toString());
                        if (Array.isArray(settings.boardIds)) {
                            settings.boardIds.forEach(id => linkedBoardIds.push(id.toString()));
                        }

                        // Check if this column points to our parent board
                        if (linkedBoardIds.includes(targetIdStr)) {
                            childBoards.push({
                                boardId: board.id,
                                boardName: board.name,
                                columnId: col.id,
                                columnLabel: col.title
                            });
                        }
                    } catch (parseError) {
                        console.warn(`Could not parse settings for board ${board.id}, column ${col.id}`);
                    }
                }
            });
        });

        return {
            success: true,
            children: childBoards,
            error: null
        };

    } catch (error) {
        console.error("[getChildBoards] Error:", error);
        return {
            success: false,
            error: error.message,
            children: []
        };
    }
}

async function getAllBoardsWithColumns() {
    try {
        const query = `
            query {
                boards (limit: 1000) {
                    id
                    name
                    columns {
                        id
                        title
                        type
                        settings_str
                    }
                }
            }
        `;
        const response = await monday.api(query);
        if (response.errors) throw new Error(response.errors[0].message);

        return {
            success: true,
            boards: response.data?.boards || []
        };
    } catch (err) {
        return { success: false, error: err.message, boards: [] };
    }
}
