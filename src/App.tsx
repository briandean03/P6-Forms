import { useState } from 'react'
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

interface Tab {
  key: TabKey
  label: string
  icon: JSX.Element
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
]

function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('engineering')
  const [sidebarExpanded, setSidebarExpanded] = useState(true)

  const renderTabContent = () => {
    switch (activeTab) {
      case 'engineering':
        return <EngineeringForm />
      case 'qaqc':
        return <QaqcHseForm />
      case 'resources':
        return <ActualResourcesForm />
      case 'dynamic':
        return <DynamicActualDataForm />
      case 'projectdata':
        return <ProjectDataForm />
      case 'aoc':
        return <AreasOfConcernForm />
      case 'variations':
        return <VariationsForm />
      case 'trades':
        return <TradesForm />
      case 'subtrades':
        return <SubtradesForm />
      case 'payments':
        return <PaymentsForm />
      case 'referencedata':
        return <ReferenceDataForm />
      default:
        return null
    }
  }

  const activeLabel = tabs.find(t => t.key === activeTab)?.label ?? ''

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
          {tabs.map((tab) => (
            <button
              key={tab.key}
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
              {sidebarExpanded && (
                <span className="truncate">{tab.label}</span>
              )}
            </button>
          ))}
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
        <header className="bg-white border-b border-gray-200 px-6 py-3 flex-shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">{activeLabel}</h2>
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
