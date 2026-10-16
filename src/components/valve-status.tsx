import { StatusChip } from "@/components/ui";

/**
 * The genuine on/off reading (`switch_6`, "Motor") plus the controller's
 * separate dry-run fault flag — two different questions, shown as two
 * chips rather than one (2026-10-16, corrected after shipping `motor_status`
 * alone as "valve status": "Normal" is a fault/health flag, not on/off, and
 * the two can disagree — "Dryrun" has been observed on this account while
 * the motor is currently off). The fault chip renders only when it is
 * actually faulted; a steady "Normal" badge on every healthy device would
 * be the same information-free decoration this product already avoids
 * elsewhere (Stat's own rule: a chip that's always the same colour says
 * nothing an absent chip wouldn't already say).
 */
export function ValveStatus({
  motorOn,
  motorStatus,
  label,
}: {
  motorOn: boolean | null;
  motorStatus: string | null;
  /** Prefixed onto the on/off chip's own text, e.g. "Valve: " — for a
   *  surface where the chip sits among others and needs to say what it's
   *  reporting (the portal's own card row). Omitted on a dedicated
   *  "Valve status" column/field, which already names it. */
  label?: string;
}) {
  if (motorOn === null && motorStatus === null) return <span>—</span>;
  const faulted = motorStatus !== null && motorStatus !== "Normal";
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {motorOn !== null && (
        <StatusChip tone={motorOn ? "ok" : "neu"}>
          {label}
          {motorOn ? "On" : "Off"}
        </StatusChip>
      )}
      {faulted && <StatusChip tone="warn">{motorStatus}</StatusChip>}
    </span>
  );
}
