import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { ProjectData } from '@/types/database'
import { EngineeringForm } from '@/forms/EngineeringForm'
import { QaqcHseForm } from '@/forms/QaqcHseForm'
import { ActualResourcesForm } from '@/forms/ActualResourcesForm'
import { DynamicActualDataForm } from '@/forms/DynamicActualDataForm'
import { ProjectDataForm } from '@/forms/ProjectDataForm'
import { AreasOfConcernForm } from '@/forms/AreasOfConcernForm'
import { VariationsForm } from '@/forms/VariationsForm'
import { TradesForm } from '@/forms/TradesForm'
import { SubtradesForm } from '@/forms/SubtradesForm'
import { PaymentsForm } from '@/forms/PaymentsForm'
import { ReferenceDataForm } from '@/forms/ReferenceDataForm'
import { P6ActivityOutputForm } from '@/forms/P6ActivityOutputForm'
import { P6ActivityUpdatesForm } from '@/forms/P6ActivityUpdatesForm'
import { P6ProjectMappingForm } from '@/forms/P6ProjectMappingForm'
import { P6RunTriggerForm } from '@/forms/P6RunTriggerForm'
import { PhotoUploadForm } from '@/forms/PhotoUploadForm'

type TabKey =
  | 'engineering'
  | 'qaqc'
  | 'resources'
  | 'dynamic'
  | 'projectdata'
  | 'aoc'
  | 'variations'
  | 'trades'
  | 'subtrades'
  | 'discipline'
  | 'type'
  | 'payments'
  | 'referencedata'
  | 'p6activityoutput'
  | 'p6activityupdates'
  | 'p6projectmapping'
  | 'p6runtrigger'
  | 'photos'

interface Tab {
  key: TabKey
  label: string
  icon: JSX.Element
  group?: string
}

const tabs: Tab[] = [
  {
    key: 'engineering',
    label: 'Engineering',
    icon: (
      <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    key: 'qaqc',
    label: 'QAQC / HSE',
    icon: (
      <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    key: 'resources',
    label: 'Actual Resources',
    icon: (
      <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
  },
  {
    key: 'dynamic',
    label: 'Dynamic Actual Data',
    icon: (
      <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
  {
    key: 'projectdata',
    label: 'Project Data',
    icon: (
      <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    key: 'aoc',
    label: 'Areas of Concern',
    icon: (
      <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-2.194-.833-2.964 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
      </svg>
    ),
  },
  {
    key: 'variations',
    label: 'Variations',
    icon: (
      <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 8v-4m0 4l-4-4m4 4l4-4M3 12h18" />
      </svg>
    ),
  },
  {
    key: 'trades',
    label: 'Trades',
    icon: (
      <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
  },
  {
    key: 'subtrades',
    label: 'Subtrades',
    icon: (
      <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
      </svg>
    ),
  },
  {
    key: 'payments',
    label: 'Payments',
    icon: (
      <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
  },
  {
    key: 'referencedata',
    label: 'Reference Data',
    icon: (
      <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
      </svg>
    ),
  },
  {
    key: 'p6activityupdates',
    label: 'Activity Updates',
    group: 'P6 Scheduler',
    icon: (
      <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    ),
  },
  {
    key: 'p6activityoutput',
    label: 'Activity Output',
    group: 'P6 Scheduler',
    icon: (
      <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    key: 'p6projectmapping',
    label: 'Project Mapping',
    group: 'P6 Scheduler',
    icon: (
      <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
      </svg>
    ),
  },
  {
    key: 'p6runtrigger',
    label: 'Run Trigger',
    group: 'P6 Scheduler',
    icon: (
      <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    key: 'photos',
    label: 'Photos',
    icon: (
      <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
]

interface ProjectInfo {
  id: string
  projectname: string | null
  contractorsname: string | null
  textProjectId: string | null
  location: string | null
  startdate: string | null
  enddate: string | null
}

function App() {
  const [view, setView] = useState<'home' | 'app'>('home')
  const [activeTab, setActiveTab] = useState<TabKey>('engineering')
  const [sidebarExpanded, setSidebarExpanded] = useState(true)
  const [projectInfo, setProjectInfo] = useState<ProjectInfo[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')

  const fetchProjectInfo = async () => {
    const { data } = await supabase
      .from('dbp6_0000_projectdata')
      .select('*')
      .order('dgt_projectname', { ascending: true })
    const rows = data as ProjectData[] | null
    if (rows) {
      setProjectInfo(rows.map(p => ({
        id: p.dgt_dbp6bd00projectdataid,
        projectname: p.dgt_projectname,
        contractorsname: p.dgt_contractorsname,
        textProjectId: p.dgt_projectid,
        location: p.dgt_location,
        startdate: p.dgt_projectstartdate,
        enddate: p.dgt_projectenddate,
      })))
    }
  }

  useEffect(() => {
    fetchProjectInfo()
  }, [])

  const handleSelectProject = (projectId: string) => {
    setSelectedProjectId(projectId)
    setActiveTab('engineering')
    setView('app')
  }

  const handleBackToHome = () => {
    fetchProjectInfo()
    setView('home')
  }

  const selectedProject = projectInfo.find(p => p.id === selectedProjectId)

  const renderTabContent = () => {
    const projectTextId = selectedProject?.textProjectId || ''
    switch (activeTab) {
      case 'engineering':
        return <EngineeringForm projectId={selectedProjectId} />
      case 'qaqc':
        return <QaqcHseForm projectId={selectedProjectId} />
      case 'resources':
        return <ActualResourcesForm projectId={selectedProjectId} />
      case 'dynamic':
        return <DynamicActualDataForm projectId={selectedProjectId} />
      case 'projectdata':
        return <ProjectDataForm projectId={selectedProjectId} />
      case 'aoc':
        return <AreasOfConcernForm projectId={selectedProjectId} />
      case 'variations':
        return <VariationsForm projectTextId={projectTextId} />
      case 'trades':
        return <TradesForm projectId={selectedProjectId} />
      case 'subtrades':
        return <SubtradesForm projectId={selectedProjectId} />
      case 'payments':
        return <PaymentsForm projectId={selectedProjectId} />
      case 'referencedata':
        return <ReferenceDataForm />
      case 'p6activityoutput':
        return <P6ActivityOutputForm />
      case 'p6activityupdates':
        return <P6ActivityUpdatesForm projectTextId={projectTextId} />
      case 'p6projectmapping':
        return <P6ProjectMappingForm />
      case 'p6runtrigger':
        return <P6RunTriggerForm />
      case 'photos':
        return <PhotoUploadForm projectId={selectedProjectId} />
      default:
        return null
    }
  }

  const activeLabel = tabs.find(t => t.key === activeTab)?.label ?? ''

  const formatDate = (d: string | null) => {
    if (!d) return null
    try { return new Date(d).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) } catch { return null }
  }

  if (view === 'home') {
    return (
      <div className="min-h-screen bg-gray-100">
        <div className="max-w-6xl mx-auto px-6 py-12">
          <div className="text-center mb-10">
            <div className="flex justify-center mb-4">
              <div className="bg-blue-600 p-3 rounded-xl">
                <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                </svg>
              </div>
            </div>
            <h1 className="text-3xl font-bold text-gray-900">P6 Project Controls</h1>
            <p className="text-gray-500 mt-2">Select a project to view and manage its data</p>
          </div>

          {projectInfo.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <p className="text-lg">No projects found.</p>
              <p className="text-sm mt-1">Go to Project Data to create a new project.</p>
              <button
                onClick={() => { setSelectedProjectId(''); setView('app'); setActiveTab('projectdata') }}
                className="mt-4 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
              >
                Go to Project Data
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {projectInfo.map(p => (
                <div
                  key={p.id}
                  className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 hover:shadow-md transition-shadow flex flex-col"
                >
                  <div className="flex-1">
                    <h3 className="text-base font-bold text-gray-900 leading-tight">
                      {p.projectname || 'Unnamed Project'}
                    </h3>
                    {p.contractorsname && (
                      <p className="text-sm text-gray-600 mt-1">{p.contractorsname}</p>
                    )}
                    {p.location && (
                      <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                        <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        {p.location}
                      </p>
                    )}
                    {(p.startdate || p.enddate) && (
                      <p className="text-xs text-gray-400 mt-1">
                        {formatDate(p.startdate)}{p.startdate && p.enddate ? ' → ' : ''}{formatDate(p.enddate)}
                      </p>
                    )}
                    {p.textProjectId && (
                      <p className="text-xs font-mono text-gray-400 mt-2">{p.textProjectId}</p>
                    )}
                  </div>
                  <button
                    onClick={() => handleSelectProject(p.id)}
                    className="mt-4 w-full px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Open Project
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`flex flex-col bg-white border-r border-gray-200 transition-all duration-300 ${
          sidebarExpanded ? 'w-56' : 'w-16'
        }`}
      >
        {/* Logo / Brand */}
        <div className={`flex items-center gap-3 px-3 py-4 border-b border-gray-200 ${sidebarExpanded ? '' : 'justify-center'}`}>
          <div className="bg-blue-600 p-1.5 rounded-lg flex-shrink-0">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
            </svg>
          </div>
          {sidebarExpanded && (
            <div className="overflow-hidden">
              <p className="text-sm font-bold text-gray-900 leading-tight">P6 Controls</p>
              <p className="text-xs text-gray-500 leading-tight">Data Management</p>
            </div>
          )}
        </div>

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto py-2">
          {tabs.map((tab, idx) => {
            const prevGroup = idx > 0 ? tabs[idx - 1].group : undefined
            const isNewGroup = tab.group && tab.group !== prevGroup
            return (
              <div key={tab.key}>
                {isNewGroup && (
                  sidebarExpanded
                    ? <div className="px-3 pt-3 pb-1"><span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{tab.group}</span></div>
                    : <div className="mx-3 my-2 border-t border-gray-200" />
                )}
                <button
                  onClick={() => setActiveTab(tab.key)}
                  title={!sidebarExpanded ? tab.label : undefined}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium transition-colors ${
                    sidebarExpanded ? '' : 'justify-center'
                  } ${
                    activeTab === tab.key
                      ? 'bg-blue-50 text-blue-600 border-r-2 border-blue-600'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  {tab.icon}
                  {sidebarExpanded && <span className="truncate">{tab.label}</span>}
                </button>
              </div>
            )
          })}
        </nav>

        {/* Toggle button */}
        <div className="border-t border-gray-200 p-2">
          <button
            onClick={() => setSidebarExpanded(prev => !prev)}
            title={sidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
            className={`w-full flex items-center gap-2 px-2 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-md transition-colors ${
              sidebarExpanded ? '' : 'justify-center'
            }`}
          >
            {sidebarExpanded ? (
              <>
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                </svg>
                <span className="text-xs">Collapse</span>
              </>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
              </svg>
            )}
          </button>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 flex-shrink-0">
          <div className="px-6 py-2 border-b border-gray-100 overflow-x-auto">
            <div className="flex items-center gap-4 whitespace-nowrap">
              <button
                onClick={handleBackToHome}
                className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Projects
              </button>
              <div className="h-4 w-px bg-gray-300" />
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-500">Contractor:</span>
                <span className="text-sm font-semibold text-gray-900">{selectedProject?.contractorsname || '—'}</span>
              </div>
              <div className="h-4 w-px bg-gray-300" />
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-500">Project:</span>
                <span className="text-sm font-semibold text-gray-900">{selectedProject?.projectname || '—'}</span>
              </div>
            </div>
          </div>
          <div className="px-6 py-2">
            <h2 className="text-2xl font-bold text-gray-900 text-center">{activeLabel}</h2>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto px-6 py-6">
          {renderTabContent()}
        </main>

        {/* Footer */}
        <footer className="bg-white border-t border-gray-200 px-6 py-3 flex-shrink-0">
          <p className="text-center text-xs text-gray-400">P6 Project Controls Data Management</p>
        </footer>
      </div>
    </div>
  )
}

export default App
