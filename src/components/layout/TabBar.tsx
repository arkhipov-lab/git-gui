import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Text, Tooltip } from "@mantine/core";
import { baseName } from "../../features/workspace/tabs";
import styles from "../../styles/app.module.css";

export function TabBar({
  tabs,
  active,
  onActivate,
  onClose,
  onReorder,
}: {
  tabs: string[];
  active: string | null;
  onActivate: (path: string) => void;
  onClose: (path: string) => void;
  onReorder: (from: number, to: number) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  return (
    <div className={styles.tabs} role="tablist">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(event) => finishDrag(event, tabs, onReorder)}>
        <SortableContext items={tabs} strategy={horizontalListSortingStrategy}>
          {tabs.map((path) => (
            <RepoTab key={path} path={path} active={path === active} onActivate={onActivate} onClose={onClose} />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
}

function finishDrag(event: DragEndEvent, tabs: string[], onReorder: (from: number, to: number) => void) {
  const over = event.over?.id;
  if (!over || event.active.id === over) return;
  const from = tabs.indexOf(String(event.active.id));
  const to = tabs.indexOf(String(over));
  if (from >= 0 && to >= 0) onReorder(from, to);
}

function RepoTab({
  path,
  active,
  onActivate,
  onClose,
}: {
  path: string;
  active: boolean;
  onActivate: (path: string) => void;
  onClose: (path: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: path });
  const name = baseName(path);
  return (
    <Tooltip label={path} openDelay={400}>
      <button
        ref={setNodeRef}
        className={`${styles.tab} ${active ? styles.tabActive : ""}`}
        style={{ transform: CSS.Transform.toString(transform), transition }}
        onClick={() => onActivate(path)}
        onAuxClick={(event) => {
          if (event.button === 1) onClose(path);
        }}
        {...attributes}
        {...listeners}
        role="tab"
        aria-selected={active}
        aria-label={name}
      >
        <span className={styles.tabName}>{name}</span>
        <Text
          span
          className={styles.meta}
          role="button"
          aria-label={`Close ${name}`}
          onClick={(event) => {
            event.stopPropagation();
            onClose(path);
          }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          ×
        </Text>
      </button>
    </Tooltip>
  );
}
