import { Button, Loader, type ButtonProps } from "@mantine/core";
import type { ComponentPropsWithoutRef } from "react";
import { progressText } from "../../features/progress";

type Props = ButtonProps &
  ComponentPropsWithoutRef<"button"> & {
    busy?: boolean;
    label: string;
    progress?: string;
  };

export function BusyButton({ busy = false, label, progress, title, style, disabled, leftSection, ...props }: Props) {
  return (
    <Button
      {...props}
      disabled={Boolean(disabled) || busy}
      leftSection={busy ? <Loader size={12} color="currentColor" /> : leftSection}
      title={busy && progress ? progress : title}
      style={busy ? { maxWidth: 320, ...(style && typeof style === "object" ? style : {}) } : style}
    >
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {busy ? progressText(label, progress) : label}
      </span>
    </Button>
  );
}
