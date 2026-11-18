import Dashboard from '@/boltDashboard/components/Dashboard'
import { DashboardStorageContext } from '@/boltDashboard/utils/storedSelection'
import '@/boltDashboard/dashboard.css'

export function BoltWeeklyDashboardForm({ projectTextId, schemaName }: { projectTextId: string; schemaName: string }) {
  if (!projectTextId) return <p className="p-4 text-gray-600">Select a project to view the Bolt weekly dashboard.</p>
  return <DashboardStorageContext.Provider value={`bolt-dashboard:${schemaName}:${projectTextId}`}>
    <Dashboard key={`${schemaName}:${projectTextId}`} projectTextId={projectTextId} schemaName={schemaName} />
  </DashboardStorageContext.Provider>
}
