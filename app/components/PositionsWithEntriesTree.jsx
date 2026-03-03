import { useState, useCallback } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { formatUTCForDisplay } from "./ThemeStream/utils";

const DRAG_HANDLE_STYLE = {
  cursor: "grab",
  padding: "0.25rem 0.5rem",
  color: "#6d7175",
  display: "inline-flex",
  alignItems: "center",
  userSelect: "none",
};

/** Sortable position row (parent) */
function SortablePosition({
  position,
  isExpanded,
  onToggle,
  onEdit,
  onDelete,
  canEdit,
  children,
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `position-${position.id}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0.5rem 0.75rem",
          border: "1px solid #e1e3e5",
          borderRadius: "6px",
          marginBottom: "0.25rem",
          backgroundColor: "#f9fafb",
        }}
      >
        <span
          {...attributes}
          {...listeners}
          style={DRAG_HANDLE_STYLE}
          title="Drag to reorder"
        >
          ⋮⋮
        </span>
        <button
          type="button"
          onClick={onToggle}
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
        <code
          style={{
            fontSize: "0.75rem",
            backgroundColor: "#e1e3e5",
            padding: "2px 6px",
            borderRadius: "4px",
          }}
        >
          {position.handle}
        </code>
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
      </div>
      {isExpanded && children}
    </div>
  );
}

/** Sortable entry row (child) */
function SortableEntry({
  entry,
  blockTypes,
  storeTimeZone,
  onEdit,
  onDelete,
  onToggleStatus,
}) {
  const fieldMap = Object.fromEntries(
    (entry.fields || []).map((f) => [f.key, f.value])
  );
  const referenceMap = Object.fromEntries(
    (entry.fields || []).map((f) => [f.key, f.reference])
  );
  const isActive = entry.capabilities?.publishable?.status === "ACTIVE";
  const desktopBannerUrl = referenceMap.desktop_banner?.image?.url;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `entry-${entry.id}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  let startDate = "—";
  let endDate = "—";
  try {
    if (fieldMap.start_at) startDate = formatUTCForDisplay(fieldMap.start_at, storeTimeZone);
    if (fieldMap.end_at) endDate = formatUTCForDisplay(fieldMap.end_at, storeTimeZone);
  } catch (_) {}

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        padding: "0.4rem 0.75rem",
        marginLeft: "2rem",
        marginBottom: "0.2rem",
        border: "1px solid #e1e3e5",
        borderRadius: "4px",
        backgroundColor: "white",
        fontSize: "0.8125rem",
      }}
    >
      <span
        {...attributes}
        {...listeners}
        style={DRAG_HANDLE_STYLE}
        title="Drag to reorder"
      >
        ⋮⋮
      </span>
      <label
        style={{
          display: "inline-flex",
          alignItems: "center",
          cursor: "pointer",
          minWidth: "44px",
          height: "22px",
        }}
      >
        <input
          type="checkbox"
          checked={isActive}
          onChange={() => onToggleStatus(entry, isActive)}
          style={{ marginRight: "0.25rem" }}
        />
      </label>
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
      <span style={{ color: "#6d7175", fontSize: "0.75rem" }}>
        {blockTypes[fieldMap.block_type || "hero"]?.label || "Hero"}
      </span>
      <span style={{ color: "#666", fontSize: "0.75rem" }}>
        {startDate} – {endDate}
      </span>
      <button
        type="button"
        onClick={() => onEdit(entry)}
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
        onClick={() => onDelete(entry)}
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

  const sensors = useSensors(
    useSensor(PointerSensor({ activationConstraint: { distance: 8 } })),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handlePositionDragEnd = useCallback(
    (event) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const ids = positions.map((p) => `position-${p.id}`);
      const oldIndex = ids.indexOf(active.id);
      const newIndex = ids.indexOf(over.id);
      if (oldIndex === -1 || newIndex === -1) return;
      const reordered = arrayMove(ids, oldIndex, newIndex);
      const positionIds = reordered.map((id) => id.replace("position-", ""));
      onPositionReorder?.(positionIds);
    },
    [positions, onPositionReorder]
  );

  const handleEntryDragEnd = useCallback(
    (event, positionHandle) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const positionEntries = entries.filter(
        (e) => {
          const fm = Object.fromEntries((e.fields || []).map((f) => [f.key, f.value]));
          return fm.position_id === positionHandle;
        }
      );
      const ids = positionEntries.map((e) => `entry-${e.id}`);
      const oldIndex = ids.indexOf(active.id);
      const newIndex = ids.indexOf(over.id);
      if (oldIndex === -1 || newIndex === -1) return;
      const reordered = arrayMove(ids, oldIndex, newIndex);
      const entryIds = reordered.map((id) => id.replace("entry-", ""));
      onEntryReorder?.(positionHandle, entryIds);
    },
    [entries, onEntryReorder]
  );

  const positionIds = positions.map((p) => `position-${p.id}`);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handlePositionDragEnd}
    >
      <SortableContext items={positionIds} strategy={verticalListSortingStrategy}>
        {positions.map((position) => {
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

          const entryIds = positionEntries.map((e) => `entry-${e.id}`);
          const isExpanded = expanded[position.id] !== false;

          return (
            <SortablePosition
              key={position.id}
              position={position}
              isExpanded={isExpanded}
              onToggle={() => toggleExpanded(position.id)}
              onEdit={onPositionEdit}
              onDelete={onPositionDelete}
              canEdit={!isDefaultPosition?.(position)}
            >
              {positionEntries.length > 0 ? (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={(e) => handleEntryDragEnd(e, position.handle)}
                >
                  <SortableContext
                    items={entryIds}
                    strategy={verticalListSortingStrategy}
                  >
                    <div style={{ marginTop: "0.25rem", marginBottom: "0.5rem" }}>
                      {positionEntries.map((entry) => (
                        <SortableEntry
                          key={entry.id}
                          entry={entry}
                          blockTypes={blockTypes}
                          storeTimeZone={storeTimeZone}
                          onEdit={onEntryEdit}
                          onDelete={onEntryDelete}
                          onToggleStatus={onEntryToggleStatus}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              ) : (
                <div
                  style={{
                    marginLeft: "2rem",
                    padding: "0.5rem",
                    color: "#6d7175",
                    fontSize: "0.8125rem",
                  }}
                >
                  No entries in this position
                </div>
              )}
            </SortablePosition>
          );
        })}
      </SortableContext>
    </DndContext>
  );
}
