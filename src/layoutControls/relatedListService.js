/**
 * relatedListService.js
 *
 * Fetches child board records that are linked to a specific parent item.
 *
 * ─── WHAT THIS HANDLES ──────────────────────────────────────────────────────
 *  Given a validated child board definition (from pageLayoutService.js) and
 *  the ID of the currently open parent item, this service queries the child
 *  board for items whose relation column links back to the parent item.
 *
 *  This file is intentionally kept separate from:
 *    - pageLayoutService.js  (metadata + validation)
 *    - RelatedLists.jsx      (rendering)
 *
 * ─── API ────────────────────────────────────────────────────────────────────
 *  fetchRelatedListRecords(childBoard, parentItemId)
 *    → Promise<{ success, records, error }>
 *
 *  records[]:
 *  {
 *    id:     string,           // monday item id
 *    name:   string,           // item name
 *    cells:  { [columnId]: { text, value, type, title } }
 *  }
 *
 * ─── SHAPE OF childBoard (from validateChildBoards) ─────────────────────────
 *  {
 *    boardId:   string,
 *    boardName: string,
 *    label:     string,
 *    columnId:  string,              // relation column on child board → parent
 *    columns:   [{ id, title, type }],  // already validated
 *    skippedColumns: string[],
 *  }
 */

import mondaySdk from "monday-sdk-js";
const monday = mondaySdk();

const RELATED_LIST_PAGE_SIZE = 200;

/**
 * Fetch child board records that are linked to the given parent item.
 *
 * The child board has a "board_relation" column (childBoard.columnId) that
 * points to the parent board. We filter for items where that column contains
 * the parentItemId.
 *
 * @param {Object} childBoard   - validated child board definition
 * @param {string} parentItemId - monday item ID of the currently open parent
 * @returns {Promise<{ success: boolean, records: Object[], error: string|null }>}
 */
export async function fetchRelatedListRecords(childBoard, parentItemId) {
    const { boardId, columnId: relationColumnId, columns: validColumns } = childBoard;

    if (!boardId || !relationColumnId || !parentItemId) {
        return {
            success: false,
            records: [],
            error: "Missing boardId, columnId, or parentItemId",
        };
    }

    // Build the column_values fragment.
    // We always request: id, text, value, column { title type }
    // Plus specialised fragments for relation and mirror columns.
    const columnValuesFragment = `
        column_values {
            id
            text
            value
            column { title type }
            ... on BoardRelationValue { linked_item_ids display_value }
            ... on MirrorValue { display_value }
            ... on PeopleValue { persons_and_teams { id kind } }
        }
    `;

    try {
        // monday's items_page with a rule: relation column contains parentItemId
        // We use `any_of` on the relation column with the parent item id as value.
        const query = `
            query {
                boards(ids: [${boardId}]) {
                    items_page(
                        limit: ${RELATED_LIST_PAGE_SIZE},
                        query_params: {
                            rules: [{
                                column_id: "${relationColumnId}",
                                compare_value: ["${parentItemId}"],
                                operator: any_of
                            }]
                        }
                    ) {
                        items {
                            id
                            name
                            ${columnValuesFragment}
                        }
                    }
                }
            }
        `;

        const response = await monday.api(query);

        if (response.errors) {
            throw new Error(response.errors[0]?.message || "GraphQL error fetching related records");
        }

        const rawItems = response?.data?.boards?.[0]?.items_page?.items || [];

        // Build a set of column IDs we actually want to display (from validated config)
        const displayColumnIds = new Set(validColumns.map((c) => c.id));

        // Shape each raw item into a flat record for easy rendering
        const records = rawItems.map((item) => {
            // cells: only include columns that are in the validated display list
            const cells = {};

            item.column_values.forEach((cv) => {
                if (!displayColumnIds.has(cv.id)) return;

                // Find the column metadata from our validated list
                const colMeta = validColumns.find((c) => c.id === cv.id);

                cells[cv.id] = {
                    text:  resolveDisplayText(cv),
                    value: cv.value,
                    type:  colMeta?.type  || cv.column?.type || "text",
                    title: colMeta?.title || cv.column?.title || cv.id,
                };
            });

            return {
                id:    item.id,
                name:  item.name,
                cells,
            };
        });

        return { success: true, records, error: null };
    } catch (error) {
        console.error("[relatedListService] fetchRelatedListRecords error:", error);
        return { success: false, records: [], error: error.message };
    }
}

/**
 * Resolve the best human-readable display text from a column_value object.
 * Priority: display_value (mirrors/relations) → text → "(empty)"
 */
function resolveDisplayText(cv) {
    // Mirror and relation columns have a display_value
    if (cv.display_value && cv.display_value.trim() !== "") {
        return cv.display_value;
    }
    // People columns: build a text from persons_and_teams if cv.text is empty
    if (cv.persons_and_teams && Array.isArray(cv.persons_and_teams)) {
        // cv.text is usually already populated for people columns; fall through
    }
    if (cv.text && cv.text.trim() !== "") {
        return cv.text;
    }
    return "";
}