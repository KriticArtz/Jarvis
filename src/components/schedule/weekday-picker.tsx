import { WEEKDAY_OPTIONS } from "@/lib/goal-options";

/** Checkbox row of weekdays (uncontrolled; submits `name` multiple times). */
export function WeekdayPicker({ name, defaultValue, legend }: { name: string; defaultValue: number[]; legend: string }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium">{legend}</legend>
      <div className="flex gap-1.5">
        {WEEKDAY_OPTIONS.map((d) => (
          <label key={d.value} className="relative">
            <input type="checkbox" name={name} value={d.value} defaultChecked={defaultValue.includes(d.value)} className="peer sr-only" />
            <span
              title={d.label}
              className="flex size-10 cursor-pointer items-center justify-center rounded-full border-2 border-transparent bg-surface-2 text-sm font-medium text-muted transition-all peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:text-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent"
            >
              {d.short}
            </span>
            <span className="sr-only">{d.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
