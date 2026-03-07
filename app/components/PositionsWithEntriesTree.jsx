import { useState, useCallback } from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { formatUTCForDisplay } from "./ThemeStream/utils";

/** Background colors for block type badges (avoid green #d4edda used for Active) */
const BLOCK_TYPE_BG = {
  hero: "#e3f2fd",
  announcement_bar: "#fff3e0",
  collection_banner: "#f3e5f5",
  countdown_banner: "#e0f7fa",
  image_with_text: "#e8eaf6",
  background_video: "#fce4ec",
  promo_card: "#e0f2f1",
};
const DEFAULT_BLOCK_TYPE_BG = "#f5f5f5";

const STATUS_STYLES = {
  active:    { bg: "#d4edda", color: "#155724", label: "Active" },
  fallback:  { bg: "#fff3cd", color: "#856404", label: "Fallback" },
  scheduled: { bg: "#cce5ff", color: "#004085", label: "Scheduled" },
  ended:     { bg: "#f8d7da", color: "#721c24", label: "Ended" },
  paused:    { bg: "#e9ecef", color: "#6c757d", label: "Paused" },
};

/**
 * Determine the "winning" (currently-displaying) entry ID for a set of
 * entries in one stream. Mirrors the Liquid selection logic: among all
 * entries that are ACTIVE with start <= now < end, pick the one with
 * the latest start_at.
 */
function findActiveEntryId(streamEntries) {
  const now = Date.now();
  let bestId = null;
  let bestStart = 0;
  for (const entry of streamEntries) {
    if (entry.capabilities?.publishable?.status !== "ACTIVE") continue;
    const fm = Object.fromEntries((entry.fields || []).map((f) => [f.key, f.value]));
    const start = fm.start_at ? new Date(fm.start_at).getTime() : 0;
    const end = fm.end_at ? new Date(fm.end_at).getTime() : 0;
    if (start <= now && end > now && start > bestStart) {
      bestStart = start;
      bestId = entry.id;
    }
  }
  return bestId;
}

/** Compute the display status for a single entry given its stream's active entry ID. */
function computeEntryStatus(entry, activeEntryId) {
  if (entry.capabilities?.publishable?.status !== "ACTIVE") return "paused";
  const fm = Object.fromEntries((entry.fields || []).map((f) => [f.key, f.value]));
  const now = Date.now();
  const start = fm.start_at ? new Date(fm.start_at).getTime() : 0;
  const end = fm.end_at ? new Date(fm.end_at).getTime() : 0;

  if (end && end <= now) return "ended";
  if (start && start > now) return "scheduled";
  if (entry.id === activeEntryId) return "active";
  return "fallback";
}

/** Position row (parent) - used inside Draggable */
function PositionRow({
  position,
  isExpanded,
  onToggle,
  onEdit,
  onDelete,
  onAddEvent,
  canEdit,
  dragHandleProps,
  positionEntries,
  blockTypes,
  storeTimeZone,
  onEntryReorder,
  onEntryEdit,
  onEntryDelete,
  onEntryToggleStatus,
  dragType,
  draggingEntryPositionId,
}) {
  const activeEntryId = findActiveEntryId(positionEntries);

  return (
    <div>
      <div
        {...dragHandleProps}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "1rem",
          padding: "0.5rem 0.75rem",
          border: "1px solid #e1e3e5",
          borderRadius: "6px",
          marginBottom: "0.25rem",
          backgroundColor: "#f9fafb",
          cursor: "grab",
        }}
      >
        <button
          type="button"
          onClick={() => onToggle(position.id)}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "0.25rem",
            fontSize: "0.875rem",
          }}
          aria-label={isExpanded ? "Collapse" : "Expand"}
        >
          {isExpanded ? "▼" : "▶"}
        </button>
        <span style={{ flex: 1, fontWeight: 600, fontSize: "0.9375rem" }}>
          {position.name}
        </span>
        {canEdit && (
          <>
            <button
              type="button"
              onClick={() => onEdit(position)}
              style={{
                fontSize: "0.8125rem",
                color: "#667eea",
                cursor: "pointer",
                background: "none",
                border: "none",
                textDecoration: "underline",
              }}
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => onDelete(position)}
              style={{
                fontSize: "0.8125rem",
                color: "#d72c0d",
                cursor: "pointer",
                background: "none",
                border: "none",
                textDecoration: "underline",
              }}
            >
              Delete
            </button>
          </>
        )}
        <button
          type="button"
          onClick={() => onAddEvent?.(position)}
          style={{
            fontSize: "0.75rem",
            color: "#6d7175",
            cursor: "pointer",
            padding: "0.2rem 0.5rem",
            border: "1px solid #c9cccf",
            borderRadius: "4px",
            background: "white",
            fontWeight: 400,
          }}
        >
          + Event
        </button>
      </div>
      {isExpanded &&
        (positionEntries.length > 0 ? (
          <Droppable
            droppableId={`entries-${position.id}`}
            isDropDisabled={
              dragType === "position" ||
              (dragType === "entry" && draggingEntryPositionId !== position.id)
            }
          >
            {(provided) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                style={{ marginTop: "0.25rem", marginBottom: "0.5rem" }}
              >
                {positionEntries.map((entry, idx) => (
                  <Draggable
                    key={entry.id}
                    draggableId={`entry-${entry.id}`}
                    index={idx}
                  >
                    {(entProvided) => (
                      <EntryRow
                        entry={entry}
                        activeEntryId={activeEntryId}
                        blockTypes={blockTypes}
                        storeTimeZone={storeTimeZone}
                        onEdit={onEntryEdit}
                        onDelete={onEntryDelete}
                        onToggleStatus={onEntryToggleStatus}
                        provided={entProvided}
                      />
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        ) : (
          <div
            style={{
              marginLeft: "2rem",
              padding: "0.5rem",
              color: "#6d7175",
              fontSize: "0.8125rem",
            }}
          >
            No events in this stream
          </div>
        ))}
    </div>
  );
}

/** Entry row (child) */
function EntryRow({
  entry,
  activeEntryId,
  blockTypes,
  storeTimeZone,
  onEdit,
  onDelete,
  onToggleStatus,
  provided,
}) {
  const fieldMap = Object.fromEntries(
    (entry.fields || []).map((f) => [f.key, f.value])
  );
  const referenceMap = Object.fromEntries(
    (entry.fields || []).map((f) => [f.key, f.reference])
  );
  const isPublished = entry.capabilities?.publishable?.status === "ACTIVE";
  const scheduleStatus = computeEntryStatus(entry, activeEntryId);
  const style = STATUS_STYLES[scheduleStatus] || STATUS_STYLES.paused;
  const desktopBannerUrl = referenceMap.desktop_banner?.image?.url;

  let startDate = "—";
  let endDate = "—";
  try {
    if (fieldMap.start_at) startDate = formatUTCForDisplay(fieldMap.start_at, storeTimeZone);
    if (fieldMap.end_at) endDate = formatUTCForDisplay(fieldMap.end_at, storeTimeZone);
  } catch (_) {}

  return (
    <div
      ref={provided.innerRef}
      {...provided.draggableProps}
      {...provided.dragHandleProps}
      style={{
        ...provided.draggableProps.style,
        display: "flex",
        alignItems: "center",
        gap: "1rem",
        padding: "0.4rem 0.75rem",
        marginLeft: "2rem",
        marginBottom: "0.2rem",
        border: "1px solid #e1e3e5",
        borderRadius: "4px",
        backgroundColor: "white",
        fontSize: "0.8125rem",
        cursor: "grab",
      }}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleStatus(entry, isPublished);
        }}
        title={isPublished ? "Click to pause" : "Click to activate"}
        style={{
          padding: "0.15rem 0.5rem",
          fontSize: "0.6875rem",
          fontWeight: 500,
          border: "none",
          borderRadius: "4px",
          cursor: "pointer",
          backgroundColor: style.bg,
          color: style.color,
        }}
      >
        {style.label}
      </button>
      {desktopBannerUrl && (
        <img
          src={desktopBannerUrl}
          alt=""
          style={{
            width: 40,
            height: 28,
            objectFit: "cover",
            borderRadius: "4px",
          }}
        />
      )}
      <span style={{ flex: 1, fontWeight: 500 }}>{fieldMap.title || "(untitled)"}</span>
      <span
        style={{
          color: "#4d5156",
          fontSize: "0.75rem",
          textAlign: "center",
          minWidth: "7rem",
          padding: "0.2rem 0.5rem",
          borderRadius: "4px",
          backgroundColor: BLOCK_TYPE_BG[fieldMap.block_type] ?? DEFAULT_BLOCK_TYPE_BG,
        }}
      >
        {blockTypes[fieldMap.block_type || "hero"]?.label || "Hero"}
      </span>
      <span
        style={{
          display: "flex",
          gap: "0.35rem",
          color: "#666",
          fontSize: "0.75rem",
          marginLeft: "1rem",
          marginRight: "1rem",
        }}
      >
        <span>{startDate}</span>
        <span>{endDate}</span>
      </span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onEdit(entry);
        }}
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          fontSize: "0.75rem",
          color: "#667eea",
          cursor: "pointer",
          background: "none",
          border: "none",
          textDecoration: "underline",
        }}
      >
        Edit
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(entry);
        }}
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          fontSize: "0.75rem",
          color: "#d72c0d",
          cursor: "pointer",
          background: "none",
          border: "none",
          textDecoration: "underline",
        }}
      >
        Delete
      </button>
    </div>
  );
}

/**
 * Collapsible tree: positions (parent) with entries (children).
 * Both support CRUD and drag-and-drop reordering.
 */
export default function PositionsWithEntriesTree({
  positions = [],
  entries = [],
  blockTypes = {},
  storeTimeZone = "UTC",
  onPositionReorder,
  onEntryReorder,
  onPositionEdit,
  onPositionDelete,
  onAddEvent,
  onEntryEdit,
  onEntryDelete,
  onEntryToggleStatus,
  isDefaultPosition,
}) {
  const [expanded, setExpanded] = useState(() => {
    const init = {};
    positions.forEach((p) => {
      init[p.id] = true;
    });
    return init;
  });

  const toggleExpanded = useCallback((positionId) => {
    setExpanded((prev) => ({ ...prev, [positionId]: !prev[positionId] }));
  }, []);

  const [dragType, setDragType] = useState(null);
  const [draggingEntryPositionId, setDraggingEntryPositionId] = useState(null);

  const handleDragStart = useCallback((result) => {
    if (result.source.droppableId === "positions") {
      setDragType("position");
      setDraggingEntryPositionId(null);
    } else if (result.source.droppableId.startsWith("entries-")) {
      setDragType("entry");
      setDraggingEntryPositionId(result.source.droppableId.replace("entries-", ""));
    }
  }, []);

  const handleDragEnd = useCallback(
    (result) => {
      setDragType(null);
      setDraggingEntryPositionId(null);
      const { source, destination } = result;
      if (!destination || source.index === destination.index) return;

      if (source.droppableId === "positions") {
        if (destination.droppableId !== "positions") return;
        const reordered = [...positions];
        const [removed] = reordered.splice(source.index, 1);
        reordered.splice(destination.index, 0, removed);
        onPositionReorder?.(reordered.map((p) => p.id));
        return;
      }

      if (source.droppableId.startsWith("entries-")) {
        if (destination.droppableId !== source.droppableId) return;
        const positionId = source.droppableId.replace("entries-", "");
        const position = positions.find((p) => p.id === positionId);
        if (!position) return;
        const positionEntries = entries
          .filter((e) => {
            const fm = Object.fromEntries((e.fields || []).map((f) => [f.key, f.value]));
            return fm.position_id === position.handle;
          })
          .sort((a, b) => {
            const aOrder = parseInt(
              (a.fields || []).find((f) => f.key === "sort_order")?.value || "0",
              10
            );
            const bOrder = parseInt(
              (b.fields || []).find((f) => f.key === "sort_order")?.value || "0",
              10
            );
            if (aOrder !== bOrder) return aOrder - bOrder;
            const aStart = (a.fields || []).find((f) => f.key === "start_at")?.value || "";
            const bStart = (b.fields || []).find((f) => f.key === "start_at")?.value || "";
            return aStart.localeCompare(bStart);
          });
        const reordered = [...positionEntries];
        const [removed] = reordered.splice(source.index, 1);
        reordered.splice(destination.index, 0, removed);
        onEntryReorder?.(position.handle, reordered.map((e) => e.id));
      }
    },
    [positions, entries, onPositionReorder, onEntryReorder]
  );

  return (
    <DragDropContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <Droppable droppableId="positions" isDropDisabled={dragType === "entry"}>
        {(provided) => (
          <div style={{ minHeight: 50 }} ref={provided.innerRef} {...provided.droppableProps}>
            {positions.map((position, idx) => {
              const positionEntries = entries
                .filter((e) => {
                  const fm = Object.fromEntries((e.fields || []).map((f) => [f.key, f.value]));
                  return fm.position_id === position.handle;
                })
                .sort((a, b) => {
                  const aOrder = parseInt(
                    (a.fields || []).find((f) => f.key === "sort_order")?.value || "0",
                    10
                  );
                  const bOrder = parseInt(
                    (b.fields || []).find((f) => f.key === "sort_order")?.value || "0",
                    10
                  );
                  if (aOrder !== bOrder) return aOrder - bOrder;
                  const aStart = (a.fields || []).find((f) => f.key === "start_at")?.value || "";
                  const bStart = (b.fields || []).find((f) => f.key === "start_at")?.value || "";
                  return aStart.localeCompare(bStart);
                });

              const isExpanded = expanded[position.id] !== false;

              return (
                <Draggable
                  key={position.id}
                  draggableId={`position-${position.id}`}
                  index={idx}
                >
                  {(posProvided) => (
                    <div
                      ref={posProvided.innerRef}
                      {...posProvided.draggableProps}
                      style={posProvided.draggableProps.style}
                    >
                      <PositionRow
                        position={position}
                        isExpanded={isExpanded}
                        onToggle={toggleExpanded}
                        onEdit={onPositionEdit}
                        onDelete={onPositionDelete}
                        onAddEvent={onAddEvent}
                        canEdit={!isDefaultPosition?.(position)}
                        dragHandleProps={posProvided.dragHandleProps}
                        positionEntries={positionEntries}
                        blockTypes={blockTypes}
                        storeTimeZone={storeTimeZone}
                        onEntryReorder={onEntryReorder}
                        onEntryEdit={onEntryEdit}
                        onEntryDelete={onEntryDelete}
                        onEntryToggleStatus={onEntryToggleStatus}
                        dragType={dragType}
                        draggingEntryPositionId={draggingEntryPositionId}
                      />
                    </div>
                  )}
                </Draggable>
              );
            })}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );
}
