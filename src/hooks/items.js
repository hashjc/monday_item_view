//items.js file
//Query records of a Monday board
import mondaySdk from "monday-sdk-js";

import { useState, useEffect } from "react";
const monday = mondaySdk();
const LIMIT = 500;

/**
 * Retrieve all items from a specific board
 *
 * @param {string} boardId - The board ID to fetch items from
 * @returns {Promise<Object>} { success, error, items }
 */
export async function retrieveBoardItems(boardId) {
    console.log(`items.js [retrieveBoardItems] Fetching items for board: ${boardId}`);

    // Validate input
    if (!boardId) {
        return {
            success: false,
            error: "Board ID is required",
            items: []
        };
    }

    try {
        // Query to fetch all items from the board
        const query = `
            query {
                boards(ids: [${boardId}]) {
                    id
                    name
                    items_page(limit: ${LIMIT}) {
                        cursor
                        items {
                            id
                            name
                            column_values {
                                id
                                text
                                value
                                type
                                column {
                                    id
                                    title
                                    type
                                }
                            }
                        }
                    }
                }
            }
        `;

        const response = await monday.api(query);

        // Check for GraphQL errors
        if (response.errors) {
            console.error("[retrieveBoardItems] GraphQL errors:", response.errors);
            return {
                success: false,
                error: response.errors[0].message || "GraphQL query failed",
                items: []
            };
        }

        // Check if board exists and user has access
        if (!response.data || !response.data.boards || response.data.boards.length === 0) {
            return {
                success: false,
                error: `Cannot access board (ID: ${boardId}). Board doesn't exist or user lacks permissions.`,
                items: []
            };
        }

        // Extract items
        const board = response.data.boards[0];
        const items = board.items_page?.items || [];

        console.log(`[retrieveBoardItems] Found ${items.length} items in board ${board.name}`);

        return {
            success: true,
            error: "",
            items: items,
            boardName: board.name
        };

    } catch (error) {
        console.error("[retrieveBoardItems] Error:", error);

        // Check if it's a permission error
        const errorMessage = error.message || String(error);
        const isPermissionError =
            errorMessage.toLowerCase().includes("permission") ||
            errorMessage.toLowerCase().includes("unauthorized") ||
            errorMessage.toLowerCase().includes("forbidden");

        if (isPermissionError) {
            return {
                success: false,
                error: `Permission denied: User does not have access to board (ID: ${boardId}). Contact admin to grant access.`,
                items: []
            };
        }

        // Generic error
        return {
            success: false,
            error: `Failed to fetch board items: ${errorMessage}`,
            items: []
        };
    }
}

/**
 * Retrieve a specific item by ID with all its column values
 *
 * @param {string} itemId - The item ID to fetch
 * @returns {Promise<Object>} { success, error, item }
 */
export async function retrieveItemById(itemId) {
    console.log(`items.js [retrieveItemById] Fetching item: ${itemId}`);

    if (!itemId) {
        return {
            success: false,
            error: "Item ID is required",
            item: null
        };
    }

    try {
        const query = `
            query {
                items(ids: [${itemId}]) {
                    id
                    name
                    board {
                        id
                        name
                    }
                    column_values {
                        id
                        text
                        value
                        type
                        column {
                            id
                            title
                            type
                        }
                    }
                }
            }
        `;

        const response = await monday.api(query);

        if (response.errors) {
            return {
                success: false,
                error: response.errors[0].message || "Failed to fetch item",
                item: null
            };
        }

        const items = response.data?.items || [];

        if (items.length === 0) {
            return {
                success: false,
                error: `Item ${itemId} not found or user lacks access`,
                item: null
            };
        }

        console.log(`[retrieveItemById] Found item: ${items[0].name}`);

        return {
            success: true,
            error: "",
            item: items[0]
        };

    } catch (error) {
        console.error("[retrieveItemById] Error:", error);
        return {
            success: false,
            error: error.message || "Failed to fetch item",
            item: null
        };
    }
}

/**
 * React Hook to fetch board items
 * Automatically refreshes when boardId changes
 */
export function useBoardItems(boardId) {
    const [data, setData] = useState({
        items: [],
        loading: true,
        error: null,
        boardName: ""
    });

    useEffect(() => {
        if (!boardId) {
            setData({ items: [], loading: false, error: null, boardName: "" });
            return;
        }

        setData(prev => ({ ...prev, loading: true, error: null }));

        retrieveBoardItems(boardId)
            .then(result => {
                setData({
                    items: result.items,
                    loading: false,
                    error: result.success ? null : result.error,
                    boardName: result.boardName || ""
                });
            })
            .catch(err => {
                setData({
                    items: [],
                    loading: false,
                    error: err.message || "Unknown error",
                    boardName: ""
                });
            });
    }, [boardId]);

    return data;
}
