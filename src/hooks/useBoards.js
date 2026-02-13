import { useState, useEffect } from "react";
import { fetchBoards } from "../services/mondayApi";

export function useBoards() {
  const [boards, setBoards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = () => {
    setLoading(true);
    setError(null);
    fetchBoards()
      .then((res) => setBoards(res))
      .catch((err) => setError(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  return { boards, loading, error, refresh: load };
}

export default useBoards;
