import mondaySdk from "monday-sdk-js";

const monday = mondaySdk();

/**
 * Fetch all items from a metadata board
 * @param {string} metadataBoardId - The ID of the metadata board
 * @returns {Promise<Array>} Array of items with their column values
 */
export async function fetchMetadataItems(metadataBoardId) {
    if (!metadataBoardId) {
        console.warn("fetchMetadataItems: No metadataBoardId provided");
        return [];
    }

    try {
        console.log("Fetching all metadata items from board:", metadataBoardId);

        // Correct GraphQL query for Monday.com API
        const query = `
            query {
                boards(ids: [${metadataBoardId}]) {
                    items_page(limit: 100) {
                        items {
                            id
                            name
                            column_values {
                                id
                                title
                                text
                                value
                                type
                            }
                        }
                    }
                }
            }
        `;

        const response = await monday.api(query);

        if (response.data && response.data.boards && response.data.boards.length > 0) {
            const items = response.data.boards[0].items_page.items;
            console.log(`Fetched ${items.length} items from metadata board`);
            return items;
        }

        console.warn("No boards found or no items in metadata board");
        return [];
    } catch (error) {
        console.error("Error fetching metadata items:", error);
        throw error;
    }
}

/**
 * Fetch metadata items for a specific board ID
 * Filters items where "Board ID" column matches the target boardId
 * @param {string} metadataBoardId - The ID of the metadata board
 * @param {string} targetBoardId - The board ID to filter by
 * @returns {Promise<Array>} Array of filtered items
 */
export async function fetchMetadataItemsForBoard(metadataBoardId, targetBoardId) {
    if (!metadataBoardId || !targetBoardId) {
        console.warn("fetchMetadataItemsForBoard: Missing required parameters");
        return [];
    }

    try {
        console.log("Fetching metadata items for board:", targetBoardId, "from metadata board:", metadataBoardId);

        // First, get the column ID for "Board ID" column
        const columnsQuery = `
            query {
                boards(ids: [${metadataBoardId}]) {
                    columns {
                        id
                        title
                        type
                    }
                }
            }
        `;

        const columnsResponse = await monday.api(columnsQuery);

        if (!columnsResponse.data || !columnsResponse.data.boards || columnsResponse.data.boards.length === 0) {
            console.warn("Could not fetch columns for metadata board");
            return [];
        }

        const columns = columnsResponse.data.boards[0].columns;
        const boardIdColumn = columns.find(col => col.title.toLowerCase() === "board id");

        if (!boardIdColumn) {
            console.warn("'Board ID' column not found in metadata board");
            // Fall back to fetching all items
            return fetchMetadataItems(metadataBoardId);
        }

        console.log("Found 'Board ID' column:", boardIdColumn.id);

        // Now query items filtered by the Board ID column value
        // Note: items_page with query_params is the correct way to filter in Monday API v2
        const itemsQuery = `
            query {
                boards(ids: [${metadataBoardId}]) {
                    items_page(limit: 100, query_params: {rules: [{column_id: "${boardIdColumn.id}", compare_value: ["${targetBoardId}"]}]}) {
                        items {
                            id
                            name
                            column_values {
                                id
                                title
                                text
                                value
                                type
                            }
                        }
                    }
                }
            }
        `;

        const itemsResponse = await monday.api(itemsQuery);

        if (itemsResponse.data && itemsResponse.data.boards && itemsResponse.data.boards.length > 0) {
            const items = itemsResponse.data.boards[0].items_page.items;
            console.log(`Fetched ${items.length} filtered items for board ${targetBoardId}`);
            return items;
        }

        console.warn("No items found for target board ID");
        return [];
    } catch (error) {
        console.error("Error fetching metadata items for board:", error);
        // Fall back to client-side filtering
        console.log("Falling back to client-side filtering");
        return fetchMetadataItems(metadataBoardId);
    }
}

/**
 * Fetch all boards accessible to the user
 * @returns {Promise<Array>} Array of boards with id, name, and workspace
 */
export async function fetchBoards() {
    try {
        console.log("Fetching all boards");

        const query = `
            query {
                boards(limit: 100) {
                    id
                    name
                    workspace {
                        id
                        name
                    }
                }
            }
        `;

        const response = await monday.api(query);

        if (response.data && response.data.boards) {
            console.log(`Fetched ${response.data.boards.length} boards`);
            return response.data.boards;
        }

        return [];
    } catch (error) {
        console.error("Error fetching boards:", error);
        throw error;
    }
}

/**
 * Fetch board details by ID
 * @param {string} boardId - The board ID
 * @returns {Promise<Object>} Board object with details
 */
export async function fetchBoardDetails(boardId) {
    if (!boardId) {
        console.warn("fetchBoardDetails: No boardId provided");
        return null;
    }

    try {
        console.log("Fetching board details for:", boardId);

        const query = `
            query {
                boards(ids: [${boardId}]) {
                    id
                    name
                    workspace {
                        id
                        name
                    }
                    columns {
                        id
                        title
                        type
                    }
                }
            }
        `;

        const response = await monday.api(query);

        if (response.data && response.data.boards && response.data.boards.length > 0) {
            return response.data.boards[0];
        }

        return null;
    } catch (error) {
        console.error("Error fetching board details:", error);
        throw error;
    }
}
