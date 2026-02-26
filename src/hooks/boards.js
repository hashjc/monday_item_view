
//boards.js
import mondaySdk from "monday-sdk-js";

const monday = mondaySdk();

/**
 * Retrieve all boards for the current account
 * * @returns {Promise<Object>} { success, error, boards }
 */
export async function getAllBoards() {
    console.log("boards.js [getAllBoards] Fetching all boards for account");

    try {
        // We query boards with a limit. You can include workspace details if needed.
        const query = `
            query {
                boards (limit: 1000) {
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

        if (response.errors) {
            console.error("[getAllBoards] GraphQL errors:", response.errors);
            return {
                success: false,
                error: response.errors[0].message || "GraphQL query failed",
                boards: []
            };
        }

        const boards = response.data?.boards || [];
        console.log(`[getAllBoards] Found ${boards.length} boards in account`);

        return {
            success: true,
            error: "",
            boards: boards
        };

    } catch (error) {
        console.error("[getAllBoards] Error:", error);
        return {
            success: false,
            error: `Failed to fetch boards: ${error.message}`,
            boards: []
        };
    }
}