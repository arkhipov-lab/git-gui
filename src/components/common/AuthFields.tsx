import { NativeSelect } from "@mantine/core";
import { useSettingsStore } from "../../stores/settingsStore";
import { usableIdentities, usableKeys } from "../../features/auth";

export function SshSelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const keys = useSettingsStore((state) => state.sshKeys);
  const options = usableKeys(keys).map((key) => ({ value: key.id, label: key.label.trim() || key.path }));
  return (
    <NativeSelect
      label="SSH key"
      description="Git default uses the SSH config and agent on this Mac. The choice is remembered for this repository when the command runs."
      value={value}
      data={[{ value: "", label: "Git default" }, ...options]}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  );
}

export function IdentitySelect({
  value,
  onChange,
  committerOnly = false,
}: {
  value: string;
  onChange: (id: string) => void;
  committerOnly?: boolean;
}) {
  const identities = useSettingsStore((state) => state.identities);
  const options = usableIdentities(identities).map((identity) => ({
    value: identity.id,
    label: identity.label.trim() || `${identity.name} <${identity.email}>`,
  }));
  return (
    <NativeSelect
      label="Name and email"
      description={committerOnly
        ? "The original author stays. This pair is the committer. Git default uses user.name and user.email from Git config. The choice is remembered for this repository when the command runs."
        : "This pair is the author and committer. Git default uses user.name and user.email from Git config. The choice is remembered for this repository when the command runs."}
      value={value}
      data={[{ value: "", label: "Git default" }, ...options]}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  );
}
