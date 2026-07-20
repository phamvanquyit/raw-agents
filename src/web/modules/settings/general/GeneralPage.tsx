import { TimezoneSection } from "./components/TimezoneSection";

export function GeneralPage() {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl bg-card p-4">
        <TimezoneSection />
      </div>
    </div>
  );
}
