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
import { getUsersProfileName } from "./hooks/userProfiles";
import { filterVisibleSections } from "./hooks/sectionVisibility";
import { computeFieldVisibility } from "./layoutControls/fieldVisibility";   // field-level visibility
import { validateVisibleFields } from "./layoutControls/fieldValidation";    // field-level validation
import RelatedLists from "./components/RelatedLists";

const monday = mondaySdk();

// =============================================================
// PHONE COUNTRIES DATA
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
// =============================================================
const PhoneInput = ({ columnId, value, onChange, label }) => {
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
        const raw = e.target.value.replace(/[^\d\s\-().]/g, "");
        onChange(columnId, { phone: raw, countryShortName: selectedCode });
    };

    return (
        <div className="phone-input-wrapper" ref={dropdownRef}>
            <div
                className={`phone-country-trigger ${dropdownOpen ? "open" : ""}`}
                onClick={() => setDropdownOpen((prev) => !prev)}
                title={`${selectedCountry.name} (${selectedCountry.dial})`}
            >
                <span className="phone-flag">{selectedCountry.flag}</span>
                <span className="phone-dial">{selectedCountry.dial}</span>
                <span className="phone-caret">▾</span>
            </div>
            <input type="tel" className="phone-number-input" value={phoneNumber} onChange={handlePhoneChange} placeholder={`${label || "Phone"} number`} />
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

// =============================================================
// RecordPill Component
// =============================================================
const RecordPill = ({ label, onRemove }) => (
    <div className="selected-record-pill">
        <span className="pill-text">{label}</span>
        <button
            className="pill-remove-btn"
            onClick={(e) => {
                e.stopPropagation();
                onRemove();
            }}
        >
            ×
        </button>
    </div>
);

// =============================================================
// FileUpload Component
// =============================================================
const FileUpload = ({ columnId, value, onChange, field, isUpdate }) => {
    const maxFiles = field.maxFiles ? parseInt(field.maxFiles) : null;
    const fileInputRef = React.useRef(null);

    const existingFiles = isUpdate ? value?.existingFiles || [] : [];
    const newFiles = isUpdate ? value?.newFiles || [] : Array.isArray(value) ? value : [];
    const totalCount = existingFiles.length + newFiles.length;

    const handleFileAdd = (e) => {
        const selected = Array.from(e.target.files || []);
        if (!selected.length) return;
        const remaining = maxFiles ? maxFiles - totalCount : Infinity;
        if (remaining <= 0) { alert(`Maximum ${maxFiles} file(s) allowed.`); e.target.value = ""; return; }
        const toAdd = selected.slice(0, remaining);
        if (selected.length > remaining) alert(`Only ${remaining} more file(s) can be added (max ${maxFiles}).`);
        if (isUpdate) onChange(columnId, { existingFiles, newFiles: [...newFiles, ...toAdd] });
        else onChange(columnId, [...newFiles, ...toAdd]);
        e.target.value = "";
    };

    const removeNewFile = (index) => {
        const updated = newFiles.filter((_, i) => i !== index);
        if (isUpdate) onChange(columnId, { existingFiles, newFiles: updated });
        else onChange(columnId, updated);
    };

    const atLimit = maxFiles !== null && totalCount >= maxFiles;

    return (
        <div className="file-upload-wrapper">
            {existingFiles.length > 0 && (
                <div className="file-list existing-files">
                    <div className="file-list-label">Existing files (cannot be deleted via API):</div>
                    {existingFiles.map((f, i) => (
                        <div key={i} className="file-pill existing">
                            <span className="file-pill-icon">📎</span>
                            <a href={f.url} target="_blank" rel="noopener noreferrer" className="file-pill-name" title={f.name}>{f.name}</a>
                        </div>
                    ))}
                </div>
            )}
            {newFiles.length > 0 && (
                <div className="file-list new-files">
                    {isUpdate && <div className="file-list-label">New files to upload:</div>}
                    {newFiles.map((f, i) => (
                        <div key={i} className="file-pill new">
                            <span className="file-pill-icon">📄</span>
                            <span className="file-pill-name" title={f.name}>{f.name}</span>
                            <span className="file-pill-size">({(f.size / 1024).toFixed(1)} KB)</span>
                            <button type="button" className="file-pill-remove" onClick={() => removeNewFile(i)} title="Remove file">×</button>
                        </div>
                    ))}
                </div>
            )}
            {!atLimit && (
                <button type="button" className="file-upload-btn" onClick={() => fileInputRef.current?.click()}>
                    <span>📎</span>
                    <span>{newFiles.length > 0 ? "Add more files" : "Attach files"}</span>
                    {maxFiles && <span className="file-upload-limit">({totalCount}/{maxFiles})</span>}
                </button>
            )}
            {atLimit && <div className="file-upload-limit-msg">Maximum {maxFiles} file(s) reached.</div>}
            <input ref={fileInputRef} type="file" multiple style={{ display: "none" }} onChange={handleFileAdd} />
        </div>
    );
};

// =============================================================
// App
// =============================================================
// =============================================================
// FallbackForm — minimal name-only form shown when PLS config is
// missing or unparseable. Supports both create and update modes.
// The "name" field is always the item name column in monday.com.
// Stored here (not in a separate file) so it stays self-contained.
// =============================================================
const FallbackForm = ({
    formAction, onFormActionChange,
    selectedItem, selectedItemId, isItemViewMode,
    formData, setFormData,
    boardId, selectedBoardName,
    mainItemLookup, setMainItemLookup, handleMainItemLookupSearch,
    selectUpdateItem, itemsError,
    monday, createItem, updateItem,
}) => {
    const name = formData["name"] || "";

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!name.trim()) {
            monday.execute("notice", { message: "Item name is required.", type: "error", timeout: 4000 });
            return;
        }
        if (formAction === "create") {
            await createItem({ name });
        } else if (formAction === "update" && selectedItemId) {
            await updateItem(selectedItemId, { name });
        }
    };

    const inputStyle = { padding: "8px 12px", width: "100%", borderRadius: "4px", border: "1px solid #ccc", fontSize: "14px", fontFamily: "inherit" };

    return (
        <div className="main-content">
            {/* Action selector — hidden in item view mode */}
            {!isItemViewMode && (
                <div className="action-selector">
                    <h3>Select Action:</h3>
                    <div className="radio-group">
                        <label className="radio-label">
                            <input type="radio" name="fallbackFormAction" value="create" checked={formAction === "create"} onChange={onFormActionChange} />
                            <span>Create New Record</span>
                        </label>
                        <label className="radio-label">
                            <input type="radio" name="fallbackFormAction" value="update" checked={formAction === "update"} onChange={onFormActionChange} />
                            <span>Update Existing Record</span>
                        </label>
                    </div>
                </div>
            )}

            {/* Item lookup — update mode only */}
            {!isItemViewMode && formAction === "update" && (
                <div className="item-selector">
                    <h3>Select Item to Update:</h3>
                    <div className="relation-lookup-container" style={{ maxWidth: "500px" }}>
                        <div
                            className={`relation-lookup-trigger ${mainItemLookup.isOpen ? "open" : ""}`}
                            onClick={() => { if (!mainItemLookup.isOpen) handleMainItemLookupSearch(""); }}
                        >
                            <span className={`relation-lookup-trigger-text ${!selectedItem ? "placeholder" : ""}`}>
                                {selectedItem ? selectedItem.name : "-- Search for a record --"}
                            </span>
                            {selectedItemId && (
                                <button
                                    className="relation-lookup-clear-btn"
                                    onClick={(e) => { e.stopPropagation(); setFormData({}); }}
                                    title="Clear selection" type="button"
                                >×</button>
                            )}
                            <span className="relation-lookup-trigger-icon">{mainItemLookup.isOpen ? "▲" : "▼"}</span>
                        </div>
                        {mainItemLookup.isOpen && (
                            <div className="relation-lookup-dropdown">
                                <div className="relation-lookup-header">
                                    <input
                                        type="text"
                                        className="relation-lookup-search"
                                        placeholder="Type to search items..."
                                        value={mainItemLookup.searchTerm || ""}
                                        onChange={(e) => handleMainItemLookupSearch(e.target.value)}
                                        autoFocus
                                    />
                                    <button className="relation-lookup-close-btn" onClick={(e) => { e.stopPropagation(); setMainItemLookup((p) => ({ ...p, isOpen: false })); }}>Close</button>
                                </div>
                                <div className="relation-lookup-results main-item-lookup-results">
                                    {mainItemLookup.loading && <div className="relation-lookup-loading">Searching board...</div>}
                                    {!mainItemLookup.loading && mainItemLookup.items?.length === 0 && <div className="relation-lookup-empty">No records match your search</div>}
                                    {!mainItemLookup.loading && mainItemLookup.items?.map((item) => (
                                        <div
                                            key={item.id}
                                            className={`relation-lookup-item ${String(selectedItemId) === String(item.id) ? "selected" : ""}`}
                                            onClick={() => selectUpdateItem(item)}
                                        >
                                            <div className="relation-lookup-item-name">{item.name}</div>
                                            <div className="relation-lookup-item-id">ID: {item.id}</div>
                                        </div>
                                    ))}
                                </div>
                                <div className="relation-lookup-footer">{mainItemLookup.items?.length || 0} records found in {selectedBoardName}</div>
                            </div>
                        )}
                    </div>
                    {itemsError && <div className="error-inline"><p>{itemsError}</p></div>}
                </div>
            )}

            {/* The fallback form itself — name field only */}
            {(formAction === "create" || (formAction === "update" && selectedItemId) || isItemViewMode) && (
                <div className="form-container">
                    {formAction === "update" && selectedItem && !isItemViewMode && (
                        <div className="editing-banner">
                            <p>✏️ Editing: <strong>{selectedItem.name}</strong> (ID: {selectedItem.id})</p>
                        </div>
                    )}
                    <form onSubmit={handleSubmit}>
                        <div className="section-container">
                            <div className="section-header">
                                <h3>Item Details <span className="field-count">(1 field)</span></h3>
                            </div>
                            <div className="section-content">
                                <div className="fields-grid">
                                    <div className="field-wrapper" data-column-id="name">
                                        <label className="field-label">
                                            Name <span className="required-asterisk">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            value={name}
                                            onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                                            placeholder="Enter item name"
                                            style={inputStyle}
                                        />
                                        <div className="field-type-hint">Type: name</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="form-actions">
                            <button type="submit" className="btn-primary">
                                {formAction === "create" ? "✓ Create Item" : "✓ Update Item"}
                            </button>
                            {formAction === "create" && (
                                <button type="button" onClick={() => setFormData({})} className="btn-secondary">Clear Form</button>
                            )}
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
};

const App = () => {
    console.log("App start");

    // ── Core context state ──────────────────────────────────────
    const [context, setContext] = useState();
    const [boardId, setBoardId] = useState(null);
    const [itemId, setItemId] = useState(null);
    const [selectedBoardName, setSelectedBoardName] = useState("");
    const [formAction, setFormAction] = useState("create");

    // ── Item selection ──────────────────────────────────────────
    const [boardItems, setBoardItems] = useState([]);
    const [loadingItems, setLoadingItems] = useState(false);
    const [itemsError, setItemsError] = useState(null);
    const [selectedItemId, setSelectedItemId] = useState("");
    const [selectedItem, setSelectedItem] = useState(null);

    // ── Form state ──────────────────────────────────────────────
    const [formData, setFormData] = useState({});
    const [collapsedSections, setCollapsedSections] = useState({});

    // ── Board metadata ──────────────────────────────────────────
    const [boardColumns, setBoardColumns] = useState([]);
    const [peopleLookups, setPeopleLookups] = useState({});
    const [relationLookups, setRelationLookups] = useState({});
    const searchTimers = useRef({});

    // ── Submit state ────────────────────────────────────────────
    const [submitting, setSubmitting] = useState(false);
    const [submitStatus, setSubmitStatus] = useState(null);

    // ── Main item lookup (board view update mode) ───────────────
    const [mainItemLookup, setMainItemLookup] = useState({
        items: [],
        loading: false,
        searchTerm: "",
        isOpen: false,
    });

    // ── User profile state (NEW) ────────────────────────────────
    // null  = not yet fetched
    // ""    = fetched but user has no profile assigned (treated as blank)
    // "xyz" = the actual profile string
    const [userProfile, setUserProfile] = useState(null);
    const [userProfileLoading, setUserProfileLoading] = useState(true);

    // ── Hooks (declared before any useEffect that references them) ──
    const { boards: boardsFromHook } = useBoards();
    const boards = boardsFromHook || [];
    const { items, validatedSections, validationSummary, validatedChildBoards, validationError, loading, error } = usePageLayoutInfo(boardId);
    const pageLayoutLoading = loading;
    const pageLayoutError = error;

    // ── Derived: sections visible to this user ───────────────────
    // While userProfile is still loading (null) we don't filter yet — avoids
    // a flash of "no sections" before the profile arrives.
    const visibleSections = userProfile === null
        ? validatedSections  // still loading — show all to avoid flicker
        : filterVisibleSections(validatedSections, userProfile);

    // ── Derived: field-level visibility map ─────────────────────
    // Recomputed on every formData change (React re-render).
    // Result: { [columnId]: boolean }  — true = show, false = hide
    //
    // SEPARATE from section visibility:
    //   sectionVisibility  = profile-based,     static per session
    //   fieldVisibilityMap = form-value-based,  changes as user types
    //
    // Two-pass algorithm handles chained dependencies (field A depends on
    // field B which itself has a visibility rule) without infinite loops.
    const fieldVisibilityMap = computeFieldVisibility(visibleSections, formData, boardColumns);

    // =============================================================
    // EFFECT: Get monday context (boardId, itemId)
    // =============================================================
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
                    const detectedItemId = res.data.itemId || null;
                    if (detectedItemId) setItemId(String(detectedItemId));
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
                const updatedItemId = res.data.itemId || null;
                if (updatedItemId) setItemId(String(updatedItemId));
            }
        });
    }, []);

    // =============================================================
    // EFFECT: Fetch current user's profile from the Users board (NEW)
    // Runs once we have the monday context (which gives us the userId).
    // =============================================================
    useEffect(() => {
        if (!context) return; // wait for context

        const userId = context.user?.id || context.userId || null;
        if (!userId) {
            // No userId available — treat as blank profile, show all sections
            console.warn("[App] Could not detect current userId from context. All sections will be shown.");
            setUserProfile("");
            setUserProfileLoading(false);
            return;
        }

        setUserProfileLoading(true);
        getUsersProfileName(userId)
            .then((profile) => {
                // Normalise null/undefined → "" so rule engine treats them as blank
                const normProfile = (profile === null || profile === undefined) ? "" : String(profile).trim();
                console.log(`[App] User ${userId} profile: "${normProfile || "(blank)"}"`);
                setUserProfile(normProfile);
            })
            .catch((err) => {
                console.error("[App] Failed to fetch user profile:", err);
                setUserProfile(""); // fail-open: show all sections
            })
            .finally(() => setUserProfileLoading(false));
    }, [context]);

    // =============================================================
    // EFFECT: Load board columns when boardId changes
    // =============================================================
    useEffect(() => {
        if (!boardId) return;
        getBoardColumns(boardId).then((result) => {
            if (result.success) {
                setBoardColumns(result.columns);
                console.log("Board columns loaded:", result.columns);
            }
        });
    }, [boardId]);

    // =============================================================
    // EFFECT: Item view auto-load
    // =============================================================
    useEffect(() => {
        if (!itemId) return;
        if (!validatedSections || validatedSections.length === 0) return;
        if (pageLayoutLoading) return;

        console.log("[ItemView] Auto-loading item:", itemId);
        setFormAction("update");
        handleItemSelection({ target: { value: itemId } });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [itemId, validatedSections, pageLayoutLoading]);

    // =============================================================
    // EFFECT: Close lookups on outside click
    // =============================================================
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (!event.target.closest(".relation-lookup-container")) {
                setRelationLookups((prev) => { const s = { ...prev }; Object.keys(s).forEach((k) => (s[k].isOpen = false)); return s; });
                setPeopleLookups((prev) => { const s = { ...prev }; Object.keys(s).forEach((k) => (s[k].isOpen = false)); return s; });
                setMainItemLookup((prev) => ({ ...prev, isOpen: false }));
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // =============================================================
    // EFFECT: Close lookups on scroll
    // =============================================================
    useEffect(() => {
        const handleScroll = (event) => {
            if (!event.target || event.target.nodeType !== 1) return;
            if (
                event.target.closest(".relation-lookup-results") ||
                event.target.closest(".phone-country-list") ||
                event.target.closest(".main-item-lookup-results")
            ) return;
            setRelationLookups((prev) => { const s = { ...prev }; Object.keys(s).forEach((k) => (s[k].isOpen = false)); return s; });
            setPeopleLookups((prev) => { const s = { ...prev }; Object.keys(s).forEach((k) => (s[k].isOpen = false)); return s; });
            setMainItemLookup((prev) => ({ ...prev, isOpen: false }));
        };
        window.addEventListener("scroll", handleScroll, true);
        return () => window.removeEventListener("scroll", handleScroll, true);
    }, []);

    // =============================================================
    // Board items (update mode)
    // =============================================================
    const fetchBoardItemsForUpdate = async () => {
        if (!boardId) return;
        setLoadingItems(true);
        setItemsError(null);
        try {
            const result = await retrieveBoardItems(boardId);
            if (result.success) setBoardItems(result.items);
            else { setItemsError(result.error); setBoardItems([]); }
        } catch (error) {
            setItemsError(error.message || "Failed to load items");
            setBoardItems([]);
        } finally {
            setLoadingItems(false);
        }
    };

    const handleMainItemLookupSearch = (searchTerm) => {
        setMainItemLookup((prev) => ({ ...prev, searchTerm, loading: true }));
        if (searchTimers.current["main_update"]) clearTimeout(searchTimers.current["main_update"]);
        searchTimers.current["main_update"] = setTimeout(async () => {
            try {
                const result = searchTerm.trim() ? await retrieveBoardItemsByItemName(boardId, searchTerm) : await retrieveBoardItems(boardId);
                setMainItemLookup((prev) => ({ ...prev, items: result.success ? result.items : [], loading: false, isOpen: true }));
            } catch (err) {
                setMainItemLookup((prev) => ({ ...prev, loading: false }));
            }
        }, 500);
    };

    const selectUpdateItem = (item) => {
        handleItemSelection({ target: { value: item.id } });
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
        if (!itemId) { setSelectedItem(null); setFormData({}); return; }
        try {
            const result = await retrieveItemById(itemId);
            if (result.success) {
                setSelectedItem(result.item);
                const itemData = {};
                itemData["name"] = result.item.name;
                result.item.column_values.forEach((col) => {
                    if (col.type === "people" || col.type === "board_relation") {
                        try {
                            const parsed = JSON.parse(col.value);
                            if (col.type === "people") {
                                itemData[col.id] = parsed.personsAndTeams?.map((p) => ({
                                    id: parseInt(p.id),
                                    name: col.text.split(", ")[parsed.personsAndTeams.indexOf(p)],
                                    photo: null,
                                })) || [];
                            } else if (col.type === "board_relation") {
                                const ids = col.linked_item_ids || [];
                                const names = (col.display_value || "").split(", ").map((n) => n.trim());
                                itemData[col.id] = ids.map((id, index) => ({ id, name: names[index] || `Item ${id}` }));
                            }
                        } catch (e) { itemData[col.id] = []; }
                    } else if (col.type === "status" || col.type === "dropdown") {
                        try {
                            const parsed = JSON.parse(col.value);
                            if (col.type === "status") itemData[col.id] = parsed.index || "";
                            else itemData[col.id] = parsed.ids || [];
                        } catch (e) { itemData[col.id] = col.text || ""; }
                    } else if (col.type === "phone") {
                        try {
                            const parsed = JSON.parse(col.value);
                            itemData[col.id] = { phone: parsed.phone || "", countryShortName: parsed.countryShortName || "US" };
                        } catch (e) { itemData[col.id] = { phone: col.text || "", countryShortName: "US" }; }
                    } else if (col.type === "checkbox") {
                        itemData[col.id] = col.text === "v" || col.text === "true";
                    } else if (col.type === "link") {
                        try {
                            const parsed = JSON.parse(col.value);
                            itemData[col.id] = { url: parsed.url || "", text: parsed.text || "" };
                        } catch (_) { itemData[col.id] = { url: col.text || "", text: col.text || "" }; }
                    } else if (col.type === "file") {
                        try {
                            const parsed = JSON.parse(col.value);
                            const urls = (col.text || "").split(", ").map((u) => u.trim());
                            itemData[col.id] = {
                                existingFiles: (parsed.files || []).map((f, i) => ({ name: f.name, assetId: f.assetId, url: urls[i] || "" })),
                                newFiles: [],
                            };
                        } catch (_) { itemData[col.id] = { existingFiles: [], newFiles: [] }; }
                    } else if (col.type === "timerange" || col.type === "timeline") {
                        // timeline stores { from: "YYYY-MM-DD", to: "YYYY-MM-DD" }
                        try {
                            const parsed = JSON.parse(col.value);
                            itemData[col.id] = {
                                from: parsed.from || parsed.start_date || "",
                                to:   parsed.to   || parsed.end_date   || "",
                            };
                        } catch (_) { itemData[col.id] = { from: "", to: "" }; }
                    } else if (col.type === "doc") {
                        // doc stores a files array; extract first doc's name + linkToFile
                        try {
                            const parsed = JSON.parse(col.value);
                            const files = parsed.files || [];
                            itemData[col.id] = files.length > 0
                                ? { name: files[0].name || "Monday Doc", linkToFile: files[0].linkToFile || null }
                                : null;
                        } catch (_) { itemData[col.id] = null; }
                    } else {
                        itemData[col.id] = col.text || col.value || "";
                    }
                });
                setFormData(itemData);
            } else { setSelectedItem(null); setFormData({}); }
        } catch (error) { setSelectedItem(null); setFormData({}); }
    };

    const handleFieldChange = (columnId, value) => {
        setFormData((prev) => ({ ...prev, [columnId]: value }));
    };

    const getRelatedBoardIds = (columnId) => {
        const column = getColumnMetadata(columnId);
        if (!column || !column.settings_str) return [];
        try {
            const settings = JSON.parse(column.settings_str);
            return settings.boardIds && settings.boardIds.length > 0 ? settings.boardIds.map(String) : [];
        } catch (e) { return []; }
    };

    const loadRelationLookup = async (columnId, relatedBoardIds) => {
        setRelationLookups((prev) => { const n = { ...prev }; Object.keys(n).forEach((k) => { if (k !== columnId && n[k].isOpen) n[k] = { ...n[k], isOpen: false }; }); return n; });
        setPeopleLookups((prev) => { const n = { ...prev }; Object.keys(n).forEach((k) => { if (n[k].isOpen) n[k] = { ...n[k], isOpen: false }; }); return n; });
        setRelationLookups((prev) => ({ ...prev, [columnId]: { ...prev[columnId], loading: true, isOpen: true } }));
        try {
            const result = await retrieveMultipleBoardItems(relatedBoardIds);
            if (result.success) {
                setRelationLookups((prev) => ({ ...prev, [columnId]: { items: result.items, loading: false, searchTerm: "", isOpen: true, boardNames: result.boardNames, isMultiBoard: relatedBoardIds.length > 1, partialError: result.error } }));
            } else {
                setRelationLookups((prev) => ({ ...prev, [columnId]: { items: [], loading: false, searchTerm: "", isOpen: true, error: result.error } }));
            }
        } catch (error) {
            setRelationLookups((prev) => ({ ...prev, [columnId]: { items: [], loading: false, searchTerm: "", isOpen: true, error: error.message } }));
        }
    };

    const handleRelationSearch = (columnId, relatedBoardIds, searchTerm) => {
        setRelationLookups((prev) => ({ ...prev, [columnId]: { ...prev[columnId], searchTerm } }));
        if (searchTimers.current[columnId]) clearTimeout(searchTimers.current[columnId]);
        if (!searchTerm || searchTerm.trim() === "") {
            searchTimers.current[columnId] = setTimeout(async () => {
                const result = await retrieveMultipleBoardItems(relatedBoardIds);
                if (result.success) setRelationLookups((prev) => ({ ...prev, [columnId]: { ...prev[columnId], items: result.items, boardNames: result.boardNames, loading: false } }));
            }, 300);
            return;
        }
        searchTimers.current[columnId] = setTimeout(async () => {
            setRelationLookups((prev) => ({ ...prev, [columnId]: { ...prev[columnId], loading: true } }));
            try {
                const result = await retrieveMultipleBoardItemsByItemName(relatedBoardIds, searchTerm);
                setRelationLookups((prev) => ({ ...prev, [columnId]: { ...prev[columnId], items: result.success ? result.items : [], boardNames: result.boardNames || {}, loading: false, error: result.success ? null : result.error } }));
            } catch (error) {
                setRelationLookups((prev) => ({ ...prev, [columnId]: { ...prev[columnId], items: [], loading: false, error: error.message } }));
            }
        }, 500);
    };

    const closeRelationLookup = (columnId) => {
        setRelationLookups((prev) => ({ ...prev, [columnId]: { ...prev[columnId], isOpen: false, searchTerm: "" } }));
    };

    const loadPeopleLookup = async (columnId) => {
        setRelationLookups((prev) => { const n = { ...prev }; Object.keys(n).forEach((k) => { if (n[k].isOpen) n[k] = { ...n[k], isOpen: false }; }); return n; });
        setPeopleLookups((prev) => { const n = { ...prev }; Object.keys(n).forEach((k) => { if (k !== columnId && n[k].isOpen) n[k] = { ...n[k], isOpen: false }; }); return n; });
        setPeopleLookups((prev) => ({ ...prev, [columnId]: { ...prev[columnId], loading: true, isOpen: true } }));
        try {
            const result = await getAllUsers();
            if (result.success) setPeopleLookups((prev) => ({ ...prev, [columnId]: { users: result.users, loading: false, searchTerm: "", isOpen: true } }));
            else setPeopleLookups((prev) => ({ ...prev, [columnId]: { users: [], loading: false, searchTerm: "", isOpen: true, error: result.error } }));
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
                setPeopleLookups((prev) => ({ ...prev, [columnId]: { ...prev[columnId], users: result.success ? result.users : [], loading: false, error: result.success ? null : result.error } }));
            } catch (error) {
                setPeopleLookups((prev) => ({ ...prev, [columnId]: { ...prev[columnId], users: [], loading: false, error: error.message } }));
            }
        }, 500);
    };

    const closePeopleLookup = (columnId) => {
        setPeopleLookups((prev) => ({ ...prev, [columnId]: { ...prev[columnId], isOpen: false, searchTerm: "" } }));
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
            return Object.keys(labels).map((index) => ({ index, label: labels[index], color: labelsColors[index]?.color || "#ccc" }));
        } catch (e) { return []; }
    };

    const getDropdownLabels = (columnId) => {
        const column = getColumnMetadata(columnId);
        if (!column || !column.settings_str) return [];
        try {
            const settings = JSON.parse(column.settings_str);
            return settings.labels || [];
        } catch (e) { return []; }
    };

    // =============================================================
    // RENDER FIELD
    // =============================================================
    const renderField = (field) => {
        const value = formData[field.columnId] !== undefined ? formData[field.columnId] : "";
        const columnMetadata = getColumnMetadata(field.columnId);

        const inputStyle = { padding: "8px 12px", width: "100%", borderRadius: "4px", border: "1px solid #ccc", fontSize: "14px", fontFamily: "inherit" };

        switch (field.type) {
            case "status": {
                const labels = getStatusLabels(field.columnId);
                return (
                    <select value={value} onChange={(e) => handleFieldChange(field.columnId, e.target.value)} style={inputStyle}>
                        <option value="">-- Select {field.label} --</option>
                        {labels.map((label) => <option key={label.index} value={label.index}>{label.label}</option>)}
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
                        <select value={dropdownValue[0] || ""} onChange={(e) => handleFieldChange(field.columnId, [parseInt(e.target.value)])} style={inputStyle}>
                            <option value="">-- Select {field.label} --</option>
                            {labels.map((label) => <option key={label.id} value={label.id}>{label.name}</option>)}
                        </select>
                    );
                } else {
                    return (
                        <select multiple value={dropdownValue.map(String)} onChange={(e) => handleFieldChange(field.columnId, Array.from(e.target.selectedOptions).map((opt) => parseInt(opt.value)))} style={{ ...inputStyle, minHeight: "100px" }}>
                            {labels.map((label) => <option key={label.id} value={label.id}>{label.name}</option>)}
                        </select>
                    );
                }
            }
            case "people":
            case "board_relation": {
                const selectedItems = Array.isArray(formData[field.columnId]) ? formData[field.columnId] : [];
                const lookup = (field.type === "people" ? peopleLookups : relationLookups)[field.columnId] || {};
                const isOpen = lookup.isOpen || false;
                return (
                    <div className="relation-lookup-container">
                        <div className={`relation-lookup-trigger ${isOpen ? "open" : ""}`} onClick={() => { if (!isOpen) { if (field.type === "people") loadPeopleLookup(field.columnId); else loadRelationLookup(field.columnId, getRelatedBoardIds(field.columnId)); } }}>
                            <div className="pills-container">
                                {selectedItems.length > 0 ? selectedItems.map((item, idx) => (
                                    <RecordPill key={item.id || idx} label={item.name || `ID: ${item.id || item}`} onRemove={() => handleFieldChange(field.columnId, selectedItems.filter((_, i) => i !== idx))} />
                                )) : <span className="relation-lookup-trigger-text placeholder">-- Select {field.label} --</span>}
                            </div>
                            <span className="relation-lookup-trigger-icon">{isOpen ? "▲" : "▼"}</span>
                        </div>
                        {isOpen && (
                            <div className="relation-lookup-dropdown">
                                <div className="relation-lookup-header">
                                    <input type="text" className="relation-lookup-search" placeholder={field.type === "people" ? "Search by name or email..." : "Search by name..."} value={lookup.searchTerm || ""} onChange={(e) => field.type === "people" ? handlePeopleSearch(field.columnId, e.target.value) : handleRelationSearch(field.columnId, getRelatedBoardIds(field.columnId), e.target.value)} autoFocus />
                                    <button className="relation-lookup-close-btn" onClick={(e) => { e.stopPropagation(); field.type === "people" ? closePeopleLookup(field.columnId) : closeRelationLookup(field.columnId); }}>Close</button>
                                </div>
                                <div className="relation-lookup-results">
                                    {lookup.loading && <div className="relation-lookup-loading">Loading...</div>}
                                    {!lookup.loading && lookup.error && <div className="relation-lookup-error">{lookup.error}</div>}
                                    {!lookup.loading && ((!lookup.users && !lookup.items) || lookup.users?.length === 0 || lookup.items?.length === 0) && <div className="relation-lookup-empty">No results found</div>}
                                    {field.type === "people" && !lookup.loading && lookup.users?.map((user) => {
                                        const isSelected = selectedItems.some((item) => parseInt(item.id) === parseInt(user.id));
                                        return (
                                            <div key={user.id} className={`relation-lookup-item people-item ${isSelected ? "selected" : ""}`} onClick={(e) => { e.stopPropagation(); handleFieldChange(field.columnId, isSelected ? selectedItems.filter((i) => parseInt(i.id) !== parseInt(user.id)) : [...selectedItems, { id: parseInt(user.id), name: user.name }]); }}>
                                                <input type="checkbox" checked={isSelected} readOnly />
                                                <div className="relation-lookup-item-name">{user.name}</div>
                                            </div>
                                        );
                                    })}
                                    {field.type === "board_relation" && !lookup.loading && lookup.items?.map((item) => {
                                        const isSelected = selectedItems.some((i) => String(i.id) === String(item.id));
                                        return (
                                            <div key={item.id} className={`relation-lookup-item ${isSelected ? "selected" : ""}`} onClick={(e) => { e.stopPropagation(); handleFieldChange(field.columnId, isSelected ? selectedItems.filter((i) => String(i.id) !== String(item.id)) : [...selectedItems, { id: item.id, name: item.name }]); }}>
                                                <div className="relation-lookup-item-name">{item.name}</div>
                                                <div className="relation-lookup-item-id">ID: {item.id}</div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                );
            }
            case "email":
                return <input type="email" value={value} onChange={(e) => handleFieldChange(field.columnId, e.target.value)} placeholder={`Enter ${field.label}`} style={inputStyle} />;
            case "phone":
                return <PhoneInput columnId={field.columnId} value={value} onChange={handleFieldChange} label={field.label} />;
            case "name":
            case "text":
                return <input type="text" value={value} onChange={(e) => handleFieldChange(field.columnId, e.target.value)} placeholder={`Enter ${field.label}`} style={inputStyle} />;
            case "long_text":
                return <textarea value={value} onChange={(e) => handleFieldChange(field.columnId, e.target.value)} placeholder={`Enter ${field.label}`} rows={4} style={{ ...inputStyle, resize: "vertical" }} />;
            case "numbers":
                return <input type="number" value={value} onChange={(e) => handleFieldChange(field.columnId, e.target.value)} placeholder={`Enter ${field.label}`} style={inputStyle} />;
            case "date":
                return <input type="date" value={value} onChange={(e) => handleFieldChange(field.columnId, e.target.value)} style={inputStyle} />;
            case "checkbox":
                return (
                    <label style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
                        <input type="checkbox" checked={value === "true" || value === true} onChange={(e) => handleFieldChange(field.columnId, e.target.checked)} style={{ marginRight: "8px" }} />
                        <span>Yes</span>
                    </label>
                );
            case "formula":
            case "mirror":
                return <input type="text" value={value} readOnly disabled placeholder="(Calculated field)" style={{ ...inputStyle, backgroundColor: "#f5f5f5", cursor: "not-allowed" }} />;
            case "link": {
                const linkVal = typeof value === "object" && value !== null ? value : { url: value || "", text: value || "" };
                return (
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        <input type="url" value={linkVal.url} onChange={(e) => handleFieldChange(field.columnId, { ...linkVal, url: e.target.value })} placeholder="https://example.com" style={inputStyle} />
                        <input type="text" value={linkVal.text} onChange={(e) => handleFieldChange(field.columnId, { ...linkVal, text: e.target.value })} placeholder="Link label (optional)" style={{ ...inputStyle, fontSize: "12px" }} />
                    </div>
                );
            }
            case "file":
                return <FileUpload columnId={field.columnId} value={formData[field.columnId]} onChange={handleFieldChange} field={field} isUpdate={formAction === "update"} />;
            case "timerange":
            case "timeline": {
                const tlVal = value && typeof value === "object" ? value : { from: "", to: "" };
                return (
                    <div className="timeline-input-wrapper">
                        <div className="timeline-input-group">
                            <label className="timeline-sub-label">From</label>
                            <input
                                type="date"
                                value={tlVal.from || ""}
                                onChange={(e) => handleFieldChange(field.columnId, { ...tlVal, from: e.target.value })}
                                style={inputStyle}
                            />
                        </div>
                        <span className="timeline-arrow">→</span>
                        <div className="timeline-input-group">
                            <label className="timeline-sub-label">To</label>
                            <input
                                type="date"
                                value={tlVal.to || ""}
                                min={tlVal.from || undefined}
                                onChange={(e) => handleFieldChange(field.columnId, { ...tlVal, to: e.target.value })}
                                style={inputStyle}
                            />
                        </div>
                        {tlVal.from && tlVal.to && tlVal.to < tlVal.from && (
                            <div className="timeline-error">End date must be after start date</div>
                        )}
                    </div>
                );
            }
            case "doc": {
                const docVal = value && typeof value === "object" ? value : null;
                const docName = docVal?.name || null;
                const docLink = docVal?.linkToFile || null;
                return (
                    <div className="doc-field-wrapper">
                        <input
                            type="text"
                            value={docName || (formAction === "update" ? "(No document linked)" : "(Document can be linked after saving)")}
                            readOnly
                            disabled
                            style={{ ...inputStyle, backgroundColor: "#f5f5f5", cursor: "not-allowed", color: "#888" }}
                        />
                        {docLink && (
                            <button
                                type="button"
                                className="doc-open-btn"
                                onClick={() => {
                                    try {
                                        monday.execute("openLinkInTab", { url: docLink });
                                    } catch (_) {
                                        window.open(docLink, "_blank", "noopener,noreferrer");
                                    }
                                }}
                                title="Open document in monday.com"
                            >
                                Open Doc ↗
                            </button>
                        )}
                        <div className="doc-field-note">
                            {docLink
                                ? "This document is managed in monday.com. Click 'Open Doc' to view or edit."
                                : "Documents are created and managed directly in monday.com."}
                        </div>
                    </div>
                );
            }
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
    // FORMAT COLUMN VALUE FOR API
    // =============================================================
    const formatColumnValue = (columnId, value, columnMeta) => {
        switch (columnMeta.type) {
            case "status": { const i = parseInt(value); return !isNaN(i) ? { index: i } : null; }
            case "dropdown": { const ids = (Array.isArray(value) ? value : [value]).filter((id) => id !== "" && id !== null).map((id) => parseInt(id)); return ids.length > 0 ? { ids } : null; }
            case "people": { const people = Array.isArray(value) ? value : []; const validIds = people.map((p) => (typeof p === "object" ? p.id : p)).filter(Boolean); return validIds.length > 0 ? { personsAndTeams: validIds.map((id) => ({ id: parseInt(id), kind: "person" })) } : null; }
            case "board_relation": { const relations = Array.isArray(value) ? value : []; const validIds = relations.map((r) => (typeof r === "object" ? r.id : r)).filter(Boolean); return validIds.length > 0 ? { item_ids: validIds.map((id) => parseInt(id)) } : null; }
            case "date": return String(value).trim() !== "" ? { date: value } : null;
            case "numbers": return String(value);
            case "text": case "long_text": return String(value);
            case "email": return String(value).trim() !== "" ? { email: String(value).trim(), text: String(value).trim() } : null;
            case "phone": { const p = value && typeof value === "object" ? value : null; if (!p || !p.phone || !String(p.phone).trim()) return null; return { phone: String(p.phone).replace(/[\s\-().]/g, ""), countryShortName: p.countryShortName || "US" }; }
            case "link": { const l = typeof value === "object" && value !== null ? value : { url: String(value).trim(), text: String(value).trim() }; const url = (l.url || "").trim(); if (!url) return null; const fullUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`; return { url: fullUrl, text: l.text || fullUrl }; }
            case "checkbox": return { checked: value === true || value === "true" || value === "v" ? "true" : "false" };
            case "timerange":
            case "timeline": {
                const tl = value && typeof value === "object" ? value : null;
                if (!tl || !tl.from || !tl.to) return null;
                return { from: tl.from, to: tl.to };
            }
            case "doc": return null; // doc columns are never written via API
            default: return String(value);
        }
    };

    const uploadPendingFiles = async (itemId, recordValues, isUpdate = false) => {
        const results = [];
        for (const columnId of Object.keys(recordValues)) {
            if (columnId === "name") continue;
            const columnMeta = getColumnMetadata(columnId);
            if (!columnMeta || columnMeta.type !== "file") continue;
            const fileValue = recordValues[columnId];
            const filesToUpload = isUpdate ? fileValue?.newFiles || [] : Array.isArray(fileValue) ? fileValue : [];
            for (const file of filesToUpload) {
                try {
                    const mutation = `mutation ($itemId: ID!, $columnId: String!, $file: File!) { add_file_to_column(item_id: $itemId, column_id: $columnId, file: $file) { id } }`;
                    const response = await monday.api(mutation, { variables: { itemId: String(itemId), columnId, file } });
                    results.push(response.data?.add_file_to_column?.id ? { success: true, file: file.name } : { success: false, file: file.name, error: "Upload returned no ID" });
                } catch (err) {
                    results.push({ success: false, file: file.name, error: err.message });
                }
            }
        }
        return results;
    };

    const createItem = async (recordValues) => {
        try {
            const itemName = recordValues.name || "New Item";
            const columnValues = {};
            Object.keys(recordValues).forEach((columnId) => {
                if (columnId === "name") return;
                const value = recordValues[columnId];
                const columnMeta = getColumnMetadata(columnId);
                if (!columnMeta || columnMeta.type === "file") return;
                const isEmpty = value === "" || value === null || value === undefined || (typeof value === "object" && !Array.isArray(value) && value.phone === "");
                if (isEmpty) return;
                const formatted = formatColumnValue(columnId, value, columnMeta);
                if (formatted !== null) columnValues[columnId] = formatted;
            });
            const mutation = `mutation($boardId: ID!, $itemName: String!, $columnValues: JSON!) { create_item(board_id: $boardId item_name: $itemName column_values: $columnValues) { id name } }`;
            const response = await monday.api(mutation, { variables: { boardId, itemName, columnValues: JSON.stringify(columnValues) } });
            if (response.data && response.data.create_item) {
                const createdItem = response.data.create_item;
                const fileErrors = (await uploadPendingFiles(createdItem.id, recordValues)).filter((r) => !r.success);
                monday.execute("notice", { message: fileErrors.length === 0 ? `Item "${createdItem.name}" created successfully!` : `Item "${createdItem.name}" created, but ${fileErrors.length} file upload(s) failed.`, type: fileErrors.length === 0 ? "success" : "error", timeout: 5000 });
                setFormData({});
                return { success: true, item: createdItem };
            } else throw new Error("Failed to create item");
        } catch (error) {
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
                if (!columnMeta || columnMeta.type === "file") return;
                const isEmpty = value === "" || value === null || value === undefined || (typeof value === "object" && !Array.isArray(value) && value.phone === "");
                if (isEmpty) return;
                const formatted = formatColumnValue(columnId, value, columnMeta);
                if (formatted !== null) columnValues[columnId] = formatted;
            });
            const mutation = `mutation($boardId: ID!, $itemId: ID!, $columnValues: JSON!) { change_multiple_column_values(board_id: $boardId item_id: $itemId column_values: $columnValues create_labels_if_missing: false) { id name } }`;
            const response = await monday.api(mutation, { variables: { boardId, itemId, columnValues: JSON.stringify(columnValues) } });
            if (response.data && response.data.change_multiple_column_values) {
                const updatedItem = response.data.change_multiple_column_values;
                const fileErrors = (await uploadPendingFiles(itemId, recordValues, true)).filter((r) => !r.success);
                monday.execute("notice", { message: fileErrors.length === 0 ? "Item updated successfully!" : `Item updated, but ${fileErrors.length} file upload(s) failed.`, type: fileErrors.length === 0 ? "success" : "error", timeout: 5000 });
                return { success: true, item: updatedItem };
            } else throw new Error("Failed to update item");
        } catch (error) {
            monday.execute("notice", { message: `Error updating item: ${error.message}`, type: "error", timeout: 5000 });
            return { success: false, error: error.message };
        }
    };

    // =============================================================
    // FORM VALIDATION
    // Uses validateVisibleFields() from fieldValidation.js which:
    //   1. Skips fields hidden by fieldVisibilityMap
    //   2. Checks isRequired on visible fields
    //   3. Checks validityRules (min/max/range) on visible fields
    // The old validateForm() is replaced by this single call.
    // =============================================================

    const displayValidationErrors = (errors) => {
        if (errors.length === 0) return;
        // Group by type for a cleaner notice message
        const byType = {};
        errors.forEach((e) => { if (!byType[e.type]) byType[e.type] = []; byType[e.type].push(e); });
        let msg = "Please fix the following errors:\n\n";
        const typeLabel = (t) =>
            t === "REQUIRED_FIELD" ? "Required fields:" : "Invalid values:";
        Object.keys(byType).forEach((type) => {
            msg += `${typeLabel(type)}\n`;
            byType[type].forEach((err) => { msg += `  • ${err.message}\n`; });
            msg += "\n";
        });
        monday.execute("notice", { message: msg, type: "error", timeout: 10000 });
    };

    const handleFormSubmit = async (e) => {
        e.preventDefault();

        // validateVisibleFields skips hidden fields automatically via fieldVisibilityMap
        const errors = validateVisibleFields(visibleSections, formData, fieldVisibilityMap);

        if (errors.length > 0) {
            displayValidationErrors(errors);
            // Scroll to the first offending field
            const firstEl = document.querySelector(`[data-column-id="${errors[0].columnId}"]`);
            if (firstEl) firstEl.scrollIntoView({ behavior: "smooth", block: "center" });
            return;
        }

        if (formAction === "create") await createItem(formData);
        else if (formAction === "update" && selectedItemId) await updateItem(selectedItemId, formData);
    };

    // =============================================================
    // LOAD FORM — renders only visibleSections (NEW)
    // =============================================================
    const loadForm = () => {
        // While profile is loading, show a subtle indicator rather than the form
        // to prevent a flicker where a hidden section briefly appears.
        if (userProfileLoading) {
            return (
                <div className="loading-state">
                    <p>Loading your profile...</p>
                </div>
            );
        }

        const validSections = visibleSections.filter((section) => section.isFullyValid && section.fields);

        if (validSections.length === 0) {
            return (
                <div className="error-box">
                    <h3>⚠️ Cannot Create Form</h3>
                    <p>No sections are available for your profile.</p>
                </div>
            );
        }

        // Active item id and update mode flag — used for RelatedLists
        const activeItemId = itemId || selectedItemId || null;
        const isUpdateMode = formAction === "update" && Boolean(activeItemId);

        return (
            <div className="form-container">
                {formAction === "update" && selectedItem && !isItemViewMode && (
                    <div className="editing-banner">
                        <p>✏️ Editing: <strong>{selectedItem.name}</strong> (ID: {selectedItem.id})</p>
                    </div>
                )}
                <form onSubmit={handleFormSubmit}>
                    {validSections.map((section) => {
                        const sectionId = section.sectionData?.id ?? section.id;
                        const sectionTitle = section.sectionData?.title ?? section.title;
                        const isCollapsed = collapsedSections[sectionId] || false;
                        const validFields = section.fields.filter((f) => f.isValid === true && f.duplicate === false);
                        if (validFields.length === 0) return null;
                        return (
                            <div key={sectionId} className="section-container">
                                <div className="section-header" onClick={() => toggleSection(sectionId)}>
                                    <h3>
                                        {sectionTitle}
                                        <span className="field-count">({validFields.length} field{validFields.length !== 1 ? "s" : ""})</span>
                                    </h3>
                                    <span className="collapse-icon">{isCollapsed ? "▼" : "▲"}</span>
                                </div>
                                {!isCollapsed && (
                                    <div className="section-content">
                                        <div className="fields-grid">
                                            {validFields.map((field) => {
                                                // fieldVisibilityMap: true = show, false = hide
                                                // Missing key defaults to true (fail-open)
                                                const fieldVisible = fieldVisibilityMap[field.columnId] !== false;
                                                if (!fieldVisible) return null;

                                                const isRequired = field.isRequired === true || field.isRequired === "true";
                                                return (
                                                    <div key={field.columnId} className="field-wrapper" data-column-id={field.columnId}>
                                                        <label className="field-label">
                                                            {field.label}
                                                            {isRequired && <span className="required-asterisk">*</span>}
                                                        </label>
                                                        {renderField(field)}
                                                        <div className="field-type-hint">Type: {field.type}</div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    <div className="form-actions">
                        <button type="submit" className="btn-primary">{formAction === "create" ? "✓ Create Item" : "✓ Update Item"}</button>
                        {formAction === "create" && <button type="button" onClick={() => setFormData({})} className="btn-secondary">Clear Form</button>}
                    </div>
                </form>
                {/* Related Lists — shown in edit/update mode only */}
                {isUpdateMode && (
                    <RelatedLists
                        validatedChildBoards={validatedChildBoards}
                        parentItemId={activeItemId}
                    />
                )}
            </div>
        );
    };

    // =============================================================
    // DERIVED FLAGS
    // =============================================================
    const isItemViewMode = Boolean(itemId);

    // =============================================================
    // RENDER
    // =============================================================
    return (
        <div className="App">
            {!boardId ? (
                <div className="board-selector">
                    <label>Select a board to continue:</label>
                    <select onChange={(e) => { const chosenId = e.target.value; setBoardId(chosenId); const chosen = boards.find((b) => String(b.id) === chosenId); setSelectedBoardName(chosen ? chosen.name : ""); }} defaultValue="">
                        <option value="" disabled>-- choose a board --</option>
                        {boards.map((b) => {
                            const ws = b.workspace && b.workspace.name ? b.workspace.name : "";
                            return <option key={b.id} value={b.id}>{ws ? `${b.name} (${ws})` : b.name}</option>;
                        })}
                    </select>
                </div>
            ) : (
                <div className="main-content">
                    {pageLayoutLoading && <div className="loading-state"><p>Loading page layout...</p></div>}
                    {!pageLayoutLoading && pageLayoutError && (
                        <div className="error-box warning">
                            <h3>⚠️ Error Loading Page Layout</h3>
                            <p>{pageLayoutError}</p>
                        </div>
                    )}
                    {!pageLayoutLoading && !pageLayoutError && validatedSections.length === 0 && (
                        <div className="error-box warning pls-warning">
                            <h3>⚠️ Page Layout Not Configured</h3>
                            <p>
                                {validationError
                                    ? <>PLS record found but layout could not be loaded: <strong>{validationError}</strong></>
                                    : <>No PLS record found for board: <strong>{selectedBoardName || boardId}</strong>. A default form is shown below.</>
                                }
                            </p>
                        </div>
                    )}
                    {/* Fallback form — shown when no valid sections (missing or broken PLS config) */}
                    {!pageLayoutLoading && !pageLayoutError && validatedSections.length === 0 && (
                        <FallbackForm
                            formAction={formAction}
                            onFormActionChange={handleFormActionChange}
                            selectedItem={selectedItem}
                            selectedItemId={selectedItemId}
                            isItemViewMode={isItemViewMode}
                            formData={formData}
                            setFormData={setFormData}
                            boardId={boardId}
                            selectedBoardName={selectedBoardName}
                            mainItemLookup={mainItemLookup}
                            setMainItemLookup={setMainItemLookup}
                            handleMainItemLookupSearch={handleMainItemLookupSearch}
                            selectUpdateItem={selectUpdateItem}
                            itemsError={itemsError}
                            monday={monday}
                            createItem={createItem}
                            updateItem={updateItem}
                        />
                    )}
                    {!pageLayoutLoading && !pageLayoutError && validatedSections.length > 0 && (
                        <div>
                            {/* ── ITEM VIEW ── */}
                            {isItemViewMode && (
                                <div>
                                    {!selectedItem && <div className="loading-state"><p>Loading item...</p></div>}
                                    {selectedItem && loadForm()}
                                </div>
                            )}

                            {/* ── BOARD VIEW ── */}
                            {!isItemViewMode && (
                                <div>
                                    <div className="action-selector">
                                        <h3>Select Action:</h3>
                                        <div className="radio-group">
                                            <label className="radio-label">
                                                <input type="radio" name="formAction" value="create" checked={formAction === "create"} onChange={handleFormActionChange} />
                                                <span>Create New Record</span>
                                            </label>
                                            <label className="radio-label">
                                                <input type="radio" name="formAction" value="update" checked={formAction === "update"} onChange={handleFormActionChange} />
                                                <span>Update Existing Record</span>
                                            </label>
                                        </div>
                                    </div>

                                    {formAction === "update" && (
                                        <div className="item-selector">
                                            <h3>Select Item to Update:</h3>
                                            <div className="relation-lookup-container" style={{ maxWidth: "500px" }}>
                                                <div className={`relation-lookup-trigger ${mainItemLookup.isOpen ? "open" : ""}`} onClick={() => { if (!mainItemLookup.isOpen) handleMainItemLookupSearch(""); }}>
                                                    <span className={`relation-lookup-trigger-text ${!selectedItem ? "placeholder" : ""}`}>{selectedItem ? selectedItem.name : "-- Search for a record --"}</span>
                                                    {selectedItemId && (
                                                        <button className="relation-lookup-clear-btn" onClick={(e) => { e.stopPropagation(); setSelectedItemId(""); setSelectedItem(null); setFormData({}); }} title="Clear selection" type="button">×</button>
                                                    )}
                                                    <span className="relation-lookup-trigger-icon">{mainItemLookup.isOpen ? "▲" : "▼"}</span>
                                                </div>
                                                {mainItemLookup.isOpen && (
                                                    <div className="relation-lookup-dropdown">
                                                        <div className="relation-lookup-header">
                                                            <input type="text" className="relation-lookup-search" placeholder="Type to search items..." value={mainItemLookup.searchTerm || ""} onChange={(e) => handleMainItemLookupSearch(e.target.value)} autoFocus />
                                                            <button className="relation-lookup-close-btn" onClick={(e) => { e.stopPropagation(); setMainItemLookup((prev) => ({ ...prev, isOpen: false })); }}>Close</button>
                                                        </div>
                                                        <div className="relation-lookup-results main-item-lookup-results">
                                                            {mainItemLookup.loading && <div className="relation-lookup-loading">Searching board...</div>}
                                                            {!mainItemLookup.loading && mainItemLookup.items && mainItemLookup.items.length === 0 && <div className="relation-lookup-empty">No records match your search</div>}
                                                            {!mainItemLookup.loading && mainItemLookup.items && mainItemLookup.items.length > 0 && mainItemLookup.items.map((item) => (
                                                                <div key={item.id} className={`relation-lookup-item ${String(selectedItemId) === String(item.id) ? "selected" : ""}`} onClick={() => selectUpdateItem(item)}>
                                                                    <div className="relation-lookup-item-name">{item.name}</div>
                                                                    <div className="relation-lookup-item-id">ID: {item.id}</div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                        <div className="relation-lookup-footer">{mainItemLookup.items?.length || 0} records found in {selectedBoardName}</div>
                                                    </div>
                                                )}
                                            </div>
                                            {itemsError && <div className="error-inline"><p>{itemsError}</p></div>}
                                        </div>
                                    )}
                                    {(formAction === "create" || (formAction === "update" && selectedItemId)) && loadForm()}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default App;
