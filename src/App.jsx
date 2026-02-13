import React from "react";
import { useState, useEffect } from "react";
import "./App.css";
import mondaySdk from "monday-sdk-js";
import "@vibe/core/tokens";
//Explore more Monday React Components here: https://vibe.monday.com/
// Optional metadata board id stored locally for testing (falls back to env vars).
import { METADATA_BOARD_ID as METADATA_BOARD_ID_FROM_FILE } from "./metadataConfig";
// Usage of mondaySDK example, for more information visit here: https://developer.monday.com/apps/docs/introduction-to-the-sdk/
const monday = mondaySdk();

const App = () => {
    console.log("App start 324324");
    const [context, setContext] = useState();
    // Track the currently selected board id (from context or user selection)
    const [boardId, setBoardId] = useState(null);
    // List of boards to show in dropdown when boardId is not available
    const [boards, setBoards] = useState([]);
    // Friendly board name for the selected board (used in form label)
    const [selectedBoardName, setSelectedBoardName] = useState("");

    useEffect(() => {
        // Notice this method notifies the monday platform that user gains a first value in an app.
        // Read more about it here: https://developer.monday.com/apps/docs/mondayexecute#value-created-for-user/
        monday.execute("valueCreatedForUser");

        // Fetch initial context when the app loads and log user + board context to console.
        // `monday.get("context")` returns a promise with context data (user, board, etc.).
        monday
            .get("context")
            .then((res) => {
                // res.data contains the context object
                console.log("monday initial context:", res.data);
                if (res && res.data) {
                    // Log current user context (available as `user` or `currentUser` depending on SDK version)
                    console.log("Current user context:", res.data.user || res.data.currentUser || null);

                    // Log current board context (may be undefined in some embed contexts)
                    console.log("Current board context:", res.data.board || res.data.selectedBoard || null);

                    // Update local state for any UI usage (keeps original behavior)
                    setContext(res.data);

                    // Try to extract board id from a few common context shapes.
                    const detectedBoardId =
                        res.data.boardId || (res.data.board && res.data.board.id) || (res.data.selectedBoard && res.data.selectedBoard.id) || null;
                    console.log('Detected board id ', detectedBoardId);
                    // Save board id if available; otherwise we'll fetch boards for user selection.
                    if (detectedBoardId) {
                        setBoardId(String(detectedBoardId));
                        // Try to get a friendly board name as well
                        const nameFromContext = (res.data.board && res.data.board.name) || (res.data.selectedBoard && res.data.selectedBoard.name) || null;
                        if (nameFromContext) setSelectedBoardName(nameFromContext);
                    } else {
                        // No board detected in context — fetch boards so the user can pick one.
                        // Query boards and their workspace names for dropdown labels.
                        const query = `query { boards (limit:100) { id name workspace { id name } } }`;
                        monday
                            .api(query)
                            .then((boardsRes) => {
                                const list = boardsRes && boardsRes.data && boardsRes.data.boards ? boardsRes.data.boards : [];
                                setBoards(list);
                                console.log("fetched boards for selection:", list);
                            })
                            .catch((err) => {
                                console.error("Failed to fetch boards:", err);
                            });
                    }
                }
            })
            .catch((err) => {
                console.error("Failed to get monday context:", err);
            });

        // Also listen for context updates and log them whenever they change.
        // This ensures we log fresh context if the user switches boards or users change.
        monday.listen("context", (res) => {
            setContext(res.data);
            console.log("monday context updated:", res.data);
            if (res && res.data) {
                console.log("Updated user context:", res.data.user || res.data.currentUser || null);
                console.log("Updated board context:", res.data.board || res.data.selectedBoard || null);
                // Keep board id/name up-to-date on context updates as well
                const updatedBoardId =
                    res.data.boardId || (res.data.board && res.data.board.id) || (res.data.selectedBoard && res.data.selectedBoard.id) || null;
                if (updatedBoardId) {
                    setBoardId(String(updatedBoardId));
                    const updatedName = (res.data.board && res.data.board.name) || (res.data.selectedBoard && res.data.selectedBoard.name) || null;
                    if (updatedName) setSelectedBoardName(updatedName);
                }
            }
        });
    }, []);

    // If we have a boardId but no friendly name, fetch board details to show a dynamic header.
    useEffect(() => {
        if (!boardId) return;
        if (selectedBoardName) return; // already have name

        // Query the API for board details by id to get a friendly name and workspace
        const query = `query { boards (ids: [${boardId}]) { id name workspace { id name } } }`;
        monday
            .api(query)
            .then((res) => {
                const list = res && res.data && res.data.boards ? res.data.boards : [];
                if (list.length > 0) {
                    const b = list[0];
                    setSelectedBoardName(b.name || "");
                    // If boards list for dropdown is empty, seed it with this board (useful if selection came from context)
                    if (!boards || boards.length === 0) setBoards([b]);
                    console.log("fetched board details:", b);
                }
            })
            .catch((err) => console.error("Failed to fetch board details:", err));
    }, [boardId, selectedBoardName]);

    console.log('Metadata board id getting 00 ');
    // Query the Metadata board for records matching the selected/detected boardId.
    // The metadata board id is expected in environment variables. In Vite apps, expose it
    // to the client using a `VITE_` prefix (e.g. VITE_METADATA_BOARD_ID=5026617338).
    useEffect(() => {
        if (!boardId) return; // nothing to query for yet
        console.log('Metadata board id getting ');
        // Prefer the id from the local config file (useful for testing). Fall back to env.
        const METADATA_BOARD_ID =
            METADATA_BOARD_ID_FROM_FILE || import.meta.env.VITE_METADATA_BOARD_ID || import.meta.env.METADATA_BOARD_ID || null;
        console.log('Metadata board id (source order: file, VITE_, raw):', METADATA_BOARD_ID);
        if (!METADATA_BOARD_ID) {
            console.warn(
                "METADATA_BOARD_ID not set in .env (use VITE_METADATA_BOARD_ID for Vite).")
            ;
            return;
        }

        // Query the metadata board items and their columns. We'll filter locally by the
        // 'Board Id' column and sort by the 'Section Order' column (ascending).
        const query = `query { boards (ids: [${METADATA_BOARD_ID}]) { items(limit:100) { id name column_values { id title text value } } } }`;
        monday
            .api(query)
            .then((res) => {
                const items =
                    res && res.data && res.data.boards && res.data.boards[0]
                        ? res.data.boards[0].items || []
                        : [];

                // Map items to include the Board Id and Section Order fields extracted from column_values
                const mapped = items
                    .map((it) => {
                        const cols = it.column_values || [];
                        const boardIdCol = cols.find((c) => (c.title || "").toLowerCase() === "board id");
                        const sectionOrderCol = cols.find((c) => (c.title || "").toLowerCase() === "section order");

                        // Column `.text` is usually the human-readable value; `.value` may be JSON.
                        const boardIdValue = boardIdCol ? (boardIdCol.text || boardIdCol.value || "") : "";
                        const sectionOrderValue = sectionOrderCol ? (sectionOrderCol.text || sectionOrderCol.value || "") : "";

                        // Try to coerce section order into a number for sorting
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
                    // filter only records that match the target boardId
                    .filter((m) => String(m.boardIdValue) === String(boardId));

                // sort by orderNum ascending
                mapped.sort((a, b) => a.orderNum - b.orderNum);

                console.log("Metadata records for board", boardId, ":", mapped);
            })
            .catch((err) => console.error("Failed to query metadata board:", err));
    }, [boardId]);


    return (
        <div className="App">
            {/* If no boardId available from context, show a dropdown to pick one */}
            {!boardId ? (
                <div style={{ marginTop: 16 }}>
                    <label style={{ display: "block", marginBottom: 8 }}>Select a board to continue:</label>
                    <select
                        onChange={(e) => {
                            const chosenId = e.target.value;
                            setBoardId(chosenId);
                            // Attempt to find the chosen board name from the fetched list
                            const chosen = boards.find((b) => String(b.id) === chosenId);
                            const wsName = chosen && chosen.workspace ? chosen.workspace.name : "";
                            setSelectedBoardName(chosen ? chosen.name : "");
                            console.log("User selected board id:", chosenId, "board:", chosen);
                        }}
                        defaultValue=""
                    >
                        <option value="" disabled>
                            -- choose a board --
                        </option>
                        {boards.map((b) => {
                            const ws = b.workspace && b.workspace.name ? b.workspace.name : "";
                            const label = ws ? `${b.name} (${ws})` : b.name;
                            return (
                                <option key={b.id} value={b.id}>
                                    {label}
                                </option>
                            );
                        })}
                    </select>
                </div>
            ) : (
                // When boardId is available, display a dynamic (blank) form labeled '<BoardName> Information'
                <div style={{ marginTop: 20 }}>
                    <h2>{selectedBoardName ? `${selectedBoardName} Information` : "Board Information"}</h2>
                    {/* Blank form placeholder - extend later with fields as required */}
                    <form>{/* Intentionally left blank for now */}</form>
                </div>
            )}
        </div>
    );
};;;

export default App;
