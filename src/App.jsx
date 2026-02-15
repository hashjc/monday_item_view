import React from "react";
import { useState, useEffect } from "react";
import "./App.css";
import mondaySdk from "monday-sdk-js";
import "@vibe/core/tokens";
import { useBoards } from "./hooks/useBoards";
import { usePageLayoutInfo } from "./hooks/pageLayoutService";
import { retrieveBoardItems, retrieveItemById } from "./hooks/items";

const monday = mondaySdk();

const App = () => {
    console.log("App start");
    const [context, setContext] = useState();
    const [boardId, setBoardId] = useState(null);
    const [selectedBoardName, setSelectedBoardName] = useState("");
    const [formAction, setFormAction] = useState("create"); // "create" or "update"

    // For Update mode
    const [boardItems, setBoardItems] = useState([]);
    const [loadingItems, setLoadingItems] = useState(false);
    const [itemsError, setItemsError] = useState(null);
    const [selectedItemId, setSelectedItemId] = useState("");
    const [selectedItem, setSelectedItem] = useState(null);

    useEffect(() => {
        monday.execute("valueCreatedForUser");

        monday
            .get("context")
            .then((res) => {
                console.log("monday initial context:", res.data);
                if (res && res.data) {
                    console.log("Current user context:", res.data.user || res.data.currentUser || null);
                    console.log("Current board context:", res.data.board || res.data.selectedBoard || null);

                    setContext(res.data);

                    const detectedBoardId =
                        res.data.boardId || (res.data.board && res.data.board.id) || (res.data.selectedBoard && res.data.selectedBoard.id) || null;

                    console.log("App.jsx Detected board id:", detectedBoardId);

                    if (detectedBoardId) {
                        setBoardId(String(detectedBoardId));
                        const nameFromContext = (res.data.board && res.data.board.name) || (res.data.selectedBoard && res.data.selectedBoard.name) || null;
                        if (nameFromContext) setSelectedBoardName(nameFromContext);
                    }
                }
            })
            .catch((err) => {
                console.error("Failed to get monday context:", err);
            });

        monday.listen("context", (res) => {
            setContext(res.data);
            console.log("monday context updated:", res.data);
            if (res && res.data) {
                console.log("Updated user context:", res.data.user || res.data.currentUser || null);
                console.log("Updated board context:", res.data.board || res.data.selectedBoard || null);

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

    // Fetch boards and page layout
    const { boards: boardsFromHook } = useBoards();
    const boards = boardsFromHook || [];
    console.log("App.jsx Boards from hook:", boardsFromHook);

    const { items: pageLayoutItems, loading: pageLayoutLoading, error: pageLayoutError } = usePageLayoutInfo(boardId);
    console.log("App.jsx Page layout items:", pageLayoutItems);
    console.log("App.jsx Page layout loading:", pageLayoutLoading);
    console.log("App.jsx Page layout error:", pageLayoutError);

    /**
     * Fetch board items when switching to Update mode
     */
    const fetchBoardItemsForUpdate = async () => {
        if (!boardId) return;

        console.log("Fetching board items for update mode...");
        setLoadingItems(true);
        setItemsError(null);

        try {
            const result = await retrieveBoardItems(boardId);

            if (result.success) {
                setBoardItems(result.items);
                console.log(`Loaded ${result.items.length} items from board`);
            } else {
                setItemsError(result.error);
                setBoardItems([]);
            }
        } catch (error) {
            setItemsError(error.message || "Failed to load items");
            setBoardItems([]);
        } finally {
            setLoadingItems(false);
        }
    };

    /**
     * Handle form action change (Create or Update)
     */
    const handleFormActionChange = (event) => {
        const action = event.target.value;
        setFormAction(action);
        console.log(`Form action changed to: ${action}`);

        // Reset selection when switching modes
        setSelectedItemId("");
        setSelectedItem(null);

        // If switching to Update mode, fetch board items
        if (action === "update") {
            fetchBoardItemsForUpdate();
        }
    };

    /**
     * Handle item selection from dropdown (Update mode)
     */
    const handleItemSelection = async (event) => {
        const itemId = event.target.value;
        setSelectedItemId(itemId);
        console.log("Selected item ID:", itemId);

        if (!itemId) {
            setSelectedItem(null);
            return;
        }

        // Fetch full item details
        try {
            const result = await retrieveItemById(itemId);
            if (result.success) {
                setSelectedItem(result.item);
                console.log("Loaded item details:", result.item);
            } else {
                console.error("Failed to load item:", result.error);
                setSelectedItem(null);
            }
        } catch (error) {
            console.error("Error loading item:", error);
            setSelectedItem(null);
        }
    };

    /**
     * Load and render the dynamic form based on page layout
     * TODO: This will be implemented to create fields dynamically from pageLayoutItems
     */
    const loadForm = () => {
        console.log("loadForm called - will create dynamic form from page layout");
        console.log("Page layout items to render:", pageLayoutItems);
        console.log("Form action:", formAction);
        console.log("Selected item:", selectedItem);

        // PLACEHOLDER: Will implement dynamic form rendering here
        return (
            <div style={{ marginTop: 20, padding: 20, border: "1px solid #ddd", borderRadius: 8 }}>
                <h3>Dynamic Form (Placeholder)</h3>
                <p>
                    Form action: <strong>{formAction}</strong>
                </p>
                <p>
                    Number of layout sections: <strong>{pageLayoutItems.length}</strong>
                </p>

                {formAction === "update" && selectedItem && (
                    <div
                        style={{
                            padding: 10,
                            backgroundColor: "#d4edda",
                            borderRadius: 4,
                            marginBottom: 15,
                        }}
                    >
                        <p style={{ margin: 0, color: "#155724" }}>
                            Editing: <strong>{selectedItem.name}</strong> (ID: {selectedItem.id})
                        </p>
                    </div>
                )}

                {/* TODO: Loop through pageLayoutItems and create form fields */}
                <div style={{ marginTop: 10, color: "#666" }}>
                    <em>Form fields will be rendered here based on page layout configuration</em>
                </div>

                {/* Placeholder form */}
                <form style={{ marginTop: 20 }}>
                    <div style={{ marginBottom: 15 }}>
                        <label style={{ display: "block", marginBottom: 5 }}>Item Name:</label>
                        <input
                            type="text"
                            placeholder="Enter item name"
                            defaultValue={selectedItem ? selectedItem.name : ""}
                            style={{ padding: 8, width: "100%", maxWidth: 400 }}
                        />
                    </div>

                    <button
                        type="submit"
                        style={{
                            padding: "10px 20px",
                            backgroundColor: "#0073ea",
                            color: "white",
                            border: "none",
                            borderRadius: 4,
                            cursor: "pointer",
                        }}
                    >
                        {formAction === "create" ? "Create Item" : "Update Item"}
                    </button>
                </form>
            </div>
        );
    };

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
                            const chosen = boards.find((b) => String(b.id) === chosenId);
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
                // When boardId is available
                <div style={{ marginTop: 20 }}>
                    <h2>{selectedBoardName ? `${selectedBoardName} Information` : "Board Information"}</h2>

                    {/* Loading State */}
                    {pageLayoutLoading && (
                        <div style={{ padding: 20, textAlign: "center" }}>
                            <p>Loading page layout...</p>
                        </div>
                    )}

                    {/* Error State */}
                    {!pageLayoutLoading && pageLayoutError && (
                        <div
                            style={{
                                padding: 20,
                                backgroundColor: "#fff3cd",
                                border: "1px solid #ffc107",
                                borderRadius: 8,
                                marginTop: 20,
                            }}
                        >
                            <h3 style={{ color: "#856404" }}>⚠️ Error Loading Page Layout</h3>
                            <p style={{ color: "#856404" }}>{pageLayoutError}</p>
                        </div>
                    )}

                    {/* No Page Layout Found */}
                    {!pageLayoutLoading && !pageLayoutError && pageLayoutItems.length === 0 && (
                        <div
                            style={{
                                padding: 20,
                                backgroundColor: "#f8d7da",
                                border: "1px solid #f5c6cb",
                                borderRadius: 8,
                                marginTop: 20,
                            }}
                        >
                            <h3 style={{ color: "#721c24" }}>❌ Page Layout Information Not Found</h3>
                            <p style={{ color: "#721c24" }}>
                                No page layout configuration found for board: <strong>{selectedBoardName}</strong>
                            </p>
                            <p style={{ color: "#721c24", fontSize: 14, marginTop: 10 }}>Board ID: {boardId}</p>
                        </div>
                    )}

                    {/* Page Layout Found - Show Create/Update Options */}
                    {!pageLayoutLoading && !pageLayoutError && pageLayoutItems.length > 0 && (
                        <div>
                            {/* Create or Update Radio Buttons */}
                            <div
                                style={{
                                    padding: 20,
                                    backgroundColor: "#f8f9fa",
                                    border: "1px solid #dee2e6",
                                    borderRadius: 8,
                                    marginBottom: 20,
                                }}
                            >
                                <h3 style={{ marginTop: 0 }}>Select Action:</h3>
                                <div style={{ display: "flex", gap: 20 }}>
                                    <label style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
                                        <input
                                            type="radio"
                                            name="formAction"
                                            value="create"
                                            checked={formAction === "create"}
                                            onChange={handleFormActionChange}
                                            style={{ marginRight: 8 }}
                                        />
                                        <span>Create New Record</span>
                                    </label>

                                    <label style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
                                        <input
                                            type="radio"
                                            name="formAction"
                                            value="update"
                                            checked={formAction === "update"}
                                            onChange={handleFormActionChange}
                                            style={{ marginRight: 8 }}
                                        />
                                        <span>Update Existing Record</span>
                                    </label>
                                </div>
                            </div>

                            {/* Item Selection Dropdown (Update Mode Only) */}
                            {formAction === "update" && (
                                <div
                                    style={{
                                        padding: 20,
                                        backgroundColor: "#fff",
                                        border: "1px solid #dee2e6",
                                        borderRadius: 8,
                                        marginBottom: 20,
                                    }}
                                >
                                    <h3 style={{ marginTop: 0 }}>Select Item to Update:</h3>

                                    {loadingItems && <p>Loading items...</p>}

                                    {itemsError && (
                                        <div
                                            style={{
                                                padding: 10,
                                                backgroundColor: "#f8d7da",
                                                borderRadius: 4,
                                                marginBottom: 10,
                                            }}
                                        >
                                            <p style={{ color: "#721c24", margin: 0 }}>Error: {itemsError}</p>
                                        </div>
                                    )}

                                    {!loadingItems && !itemsError && boardItems.length === 0 && <p style={{ color: "#666" }}>No items found in this board.</p>}

                                    {!loadingItems && !itemsError && boardItems.length > 0 && (
                                        <div>
                                            <select
                                                value={selectedItemId}
                                                onChange={handleItemSelection}
                                                style={{
                                                    padding: 10,
                                                    width: "100%",
                                                    maxWidth: 500,
                                                    fontSize: 14,
                                                    borderRadius: 4,
                                                    border: "1px solid #ccc",
                                                }}
                                            >
                                                <option value="">-- Select an item --</option>
                                                {boardItems.map((item) => (
                                                    <option key={item.id} value={item.id}>
                                                        {item.name} (ID: {item.id})
                                                    </option>
                                                ))}
                                            </select>

                                            <p
                                                style={{
                                                    marginTop: 10,
                                                    fontSize: 13,
                                                    color: "#666",
                                                }}
                                            >
                                                Found {boardItems.length} item(s) in board
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Load Dynamic Form (only if Create mode OR item is selected in Update mode) */}
                            {(formAction === "create" || (formAction === "update" && selectedItemId)) && loadForm()}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default App;
