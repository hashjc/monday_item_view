// useMetadataRecords.js
import { useState, useEffect, useCallback } from "react";
import { fetchMetadataItems, fetchMetadataItemsForBoard } from "../services/mondayApi";

/**
 * Hook to fetch metadata records for a target boardId from a metadata board
 * @param {string} boardId - The target board ID
 * @param {string} metadataBoardId - The metadata board ID
 * @returns {Object} { records, loading, error, refresh }
 */
export function useMetadataRecords(boardId, metadataBoardId) {
    console.log("useMetadataRecords hook called for board:", boardId, "metadata board:", metadataBoardId);

    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const load = useCallback(() => {
        if (!boardId || !metadataBoardId) {
            console.log("useMetadataRecords: Missing boardId or metadataBoardId, skipping fetch");
            return;
        }

        console.log("useMetadataRecords: Loading metadata for board", boardId, "from metadata board", metadataBoardId);
        setLoading(true);
        setError(null);

        // Try server-side filtering first
        fetchMetadataItemsForBoard(metadataBoardId, boardId)
            .then((items) => {
                if (!items || items.length === 0) {
                    console.log("useMetadataRecords: No items found (may need client-side filtering)");
                }

                // Map items to records format
                const mapped = (items || []).map((it) => {
                    const cols = it.column_values || [];
                    const boardIdCol = cols.find((c) => (c.title || "").toLowerCase() === "board id");
                    const sectionOrderCol = cols.find((c) => (c.title || "").toLowerCase() === "section order");

                    const boardIdValue = boardIdCol ? (boardIdCol.text || boardIdCol.value || "") : "";
                    const sectionOrderValue = sectionOrderCol ? (sectionOrderCol.text || sectionOrderCol.value || "") : "";
                    const orderNum = parseFloat(sectionOrderValue) || 0;

                    return {
                        id: it.id,
                        name: it.name,
                        rawColumns: cols,
                        boardIdValue,
                        sectionOrderValue,
                        orderNum,
                    };
                });

                // Sort by section order
                mapped.sort((a, b) => a.orderNum - b.orderNum);

                console.log(`useMetadataRecords: Loaded ${mapped.length} records`);
                setRecords(mapped);
            })
            .catch((err) => {
                console.error("useMetadataRecords: Error loading metadata:", err);
                setError(err);
            })
            .finally(() => {
                setLoading(false);
            });
    }, [boardId, metadataBoardId]);

    useEffect(() => {
        load();
    }, [load]);

    return {
        records,
        loading,
        error,
        refresh: load
    };
}

export default useMetadataRecords;
