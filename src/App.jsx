import React from "react";
import { useState, useEffect } from "react";
import "./App.css";
import mondaySdk from "monday-sdk-js";
import "@vibe/core/tokens";
import { useBoards } from "./hooks/useBoards";
import { usePageLayoutInfo } from "./hooks/pageLayoutService";
import { retrieveBoardItems, retrieveItemById } from "./hooks/items";
import { getBoardColumns } from "./hooks/boardMetadata";

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

    // Board columns metadata for dropdown/status options
    const [boardColumns, setBoardColumns] = useState([]);

    useEffect(() => {
        monday.execute("valueCreatedForUser");

        monday
            .get("context")
            .then((res) => {
                console.log("monday initial context:", res.data);
                if (res && res.data) {
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
            if (res && res.data) {
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

    // Fetch board columns metadata when boardId changes
    useEffect(() => {
        if (!boardId) return;

        getBoardColumns(boardId).then((result) => {
            if (result.success) {
                setBoardColumns(result.columns);
                console.log("Board columns loaded:", result.columns);
            }
        });
    }, [boardId]);

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
                    // For status/dropdown, store the ID(s) instead of text
                    if (col.type === "status" || col.type === "dropdown") {
                        try {
                            const parsed = JSON.parse(col.value);
                            if (col.type === "status") {
                                itemData[col.id] = parsed.index || "";
                            } else if (col.type === "dropdown") {
                                itemData[col.id] = parsed.ids || [];
                            }
                        } catch (e) {
                            itemData[col.id] = col.text || "";
                        }
                    } else {
                        itemData[col.id] = col.text || col.value || "";
                    }
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

    /**
     * Get column metadata by column ID
     */
    const getColumnMetadata = (columnId) => {
        return boardColumns.find((col) => col.id === columnId);
    };

    /**
     * Parse status column settings to get labels
     */
    const getStatusLabels = (columnId) => {
        const column = getColumnMetadata(columnId);
        if (!column || !column.settings_str) return [];

        try {
            const settings = JSON.parse(column.settings_str);
            const labels = settings.labels || {};
            const labelsColors = settings.labels_colors || {};

            return Object.keys(labels).map((index) => ({
                index: index,
                label: labels[index],
                color: labelsColors[index]?.color || "#ccc",
            }));
        } catch (e) {
            console.error("Error parsing status settings:", e);
            return [];
        }
    };

    /**
     * Parse dropdown column settings to get labels
     */
    const getDropdownLabels = (columnId) => {
        const column = getColumnMetadata(columnId);
        if (!column || !column.settings_str) return [];

        try {
            const settings = JSON.parse(column.settings_str);
            return settings.labels || [];
        } catch (e) {
            console.error("Error parsing dropdown settings:", e);
            return [];
        }
    };

    const renderField = (field) => {
        const value = formData[field.columnId] || "";
        const columnMetadata = getColumnMetadata(field.columnId);

        const inputStyle = {
            padding: "8px 12px",
            width: "100%",
            borderRadius: "4px",
            border: "1px solid #ccc",
            fontSize: "14px",
            fontFamily: "inherit",
        };

        switch (field.type) {
            case "status": {
                const labels = getStatusLabels(field.columnId);
                return (
                    <select value={value} onChange={(e) => handleFieldChange(field.columnId, e.target.value)} style={inputStyle}>
                        <option value="">-- Select {field.label} --</option>
                        {labels.map((label) => (
                            <option key={label.index} value={label.index}>
                                {label.label}
                            </option>
                        ))}
                    </select>
                );
            }

            case "dropdown": {
                const labels = getDropdownLabels(field.columnId);
                const dropdownValue = Array.isArray(value) ? value : value ? [value] : [];

                // Check if multi-select is allowed
                const settings = columnMetadata ? JSON.parse(columnMetadata.settings_str || "{}") : {};
                const limitSelect = settings.limit_select;

                if (limitSelect) {
                    // Single select
                    return (
                        <select
                            value={dropdownValue[0] || ""}
                            onChange={(e) => handleFieldChange(field.columnId, [parseInt(e.target.value)])}
                            style={inputStyle}
                        >
                            <option value="">-- Select {field.label} --</option>
                            {labels.map((label) => (
                                <option key={label.id} value={label.id}>
                                    {label.name}
                                </option>
                            ))}
                        </select>
                    );
                } else {
                    // Multi-select
                    return (
                        <select
                            multiple
                            value={dropdownValue.map(String)}
                            onChange={(e) => {
                                const selected = Array.from(e.target.selectedOptions).map((opt) => parseInt(opt.value));
                                handleFieldChange(field.columnId, selected);
                            }}
                            style={{
                                ...inputStyle,
                                minHeight: "100px",
                            }}
                        >
                            {labels.map((label) => (
                                <option key={label.id} value={label.id}>
                                    {label.name}
                                </option>
                            ))}
                        </select>
                    );
                }
            }

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

    /**
     * Create a new item in Monday.com
     */
    const createItem = async (recordValues) => {
        console.log("Creating item with values:", recordValues);

        try {
            // Extract item name
            const itemName = recordValues.name || "New Item";

            // Build column values JSON
            const columnValues = {};

            Object.keys(recordValues).forEach((columnId) => {
                if (columnId === "name") return; // Skip name as it's separate

                const value = recordValues[columnId];
                const columnMeta = getColumnMetadata(columnId);

                if (!columnMeta) return;
                // Skip empty values
                if (value === "" || value === null || value === undefined) {
                    console.log(`Skipping empty value for column: ${columnId}`);
                    return;
                }
                // Format value based on column type
                switch (columnMeta.type) {
                    case "status":
                        // Status expects: {"index": 1}
                        const statusIndex = parseInt(value);
                        if (!isNaN(statusIndex)) {
                            columnValues[columnId] = { index: statusIndex };
                        }
                        break;

                    case "dropdown":
                        // Dropdown expects: {"ids": [1, 2, 3]}
                        const ids = Array.isArray(value) ? value : [value];
                        const validIds = ids.filter((id) => id !== "" && id !== null).map((id) => parseInt(id));
                        if (validIds.length > 0) {
                            columnValues[columnId] = { ids: validIds };
                        }
                        break;

                    case "checkbox":
                        // Checkbox expects: {"checked": "true"}
                        columnValues[columnId] = { checked: value ? "true" : "false" };
                        break;

                    case "date":
                        // Date expects: {"date": "2023-01-15"}
                        if (value.trim() !== "") {
                            columnValues[columnId] = { date: value };
                        }
                        break;

                    case "numbers":
                        // Numbers expects: "42"
                        columnValues[columnId] = String(value);
                        break;

                    case "text":
                    case "long_text":
                        // Text expects: "text value"
                        columnValues[columnId] = String(value);
                        break;

                    default:
                        // Generic string value
                        columnValues[columnId] = String(value);
                }
            });
            // NOW stringify once at the end
            const columnValuesJSON = JSON.stringify(columnValues);

            console.log("Column values object:", columnValues);
            console.log("Column values JSON:", columnValuesJSON);

            const mutation = `
                mutation($boardId: ID!, $itemName: String!, $columnValues: JSON!) {
                    create_item(
                        board_id: $boardId
                        item_name: $itemName
                        column_values: $columnValues
                    ) {
                        id
                        name
                    }
                }
            `;

            const variables = {
                boardId: boardId,
                itemName: itemName,
                columnValues: columnValuesJSON,
            };

            console.log("=== DEBUG: Full mutation request ===");
            console.log("Mutation:", mutation);
            console.log("Variables:", variables);
            console.log("Parsed column values:", JSON.parse(variables.columnValues));

            const response = await monday.api(mutation, { variables });

            if (response.data && response.data.create_item) {
                console.log("Item created successfully:", response.data.create_item);
                monday.execute("notice", {
                    message: `Item "${response.data.create_item.name}" created successfully!`,
                    type: "success",
                    timeout: 5000,
                });

                // Clear form
                setFormData({});

                return { success: true, item: response.data.create_item };
            } else {
                throw new Error("Failed to create item");
            }
        } catch (error) {
            console.error("Error creating item:", error);
            monday.execute("notice", {
                message: `Error creating item: ${error.message}`,
                type: "error",
                timeout: 5000,
            });
            return { success: false, error: error.message };
        }
    };

    /**
     * Update an existing item in Monday.com
     */
    const updateItem = async (itemId, recordValues) => {
        console.log("Updating item", itemId, "with values:", recordValues);

        try {
            // Build column values updates
            const updates = [];

            Object.keys(recordValues).forEach((columnId) => {
                if (columnId === "name") {
                    // Update item name separately if changed
                    if (recordValues.name && recordValues.name !== selectedItem.name) {
                        updates.push({
                            mutation: `
                                mutation($itemId: ID!, $boardId: ID!, $name: String!) {
                                    change_multiple_column_values(
                                        item_id: $itemId
                                        board_id: $boardId
                                        column_values: "{}"
                                        create_labels_if_missing: false
                                    ) {
                                        id
                                    }
                                }
                            `,
                            variables: {
                                itemId: itemId,
                                boardId: boardId,
                                name: recordValues.name,
                            },
                        });
                    }
                    return;
                }

                const value = recordValues[columnId];
                const columnMeta = getColumnMetadata(columnId);

                if (!columnMeta || !value) return;

                // Format value based on column type (same as create)
                let formattedValue;
                switch (columnMeta.type) {
                    case "status":
                        formattedValue = JSON.stringify({ index: parseInt(value) });
                        break;
                    case "dropdown":
                        const ids = Array.isArray(value) ? value : [value];
                        formattedValue = JSON.stringify({ ids: ids.filter((id) => id !== "") });
                        break;
                    case "checkbox":
                        formattedValue = JSON.stringify({ checked: value ? "true" : "false" });
                        break;
                    case "date":
                        formattedValue = JSON.stringify({ date: value });
                        break;
                    default:
                        formattedValue = String(value);
                }

                updates.push({
                    columnId: columnId,
                    value: formattedValue,
                });
            });

            // Execute update mutation
            const columnValues = {};
            updates.forEach((update) => {
                if (update.columnId) {
                    columnValues[update.columnId] = update.value;
                }
            });

            const mutation = `
                mutation($boardId: ID!, $itemId: ID!, $columnValues: JSON!) {
                    change_multiple_column_values(
                        board_id: $boardId
                        item_id: $itemId
                        column_values: $columnValues
                        create_labels_if_missing: false
                    ) {
                        id
                        name
                    }
                }
            `;

            const variables = {
                boardId: boardId,
                itemId: itemId,
                columnValues: JSON.stringify(columnValues),
            };

            console.log("Update mutation variables:", variables);

            const response = await monday.api(mutation, { variables });

            if (response.data && response.data.change_multiple_column_values) {
                console.log("Item updated successfully:", response.data.change_multiple_column_values);
                monday.execute("notice", {
                    message: `Item updated successfully!`,
                    type: "success",
                    timeout: 5000,
                });

                return { success: true, item: response.data.change_multiple_column_values };
            } else {
                throw new Error("Failed to update item");
            }
        } catch (error) {
            console.error("Error updating item:", error);
            monday.execute("notice", {
                message: `Error updating item: ${error.message}`,
                type: "error",
                timeout: 5000,
            });
            return { success: false, error: error.message };
        }
    };

    const handleFormSubmit = async (e) => {
        e.preventDefault();

        console.log("Form submitted with data:", formData);
        console.log("Form action:", formAction);

        if (formAction === "create") {
            await createItem(formData);
        } else if (formAction === "update" && selectedItemId) {
            await updateItem(selectedItemId, formData);
        }
    };

    const loadForm = () => {
        const validSections = validatedSections.filter((section) => section.isFullyValid && section.sectionData && section.sectionData.fields);

        if (validSections.length === 0) {
            return (
                <div className="error-box">
                    <h3>⚠️ Cannot Create Form</h3>
                    <p>No valid sections found. Please check your page layout configuration.</p>
                </div>
            );
        }

        return (
            <div className="form-container">
                {formAction === "update" && selectedItem && (
                    <div className="editing-banner">
                        <p>
                            ✏️ Editing: <strong>{selectedItem.name}</strong> (ID: {selectedItem.id})
                        </p>
                    </div>
                )}

                <form onSubmit={handleFormSubmit}>
                    {validSections.map((section) => {
                        const sectionId = section.sectionData.id;
                        const isCollapsed = collapsedSections[sectionId] || false;

                        const validFields = section.sectionData.fields.filter((field) => field.isValid === true && field.duplicate === false);

                        if (validFields.length === 0) return null;

                        return (
                            <div key={sectionId} className="section-container">
                                <div className="section-header" onClick={() => toggleSection(sectionId)}>
                                    <h3>
                                        {section.sectionData.title}
                                        <span className="field-count">
                                            ({validFields.length} field{validFields.length !== 1 ? "s" : ""})
                                        </span>
                                    </h3>
                                    <span className="collapse-icon">{isCollapsed ? "▼" : "▲"}</span>
                                </div>

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

                    <div className="form-actions">
                        <button type="submit" className="btn-primary">
                            {formAction === "create" ? "✓ Create Item" : "✓ Update Item"}
                        </button>

                        <button type="button" onClick={() => setFormData({})} className="btn-secondary">
                            Clear Form
                        </button>
                    </div>
                </form>
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
                        </div>
                    )}

                    {!pageLayoutLoading && !pageLayoutError && validatedSections.length > 0 && (
                        <div>
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

                            {(formAction === "create" || (formAction === "update" && selectedItemId)) && loadForm()}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default App;
