import mondaySdk from "monday-sdk-js";
import { USERS_BOARD_ID } from "../metadataConfig";
const monday = mondaySdk();
//const USERS_BOARD_ID = 5026719492;
const USERS_COL_TITLE_PROFILE = "Profile";
const USERS_COL_TITLE_USER  = "User";

/**
 * Fetches the Profile name for a specific Monday User ID from the Users Board.
 * @param {string|number} userId - The ID of the user to look up.
 * @returns {Promise<string|null>} The profile name string or null if not found/error.
 */
export async function getUsersProfileName(userId) {
    if (!userId) return null;

    try {
        const query = `
            query ($boardId: [ID!]) {
                boards(ids: $boardId) {
                    items_page(limit: 100) {
                        items {
                            column_values {
                                text
                                value
                                column {
                                    title
                                }
                            }
                        }
                    }
                }
            }
        `;

        const variables = { boardId: [String(USERS_BOARD_ID)] };
        const response = await monday.api(query, { variables });

        if (response.errors) {
            return null;
        }

        const items = response.data?.boards?.[0]?.items_page?.items || [];
        // Search through the records for the matching User ID
        for (const item of items) {
            const userColumn = item.column_values.find(cv => cv.column.title === USERS_COL_TITLE_USER);
            const profileColumn = item.column_values.find(cv => cv.column.title === USERS_COL_TITLE_PROFILE);

            if (userColumn && userColumn.value) {
                try {
                    const parsedUser = JSON.parse(userColumn.value);
                    const persons = parsedUser.personsAndTeams || [];

                    // Check if the passed userId matches any ID in the people column
                    const isMatch = persons.some(p => String(p.id) === String(userId));

                    if (isMatch) {
                        return profileColumn ? profileColumn.text : null;
                    }
                } catch (parseErr) {
                    return null;
                }
            }
        }

        return null; // Record not found
    } catch (error) {
        //console.error("[getUsersProfileName] General Error:", error);
        return null;
    }
}