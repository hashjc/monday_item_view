import React from "react";
import { useState, useEffect, useRef } from "react";
import "./App.css";
import mondaySdk from "monday-sdk-js";
import "@vibe/core/tokens";
import { useBoards } from "./hooks/useBoards";
import { usePageLayoutInfo } from "./hooks/pageLayoutService";
import { retrieveBoardItems, retrieveItemById, retrieveBoardItemsByItemName } from "./hooks/items";
import { getBoardColumns } from "./hooks/boardMetadata";
import { getAllUsers, searchUsersByNameOrEmail } from "./hooks/usersAndTeams";

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

    // Monday users for People fields (lookup pattern)
    const [peopleLookups, setPeopleLookups] = useState({});
    // Format: { columnId: { users: [], loading: false, searchTerm: "", isOpen: false } }

    // Board relation lookups - separate state for each field
    const [relationLookups, setRelationLookups] = useState({});
    // Format: { columnId: { items: [], loading: false, searchTerm: "", isOpen: false } }

    // Debounce timers for search
    const searchTimers = useRef({});

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

    // 1. Add this useEffect to handle "Click Outside" to close menus
    useEffect(() => {
        const handleClickOutside = (event) => {
            // Check if the click happened outside any lookup container
            if (!event.target.closest(".relation-lookup-container")) {
                // Close all Board Relation menus
                setRelationLookups((prev) => {
                    const newState = { ...prev };
                    let changed = false;
                    Object.keys(newState).forEach((key) => {
                        if (newState[key].isOpen) {
                            newState[key].isOpen = false;
                            changed = true;
                        }
                    });
                    return changed ? newState : prev;
                });

                // Close all People lookup menus
                setPeopleLookups((prev) => {
                    const newState = { ...prev };
                    let changed = false;
                    Object.keys(newState).forEach((key) => {
                        if (newState[key].isOpen) {
                            newState[key].isOpen = false;
                            changed = true;
                        }
                    });
                    return changed ? newState : prev;
                });
            }
        };

        // Bind the event listener
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            // Unbind the event listener on clean up
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    useEffect(() => {
        const handleScroll = () => {
            // Optional: Close menus on scroll to avoid alignment issues
            setRelationLookups((prev) => {
                const newState = { ...prev };
                Object.keys(newState).forEach((key) => (newState[key].isOpen = false));
                return newState;
            });
        };

        window.addEventListener("scroll", handleScroll, true);
        return () => window.removeEventListener("scroll", handleScroll, true);
    }, []);

    // Fetch Monday users once on mount

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
                    } else if (col.type === "people") {
                        try {
                            const parsed = JSON.parse(col.value);
                            const personIds = parsed.personsAndTeams?.map((p) => parseInt(p.id)) || [];
                            itemData[col.id] = personIds;
                        } catch (e) {
                            itemData[col.id] = [];
                        }
                    } else if (col.type === "board_relation") {
                        try {
                            const parsed = JSON.parse(col.value);
                            // Extract linked item IDs
                            const linkedItemIds = parsed.linkedPulseIds?.map((id) => parseInt(id.linkedPulseId)) || [];
                            itemData[col.id] = linkedItemIds.length > 0 ? linkedItemIds[0] : ""; // Single select
                        } catch (e) {
                            itemData[col.id] = "";
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

    /**
     * Get related board ID from board_relation column settings
     */
    const getRelatedBoardId = (columnId) => {
        const column = getColumnMetadata(columnId);
        if (!column || !column.settings_str) return null;

        try {
            const settings = JSON.parse(column.settings_str);
            // boardIds is an array, get the first one
            return settings.boardIds && settings.boardIds.length > 0 ? settings.boardIds[0] : null;
        } catch (e) {
            console.error("Error parsing board_relation settings:", e);
            return null;
        }
    };

    /**
     * Load related board items when lookup is opened
     */
    const loadRelationLookup = async (columnId, relatedBoardId) => {
        // Close others first
        setRelationLookups({});
        setPeopleLookups({});

        setRelationLookups((prev) => ({
            ...prev,
            [columnId]: { ...prev[columnId], loading: true, isOpen: true },
        }));
        /*
        console.log(`Loading lookup for column ${columnId}, board ${relatedBoardId}`);
        // First, close all other open lookups
        setRelationLookups((prev) => {
            const reset = { ...prev };
            Object.keys(reset).forEach((key) => (reset[key].isOpen = false));
            return reset;
        });
        // Set loading state
        setRelationLookups((prev) => ({
            ...prev,
            [columnId]: {
                ...prev[columnId],
                loading: true,
                isOpen: true,
            },
        }));
        */
        try {
            const result = await retrieveBoardItems(relatedBoardId);

            if (result.success) {
                setRelationLookups((prev) => ({
                    ...prev,
                    [columnId]: {
                        items: result.items,
                        loading: false,
                        searchTerm: "",
                        isOpen: true,
                        boardName: result.boardName,
                    },
                }));
            } else {
                setRelationLookups((prev) => ({
                    ...prev,
                    [columnId]: {
                        items: [],
                        loading: false,
                        searchTerm: "",
                        isOpen: true,
                        error: result.error,
                    },
                }));
            }
        } catch (error) {
            console.error("Error loading lookup:", error);
            setRelationLookups((prev) => ({
                ...prev,
                [columnId]: {
                    items: [],
                    loading: false,
                    searchTerm: "",
                    isOpen: true,
                    error: error.message,
                },
            }));
        }
    };

    /**
     * Handle search in board_relation lookup with debouncing
     */
    const handleRelationSearch = (columnId, relatedBoardId, searchTerm) => {
        console.log(`Search term for ${columnId}:`, searchTerm);

        // Update search term immediately for UI responsiveness
        setRelationLookups((prev) => ({
            ...prev,
            [columnId]: {
                ...prev[columnId],
                searchTerm: searchTerm,
            },
        }));

        // Clear existing timer
        if (searchTimers.current[columnId]) {
            clearTimeout(searchTimers.current[columnId]);
        }

        // If search is empty, load all items
        if (!searchTerm || searchTerm.trim() === "") {
            searchTimers.current[columnId] = setTimeout(async () => {
                const result = await retrieveBoardItems(relatedBoardId);
                if (result.success) {
                    setRelationLookups((prev) => ({
                        ...prev,
                        [columnId]: {
                            ...prev[columnId],
                            items: result.items,
                            loading: false,
                        },
                    }));
                }
            }, 300);
            return;
        }

        // Debounce search - wait 500ms after user stops typing
        searchTimers.current[columnId] = setTimeout(async () => {
            setRelationLookups((prev) => ({
                ...prev,
                [columnId]: {
                    ...prev[columnId],
                    loading: true,
                },
            }));

            try {
                const result = await retrieveBoardItemsByItemName(relatedBoardId, searchTerm);

                setRelationLookups((prev) => ({
                    ...prev,
                    [columnId]: {
                        ...prev[columnId],
                        items: result.success ? result.items : [],
                        loading: false,
                        error: result.success ? null : result.error,
                    },
                }));
            } catch (error) {
                setRelationLookups((prev) => ({
                    ...prev,
                    [columnId]: {
                        ...prev[columnId],
                        items: [],
                        loading: false,
                        error: error.message,
                    },
                }));
            }
        }, 500); // 500ms debounce delay
    };

    /**
     * Close relation lookup
     */
    const closeRelationLookup = (columnId) => {
        setRelationLookups((prev) => ({
            ...prev,
            [columnId]: {
                ...prev[columnId],
                isOpen: false,
                searchTerm: "",
            },
        }));
    };

    /**
     * Select item from board_relation lookup
     */
    const selectRelationItem = (columnId, itemId, itemName) => {
        console.log(`Selected item ${itemId} (${itemName}) for column ${columnId}`);
        handleFieldChange(columnId, itemId);
        //closeRelationLookup(columnId);
        // Explicitly close the menu after selection
        setRelationLookups((prev) => ({
            ...prev,
            [columnId]: { ...prev[columnId], isOpen: false },
        }));
    };
    /**
     * Load people lookup when opened
     */
    const loadPeopleLookup = async (columnId) => {
        // Close others first
        setRelationLookups({});
        setPeopleLookups({});
        console.log(`Loading people lookup for column ${columnId}`);

        // Set loading state
        setPeopleLookups((prev) => ({
            ...prev,
            [columnId]: {
                ...prev[columnId],
                loading: true,
                isOpen: true,
            },
        }));

        try {
            const result = await getAllUsers();

            if (result.success) {
                setPeopleLookups((prev) => ({
                    ...prev,
                    [columnId]: {
                        users: result.users,
                        loading: false,
                        searchTerm: "",
                        isOpen: true,
                    },
                }));
            } else {
                setPeopleLookups((prev) => ({
                    ...prev,
                    [columnId]: {
                        users: [],
                        loading: false,
                        searchTerm: "",
                        isOpen: true,
                        error: result.error,
                    },
                }));
            }
        } catch (error) {
            console.error("Error loading people lookup:", error);
            setPeopleLookups((prev) => ({
                ...prev,
                [columnId]: {
                    users: [],
                    loading: false,
                    searchTerm: "",
                    isOpen: true,
                    error: error.message,
                },
            }));
        }
    };

    /**
     * Handle search in people lookup with debouncing
     */
    const handlePeopleSearch = (columnId, searchTerm) => {
        console.log(`People search for ${columnId}:`, searchTerm);

        // Update search term immediately for UI responsiveness
        setPeopleLookups((prev) => ({
            ...prev,
            [columnId]: {
                ...prev[columnId],
                searchTerm: searchTerm,
            },
        }));

        // Clear existing timer
        const timerKey = `people_${columnId}`;
        if (searchTimers.current[timerKey]) {
            clearTimeout(searchTimers.current[timerKey]);
        }

        // If search is empty, load all users
        if (!searchTerm || searchTerm.trim() === "") {
            searchTimers.current[timerKey] = setTimeout(async () => {
                const result = await getAllUsers();
                if (result.success) {
                    setPeopleLookups((prev) => ({
                        ...prev,
                        [columnId]: {
                            ...prev[columnId],
                            users: result.users,
                            loading: false,
                        },
                    }));
                }
            }, 300);
            return;
        }

        // Debounce search - wait 500ms after user stops typing
        searchTimers.current[timerKey] = setTimeout(async () => {
            setPeopleLookups((prev) => ({
                ...prev,
                [columnId]: {
                    ...prev[columnId],
                    loading: true,
                },
            }));

            try {
                const result = await searchUsersByNameOrEmail(searchTerm);

                setPeopleLookups((prev) => ({
                    ...prev,
                    [columnId]: {
                        ...prev[columnId],
                        users: result.success ? result.users : [],
                        loading: false,
                        error: result.success ? null : result.error,
                    },
                }));
            } catch (error) {
                setPeopleLookups((prev) => ({
                    ...prev,
                    [columnId]: {
                        ...prev[columnId],
                        users: [],
                        loading: false,
                        error: error.message,
                    },
                }));
            }
        }, 500);
    };

    /**
     * Close people lookup
     */
    const closePeopleLookup = (columnId) => {
        setPeopleLookups((prev) => ({
            ...prev,
            [columnId]: {
                ...prev[columnId],
                isOpen: false,
                searchTerm: "",
            },
        }));
    };

    /**
     * Toggle user selection in people field (multi-select)
     */
    const togglePeopleSelection = (columnId, userId) => {
        const currentValue = formData[columnId] || [];
        const userIdNum = parseInt(userId);

        let newValue;
        if (currentValue.includes(userIdNum)) {
            // Remove user if already selected
            newValue = currentValue.filter((id) => id !== userIdNum);
        } else {
            // Add user if not selected
            newValue = [...currentValue, userIdNum];
        }

        console.log(`People field ${columnId} updated:`, newValue);
        handleFieldChange(columnId, newValue);
    };
    /**
     * Clear selected value for board_relation field
     */
    const clearRelationSelection = (columnId, e) => {
        e.stopPropagation(); // Prevent opening the lookup
        console.log(`Clearing selection for relation field: ${columnId}`);
        handleFieldChange(columnId, "");
    };

    /**
     * Clear selected values for people field
     */
    const clearPeopleSelection = (columnId, e) => {
        e.stopPropagation(); // Prevent opening the lookup
        console.log(`Clearing selection for people field: ${columnId}`);
        handleFieldChange(columnId, []);
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

                const settings = columnMetadata ? JSON.parse(columnMetadata.settings_str || "{}") : {};
                const limitSelect = settings.limit_select;

                if (limitSelect) {
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

            case "people": {
                const selectedPeople = Array.isArray(value) ? value : [];

                const lookup = peopleLookups[field.columnId] || {};
                const isOpen = lookup.isOpen || false;

                // Get selected user names for display
                const selectedUserNames = [];
                if (selectedPeople.length > 0 && lookup.users) {
                    selectedPeople.forEach((userId) => {
                        const found = lookup.users.find((u) => parseInt(u.id) === parseInt(userId));
                        if (found) {
                            selectedUserNames.push(found.name);
                        }
                    });
                }

                const displayText = selectedUserNames.length > 0 ? selectedUserNames.join(", ") : `-- Select ${field.label} --`;

                return (
                    <div className="relation-lookup-container">
                        {/* Trigger */}
                        <div
                            className={`relation-lookup-trigger ${isOpen ? "open" : ""}`}
                            onClick={() => {
                                if (!isOpen) {
                                    loadPeopleLookup(field.columnId);
                                }
                            }}
                        >
                            <span className={`relation-lookup-trigger-text ${selectedUserNames.length === 0 ? "placeholder" : ""}`}>{displayText}</span>

                            {/* Clear button (X) - only show if people are selected */}
                            {selectedPeople.length > 0 && (
                                <button
                                    className="relation-lookup-clear-btn"
                                    onClick={(e) => clearPeopleSelection(field.columnId, e)}
                                    title="Clear all selections"
                                    type="button"
                                >
                                    ×
                                </button>
                            )}

                            <span className="relation-lookup-trigger-icon">{isOpen ? "▲" : "▼"}</span>
                        </div>

                        {/* Dropdown */}
                        {isOpen && (
                            <div className="relation-lookup-dropdown">
                                {/* Header with search */}
                                <div className="relation-lookup-header">
                                    <input
                                        type="text"
                                        className="relation-lookup-search"
                                        placeholder="Search by name or email..."
                                        value={lookup.searchTerm || ""}
                                        onChange={(e) => handlePeopleSearch(field.columnId, e.target.value)}
                                        autoFocus
                                    />
                                    <button
                                        className="relation-lookup-close-btn"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            closePeopleLookup(field.columnId);
                                        }}
                                    >
                                        Close
                                    </button>
                                </div>

                                {/* Results */}
                                <div className="relation-lookup-results">
                                    {/* Loading */}
                                    {lookup.loading && <div className="relation-lookup-loading">Loading users...</div>}

                                    {/* Error */}
                                    {!lookup.loading && lookup.error && <div className="relation-lookup-error">{lookup.error}</div>}

                                    {/* Empty */}
                                    {!lookup.loading && !lookup.error && lookup.users && lookup.users.length === 0 && (
                                        <div className="relation-lookup-empty">No users found</div>
                                    )}

                                    {/* Users */}
                                    {!lookup.loading && lookup.users && lookup.users.length > 0 && (
                                        <>
                                            {lookup.users.map((user) => {
                                                const isSelected = selectedPeople.includes(parseInt(user.id));

                                                return (
                                                    <div
                                                        key={user.id}
                                                        className={`relation-lookup-item people-item ${isSelected ? "selected" : ""}`}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            togglePeopleSelection(field.columnId, user.id);
                                                        }}
                                                    >
                                                        <div style={{ display: "flex", alignItems: "center", width: "100%" }}>
                                                            <input type="checkbox" checked={isSelected} readOnly style={{ marginRight: "10px" }} />
                                                            {user.photo_thumb && (
                                                                <img
                                                                    src={user.photo_thumb}
                                                                    alt={user.name}
                                                                    style={{
                                                                        width: "24px",
                                                                        height: "24px",
                                                                        borderRadius: "50%",
                                                                        marginRight: "10px",
                                                                        objectFit: "cover",
                                                                    }}
                                                                />
                                                            )}
                                                            <div style={{ flex: 1 }}>
                                                                <div className="relation-lookup-item-name">
                                                                    {user.name}
                                                                    {user.is_admin && (
                                                                        <span
                                                                            style={{
                                                                                fontSize: "11px",
                                                                                padding: "2px 6px",
                                                                                backgroundColor: "#0073ea",
                                                                                color: "white",
                                                                                borderRadius: "3px",
                                                                                marginLeft: "8px",
                                                                            }}
                                                                        >
                                                                            Admin
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                {user.email && <div className="relation-lookup-item-id">{user.email}</div>}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </>
                                    )}
                                </div>

                                {/* Footer */}
                                {lookup.users && lookup.users.length > 0 && (
                                    <div className="relation-lookup-footer">
                                        {selectedPeople.length} selected of {lookup.users.length} user(s)
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                );
            }

            case "email":
                return (
                    <input
                        type="email"
                        value={value}
                        onChange={(e) => handleFieldChange(field.columnId, e.target.value)}
                        placeholder={`Enter ${field.label}`}
                        style={inputStyle}
                    />
                );

            case "phone":
                return (
                    <input
                        type="tel"
                        value={value}
                        onChange={(e) => handleFieldChange(field.columnId, e.target.value)}
                        placeholder={`Enter ${field.label} (e.g. 9885551234)`}
                        style={inputStyle}
                    />
                );

            case "board_relation": {
                const relatedBoardId = getRelatedBoardId(field.columnId);
                if (!relatedBoardId) {
                    return <div style={{ fontSize: "13px", color: "#999" }}>Board relation not configured</div>;
                }

                const lookup = relationLookups[field.columnId] || {};
                const isOpen = lookup.isOpen || false;
                const selectedItemId = value;

                // Find selected item name
                let selectedItemName = "";
                if (selectedItemId && lookup.items) {
                    const found = lookup.items.find((item) => String(item.id) === String(selectedItemId));
                    selectedItemName = found ? found.name : `Item ${selectedItemId}`;
                }

                return (
                    <div className="relation-lookup-container">
                        {/* Trigger */}
                        <div
                            className={`relation-lookup-trigger ${isOpen ? "open" : ""}`}
                            onClick={() => {
                                if (!isOpen) {
                                    loadRelationLookup(field.columnId, relatedBoardId);
                                }
                            }}
                        >
                            <span className={`relation-lookup-trigger-text ${!selectedItemName ? "placeholder" : ""}`}>
                                {selectedItemName || `-- Select ${field.label} --`}
                            </span>

                            {/* Clear button (X) - only show if something is selected */}
                            {selectedItemId && (
                                <button
                                    className="relation-lookup-clear-btn"
                                    onClick={(e) => clearRelationSelection(field.columnId, e)}
                                    title="Clear selection"
                                    type="button"
                                >
                                    ×
                                </button>
                            )}

                            <span className="relation-lookup-trigger-icon">{isOpen ? "▲" : "▼"}</span>
                        </div>

                        {/* Dropdown */}
                        {isOpen && (
                            <div className="relation-lookup-dropdown">
                                {/* Header with search */}
                                <div className="relation-lookup-header">
                                    <input
                                        type="text"
                                        className="relation-lookup-search"
                                        placeholder="Search by name..."
                                        value={lookup.searchTerm || ""}
                                        onChange={(e) => handleRelationSearch(field.columnId, relatedBoardId, e.target.value)}
                                        autoFocus
                                    />
                                    <button
                                        className="relation-lookup-close-btn"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            closeRelationLookup(field.columnId);
                                        }}
                                    >
                                        Close
                                    </button>
                                </div>

                                {/* Results */}
                                <div className="relation-lookup-results">
                                    {/* Loading */}
                                    {lookup.loading && <div className="relation-lookup-loading">Loading...</div>}

                                    {/* Error */}
                                    {!lookup.loading && lookup.error && <div className="relation-lookup-error">{lookup.error}</div>}

                                    {/* Empty */}
                                    {!lookup.loading && !lookup.error && lookup.items && lookup.items.length === 0 && (
                                        <div className="relation-lookup-empty">No items found</div>
                                    )}

                                    {/* Items */}
                                    {!lookup.loading && lookup.items && lookup.items.length > 0 && (
                                        <>
                                            {lookup.items.map((item) => (
                                                <div
                                                    key={item.id}
                                                    className={`relation-lookup-item ${String(selectedItemId) === String(item.id) ? "selected" : ""}`}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        selectRelationItem(field.columnId, item.id, item.name);
                                                    }}
                                                >
                                                    <div className="relation-lookup-item-name">{item.name}</div>
                                                    <div className="relation-lookup-item-id">ID: {item.id}</div>
                                                </div>
                                            ))}
                                        </>
                                    )}
                                </div>

                                {/* Footer */}
                                {lookup.items && lookup.items.length > 0 && (
                                    <div className="relation-lookup-footer">
                                        {lookup.items.length} item(s) {lookup.boardName && `from ${lookup.boardName}`}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                );
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
            const itemName = recordValues.name || "New Item";
            const columnValues = {};

            Object.keys(recordValues).forEach((columnId) => {
                if (columnId === "name") return;

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
                        const statusIndex = parseInt(value);
                        if (!isNaN(statusIndex)) {
                            columnValues[columnId] = { index: statusIndex };
                        }
                        break;

                    case "dropdown":
                        const ids = Array.isArray(value) ? value : [value];
                        const validIds = ids.filter((id) => id !== "" && id !== null).map((id) => parseInt(id));
                        if (validIds.length > 0) {
                            columnValues[columnId] = { ids: validIds };
                        }
                        break;

                    case "people":
                        const peopleIds = Array.isArray(value) ? value : [value];
                        const validPeopleIds = peopleIds.filter((id) => id !== "" && id !== null);
                        if (validPeopleIds.length > 0) {
                            columnValues[columnId] = {
                                personsAndTeams: validPeopleIds.map((id) => ({
                                    id: parseInt(id),
                                    kind: "person",
                                })),
                            };
                        }
                        break;

                    case "board_relation":
                        // Board relation expects: {"item_ids": [123, 456]}
                        const relationIds = Array.isArray(value) ? value : [value];
                        const validRelationIds = relationIds.filter((id) => id !== "" && id !== null);
                        if (validRelationIds.length > 0) {
                            columnValues[columnId] = {
                                item_ids: validRelationIds.map((id) => parseInt(id)),
                            };
                        }
                        break;

                    case "checkbox":
                        columnValues[columnId] = { checked: value ? "true" : "false" };
                        break;

                    case "date":
                        if (value.trim() !== "") {
                            columnValues[columnId] = { date: value };
                        }
                        break;

                    case "numbers":
                        columnValues[columnId] = String(value);
                        break;

                    case "text":
                    case "long_text":
                        columnValues[columnId] = String(value);
                        break;
                    case "email":
                        // Monday expects: { "email": "user@example.com", "text": "user@example.com" }
                        // "text" is the display label — use the email address itself
                        if (String(value).trim() !== "") {
                            columnValues[columnId] = {
                                email: String(value).trim(),
                                text: String(value).trim(),
                            };
                        }
                        break;

                    case "phone":
                        // Monday expects: { "phone": "9888002909", "countryShortName": "US" }
                        // Strip spaces/dashes from the phone number string
                        if (String(value).trim() !== "") {
                            const cleanPhone = String(value).replace(/[\s\-().+]/g, "");
                            columnValues[columnId] = {
                                phone: cleanPhone,
                                countryShortName: "US", // Default country — adjust if needed
                            };
                        }
                        break;
                    default:
                        columnValues[columnId] = String(value);
                }
            });

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
            console.log("Variables:", variables);

            const response = await monday.api(mutation, { variables });

            if (response.data && response.data.create_item) {
                console.log("Item created successfully:", response.data.create_item);
                monday.execute("notice", {
                    message: `Item "${response.data.create_item.name}" created successfully!`,
                    type: "success",
                    timeout: 5000,
                });

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
            const columnValues = {};

            Object.keys(recordValues).forEach((columnId) => {
                if (columnId === "name") return;

                const value = recordValues[columnId];
                const columnMeta = getColumnMetadata(columnId);

                if (!columnMeta) return;

                // Skip empty values
                if (value === "" || value === null || value === undefined) {
                    return;
                }

                // Format value based on column type
                switch (columnMeta.type) {
                    case "status":
                        const statusIndex = parseInt(value);
                        if (!isNaN(statusIndex)) {
                            columnValues[columnId] = { index: statusIndex };
                        }
                        break;

                    case "dropdown":
                        const ids = Array.isArray(value) ? value : [value];
                        const validIds = ids.filter((id) => id !== "" && id !== null).map((id) => parseInt(id));
                        if (validIds.length > 0) {
                            columnValues[columnId] = { ids: validIds };
                        }
                        break;

                    case "people":
                        const peopleIds = Array.isArray(value) ? value : [value];
                        const validPeopleIds = peopleIds.filter((id) => id !== "" && id !== null);
                        if (validPeopleIds.length > 0) {
                            columnValues[columnId] = {
                                personsAndTeams: validPeopleIds.map((id) => ({
                                    id: parseInt(id),
                                    kind: "person",
                                })),
                            };
                        }
                        break;

                    case "board_relation":
                        const relationIds = Array.isArray(value) ? value : [value];
                        const validRelationIds = relationIds.filter((id) => id !== "" && id !== null);
                        if (validRelationIds.length > 0) {
                            columnValues[columnId] = {
                                item_ids: validRelationIds.map((id) => parseInt(id)),
                            };
                        }
                        break;

                    case "checkbox":
                        columnValues[columnId] = { checked: value ? "true" : "false" };
                        break;

                    case "date":
                        if (String(value).trim() !== "") {
                            columnValues[columnId] = { date: value };
                        }
                        break;

                    case "numbers":
                        columnValues[columnId] = String(value);
                        break;

                    case "text":
                    case "long_text":
                        columnValues[columnId] = String(value);
                        break;
                    case "email":
                        if (String(value).trim() !== "") {
                            columnValues[columnId] = {
                                email: String(value).trim(),
                                text: String(value).trim(),
                            };
                        }
                        break;

                    case "phone":
                        if (String(value).trim() !== "") {
                            const cleanPhone = String(value).replace(/[\s\-().+]/g, "");
                            columnValues[columnId] = {
                                phone: cleanPhone,
                                countryShortName: "US", // Default country — adjust if needed
                            };
                        }
                        break;
                    default:
                        columnValues[columnId] = String(value);
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

    /**
     * Validate form data before submission
     * @param {Object} formData - The form data to validate
     * @param {Array} validatedSections - Page layout sections with field definitions
     * @param {string} formAction - "create" or "update"
     * @returns {Object} { isValid: boolean, errors: Array }
     */
    const validateForm = (formData, validatedSections, formAction) => {
        const errors = [];

        console.log("=== FORM VALIDATION START ===");
        console.log("Form action:", formAction);
        console.log("Form data:", formData);

        // Collect all fields from validated sections
        const allFields = [];
        validatedSections.forEach((section) => {
            if (section.sectionData && section.sectionData.fields) {
                section.sectionData.fields.forEach((field) => {
                    if (field.isValid && !field.duplicate) {
                        allFields.push(field);
                    }
                });
            }
        });

        // 1. REQUIRED FIELD VALIDATION
        // TODO: Implement required field validation
        // Check if fields marked as isDefault="true" have values
        const requiredFields = allFields.filter((field) => field.isDefault === "true");
        console.log("Required fields:", requiredFields);

        requiredFields.forEach((field) => {
            const value = formData[field.columnId];

            // Check if field is empty
            const isEmpty = value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);

            if (isEmpty) {
                errors.push({
                    type: "REQUIRED_FIELD",
                    field: field.label,
                    columnId: field.columnId,
                    message: `${field.label} is required`,
                });
            }
        });

        // 2. DATA TYPE VALIDATION
        // TODO: Implement data type validation
        // Validate that data types match field types
        allFields.forEach((field) => {
            const value = formData[field.columnId];

            if (value === undefined || value === null || value === "") {
                return; // Skip empty values (handled by required validation)
            }

            const columnMeta = getColumnMetadata(field.columnId);
            if (!columnMeta) return;

            switch (columnMeta.type) {
                case "numbers":
                    // Validate that numbers field contains valid number
                    if (isNaN(value)) {
                        errors.push({
                            type: "INVALID_TYPE",
                            field: field.label,
                            columnId: field.columnId,
                            message: `${field.label} must be a valid number`,
                        });
                    }
                    break;

                case "date":
                    // Validate date format
                    if (value && !isValidDate(value)) {
                        errors.push({
                            type: "INVALID_DATE",
                            field: field.label,
                            columnId: field.columnId,
                            message: `${field.label} must be a valid date`,
                        });
                    }
                    break;

                case "status":
                case "dropdown":
                    // Validate that selected index/id exists
                    // TODO: Check against available options
                    break;

                // Add more type validations as needed
            }
        });

        // 3. BUSINESS LOGIC VALIDATION
        // TODO: Implement custom business rules
        // Examples:
        // - End date must be after start date
        // - Budget must be positive
        // - Email format validation
        // - Phone number format validation

        // Example placeholder:
        if (formData.end_date && formData.start_date) {
            if (new Date(formData.end_date) < new Date(formData.start_date)) {
                errors.push({
                    type: "BUSINESS_RULE",
                    field: "Date Range",
                    message: "End date must be after start date",
                });
            }
        }

        // 4. DUPLICATE VALIDATION
        // TODO: Check for duplicate values in unique fields
        // This would require querying existing items

        // 5. PERMISSION VALIDATION
        // TODO: Check if user has permission to set certain fields
        // Example: Only admins can set certain status values

        console.log("Validation errors:", errors);
        console.log("=== FORM VALIDATION END ===");

        return {
            isValid: errors.length === 0,
            errors: errors,
        };
    };

    /**
     * Helper function to validate date format
     */
    const isValidDate = (dateString) => {
        const date = new Date(dateString);
        return date instanceof Date && !isNaN(date);
    };

    /**
     * Display validation errors to user
     */
    const displayValidationErrors = (errors) => {
        if (errors.length === 0) return;

        // Group errors by type
        const errorsByType = {};
        errors.forEach((error) => {
            if (!errorsByType[error.type]) {
                errorsByType[error.type] = [];
            }
            errorsByType[error.type].push(error);
        });

        // Build error message
        let errorMessage = "Please fix the following errors:\n\n";

        Object.keys(errorsByType).forEach((type) => {
            const typeErrors = errorsByType[type];

            switch (type) {
                case "REQUIRED_FIELD":
                    errorMessage += "Required fields:\n";
                    typeErrors.forEach((err) => {
                        errorMessage += `  • ${err.message}\n`;
                    });
                    errorMessage += "\n";
                    break;

                case "INVALID_TYPE":
                case "INVALID_DATE":
                    errorMessage += "Invalid values:\n";
                    typeErrors.forEach((err) => {
                        errorMessage += `  • ${err.message}\n`;
                    });
                    errorMessage += "\n";
                    break;

                case "BUSINESS_RULE":
                    errorMessage += "Business rules:\n";
                    typeErrors.forEach((err) => {
                        errorMessage += `  • ${err.message}\n`;
                    });
                    errorMessage += "\n";
                    break;
            }
        });

        // Show error notification
        monday.execute("notice", {
            message: errorMessage,
            type: "error",
            timeout: 10000,
        });

        // Also log to console for debugging
        //console.error("Validation failed:", errors);
    };

    /**
     * Get column metadata helper (if not already defined)
     * This should already exist in your code, but included for completeness
     */
    // const getColumnMetadata = (columnId) => {
    //     return boardColumns.find((col) => col.id === columnId);
    // };

    const handleFormSubmit = async (e) => {
        e.preventDefault();

        console.log("Form submitted with data:", formData);
        console.log("Form action:", formAction);

        // ===================================================
        // STEP 1: VALIDATE FORM DATA
        // ===================================================
        const validation = validateForm(formData, validatedSections, formAction);

        if (!validation.isValid) {
            // Show validation errors to user
            displayValidationErrors(validation.errors);

            // Scroll to first error field (optional)
            if (validation.errors.length > 0) {
                const firstErrorField = validation.errors[0].columnId;
                const fieldElement = document.querySelector(`[data-column-id="${firstErrorField}"]`);
                if (fieldElement) {
                    fieldElement.scrollIntoView({ behavior: "smooth", block: "center" });
                }
            }

            return; // Stop submission
        }

        // ===================================================
        // STEP 2: PROCEED WITH CREATE OR UPDATE
        // ===================================================
        if (formAction === "create") {
            const result = await createItem(formData);

            if (result.success) {
                // Optionally refresh the board items list if in update mode
                // This ensures the new item appears in the dropdown
                // fetchBoardItemsForUpdate();
            }
        } else if (formAction === "update" && selectedItemId) {
            const result = await updateItem(selectedItemId, formData);

            if (result.success) {
                // Optionally refresh the item data
                // handleItemSelection({ target: { value: selectedItemId } });
            }
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
                                                <div key={field.id} className="field-wrapper" data-column-id={field.columnId}>
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
};;;

export default App;
