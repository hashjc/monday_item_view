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
 *  - Records are loaded lazily: the first time a sub-section is expanded,
 *    fetchRelatedListRecords() is called. Results are cached in state so
 *    re-expanding doesn't re-fetch.
 *  - The "name" column is always rendered as the first column regardless of
 *    column order in the config (since it is the item name, not a column value).
 */

import React, { useState, useEffect, useCallback } from "react";
import { fetchRelatedListRecords } from "./relatedListService";

// ─── RelatedListTable ─────────────────────────────────────────────────────────

/**
 * Renders one child board's records as a table.
 * Handles its own loading / error / empty states.
 */
function RelatedListTable({ childBoard, parentItemId }) {
    const [state, setState] = useState({
        records: [],
        loading: false,
        loaded:  false,
        error:   null,
    });
    const [isExpanded, setIsExpanded] = useState(false);

    const loadRecords = useCallback(async () => {
        if (state.loaded || state.loading) return; // already fetched or in-flight
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
        if (willExpand && !state.loaded && !state.loading) {
            loadRecords();
        }
    };

    // Refresh when parentItemId changes (user selects a different record)
    useEffect(() => {
        setState({ records: [], loading: false, loaded: false, error: null });
        setIsExpanded(false);
    }, [parentItemId, childBoard.boardId]);

    // Determine display columns:
    // "name" column is always shown first from item.name (not column_values).
    // All other validated columns follow in config order.
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
                                    </tr>
                                </thead>
                                <tbody>
                                    {state.records.map((record) => (
                                        <tr key={record.id} className="rl-tr">
                                            {displayCols.map((col) => {
                                                // "name" column is the item name
                                                if (col.id === "name") {
                                                    return (
                                                        <td key="name" className="rl-td rl-td-name">
                                                            {record.name}
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

/**
 * Renders a single table cell value based on column type.
 * Keeps it lightweight — just text display for now.
 */
function CellRenderer({ value, type }) {
    if (!value && value !== 0) {
        return <span className="rl-cell-empty">—</span>;
    }

    switch (type) {
        case "checkbox":
        case "boolean":
            // monday stores "v" or "true" for checked
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
            // value from monday for link columns is typically "url - label" or just the url
            const urlPart = value.split(" - ")[0];
            return (
                <a
                    href={urlPart}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rl-cell-link"
                    onClick={(e) => e.stopPropagation()}
                >
                    {value}
                </a>
            );
        }

        default:
            return <span className="rl-cell-text">{value}</span>;
    }
}

// ─── RelatedLists (main export) ───────────────────────────────────────────────

/**
 * Top-level Related Lists panel.
 * Renders the outer collapsible section and one RelatedListTable per child board.
 *
 * @param {{ validatedChildBoards: Object[], parentItemId: string }} props
 */
export default function RelatedLists({ validatedChildBoards, parentItemId }) {
    const [panelExpanded, setPanelExpanded] = useState(true);

    // Don't render the panel at all if there are no child boards configured
    if (!validatedChildBoards || validatedChildBoards.length === 0) return null;
    if (!parentItemId) return null;

    return (
        <div className="rl-panel">
            {/* Panel header */}
            <div className="rl-panel-header" onClick={() => setPanelExpanded((p) => !p)}>
                <div className="rl-panel-title">
                    <span className="rl-panel-icon">🔗</span>
                    <h3>Related Lists</h3>
                    <span className="rl-panel-badge">{validatedChildBoards.length}</span>
                </div>
                <span className="rl-panel-caret">{panelExpanded ? "▲" : "▼"}</span>
            </div>

            {/* Panel body — one table per child board */}
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
