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
 * @returns {Promise<Object>} { success, error, items, boardName }
 */
export async function retrieveBoardItems(boardId) {
    console.log(`items.js [retrieveBoardItems] Fetching items for board: ${boardId}`);

    if (!boardId) {
        return { success: false, error: "Board ID is required", items: [] };
    }

    try {
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

        if (response.errors) {
            console.error("[retrieveBoardItems] GraphQL errors:", response.errors);
            return {
                success: false,
                error: response.errors[0].message || "GraphQL query failed",
                items: []
            };
        }

        if (!response.data || !response.data.boards || response.data.boards.length === 0) {
            return {
                success: false,
                error: `Cannot access board (ID: ${boardId}). Board doesn't exist or user lacks permissions.`,
                items: []
            };
        }

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
        const errorMessage = error.message || String(error);
        const isPermissionError =
            errorMessage.toLowerCase().includes("permission") ||
            errorMessage.toLowerCase().includes("unauthorized") ||
            errorMessage.toLowerCase().includes("forbidden");

        return {
            success: false,
            error: isPermissionError
                ? `Permission denied: User does not have access to board (ID: ${boardId}).`
                : `Failed to fetch board items: ${errorMessage}`,
            items: []
        };
    }
}

// =============================================================
// NEW: Fetch items from MULTIPLE boards in parallel
// Used by board_relation fields linked to more than one board
//
// Returns items tagged with boardId + boardName so the UI
// can show which board each result belongs to.
//
// @param {Array<string|number>} boardIds  - Array of board IDs
// @returns {Promise<Object>}
//   {
//     success: boolean,
//     error: string,
//     items: [
//       { id, name, boardId, boardName, column_values }
//     ],
//     boardNames: { [boardId]: boardName }
//   }
// =============================================================
export async function retrieveMultipleBoardItems(boardIds) {
    console.log(`items.js [retrieveMultipleBoardItems] Fetching from boards: ${boardIds.join(", ")}`);

    if (!boardIds || boardIds.length === 0) {
        return { success: false, error: "At least one board ID is required", items: [] };
    }

    // Single board — just delegate to existing function and tag results
    if (boardIds.length === 1) {
        const result = await retrieveBoardItems(boardIds[0]);
        if (!result.success) return result;

        return {
            success: true,
            error: "",
            items: result.items.map(item => ({
                ...item,
                boardId: String(boardIds[0]),
                boardName: result.boardName
            })),
            boardNames: { [String(boardIds[0])]: result.boardName }
        };
    }

    // Multiple boards — fetch all in parallel
    const results = await Promise.allSettled(
        boardIds.map(boardId => retrieveBoardItems(boardId))
    );

    const allItems = [];
    const boardNames = {};
    const errors = [];

    results.forEach((result, index) => {
        const boardId = String(boardIds[index]);

        if (result.status === "fulfilled" && result.value.success) {
            const { items, boardName } = result.value;
            boardNames[boardId] = boardName;

            // Tag every item with its source board
            items.forEach(item => {
                allItems.push({
                    ...item,
                    boardId,
                    boardName
                });
            });

            console.log(`[retrieveMultipleBoardItems] Board "${boardName}": ${items.length} items`);
        } else {
            const errorMsg = result.status === "rejected"
                ? result.reason?.message || "Unknown error"
                : result.value?.error || "Failed to fetch";

            console.warn(`[retrieveMultipleBoardItems] Board ${boardId} failed: ${errorMsg}`);
            errors.push(`Board ${boardId}: ${errorMsg}`);
        }
    });

    if (allItems.length === 0 && errors.length > 0) {
        return {
            success: false,
            error: errors.join("; "),
            items: [],
            boardNames
        };
    }

    console.log(`[retrieveMultipleBoardItems] Total: ${allItems.length} items across ${Object.keys(boardNames).length} board(s)`);

    return {
        success: true,
        error: errors.length > 0 ? `Some boards failed: ${errors.join("; ")}` : "",
        items: allItems,
        boardNames
    };
}

// =============================================================
// NEW: Search by name across MULTIPLE boards in parallel
//
// @param {Array<string|number>} boardIds
// @param {string} itemName
// @returns {Promise<Object>} same shape as retrieveMultipleBoardItems
// =============================================================
export async function retrieveMultipleBoardItemsByItemName(boardIds, itemName) {
    console.log(`items.js [retrieveMultipleBoardItemsByItemName] Boards: ${boardIds.join(", ")}, Name: "${itemName}"`);

    if (!boardIds || boardIds.length === 0) {
        return { success: false, error: "At least one board ID is required", items: [] };
    }

    if (!itemName || itemName.trim() === "") {
        return { success: false, error: "Item name is required", items: [] };
    }

    // Single board — delegate
    if (boardIds.length === 1) {
        const result = await retrieveBoardItemsByItemName(boardIds[0], itemName);
        if (!result.success) return { ...result, boardNames: {} };

        // We need the boardName — fetch it by doing a quick boards query
        let boardName = `Board ${boardIds[0]}`;
        try {
            const nameResult = await monday.api(`query { boards(ids: [${boardIds[0]}]) { name } }`);
            boardName = nameResult.data?.boards?.[0]?.name || boardName;
        } catch (_) {}

        return {
            success: true,
            error: "",
            items: result.items.map(item => ({
                ...item,
                boardId: String(boardIds[0]),
                boardName
            })),
            boardNames: { [String(boardIds[0])]: boardName }
        };
    }

    // Multiple boards — search all in parallel
    const results = await Promise.allSettled(
        boardIds.map(boardId => retrieveBoardItemsByItemName(boardId, itemName))
    );

    const allItems = [];
    const boardNames = {};
    const errors = [];

    // We also need board names — fetch them once
    try {
        const idsStr = boardIds.join(", ");
        const namesResponse = await monday.api(`query { boards(ids: [${idsStr}]) { id name } }`);
        const boards = namesResponse.data?.boards || [];
        boards.forEach(b => { boardNames[String(b.id)] = b.name; });
    } catch (_) {
        boardIds.forEach(id => { boardNames[String(id)] = `Board ${id}`; });
    }

    results.forEach((result, index) => {
        const boardId = String(boardIds[index]);
        const boardName = boardNames[boardId] || `Board ${boardId}`;

        if (result.status === "fulfilled" && result.value.success) {
            result.value.items.forEach(item => {
                allItems.push({ ...item, boardId, boardName });
            });
        } else {
            const errorMsg = result.status === "rejected"
                ? result.reason?.message || "Unknown error"
                : result.value?.error || "No results";
            errors.push(`"${boardName}": ${errorMsg}`);
        }
    });

    if (allItems.length === 0) {
        return {
            success: false,
            error: `No items found matching "${itemName}"`,
            items: [],
            boardNames
        };
    }

    return {
        success: true,
        error: "",
        items: allItems,
        boardNames
    };
}

/**
 * Retrieve board items by item name (partial match) — single board
 *
 * @param {string} boardId - The board ID
 * @param {string} itemName - The item name to search
 * @returns {Promise<Object>} { success, error, items }
 */
export async function retrieveBoardItemsByItemName(boardId, itemName) {
    console.log(`items.js [retrieveBoardItemsByItemName] Board: ${boardId}, Name: ${itemName}`);

    if (!boardId) {
        return { success: false, error: "Board ID is required", items: [] };
    }

    if (!itemName || itemName.trim() === "") {
        return { success: false, error: "Item name is required", items: [] };
    }

    try {
        const safeItemName = itemName.replace(/"/g, '\\"');

        const query = `
            query {
                boards(ids: ${boardId}) {
                    items_page(
                        limit: 100,
                        query_params: {
                            rules: [
                                {
                                    column_id: "name",
                                    compare_value: ["${safeItemName}"],
                                    operator: contains_text
                                }
                            ]
                        }
                    ) {
                        items {
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
                }
            }
        `;

        const response = await monday.api(query);

        if (response.errors) {
            return {
                success: false,
                error: response.errors[0].message || "Failed to search items",
                items: []
            };
        }

        const items = response.data?.boards?.[0]?.items_page?.items || [];

        console.log(`[retrieveBoardItemsByItemName] Found ${items.length} item(s)`);

        return {
            success: true,
            error: items.length === 0 ? `No items found matching "${itemName}"` : "",
            items
        };

    } catch (error) {
        console.error("[retrieveBoardItemsByItemName] Error:", error);
        return {
            success: false,
            error: error.message || "Failed to search items",
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
        return { success: false, error: "Item ID is required", item: null };
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

        return { success: true, error: "", item: items[0] };

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
