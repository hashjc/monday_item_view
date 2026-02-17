import React from "react";
import { useState, useEffect, useRef } from "react";
import "./App.css";
import mondaySdk from "monday-sdk-js";
import "@vibe/core/tokens";
import { useBoards } from "./hooks/useBoards";
import { usePageLayoutInfo } from "./hooks/pageLayoutService";
import {
    retrieveBoardItems,
    retrieveItemById,
    retrieveBoardItemsByItemName,
    retrieveMultipleBoardItems,
    retrieveMultipleBoardItemsByItemName,
} from "./hooks/items";
import { getBoardColumns } from "./hooks/boardMetadata";
import { getAllUsers, searchUsersByNameOrEmail } from "./hooks/usersAndTeams";

const monday = mondaySdk();

// =============================================================
// PHONE COUNTRIES DATA
// monday.com countryShortName uses ISO 3166-1 alpha-2 codes
// =============================================================
const PHONE_COUNTRIES = [
    { code: "US", name: "United States", dial: "+1", flag: "🇺🇸" },
    { code: "CA", name: "Canada", dial: "+1", flag: "🇨🇦" },
    { code: "GB", name: "United Kingdom", dial: "+44", flag: "🇬🇧" },
    { code: "AU", name: "Australia", dial: "+61", flag: "🇦🇺" },
    { code: "DE", name: "Germany", dial: "+49", flag: "🇩🇪" },
    { code: "FR", name: "France", dial: "+33", flag: "🇫🇷" },
    { code: "IN", name: "India", dial: "+91", flag: "🇮🇳" },
    { code: "BR", name: "Brazil", dial: "+55", flag: "🇧🇷" },
    { code: "MX", name: "Mexico", dial: "+52", flag: "🇲🇽" },
    { code: "JP", name: "Japan", dial: "+81", flag: "🇯🇵" },
    { code: "CN", name: "China", dial: "+86", flag: "🇨🇳" },
    { code: "KR", name: "South Korea", dial: "+82", flag: "🇰🇷" },
    { code: "SG", name: "Singapore", dial: "+65", flag: "🇸🇬" },
    { code: "AE", name: "UAE", dial: "+971", flag: "🇦🇪" },
    { code: "SA", name: "Saudi Arabia", dial: "+966", flag: "🇸🇦" },
    { code: "ZA", name: "South Africa", dial: "+27", flag: "🇿🇦" },
    { code: "NG", name: "Nigeria", dial: "+234", flag: "🇳🇬" },
    { code: "EG", name: "Egypt", dial: "+20", flag: "🇪🇬" },
    { code: "IT", name: "Italy", dial: "+39", flag: "🇮🇹" },
    { code: "ES", name: "Spain", dial: "+34", flag: "🇪🇸" },
    { code: "NL", name: "Netherlands", dial: "+31", flag: "🇳🇱" },
    { code: "SE", name: "Sweden", dial: "+46", flag: "🇸🇪" },
    { code: "NO", name: "Norway", dial: "+47", flag: "🇳🇴" },
    { code: "DK", name: "Denmark", dial: "+45", flag: "🇩🇰" },
    { code: "FI", name: "Finland", dial: "+358", flag: "🇫🇮" },
    { code: "CH", name: "Switzerland", dial: "+41", flag: "🇨🇭" },
    { code: "AT", name: "Austria", dial: "+43", flag: "🇦🇹" },
    { code: "BE", name: "Belgium", dial: "+32", flag: "🇧🇪" },
    { code: "PT", name: "Portugal", dial: "+351", flag: "🇵🇹" },
    { code: "PL", name: "Poland", dial: "+48", flag: "🇵🇱" },
    { code: "RU", name: "Russia", dial: "+7", flag: "🇷🇺" },
    { code: "TR", name: "Turkey", dial: "+90", flag: "🇹🇷" },
    { code: "IL", name: "Israel", dial: "+972", flag: "🇮🇱" },
    { code: "PK", name: "Pakistan", dial: "+92", flag: "🇵🇰" },
    { code: "BD", name: "Bangladesh", dial: "+880", flag: "🇧🇩" },
    { code: "ID", name: "Indonesia", dial: "+62", flag: "🇮🇩" },
    { code: "MY", name: "Malaysia", dial: "+60", flag: "🇲🇾" },
    { code: "PH", name: "Philippines", dial: "+63", flag: "🇵🇭" },
    { code: "TH", name: "Thailand", dial: "+66", flag: "🇹🇭" },
    { code: "VN", name: "Vietnam", dial: "+84", flag: "🇻🇳" },
    { code: "NZ", name: "New Zealand", dial: "+64", flag: "🇳🇿" },
    { code: "AR", name: "Argentina", dial: "+54", flag: "🇦🇷" },
    { code: "CO", name: "Colombia", dial: "+57", flag: "🇨🇴" },
    { code: "CL", name: "Chile", dial: "+56", flag: "🇨🇱" },
    { code: "PE", name: "Peru", dial: "+51", flag: "🇵🇪" },
    { code: "GR", name: "Greece", dial: "+30", flag: "🇬🇷" },
    { code: "CZ", name: "Czech Republic", dial: "+420", flag: "🇨🇿" },
    { code: "HU", name: "Hungary", dial: "+36", flag: "🇭🇺" },
    { code: "RO", name: "Romania", dial: "+40", flag: "🇷🇴" },
    { code: "UA", name: "Ukraine", dial: "+380", flag: "🇺🇦" },
];

// =============================================================
// PhoneInput Component
// Renders: [🇺🇸 ▾] [ number input ]
// Stores in formData as: { phone: "9885551234", countryShortName: "US" }
// =============================================================
const PhoneInput = ({ columnId, value, onChange, label }) => {
    // value is either "" or { phone: "...", countryShortName: "..." }
    const phoneObj = value && typeof value === "object" ? value : { phone: "", countryShortName: "US" };
    const selectedCode = phoneObj.countryShortName || "US";
    const phoneNumber = phoneObj.phone || "";

    const [countrySearch, setCountrySearch] = useState("");
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const dropdownRef = useRef(null);

    const selectedCountry = PHONE_COUNTRIES.find((c) => c.code === selectedCode) || PHONE_COUNTRIES[0];

    const filteredCountries = countrySearch.trim()
        ? PHONE_COUNTRIES.filter(
              (c) =>
                  c.name.toLowerCase().includes(countrySearch.toLowerCase()) ||
                  c.dial.includes(countrySearch) ||
                  c.code.toLowerCase().includes(countrySearch.toLowerCase()),
          )
        : PHONE_COUNTRIES;

    // Close dropdown on outside click
    useEffect(() => {
        const handler = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setDropdownOpen(false);
                setCountrySearch("");
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    const handleCountrySelect = (country) => {
        setDropdownOpen(false);
        setCountrySearch("");
        onChange(columnId, { phone: phoneNumber, countryShortName: country.code });
    };

    const handlePhoneChange = (e) => {
        // Strip non-numeric chars (keep digits only for monday.com)
        const raw = e.target.value.replace(/[^\d\s\-().]/g, "");
        onChange(columnId, { phone: raw, countryShortName: selectedCode });
    };

    return (
        <div className="phone-input-wrapper" ref={dropdownRef}>
            {/* Country selector trigger */}
            <div
                className={`phone-country-trigger ${dropdownOpen ? "open" : ""}`}
                onClick={() => setDropdownOpen((prev) => !prev)}
                title={`${selectedCountry.name} (${selectedCountry.dial})`}
            >
                <span className="phone-flag">{selectedCountry.flag}</span>
                <span className="phone-dial">{selectedCountry.dial}</span>
                <span className="phone-caret">▾</span>
            </div>

            {/* Number input */}
            <input type="tel" className="phone-number-input" value={phoneNumber} onChange={handlePhoneChange} placeholder={`${label || "Phone"} number`} />

            {/* Country dropdown */}
            {dropdownOpen && (
                <div className="phone-country-dropdown">
                    <div className="phone-country-search-wrapper">
                        <input
                            type="text"
                            className="phone-country-search"
                            placeholder="Search country..."
                            value={countrySearch}
                            onChange={(e) => setCountrySearch(e.target.value)}
                            autoFocus
                        />
                    </div>
                    <div className="phone-country-list">
                        {filteredCountries.length === 0 ? (
                            <div className="phone-country-empty">No countries found</div>
                        ) : (
                            filteredCountries.map((country) => (
                                <div
                                    key={country.code}
                                    className={`phone-country-option ${country.code === selectedCode ? "active" : ""}`}
                                    onClick={() => handleCountrySelect(country)}
                                >
                                    <span className="phone-flag">{country.flag}</span>
                                    <span className="phone-country-name">{country.name}</span>
                                    <span className="phone-country-dial">{country.dial}</span>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

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

    const [boardColumns, setBoardColumns] = useState([]);
    const [peopleLookups, setPeopleLookups] = useState({});
    const [relationLookups, setRelationLookups] = useState({});
    const searchTimers = useRef({});

    const [mainItemLookup, setMainItemLookup] = useState({
        items: [],
        loading: false,
        searchTerm: "",
        isOpen: false,
    });

    useEffect(() => {
        monday.execute("valueCreatedForUser");
        monday
            .get("context")
            .then((res) => {
                if (res && res.data) {
                    setContext(res.data);
                    const detectedBoardId =
                        res.data.boardId || (res.data.board && res.data.board.id) || (res.data.selectedBoard && res.data.selectedBoard.id) || null;
                    if (detectedBoardId) {
                        setBoardId(String(detectedBoardId));
                        const nameFromContext = (res.data.board && res.data.board.name) || (res.data.selectedBoard && res.data.selectedBoard.name) || null;
                        if (nameFromContext) setSelectedBoardName(nameFromContext);
                    }
                }
            })
            .catch((err) => console.error("Failed to get monday context:", err));

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

    useEffect(() => {
        if (!boardId) return;
        getBoardColumns(boardId).then((result) => {
            if (result.success) {
                setBoardColumns(result.columns);
                console.log("Board columns loaded:", result.columns);
            }
        });
    }, [boardId]);

    // Close lookups on outside click
    useEffect(() => {
        const handleClickOutside = (event) => {
            // Check if click is outside ANY lookup container
            if (!event.target.closest(".relation-lookup-container")) {
                setRelationLookups((prev) => {
                    const newState = { ...prev };
                    Object.keys(newState).forEach((key) => (newState[key].isOpen = false));
                    return newState;
                });
                setPeopleLookups((prev) => {
                    const newState = { ...prev };
                    Object.keys(newState).forEach((key) => (newState[key].isOpen = false));
                    return newState;
                });
                setMainItemLookup((prev) => ({ ...prev, isOpen: false }));
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    useEffect(() => {
        /*
        const handleScroll = () => {
            setRelationLookups((prev) => {
                const newState = { ...prev };
                Object.keys(newState).forEach((key) => (newState[key].isOpen = false));
                return newState;
            });
        };
        */
        const handleScroll = (event) => {
            if (!event.target || event.target.nodeType !== 1) {
                return;
            }
            // If the scroll is happening inside a relation or people lookup list, DO NOT close it
            if (
                event.target.closest(".relation-lookup-results") ||
                event.target.closest(".phone-country-list") ||
                event.target.closest(".main-item-lookup-results")
            ) {
                return;
            }

            // Close menus if the user scrolls the main board or section
            setRelationLookups((prev) => {
                const newState = { ...prev };
                Object.keys(newState).forEach((key) => (newState[key].isOpen = false));
                return newState;
            });

            setPeopleLookups((prev) => {
                const newState = { ...prev };
                Object.keys(newState).forEach((key) => (newState[key].isOpen = false));
                return newState;
            });

            setMainItemLookup((prev) => ({ ...prev, isOpen: false }));
        };
        window.addEventListener("scroll", handleScroll, true);
        return () => window.removeEventListener("scroll", handleScroll, true);
    }, []);

    const { boards: boardsFromHook } = useBoards();
    const boards = boardsFromHook || [];

    const { items, validatedSections, validationSummary, loading, error } = usePageLayoutInfo(boardId);
    const pageLayoutLoading = loading;
    const pageLayoutError = error;

    const fetchBoardItemsForUpdate = async () => {
        if (!boardId) return;
        setLoadingItems(true);
        setItemsError(null);
        try {
            const result = await retrieveBoardItems(boardId);
            if (result.success) {
                setBoardItems(result.items);
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

    // logic to handle searching for items on the MAIN board
    const handleMainItemSearch = (searchTerm) => {
        setMainItemLookup((prev) => ({ ...prev, searchTerm, loading: true }));

        if (searchTimers.current["main_search"]) clearTimeout(searchTimers.current["main_search"]);

        searchTimers.current["main_search"] = setTimeout(async () => {
            try {
                const result = searchTerm.trim() ? await retrieveBoardItemsByItemName(boardId, searchTerm) : await retrieveBoardItems(boardId);

                setMainItemLookup((prev) => ({
                    ...prev,
                    items: result.success ? result.items : [],
                    loading: false,
                    isOpen: true,
                }));
            } catch (err) {
                setMainItemLookup((prev) => ({ ...prev, loading: false }));
            }
        }, 500);
    };

    // Selection handler for the update record
    const selectUpdateItem = (item) => {
        handleItemSelection({ target: { value: item.id } }); // Trigger existing details fetch
        setMainItemLookup((prev) => ({ ...prev, isOpen: false, searchTerm: "" }));
    };

    const handleFormActionChange = (event) => {
        const action = event.target.value;
        setFormAction(action);
        setSelectedItemId("");
        setSelectedItem(null);
        setFormData({});
        if (action === "update") fetchBoardItemsForUpdate();
    };

    const handleItemSelection = async (event) => {
        const itemId = event.target.value;
        setSelectedItemId(itemId);
        if (!itemId) {
            setSelectedItem(null);
            setFormData({});
            return;
        }
        try {
            const result = await retrieveItemById(itemId);
            if (result.success) {
                console.log("Result ", result);
                setSelectedItem(result.item);
                const itemData = {};
                itemData["name"] = result.item.name;
                result.item.column_values.forEach((col) => {
                    if (col.type === "status" || col.type === "dropdown") {
                        try {
                            const parsed = JSON.parse(col.value);
                            if (col.type === "status") itemData[col.id] = parsed.index || "";
                            else if (col.type === "dropdown") itemData[col.id] = parsed.ids || [];
                        } catch (e) {
                            itemData[col.id] = col.text || "";
                        }
                    } else if (col.type === "people") {
                        try {
                            const parsed = JSON.parse(col.value);
                            itemData[col.id] = parsed.personsAndTeams?.map((p) => parseInt(p.id)) || [];
                        } catch (e) {
                            itemData[col.id] = [];
                        }
                    } else if (col.type === "board_relation") {
                        try {
                            const parsed = JSON.parse(col.value);
                            const linkedItemIds = parsed.linkedPulseIds?.map((id) => parseInt(id.linkedPulseId)) || [];
                            itemData[col.id] = linkedItemIds.length > 0 ? linkedItemIds[0] : "";
                        } catch (e) {
                            itemData[col.id] = "";
                        }
                    } else if (col.type === "phone") {
                        // Parse phone back into { phone, countryShortName } for our PhoneInput
                        try {
                            const parsed = JSON.parse(col.value);
                            itemData[col.id] = {
                                phone: parsed.phone || "",
                                countryShortName: parsed.countryShortName || "US",
                            };
                        } catch (e) {
                            itemData[col.id] = { phone: col.text || "", countryShortName: "US" };
                        }
                    } else {
                        itemData[col.id] = col.text || col.value || "";
                    }
                });
                setFormData(itemData);
            } else {
                setSelectedItem(null);
                setFormData({});
            }
        } catch (error) {
            setSelectedItem(null);
            setFormData({});
        }
    };

    const handleFieldChange = (columnId, value) => {
        setFormData((prev) => ({ ...prev, [columnId]: value }));
    };

    // Returns ALL board IDs linked to a board_relation column (array)
    const getRelatedBoardIds = (columnId) => {
        const column = getColumnMetadata(columnId);
        if (!column || !column.settings_str) return [];
        try {
            const settings = JSON.parse(column.settings_str);
            // boardIds is always an array in Monday's settings_str
            return settings.boardIds && settings.boardIds.length > 0 ? settings.boardIds.map(String) : [];
        } catch (e) {
            console.error("Error parsing board_relation settings:", e);
            return [];
        }
    };

    const loadRelationLookup = async (columnId, relatedBoardIds) => {
        // Only close OTHER open dropdowns — do NOT wipe their items/users cache.
        // The items cache is what lets each trigger display its selected value name.
        setRelationLookups((prev) => {
            const next = { ...prev };
            Object.keys(next).forEach((key) => {
                if (key !== columnId && next[key].isOpen) {
                    next[key] = { ...next[key], isOpen: false };
                }
            });
            return next;
        });
        setPeopleLookups((prev) => {
            const next = { ...prev };
            Object.keys(next).forEach((key) => {
                if (next[key].isOpen) next[key] = { ...next[key], isOpen: false };
            });
            return next;
        });
        setRelationLookups((prev) => ({ ...prev, [columnId]: { ...prev[columnId], loading: true, isOpen: true } }));
        try {
            // Fetch from ALL linked boards in parallel
            const result = await retrieveMultipleBoardItems(relatedBoardIds);
            if (result.success) {
                setRelationLookups((prev) => ({
                    ...prev,
                    [columnId]: {
                        items: result.items, // items tagged with boardId + boardName
                        loading: false,
                        searchTerm: "",
                        isOpen: true,
                        boardNames: result.boardNames,
                        isMultiBoard: relatedBoardIds.length > 1,
                        partialError: result.error, // some boards may have failed
                    },
                }));
            } else {
                setRelationLookups((prev) => ({
                    ...prev,
                    [columnId]: { items: [], loading: false, searchTerm: "", isOpen: true, error: result.error },
                }));
            }
        } catch (error) {
            setRelationLookups((prev) => ({
                ...prev,
                [columnId]: { items: [], loading: false, searchTerm: "", isOpen: true, error: error.message },
            }));
        }
    };

    const handleRelationSearch = (columnId, relatedBoardIds, searchTerm) => {
        setRelationLookups((prev) => ({ ...prev, [columnId]: { ...prev[columnId], searchTerm } }));
        if (searchTimers.current[columnId]) clearTimeout(searchTimers.current[columnId]);
        if (!searchTerm || searchTerm.trim() === "") {
            searchTimers.current[columnId] = setTimeout(async () => {
                const result = await retrieveMultipleBoardItems(relatedBoardIds);
                if (result.success)
                    setRelationLookups((prev) => ({
                        ...prev,
                        [columnId]: { ...prev[columnId], items: result.items, boardNames: result.boardNames, loading: false },
                    }));
            }, 300);
            return;
        }
        searchTimers.current[columnId] = setTimeout(async () => {
            setRelationLookups((prev) => ({ ...prev, [columnId]: { ...prev[columnId], loading: true } }));
            try {
                const result = await retrieveMultipleBoardItemsByItemName(relatedBoardIds, searchTerm);
                setRelationLookups((prev) => ({
                    ...prev,
                    [columnId]: {
                        ...prev[columnId],
                        items: result.success ? result.items : [],
                        boardNames: result.boardNames || {},
                        loading: false,
                        error: result.success ? null : result.error,
                    },
                }));
            } catch (error) {
                setRelationLookups((prev) => ({
                    ...prev,
                    [columnId]: { ...prev[columnId], items: [], loading: false, error: error.message },
                }));
            }
        }, 500);
    };

    const closeRelationLookup = (columnId) => {
        setRelationLookups((prev) => ({ ...prev, [columnId]: { ...prev[columnId], isOpen: false, searchTerm: "" } }));
    };

    const selectRelationItem = (columnId, itemId, itemName) => {
        handleFieldChange(columnId, itemId);
        setRelationLookups((prev) => ({ ...prev, [columnId]: { ...prev[columnId], isOpen: false } }));
    };

    const loadPeopleLookup = async (columnId) => {
        // Only close OTHER open dropdowns — do NOT wipe their items/users cache.
        setRelationLookups((prev) => {
            const next = { ...prev };
            Object.keys(next).forEach((key) => {
                if (next[key].isOpen) next[key] = { ...next[key], isOpen: false };
            });
            return next;
        });
        setPeopleLookups((prev) => {
            const next = { ...prev };
            Object.keys(next).forEach((key) => {
                if (key !== columnId && next[key].isOpen) {
                    next[key] = { ...next[key], isOpen: false };
                }
            });
            return next;
        });
        setPeopleLookups((prev) => ({ ...prev, [columnId]: { ...prev[columnId], loading: true, isOpen: true } }));
        try {
            const result = await getAllUsers();
            if (result.success) {
                setPeopleLookups((prev) => ({ ...prev, [columnId]: { users: result.users, loading: false, searchTerm: "", isOpen: true } }));
            } else {
                setPeopleLookups((prev) => ({ ...prev, [columnId]: { users: [], loading: false, searchTerm: "", isOpen: true, error: result.error } }));
            }
        } catch (error) {
            setPeopleLookups((prev) => ({ ...prev, [columnId]: { users: [], loading: false, searchTerm: "", isOpen: true, error: error.message } }));
        }
    };

    const handlePeopleSearch = (columnId, searchTerm) => {
        setPeopleLookups((prev) => ({ ...prev, [columnId]: { ...prev[columnId], searchTerm } }));
        const timerKey = `people_${columnId}`;
        if (searchTimers.current[timerKey]) clearTimeout(searchTimers.current[timerKey]);
        if (!searchTerm || searchTerm.trim() === "") {
            searchTimers.current[timerKey] = setTimeout(async () => {
                const result = await getAllUsers();
                if (result.success) setPeopleLookups((prev) => ({ ...prev, [columnId]: { ...prev[columnId], users: result.users, loading: false } }));
            }, 300);
            return;
        }
        searchTimers.current[timerKey] = setTimeout(async () => {
            setPeopleLookups((prev) => ({ ...prev, [columnId]: { ...prev[columnId], loading: true } }));
            try {
                const result = await searchUsersByNameOrEmail(searchTerm);
                setPeopleLookups((prev) => ({
                    ...prev,
                    [columnId]: { ...prev[columnId], users: result.success ? result.users : [], loading: false, error: result.success ? null : result.error },
                }));
            } catch (error) {
                setPeopleLookups((prev) => ({ ...prev, [columnId]: { ...prev[columnId], users: [], loading: false, error: error.message } }));
            }
        }, 500);
    };

    const closePeopleLookup = (columnId) => {
        setPeopleLookups((prev) => ({ ...prev, [columnId]: { ...prev[columnId], isOpen: false, searchTerm: "" } }));
    };

    const togglePeopleSelection = (columnId, userId) => {
        const currentValue = formData[columnId] || [];
        const userIdNum = parseInt(userId);
        const newValue = currentValue.includes(userIdNum) ? currentValue.filter((id) => id !== userIdNum) : [...currentValue, userIdNum];
        handleFieldChange(columnId, newValue);
    };

    const clearRelationSelection = (columnId, e) => {
        e.stopPropagation();
        handleFieldChange(columnId, "");
    };

    const clearPeopleSelection = (columnId, e) => {
        e.stopPropagation();
        handleFieldChange(columnId, []);
    };

    const toggleSection = (sectionId) => {
        setCollapsedSections((prev) => ({ ...prev, [sectionId]: !prev[sectionId] }));
    };

    const getColumnMetadata = (columnId) => boardColumns.find((col) => col.id === columnId);

    const getStatusLabels = (columnId) => {
        const column = getColumnMetadata(columnId);
        if (!column || !column.settings_str) return [];
        try {
            const settings = JSON.parse(column.settings_str);
            const labels = settings.labels || {};
            const labelsColors = settings.labels_colors || {};
            return Object.keys(labels).map((index) => ({
                index,
                label: labels[index],
                color: labelsColors[index]?.color || "#ccc",
            }));
        } catch (e) {
            return [];
        }
    };

    const getDropdownLabels = (columnId) => {
        const column = getColumnMetadata(columnId);
        if (!column || !column.settings_str) return [];
        try {
            const settings = JSON.parse(column.settings_str);
            return settings.labels || [];
        } catch (e) {
            return [];
        }
    };

    const renderField = (field) => {
        const value = formData[field.columnId] !== undefined ? formData[field.columnId] : "";
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
                            onChange={(e) =>
                                handleFieldChange(
                                    field.columnId,
                                    Array.from(e.target.selectedOptions).map((opt) => parseInt(opt.value)),
                                )
                            }
                            style={{ ...inputStyle, minHeight: "100px" }}
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
                const selectedUserNames = [];
                if (selectedPeople.length > 0 && lookup.users) {
                    selectedPeople.forEach((userId) => {
                        const found = lookup.users.find((u) => parseInt(u.id) === parseInt(userId));
                        if (found) selectedUserNames.push(found.name);
                    });
                }
                const displayText = selectedUserNames.length > 0 ? selectedUserNames.join(", ") : `-- Select ${field.label} --`;
                return (
                    <div className="relation-lookup-container">
                        <div
                            className={`relation-lookup-trigger ${isOpen ? "open" : ""}`}
                            onClick={() => {
                                if (!isOpen) loadPeopleLookup(field.columnId);
                            }}
                        >
                            <span className={`relation-lookup-trigger-text ${selectedUserNames.length === 0 ? "placeholder" : ""}`}>{displayText}</span>
                            {selectedPeople.length > 0 && (
                                <button
                                    className="relation-lookup-clear-btn"
                                    onClick={(e) => clearPeopleSelection(field.columnId, e)}
                                    title="Clear all"
                                    type="button"
                                >
                                    ×
                                </button>
                            )}
                            <span className="relation-lookup-trigger-icon">{isOpen ? "▲" : "▼"}</span>
                        </div>
                        {isOpen && (
                            <div className="relation-lookup-dropdown">
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
                                <div className="relation-lookup-results">
                                    {lookup.loading && <div className="relation-lookup-loading">Loading users...</div>}
                                    {!lookup.loading && lookup.error && <div className="relation-lookup-error">{lookup.error}</div>}
                                    {!lookup.loading && !lookup.error && lookup.users && lookup.users.length === 0 && (
                                        <div className="relation-lookup-empty">No users found</div>
                                    )}
                                    {!lookup.loading &&
                                        lookup.users &&
                                        lookup.users.length > 0 &&
                                        lookup.users.map((user) => {
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
                                </div>
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

            // =====================================================
            // PHONE: Uses the PhoneInput component with country picker
            // =====================================================
            case "phone":
                return <PhoneInput columnId={field.columnId} value={value} onChange={handleFieldChange} label={field.label} />;

            case "board_relation": {
                const relatedBoardIds = getRelatedBoardIds(field.columnId);
                if (relatedBoardIds.length === 0) return <div style={{ fontSize: "13px", color: "#999" }}>Board relation not configured</div>;
                const lookup = relationLookups[field.columnId] || {};
                const isOpen = lookup.isOpen || false;
                const selectedItemId = value;
                let selectedItemName = "";
                if (selectedItemId && lookup.items) {
                    const found = lookup.items.find((item) => String(item.id) === String(selectedItemId));
                    // Show "Item Name (Board Name)" when multiple boards are linked
                    selectedItemName = found ? (lookup.isMultiBoard ? `${found.name} (${found.boardName})` : found.name) : `Item ${selectedItemId}`;
                }
                // Footer label: one board name or count
                const footerLabel = lookup.isMultiBoard
                    ? `${Object.keys(lookup.boardNames || {}).length} boards`
                    : Object.values(lookup.boardNames || {})[0] || "";

                return (
                    <div className="relation-lookup-container">
                        <div
                            className={`relation-lookup-trigger ${isOpen ? "open" : ""}`}
                            onClick={() => {
                                if (!isOpen) loadRelationLookup(field.columnId, relatedBoardIds);
                            }}
                        >
                            <span className={`relation-lookup-trigger-text ${!selectedItemName ? "placeholder" : ""}`}>
                                {selectedItemName || `-- Select ${field.label} --`}
                            </span>
                            {selectedItemId && (
                                <button
                                    className="relation-lookup-clear-btn"
                                    onClick={(e) => clearRelationSelection(field.columnId, e)}
                                    title="Clear"
                                    type="button"
                                >
                                    ×
                                </button>
                            )}
                            <span className="relation-lookup-trigger-icon">{isOpen ? "▲" : "▼"}</span>
                        </div>
                        {isOpen && (
                            <div className="relation-lookup-dropdown">
                                <div className="relation-lookup-header">
                                    <input
                                        type="text"
                                        className="relation-lookup-search"
                                        placeholder="Search by name..."
                                        value={lookup.searchTerm || ""}
                                        onChange={(e) => handleRelationSearch(field.columnId, relatedBoardIds, e.target.value)}
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
                                <div className="relation-lookup-results">
                                    {lookup.loading && <div className="relation-lookup-loading">Loading...</div>}
                                    {!lookup.loading && lookup.error && !lookup.items?.length && <div className="relation-lookup-error">{lookup.error}</div>}
                                    {!lookup.loading && !lookup.error && lookup.items && lookup.items.length === 0 && (
                                        <div className="relation-lookup-empty">No items found</div>
                                    )}
                                    {!lookup.loading &&
                                        lookup.items &&
                                        lookup.items.length > 0 &&
                                        (() => {
                                            // Group by board when multi-board
                                            if (!lookup.isMultiBoard) {
                                                return lookup.items.map((item) => (
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
                                                ));
                                            }

                                            // Multi-board: group items under board headers
                                            const grouped = {};
                                            lookup.items.forEach((item) => {
                                                const key = item.boardId;
                                                if (!grouped[key]) grouped[key] = { boardName: item.boardName, items: [] };
                                                grouped[key].items.push(item);
                                            });

                                            return Object.entries(grouped).map(([boardId, group]) => (
                                                <div key={boardId}>
                                                    <div className="relation-lookup-board-header">{group.boardName}</div>
                                                    {group.items.map((item) => (
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
                                                </div>
                                            ));
                                        })()}
                                </div>
                                {lookup.items && lookup.items.length > 0 && (
                                    <div className="relation-lookup-footer">
                                        {lookup.items.length} item(s) from {footerLabel}
                                        {lookup.partialError && <span style={{ color: "#e57373", marginLeft: "8px" }}>⚠ Some boards unavailable</span>}
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
                        style={{ ...inputStyle, resize: "vertical" }}
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
                        style={{ ...inputStyle, backgroundColor: "#f5f5f5", cursor: "not-allowed" }}
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

    // =============================================================
    // FORMAT COLUMN VALUE FOR API (shared by create and update)
    // =============================================================
    const formatColumnValue = (columnId, value, columnMeta) => {
        switch (columnMeta.type) {
            case "status": {
                const statusIndex = parseInt(value);
                return !isNaN(statusIndex) ? { index: statusIndex } : null;
            }
            case "dropdown": {
                const ids = Array.isArray(value) ? value : [value];
                const validIds = ids.filter((id) => id !== "" && id !== null).map((id) => parseInt(id));
                return validIds.length > 0 ? { ids: validIds } : null;
            }
            case "people": {
                const peopleIds = Array.isArray(value) ? value : [value];
                const validPeopleIds = peopleIds.filter((id) => id !== "" && id !== null);
                return validPeopleIds.length > 0 ? { personsAndTeams: validPeopleIds.map((id) => ({ id: parseInt(id), kind: "person" })) } : null;
            }
            case "board_relation": {
                const relationIds = Array.isArray(value) ? value : [value];
                const validRelationIds = relationIds.filter((id) => id !== "" && id !== null);
                return validRelationIds.length > 0 ? { item_ids: validRelationIds.map((id) => parseInt(id)) } : null;
            }
            case "checkbox":
                return { checked: value ? "true" : "false" };
            case "date":
                return String(value).trim() !== "" ? { date: value } : null;
            case "numbers":
                return String(value);
            case "text":
            case "long_text":
                return String(value);
            case "email":
                return String(value).trim() !== "" ? { email: String(value).trim(), text: String(value).trim() } : null;
            case "phone": {
                // value is { phone: "...", countryShortName: "..." }
                const phoneObj = value && typeof value === "object" ? value : null;
                if (!phoneObj || !phoneObj.phone || String(phoneObj.phone).trim() === "") return null;
                const cleanPhone = String(phoneObj.phone).replace(/[\s\-().]/g, "");
                return { phone: cleanPhone, countryShortName: phoneObj.countryShortName || "US" };
            }
            default:
                return String(value);
        }
    };

    const createItem = async (recordValues) => {
        try {
            const itemName = recordValues.name || "New Item";
            const columnValues = {};
            Object.keys(recordValues).forEach((columnId) => {
                if (columnId === "name") return;
                const value = recordValues[columnId];
                const columnMeta = getColumnMetadata(columnId);
                if (!columnMeta) return;
                const isEmpty =
                    value === "" || value === null || value === undefined || (typeof value === "object" && !Array.isArray(value) && value.phone === "");
                if (isEmpty) return;
                const formatted = formatColumnValue(columnId, value, columnMeta);
                if (formatted !== null) columnValues[columnId] = formatted;
            });

            const mutation = `mutation($boardId: ID!, $itemName: String!, $columnValues: JSON!) {
                create_item(board_id: $boardId item_name: $itemName column_values: $columnValues) { id name }
            }`;
            const variables = { boardId, itemName, columnValues: JSON.stringify(columnValues) };
            const response = await monday.api(mutation, { variables });

            if (response.data && response.data.create_item) {
                monday.execute("notice", { message: `Item "${response.data.create_item.name}" created successfully!`, type: "success", timeout: 5000 });
                setFormData({});
                return { success: true, item: response.data.create_item };
            } else {
                throw new Error("Failed to create item");
            }
        } catch (error) {
            console.error("Error creating item:", error);
            monday.execute("notice", { message: `Error creating item: ${error.message}`, type: "error", timeout: 5000 });
            return { success: false, error: error.message };
        }
    };

    const updateItem = async (itemId, recordValues) => {
        try {
            const columnValues = {};
            Object.keys(recordValues).forEach((columnId) => {
                if (columnId === "name") return;
                const value = recordValues[columnId];
                const columnMeta = getColumnMetadata(columnId);
                if (!columnMeta) return;
                const isEmpty =
                    value === "" || value === null || value === undefined || (typeof value === "object" && !Array.isArray(value) && value.phone === "");
                if (isEmpty) return;
                const formatted = formatColumnValue(columnId, value, columnMeta);
                if (formatted !== null) columnValues[columnId] = formatted;
            });

            const mutation = `mutation($boardId: ID!, $itemId: ID!, $columnValues: JSON!) {
                change_multiple_column_values(board_id: $boardId item_id: $itemId column_values: $columnValues create_labels_if_missing: false) { id name }
            }`;
            const variables = { boardId, itemId, columnValues: JSON.stringify(columnValues) };
            const response = await monday.api(mutation, { variables });

            if (response.data && response.data.change_multiple_column_values) {
                monday.execute("notice", { message: `Item updated successfully!`, type: "success", timeout: 5000 });
                return { success: true, item: response.data.change_multiple_column_values };
            } else {
                throw new Error("Failed to update item");
            }
        } catch (error) {
            console.error("Error updating item:", error);
            monday.execute("notice", { message: `Error updating item: ${error.message}`, type: "error", timeout: 5000 });
            return { success: false, error: error.message };
        }
    };

    const validateForm = (formData, validatedSections, formAction) => {
        const errors = [];
        const allFields = [];
        validatedSections.forEach((section) => {
            if (section.sectionData && section.sectionData.fields) {
                section.sectionData.fields.forEach((field) => {
                    if (field.isValid && !field.duplicate) allFields.push(field);
                });
            }
        });

        // Required fields
        allFields
            .filter((f) => f.isDefault === "true")
            .forEach((field) => {
                const value = formData[field.columnId];
                const isEmpty = value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
                if (isEmpty) errors.push({ type: "REQUIRED_FIELD", field: field.label, columnId: field.columnId, message: `${field.label} is required` });
            });

        // Type validation
        allFields.forEach((field) => {
            const value = formData[field.columnId];
            if (value === undefined || value === null || value === "") return;
            const columnMeta = getColumnMetadata(field.columnId);
            if (!columnMeta) return;
            if (columnMeta.type === "numbers" && isNaN(value)) {
                errors.push({ type: "INVALID_TYPE", field: field.label, columnId: field.columnId, message: `${field.label} must be a valid number` });
            }
            if (columnMeta.type === "date" && value && !(new Date(value) instanceof Date && !isNaN(new Date(value)))) {
                errors.push({ type: "INVALID_DATE", field: field.label, columnId: field.columnId, message: `${field.label} must be a valid date` });
            }
        });

        return { isValid: errors.length === 0, errors };
    };

    const displayValidationErrors = (errors) => {
        if (errors.length === 0) return;
        const errorsByType = {};
        errors.forEach((e) => {
            if (!errorsByType[e.type]) errorsByType[e.type] = [];
            errorsByType[e.type].push(e);
        });
        let errorMessage = "Please fix the following errors:\n\n";
        Object.keys(errorsByType).forEach((type) => {
            const label = type === "REQUIRED_FIELD" ? "Required fields:" : "Invalid values:";
            errorMessage += `${label}\n`;
            errorsByType[type].forEach((err) => {
                errorMessage += `  • ${err.message}\n`;
            });
            errorMessage += "\n";
        });
        monday.execute("notice", { message: errorMessage, type: "error", timeout: 10000 });
    };

    const handleFormSubmit = async (e) => {
        e.preventDefault();
        const validation = validateForm(formData, validatedSections, formAction);
        if (!validation.isValid) {
            displayValidationErrors(validation.errors);
            if (validation.errors.length > 0) {
                const firstErrorField = validation.errors[0].columnId;
                const fieldElement = document.querySelector(`[data-column-id="${firstErrorField}"]`);
                if (fieldElement) fieldElement.scrollIntoView({ behavior: "smooth", block: "center" });
            }
            return;
        }
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
                    <p>No valid sections found.</p>
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
                        const validFields = section.sectionData.fields.filter((f) => f.isValid === true && f.duplicate === false);
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
                                    <div className="relation-lookup-container" style={{ maxWidth: "500px" }}>
                                        {/* Lookup Trigger */}
                                        <div
                                            className={`relation-lookup-trigger ${mainItemLookup.isOpen ? "open" : ""}`}
                                            onClick={() => {
                                                if (!mainItemLookup.isOpen) handleMainItemSearch("");
                                            }}
                                        >
                                            <span className={`relation-lookup-trigger-text ${!selectedItem ? "placeholder" : ""}`}>
                                                {selectedItem ? selectedItem.name : "Search for an item..."}
                                            </span>
                                            <span className="relation-lookup-trigger-icon">{mainItemLookup.isOpen ? "▲" : "▼"}</span>
                                        </div>

                                        {/* Lookup Dropdown */}
                                        {mainItemLookup.isOpen && (
                                            <div className="relation-lookup-dropdown">
                                                <div className="relation-lookup-header">
                                                    <input
                                                        type="text"
                                                        className="relation-lookup-search"
                                                        placeholder="Type to search items..."
                                                        value={mainItemLookup.searchTerm}
                                                        onChange={(e) => handleMainItemSearch(e.target.value)}
                                                        autoFocus
                                                    />
                                                    <button
                                                        className="relation-lookup-close-btn"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setMainItemLookup((prev) => ({ ...prev, isOpen: false }));
                                                        }}
                                                    >
                                                        Close
                                                    </button>
                                                </div>
                                                <div className="relation-lookup-results">
                                                    {mainItemLookup.loading && <div className="relation-lookup-loading">Searching...</div>}
                                                    {!mainItemLookup.loading && mainItemLookup.items.length === 0 && (
                                                        <div className="relation-lookup-empty">No matching items found</div>
                                                    )}
                                                    {mainItemLookup.items.map((item) => (
                                                        <div
                                                            key={item.id}
                                                            className={`relation-lookup-item ${selectedItemId === item.id ? "selected" : ""}`}
                                                            onClick={() => selectUpdateItem(item)}
                                                        >
                                                            <div className="relation-lookup-item-name">{item.name}</div>
                                                            <div className="relation-lookup-item-id">ID: {item.id}</div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
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
