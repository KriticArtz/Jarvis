"use client";

import { useState } from "react";
import { Moon, Monitor, Sun } from "lucide-react";
import { Presence, type PresenceState } from "@/components/ui/presence";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Switch } from "@/components/ui/switch";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { Field, Input } from "@/components/ui/field";
import { ListGroup, ListRow } from "@/components/ui/list";

/** Interactive pieces of the /design preview (client-side state only; nothing is saved). */

export function AppearanceDemo({ size = "md" }: { size?: "sm" | "md" }) {
  const [mode, setMode] = useState<"light" | "dark" | "system">("system");
  return (
    <SegmentedControl
      aria-label="Appearance"
      size={size}
      value={mode}
      onChange={setMode}
      options={[
        { value: "light", label: "Light", icon: <Sun className="size-3.5" aria-hidden /> },
        { value: "dark", label: "Dark", icon: <Moon className="size-3.5" aria-hidden /> },
        { value: "system", label: "System", icon: <Monitor className="size-3.5" aria-hidden /> },
      ]}
    />
  );
}

export function SwitchDemo({ label, initial = true }: { label: string; initial?: boolean }) {
  const [on, setOn] = useState(initial);
  return <Switch checked={on} onCheckedChange={setOn} aria-label={label} />;
}

export function ViewDemo() {
  const [view, setView] = useState<"day" | "week" | "month">("day");
  return (
    <SegmentedControl
      aria-label="Calendar view"
      size="sm"
      value={view}
      onChange={setView}
      options={[
        { value: "day", label: "Day" },
        { value: "week", label: "Week" },
        { value: "month", label: "Month" },
      ]}
    />
  );
}

const STATES: { value: PresenceState; label: string }[] = [
  { value: "idle", label: "Idle" },
  { value: "listening", label: "Listening" },
  { value: "thinking", label: "Thinking" },
  { value: "acting", label: "Acting" },
];

export function PresenceDemo() {
  const [state, setState] = useState<PresenceState>("idle");
  return (
    <div className="flex flex-col items-center gap-8 py-6">
      <Presence size="hero" state={state} label={`Assistant, ${state}`} />
      <SegmentedControl aria-label="Presence state" value={state} onChange={setState} options={STATES} className="w-full max-w-md" />
    </div>
  );
}

export function SheetDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)} data-testid="open-sheet">
        Open a sheet
      </Button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Workout"
        description="Today · 6:00 – 6:45 PM · From your plan"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => setOpen(false)}>Save</Button>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <Field label="Title" htmlFor="sheet-title">
            <Input id="sheet-title" defaultValue="Workout" />
          </Field>
          <ListGroup title="When">
            <ListRow title="Starts" trailing={<span className="type-num text-foreground">6:00 PM</span>} />
            <ListRow title="Duration" trailing={<span className="type-num text-foreground">45 min</span>} />
            <ListRow title="Remind me" trailing={<SwitchDemo label="Remind me" />} />
          </ListGroup>
        </div>
      </Sheet>
    </>
  );
}

export function ToastDemo() {
  const toast = useToast();
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="secondary"
        data-testid="toast-success"
        onClick={() => toast({ title: "Moved to tomorrow, 6:00 PM", description: "Workout", tone: "success", action: { label: "View", onClick: () => {} } })}
      >
        Success toast
      </Button>
      <Button variant="secondary" onClick={() => toast({ title: "Saved" })}>
        Neutral toast
      </Button>
      <Button variant="secondary" onClick={() => toast({ title: "Couldn't reach your calendar", description: "Nothing was changed.", tone: "danger" })}>
        Error toast
      </Button>
    </div>
  );
}
