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
    const [formAction, setFormAction] = useState("create");

    const [boardItems, setBoardItems] = useState([]);
    const [loadingItems, setLoadingItems] = useState(false);
    const [itemsError, setItemsError] = useState(null);
    const [selectedItemId, setSelectedItemId] = useState("");
    const [selectedItem, setSelectedItem] = useState(null);

    const [formData, setFormData] = useState({});
    const [collapsedSections, setCollapsedSections] = useState({});

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

    const { boards: boardsFromHook } = useBoards();
    const boards = boardsFromHook || [];

    const { items, validatedSections, validationSummary, loading, error } = usePageLayoutInfo(boardId);
    const pageLayoutLoading = loading;
    const pageLayoutError = error;

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

    const handleFormActionChange = (event) => {
        const action = event.target.value;
        setFormAction(action);
        console.log(`Form action changed to: ${action}`);

        setSelectedItemId("");
        setSelectedItem(null);
        setFormData({});

        if (action === "update") {
            fetchBoardItemsForUpdate();
        }
    };

    const handleItemSelection = async (event) => {
        const itemId = event.target.value;
        setSelectedItemId(itemId);
        console.log("Selected item ID:", itemId);

        if (!itemId) {
            setSelectedItem(null);
            setFormData({});
            return;
        }

        try {
            const result = await retrieveItemById(itemId);
            if (result.success) {
                setSelectedItem(result.item);
                console.log("Loaded item details:", result.item);

                const itemData = {};
                itemData["name"] = result.item.name;

                result.item.column_values.forEach((col) => {
                    itemData[col.id] = col.text || col.value || "";
                });

                setFormData(itemData);
                console.log("Form populated with item data:", itemData);
            } else {
                console.error("Failed to load item:", result.error);
                setSelectedItem(null);
                setFormData({});
            }
        } catch (error) {
            console.error("Error loading item:", error);
            setSelectedItem(null);
            setFormData({});
        }
    };

    const handleFieldChange = (columnId, value) => {
        setFormData((prev) => ({
            ...prev,
            [columnId]: value,
        }));
    };

    const toggleSection = (sectionId) => {
        setCollapsedSections((prev) => ({
            ...prev,
            [sectionId]: !prev[sectionId],
        }));
    };

    const renderField = (field) => {
        const value = formData[field.columnId] || "";

        const inputStyle = {
            padding: "8px 12px",
            width: "100%",
            borderRadius: "4px",
            border: "1px solid #ccc",
            fontSize: "14px",
            fontFamily: "inherit",
        };

        switch (field.type) {
            case "name":
            case "text":
                return (
                    <input
                        type="text"
                        value={value}
                        onChange={(e) => handleFieldChange(field.columnId, e.target.value)}
                        placeholder={`Enter ${field.label}`}
                        style={inputStyle}
                    />
                );

            case "long_text":
                return (
                    <textarea
                        value={value}
                        onChange={(e) => handleFieldChange(field.columnId, e.target.value)}
                        placeholder={`Enter ${field.label}`}
                        rows={4}
                        style={{
                            ...inputStyle,
                            resize: "vertical",
                        }}
                    />
                );

            case "numbers":
                return (
                    <input
                        type="number"
                        value={value}
                        onChange={(e) => handleFieldChange(field.columnId, e.target.value)}
                        placeholder={`Enter ${field.label}`}
                        style={inputStyle}
                    />
                );

            case "date":
                return <input type="date" value={value} onChange={(e) => handleFieldChange(field.columnId, e.target.value)} style={inputStyle} />;

            case "checkbox":
                return (
                    <label style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
                        <input
                            type="checkbox"
                            checked={value === "true" || value === true}
                            onChange={(e) => handleFieldChange(field.columnId, e.target.checked)}
                            style={{ marginRight: "8px" }}
                        />
                        <span>Yes</span>
                    </label>
                );

            case "formula":
            case "mirror":
                return (
                    <input
                        type="text"
                        value={value}
                        readOnly
                        disabled
                        placeholder="(Calculated field)"
                        style={{
                            ...inputStyle,
                            backgroundColor: "#f5f5f5",
                            cursor: "not-allowed",
                        }}
                    />
                );

            case "status":
            case "people":
            case "board_relation":
            case "doc":
                return (
                    <input
                        type="text"
                        value={value}
                        onChange={(e) => handleFieldChange(field.columnId, e.target.value)}
                        placeholder={`Enter ${field.label} (Complex type - simplified input)`}
                        style={inputStyle}
                    />
                );

            default:
                return (
                    <input
                        type="text"
                        value={value}
                        onChange={(e) => handleFieldChange(field.columnId, e.target.value)}
                        placeholder={`Enter ${field.label}`}
                        style={inputStyle}
                    />
                );
        }
    };

    const handleFormSubmit = (e) => {
        e.preventDefault();

        console.log("Form submitted with data:", formData);
        console.log("Form action:", formAction);

        if (formAction === "create") {
            monday.execute("notice", {
                message: "Create functionality will be implemented",
                type: "info",
                timeout: 3000,
            });
        } else {
            monday.execute("notice", {
                message: `Update functionality will be implemented for item ${selectedItemId}`,
                type: "info",
                timeout: 3000,
            });
        }
    };

    const loadForm = () => {
        console.log("loadForm called - creating dynamic form from validated sections");

        const validSections = validatedSections.filter((section) => section.isFullyValid && section.sectionData && section.sectionData.fields);

        if (validSections.length === 0) {
            return (
                <div className="error-box">
                    <h3>⚠️ Cannot Create Form</h3>
                    <p>No valid sections found. Please check your page layout configuration.</p>
                    {validationSummary && (
                        <p className="error-details">
                            Sections with errors: {validationSummary.sectionsWithInvalidFields} invalid fields, {validationSummary.sectionsWithDuplicates}{" "}
                            duplicates
                        </p>
                    )}
                </div>
            );
        }

        return (
            <div className="form-container">
                {/* Header */}
                {formAction === "update" && selectedItem && (
                    <div className="editing-banner">
                        <p>
                            ✏️ Editing: <strong>{selectedItem.name}</strong> (ID: {selectedItem.id})
                        </p>
                    </div>
                )}

                {/* Dynamic Form */}
                <form onSubmit={handleFormSubmit}>
                    {validSections.map((section) => {
                        const sectionId = section.sectionData.id;
                        const isCollapsed = collapsedSections[sectionId] || false;

                        const validFields = section.sectionData.fields.filter((field) => field.isValid === true && field.duplicate === false);

                        if (validFields.length === 0) return null;

                        return (
                            <div key={sectionId} className="section-container">
                                {/* Section Header (Collapsible) */}
                                <div className="section-header" onClick={() => toggleSection(sectionId)}>
                                    <h3>
                                        {section.sectionData.title}
                                        <span className="field-count">
                                            ({validFields.length} field{validFields.length !== 1 ? "s" : ""})
                                        </span>
                                    </h3>
                                    <span className="collapse-icon">{isCollapsed ? "▼" : "▲"}</span>
                                </div>

                                {/* Section Content */}
                                {!isCollapsed && (
                                    <div className="section-content">
                                        <div className="fields-grid">
                                            {validFields.map((field) => (
                                                <div key={field.id} className="field-wrapper">
                                                    <label className="field-label">
                                                        {field.label}
                                                        {field.isDefault === "true" && <span className="required-asterisk">*</span>}
                                                    </label>
                                                    {renderField(field)}
                                                    <div className="field-type-hint">Type: {field.type}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    {/* Form Actions */}
                    <div className="form-actions">
                        <button type="submit" className="btn-primary">
                            {formAction === "create" ? "✓ Create Item" : "✓ Update Item"}
                        </button>

                        <button type="button" onClick={() => setFormData({})} className="btn-secondary">
                            Clear Form
                        </button>
                    </div>
                </form>

                {/* REMOVED: Validation Summary */}
            </div>
        );
    };

    return (
        <div className="App">
            {!boardId ? (
                <div className="board-selector">
                    <label>Select a board to continue:</label>
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
                <div className="main-content">
                    {/* REMOVED: Board Information heading */}

                    {pageLayoutLoading && (
                        <div className="loading-state">
                            <p>Loading page layout...</p>
                        </div>
                    )}

                    {!pageLayoutLoading && pageLayoutError && (
                        <div className="error-box warning">
                            <h3>⚠️ Error Loading Page Layout</h3>
                            <p>{pageLayoutError}</p>
                        </div>
                    )}

                    {!pageLayoutLoading && !pageLayoutError && validatedSections.length === 0 && (
                        <div className="error-box danger">
                            <h3>❌ Page Layout Information Not Found</h3>
                            <p>
                                No page layout configuration found for board: <strong>{selectedBoardName}</strong>
                            </p>
                            <p className="board-id-hint">Board ID: {boardId}</p>
                        </div>
                    )}

                    {!pageLayoutLoading && !pageLayoutError && validatedSections.length > 0 && (
                        <div>
                            {/* Create or Update Radio Buttons */}
                            <div className="action-selector">
                                <h3>Select Action:</h3>
                                <div className="radio-group">
                                    <label className="radio-label">
                                        <input
                                            type="radio"
                                            name="formAction"
                                            value="create"
                                            checked={formAction === "create"}
                                            onChange={handleFormActionChange}
                                        />
                                        <span>Create New Record</span>
                                    </label>

                                    <label className="radio-label">
                                        <input
                                            type="radio"
                                            name="formAction"
                                            value="update"
                                            checked={formAction === "update"}
                                            onChange={handleFormActionChange}
                                        />
                                        <span>Update Existing Record</span>
                                    </label>
                                </div>
                            </div>

                            {/* Item Selection Dropdown (Update Mode Only) */}
                            {formAction === "update" && (
                                <div className="item-selector">
                                    <h3>Select Item to Update:</h3>

                                    {loadingItems && <p>Loading items...</p>}

                                    {itemsError && (
                                        <div className="error-inline">
                                            <p>Error: {itemsError}</p>
                                        </div>
                                    )}

                                    {!loadingItems && !itemsError && boardItems.length === 0 && (
                                        <p className="no-items-message">No items found in this board.</p>
                                    )}

                                    {!loadingItems && !itemsError && boardItems.length > 0 && (
                                        <div>
                                            <select value={selectedItemId} onChange={handleItemSelection} className="item-dropdown">
                                                <option value="">-- Select an item --</option>
                                                {boardItems.map((item) => (
                                                    <option key={item.id} value={item.id}>
                                                        {item.name} (ID: {item.id})
                                                    </option>
                                                ))}
                                            </select>

                                            <p className="item-count-hint">Found {boardItems.length} item(s) in board</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Load Dynamic Form */}
                            {(formAction === "create" || (formAction === "update" && selectedItemId)) && loadForm()}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default App;
