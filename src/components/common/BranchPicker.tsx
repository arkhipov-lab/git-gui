import { Text, TextInput } from "@mantine/core";
import { useState } from "react";
import styles from "../../styles/app.module.css";

export function BranchPicker({
  label,
  value,
  options,
  onChange,
}: {
  label?: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = options.find((option) => option.value === value);
  const needle = query.trim().toLowerCase();
  const shown = needle
    ? options.filter((option) => `${option.label} ${option.value}`.toLowerCase().includes(needle))
    : options;
  return (
    <div style={{ position: "relative", minWidth: 220, flex: 1 }}>
      <TextInput
        label={label}
        size="xs"
        value={open ? query : (selected?.label ?? value)}
        placeholder="Type to filter branches"
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        onBlur={() => setOpen(false)}
        onChange={(event) => {
          setQuery(event.currentTarget.value);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && shown[0]) {
            onChange(shown[0].value);
            setOpen(false);
          }
          if (event.key === "Escape") setOpen(false);
        }}
      />
      {open ? (
        <div className={styles.scroll} style={{ position: "absolute", zIndex: 20, left: 0, right: 0, maxHeight: 220, background: "var(--mantine-color-body)", border: "1px solid var(--mantine-color-default-border)" }}>
          {shown.length === 0 ? <Text size="xs" c="dimmed" p="xs">No matches</Text> : null}
          {shown.map((option) => (
            <button
              key={option.value}
              type="button"
              className={styles.branchOption}
              title={option.label}
              data-active={option.value === value}
              onMouseDown={(event) => {
                event.preventDefault();
                onChange(option.value);
                setOpen(false);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
