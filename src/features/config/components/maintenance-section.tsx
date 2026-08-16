import { CacheMaintenance } from "@/features/cache/components/cache-maintenance";
import { AutoSnapshotSettings } from "@/features/posts/components/admin/auto-snapshot-settings";
import { SearchMaintenance } from "@/features/search/components/search-maintenance";
import { VersionMaintenance } from "@/features/version/components/version-maintenance";
import { SiteMaintenanceSettings } from "@/features/config/components/site-maintenance-settings";

export function MaintenanceSection() {
  return (
    <div className="space-y-12 animate-in fade-in slide-in-from-bottom-2 duration-700">
      <SiteMaintenanceSettings />

      <section className="border border-border/30 bg-background/50 p-8">
        <VersionMaintenance />
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-10">
        <SearchMaintenance />
        <CacheMaintenance />
      </div>

      <AutoSnapshotSettings />
    </div>
  );
}
