import React from "react";
import { useState, useEffect } from "react";
import "./App.css";
import mondaySdk from "monday-sdk-js";
import "@vibe/core/tokens";
//Explore more Monday React Components here: https://vibe.monday.com/
import { AttentionBox } from "@vibe/core";

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

    //Some example what you can do with context, read more here: https://developer.monday.com/apps/docs/mondayget#requesting-context-and-settings-data
    const attentionBoxText = `Hello, your user_id is: ${context ? context.user.id : "still loading"}.
  Let's start building your amazing app, which will change the world!`;

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
};;

export default App;
