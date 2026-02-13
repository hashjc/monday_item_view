import { useState, useEffect } from "react";
import { fetchBoardDetails } from "../services/mondayApi";

export function useBoardDetails(boardId) {
  const [board, setBoard] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!boardId) return;
    setLoading(true);
    setError(null);
    fetchBoardDetails(boardId)
      .then((b) => setBoard(b))
      .catch((err) => setError(err))
      .finally(() => setLoading(false));
  }, [boardId]);

  return { board, loading, error };
}

export default useBoardDetails;
