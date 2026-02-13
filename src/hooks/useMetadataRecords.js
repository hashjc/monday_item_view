import { useState, useEffect, useCallback } from "react";
import { fetchMetadataItems } from "../services/mondayApi";

// Hook to fetch metadata records for a target boardId from a metadata board
export function useMetadataRecords(boardId, metadataBoardId) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    if (!boardId || !metadataBoardId) return;
    setLoading(true);
    setError(null);
    fetchMetadataItems(metadataBoardId)
      .then((items) => {
        const mapped = (items || [])
          .map((it) => {
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
          })
          .filter((m) => String(m.boardIdValue) === String(boardId));

        mapped.sort((a, b) => a.orderNum - b.orderNum);
        setRecords(mapped);
      })
      .catch((err) => setError(err))
      .finally(() => setLoading(false));
  }, [boardId, metadataBoardId]);

  useEffect(() => {
    load();
  }, [load]);

  return { records, loading, error, refresh: load };
}

export default useMetadataRecords;
