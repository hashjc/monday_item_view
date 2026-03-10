/**
 * RelatedLists.jsx
 *
 * Renders a "Related Lists" panel — Salesforce-style child board records.
 * Each validated child board gets its own collapsible sub-section with a table.
 *
 * ─── PROPS ──────────────────────────────────────────────────────────────────
 *  validatedChildBoards  ValidatedChildBoard[]   from pageLayoutService
 *  parentItemId          string                  currently selected item ID
 *
 * ─── BEHAVIOUR ──────────────────────────────────────────────────────────────
 *  - The outer "Related Lists" section is collapsible.
 *  - Each child board is its own collapsible sub-section.
 *  - Records are loaded lazily on first expand; cached so re-expanding is free.
 *  - Each row has a kebab (⋮) action menu (visible on row hover) with:
 *      Edit   → monday.execute("openItemCard", { itemId }) — opens native
 *               monday item card in a side panel (no new tab, no URL needed).
 *      Delete → inline two-step confirmation → deleteItems([id]) from items.js
 *               → optimistic removal from local state on success.
 *  - Only one menu open at a time; clicking outside closes it.
 *  - The "name" column is always first (rendered from item.name, not column_values).
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import mondaySdk from "monday-sdk-js";
import { fetchRelatedListRecords } from "../hooks/relatedListService";
import { deleteItems } from "../hooks/items";

const monday = mondaySdk();

// ─── RowActionMenu ────────────────────────────────────────────────────────────

/**
 * The kebab (⋮) button + dropdown for a single table row.
 *
 * States per row:
 *   idle         → show ⋮ button (only visible on row hover via CSS)
 *   menuOpen     → dropdown showing Edit / Delete
 *   confirmDelete → dropdown replaced by "Are you sure?" + Confirm / Cancel
 *   deleting     → spinner, buttons disabled
 *
 * Props:
 *   record        { id, name }
 *   onDeleted     (recordId) => void   — called after successful delete
 *   onEditError   (msg) => void        — called if openItemCard fails
 */
function RowActionMenu({ record, onDeleted, onEditError }) {
    const [phase, setPhase] = useState("idle"); // idle | open | confirm | deleting
    const menuRef = useRef(null);

    // ── Close on outside click ──────────────────────────────────
    useEffect(() => {
        if (phase === "idle") return;
        const handler = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) {
                setPhase("idle");
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [phase]);

    // ── Edit ────────────────────────────────────────────────────
    const handleEdit = async (e) => {
        e.stopPropagation();
        setPhase("idle");
        try {
            // Opens the native monday item card side panel — no URL, no new tab needed.
            // Works in both board view and item view contexts.
            await monday.execute("openItemCard", { itemId: parseInt(record.id, 10) });
        } catch (err) {
            // Fallback: most monday SDK versions support openItemCard, but if it
            // fails (e.g. in dev/tunnel environment) surface the error gracefully.
            onEditError?.(`Could not open item card: ${err.message}`);
        }
    };

    // ── Delete — step 1: ask for confirmation ───────────────────
    const handleDeleteClick = (e) => {
        e.stopPropagation();
        setPhase("confirm");
    };

    // ── Delete — step 2: confirmed, call API ────────────────────
    const handleDeleteConfirm = async (e) => {
        e.stopPropagation();
        setPhase("deleting");
        const result = await deleteItems([record.id]);
        if (result.success) {
            // Parent removes the row from local state immediately — no re-fetch.
            onDeleted(record.id);
        } else {
            // Reset to idle and let parent surface the error.
            setPhase("idle");
            onEditError?.(`Delete failed: ${result.error}`);
        }
    };

    // ── Delete — cancel confirmation ─────────────────────────────
    const handleDeleteCancel = (e) => {
        e.stopPropagation();
        setPhase("idle");
    };

    return (
        <div className="rl-action-menu" ref={menuRef}>
            {/* Kebab trigger — always rendered, shown on row hover via CSS */}
            <button
                className="rl-kebab-btn"
                title="Actions"
                onClick={(e) => {
                    e.stopPropagation();
                    setPhase((p) => (p === "open" ? "idle" : "open"));
                }}
                aria-label="Row actions"
            >
                ⋮
            </button>

            {/* Dropdown — shown when open or in confirm/deleting phase */}
            {(phase === "open" || phase === "confirm" || phase === "deleting") && (
                <div className="rl-action-dropdown">
                    {/* ── Normal menu ── */}
                    {phase === "open" && (
                        <>
                            <button className="rl-action-btn rl-action-edit" onClick={handleEdit}>
                                ✏️ Edit
                            </button>
                            <button className="rl-action-btn rl-action-delete" onClick={handleDeleteClick}>
                                🗑️ Delete
                            </button>
                        </>
                    )}

                    {/* ── Confirmation step ── */}
                    {phase === "confirm" && (
                        <div className="rl-confirm">
                            <p className="rl-confirm-msg">Delete <strong>{record.name}</strong>?</p>
                            <div className="rl-confirm-btns">
                                <button className="rl-confirm-yes" onClick={handleDeleteConfirm}>
                                    Yes, delete
                                </button>
                                <button className="rl-confirm-no" onClick={handleDeleteCancel}>
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ── Deleting spinner ── */}
                    {phase === "deleting" && (
                        <div className="rl-confirm">
                            <div className="rl-deleting">
                                <span className="rl-spinner" /> Deleting…
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ─── RelatedListTable ─────────────────────────────────────────────────────────

/**
 * Renders one child board's records as a table.
 * Manages its own: loading, error, empty, expand/collapse, and action-menu state.
 */
function RelatedListTable({ childBoard, parentItemId }) {
    const [state, setState] = useState({
        records: [],
        loading: false,
        loaded:  false,
        error:   null,
    });
    const [isExpanded, setIsExpanded]   = useState(false);
    const [actionError, setActionError] = useState(null); // surfaces edit/delete errors

    // ── Load records (lazy, cached) ────────────────────────────
    const loadRecords = useCallback(async () => {
        if (state.loaded || state.loading) return;
        setState((prev) => ({ ...prev, loading: true, error: null }));
        const result = await fetchRelatedListRecords(childBoard, parentItemId);
        setState({
            records: result.records || [],
            loading: false,
            loaded:  true,
            error:   result.success ? null : result.error,
        });
    }, [childBoard, parentItemId, state.loaded, state.loading]);

    const handleToggle = () => {
        const willExpand = !isExpanded;
        setIsExpanded(willExpand);
        if (willExpand && !state.loaded && !state.loading) loadRecords();
    };

    // Reset when parent record changes
    useEffect(() => {
        setState({ records: [], loading: false, loaded: false, error: null });
        setIsExpanded(false);
        setActionError(null);
    }, [parentItemId, childBoard.boardId]);

    // ── Optimistic delete — remove from local state immediately ──
    const handleRecordDeleted = (deletedId) => {
        setState((prev) => ({
            ...prev,
            records: prev.records.filter((r) => r.id !== deletedId),
        }));
    };

    // ── Column layout ───────────────────────────────────────────
    const nameCol     = childBoard.columns.find((c) => c.id === "name");
    const otherCols   = childBoard.columns.filter((c) => c.id !== "name");
    const displayCols = nameCol ? [nameCol, ...otherCols] : otherCols;

    const recordCount = state.loaded ? state.records.length : null;

    return (
        <div className="rl-child-section">
            {/* Sub-section header */}
            <div className="rl-child-header" onClick={handleToggle}>
                <div className="rl-child-title-row">
                    <span className="rl-child-icon">⬡</span>
                    <span className="rl-child-label">{childBoard.label}</span>
                    {recordCount !== null && (
                        <span className="rl-child-count">{recordCount}</span>
                    )}
                </div>
                <span className="rl-child-caret">{isExpanded ? "▲" : "▼"}</span>
            </div>

            {/* Table area */}
            {isExpanded && (
                <div className="rl-child-body">

                    {/* Action error banner (edit/delete failures) */}
                    {actionError && (
                        <div className="rl-action-error">
                            ⚠️ {actionError}
                            <button
                                className="rl-action-error-close"
                                onClick={() => setActionError(null)}
                                aria-label="Dismiss error"
                            >
                                ×
                            </button>
                        </div>
                    )}

                    {state.loading && (
                        <div className="rl-loading">
                            <span className="rl-spinner" />
                            Loading {childBoard.label}…
                        </div>
                    )}

                    {!state.loading && state.error && (
                        <div className="rl-error">
                            ⚠️ Could not load records: {state.error}
                        </div>
                    )}

                    {!state.loading && !state.error && state.loaded && state.records.length === 0 && (
                        <div className="rl-empty">
                            No {childBoard.label} linked to this record.
                        </div>
                    )}

                    {!state.loading && !state.error && state.records.length > 0 && (
                        <div className="rl-table-scroll">
                            <table className="rl-table">
                                <thead>
                                    <tr>
                                        {displayCols.map((col) => (
                                            <th key={col.id} className="rl-th">
                                                {col.title}
                                            </th>
                                        ))}
                                        {/* Empty header for the action column */}
                                        <th className="rl-th rl-th-actions" aria-label="Actions" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {state.records.map((record) => (
                                        <tr key={record.id} className="rl-tr">
                                            {displayCols.map((col) => {
                                                if (col.id === "name") {
                                                    return (
                                                        <td key="name" className="rl-td rl-td-name">
                                                            <button className="rl-name-link" onClick={() => monday.execute("openItemCard", { itemId: parseInt(record.id, 10) })}
                                                                title="Open record"
                                                            >{record.name}
                                                            </button>
                                                        </td>
                                                    );
                                                }
                                                const cell = record.cells[col.id];
                                                return (
                                                    <td key={col.id} className="rl-td">
                                                        <CellRenderer
                                                            value={cell?.text || ""}
                                                            type={cell?.type || col.type}
                                                        />
                                                    </td>
                                                );
                                            })}

                                            {/* Action menu cell */}
                                            <td className="rl-td rl-td-actions">
                                                <RowActionMenu
                                                    record={record}
                                                    onDeleted={handleRecordDeleted}
                                                    onEditError={(msg) => setActionError(msg)}
                                                />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ─── CellRenderer ─────────────────────────────────────────────────────────────

function CellRenderer({ value, type }) {
    if (!value && value !== 0) {
        return <span className="rl-cell-empty">—</span>;
    }

    switch (type) {
        case "checkbox":
        case "boolean":
            return (
                <span className={`rl-cell-checkbox ${value === "v" || value === "true" ? "checked" : ""}`}>
                    {value === "v" || value === "true" ? "✓" : "✗"}
                </span>
            );
        case "status":
        case "color":
            return <span className="rl-cell-badge">{value}</span>;
        case "date":
            return <span className="rl-cell-date">{value}</span>;
        case "email":
            return (
                <a href={`mailto:${value}`} className="rl-cell-link" onClick={(e) => e.stopPropagation()}>
                    {value}
                </a>
            );
        case "link": {
            const urlPart = value.split(" - ")[0];
            return (
                <a href={urlPart} target="_blank" rel="noopener noreferrer" className="rl-cell-link" onClick={(e) => e.stopPropagation()}>
                    {value}
                </a>
            );
        }
        default:
            return <span className="rl-cell-text">{value}</span>;
    }
}

// ─── RelatedLists (main export) ───────────────────────────────────────────────

export default function RelatedLists({ validatedChildBoards, parentItemId }) {
    const [panelExpanded, setPanelExpanded] = useState(true);

    if (!validatedChildBoards || validatedChildBoards.length === 0) return null;
    if (!parentItemId) return null;

    return (
        <div className="rl-panel">
            <div className="rl-panel-header" onClick={() => setPanelExpanded((p) => !p)}>
                <div className="rl-panel-title">
                    <span className="rl-panel-icon">🔗</span>
                    <h3>Related Lists</h3>
                    <span className="rl-panel-badge">{validatedChildBoards.length}</span>
                </div>
                <span className="rl-panel-caret">{panelExpanded ? "▲" : "▼"}</span>
            </div>

            {panelExpanded && (
                <div className="rl-panel-body">
                    {validatedChildBoards.map((childBoard) => (
                        <RelatedListTable
                            key={`${childBoard.boardId}::${childBoard.columnId}`}
                            childBoard={childBoard}
                            parentItemId={parentItemId}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
