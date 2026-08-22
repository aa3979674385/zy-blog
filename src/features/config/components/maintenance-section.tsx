import { AutoSnapshotSettings } from "@/features/posts/components/admin/auto-snapshot-settings";
import { VersionMaintenance } from "@/features/version/components/version-maintenance";
import { SiteMaintenanceSettings } from "@/features/config/components/site-maintenance-settings";

export function MaintenanceSection() {
  return (
    <div className="space-y-12 animate-in fade-in slide-in-from-bottom-2 duration-700">
      <SiteMaintenanceSettings />

      <section className="border border-border/30 bg-background/50 p-8">
        <VersionMaintenance />
      </section>

      <AutoSnapshotSettings />
    </div>
  );
}
