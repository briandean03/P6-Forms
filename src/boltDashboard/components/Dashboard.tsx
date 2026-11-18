import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Loader2, Printer, AlertTriangle, RefreshCw } from "lucide-react";
import {
  ApprovedDesign,
  ApprovedStructure,
  createDashboardSource,
  WidgetRow,
} from "@/boltDashboard/api/dashboardApi";
import { buildTheme, themeToCssVars, radius, shadow, space } from "@/boltDashboard/theme/designTheme";
import { WidgetRenderer } from "@/boltDashboard/components/WidgetRenderer";
import { readStoredStrings, writeStoredStrings } from "@/boltDashboard/utils/storedSelection";

type LoadError = { message: string; status: number };

function formatReportDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function FullScreenMessage({
  theme,
  icon,
  title,
  detail,
  onRetry,
}: {
  theme: ReturnType<typeof buildTheme>;
  icon: React.ReactNode;
  title: string;
  detail?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: theme.colors.canvas ?? "#F4F3F8" }}>
      <div
        className="flex flex-col items-center gap-3 text-center p-8 max-w-md"
        style={{ background: theme.colors.surface_primary ?? "#FFF", borderRadius: radius(theme, "analytical_panel"), boxShadow: shadow(theme, "shadow_modal") }}
      >
        {icon}
        <h2 className="text-[16px] font-bold" style={{ color: theme.colors.text_primary }}>
          {title}
        </h2>
        {detail && (
          <p className="text-[13px] leading-5" style={{ color: theme.colors.text_secondary }}>
            {detail}
          </p>
        )}
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-1 px-4 py-2 text-[12px] font-semibold inline-flex items-center gap-2"
            style={{
              borderRadius: radius(theme, "button"),
              background: theme.colors.primary ?? "#5741DF",
              color: theme.colors.text_on_primary ?? "#FFF",
              cursor: "pointer",
            }}
          >
            <RefreshCw size={13} /> Try again
          </button>
        )}
      </div>
    </div>
  );
}

export default function Dashboard({ schemaName, projectTextId }: { schemaName: string; projectTextId: string }) {
  useEffect(() => {
    document.documentElement.classList.add('bolt-dashboard-printing');
    return () => document.documentElement.classList.remove('bolt-dashboard-printing');
  }, []);
  const source = useMemo(() => createDashboardSource(schemaName, projectTextId), [schemaName, projectTextId]);
  const KPI_SELECTION_STORAGE_KEY = `bolt-dashboard:${schemaName}:${projectTextId}:kpis`;
  const [structures, setStructures] = useState<ApprovedStructure[] | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [retry, setRetry] = useState(0);
  const [design, setDesign] = useState<ApprovedDesign | null>(null);
  const [structure, setStructure] = useState<ApprovedStructure | null>(null);
  const [designError, setDesignError] = useState<LoadError | null>(null);
  const [widgets, setWidgets] = useState<WidgetRow[] | null>(null);
  const [widgetsLoading, setWidgetsLoading] = useState(false);
  const [widgetsError, setWidgetsError] = useState<LoadError | null>(null);
  const [activeSection, setActiveSection] = useState(0);
  const [approvalStatus, setApprovalStatus] = useState<'Approved' | 'Draft'>('Approved');
  const [kpiSelection, setKpiSelection] = useState<string[] | null>(() => readStoredStrings(KPI_SELECTION_STORAGE_KEY));
  const setPersistedKpiSelection = (kpis: string[] | null) => {
    setKpiSelection(kpis);
    writeStoredStrings(KPI_SELECTION_STORAGE_KEY, kpis);
  };
  const sectionRefs = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    let cancelled = false;
    setDesignError(null);
    setStructures(null);
    source.listStructures().then(rows => {
      if (cancelled) return;
      setStructures(rows);
      setSelectedId(rows[0]?.structure_id ?? '');
    }).catch(error => { if (!cancelled) setDesignError({ message: error.message, status: 0 }); });
    return () => { cancelled = true; };
  }, [source, retry]);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setWidgetsLoading(true);
    setWidgets(null);
    setStructure(null);
    setWidgetsError(null);
    setDesignError(null);
    source.load(selectedId).then(result => {
      if (cancelled) return;
      setStructure(result.structure);
      setDesign(result.design);
      setWidgets(result.widgets);
      setWidgetsError(result.warning ? { message: result.warning, status: 0 } : null);
      setActiveSection(0);
    }).catch(error => { if (!cancelled) setDesignError({ message: error.message, status: 0 }); })
      .finally(() => { if (!cancelled) setWidgetsLoading(false); });
    return () => { cancelled = true; };
  }, [source, selectedId, retry]);

  const theme = useMemo(() => buildTheme(design ?? FALLBACK_DESIGN), [design]);

  const pages = useMemo(() => structure?.structure_plan?.pages ?? [], [structure]);

  // Highlight the section currently in view while scrolling continuously.
  useEffect(() => {
    if (!pages.length) return;
    const els = sectionRefs.current.filter(Boolean) as HTMLElement[];
    if (!els.length) return;
    if (typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) {
          const idx = els.indexOf(top.target as HTMLElement);
          if (idx >= 0) setActiveSection(idx);
        }
      },
      { rootMargin: "-64px 0px -60% 0px", threshold: 0 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [pages, widgets, widgetsLoading]);

  const scrollToSection = (i: number) => {
    sectionRefs.current[i]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const widgetsByPage = useMemo(() => {
    const map: Record<string, WidgetRow[]> = {};
    for (const w of widgets ?? []) {
      (map[w.page_id] ??= []).push(w);
    }
    for (const k of Object.keys(map)) map[k].sort((a, b) => a.widget_order - b.widget_order);
    return map;
  }, [widgets]);


  if (designError) {
    return (
      <FullScreenMessage
        theme={theme}
        icon={<AlertTriangle size={28} style={{ color: theme.colors.critical ?? "#DB694F" }} />}
        title="Dashboard unavailable"
        detail={designError.message}
        onRetry={() => setRetry(value => value + 1)}
      />
    );
  }

  if (structures?.length === 0) return <FullScreenMessage theme={theme} icon={<AlertTriangle size={28} />} title="No weekly dashboards available" detail="No dashboard structures were found for the selected project. Generate a dashboard using the existing report workflow, then refresh." onRetry={() => setRetry(value => value + 1)} />;

  if (!design || !structure) {
    return (
      <FullScreenMessage
        theme={theme}
        icon={<Loader2 size={28} className="animate-spin" style={{ color: theme.colors.primary ?? "#5741DF" }} />}
        title="Loading dashboard design and structure…"
        detail="Loading the selected project’s dashboard design, structure, and widgets."
      />
    );
  }

  return (
    <div style={themeToCssVars(theme)} className="bolt-dashboard min-h-screen" >
      {/* Application header */}
      <header
        className="sticky top-0 z-20 flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between md:px-8"
        style={{
          background: theme.colors.app_header_bg ?? "#FFF",
          borderBottom: `1px solid ${theme.colors.subtle_border ?? "#ECEAF6"}`,
          minHeight: 56,
        }}
      >
        <div className="min-w-0">
          <h1 className="truncate text-[16px] font-semibold leading-6 md:text-[18px]" style={{ color: theme.colors.text_primary }}>
            {structure.dashboard_title}
          </h1>
          <p className="truncate text-[11px] leading-4" style={{ color: theme.colors.muted_text }}>
            {structure.project_id}
          </p>
        </div>
        <div className="no-print flex flex-wrap items-center gap-2 md:justify-end">
          <span
            className="inline-flex items-center rounded-full px-3 py-1.5 text-[16px] font-semibold"
            style={{ background: theme.colors.primary_light ?? "#E7E3FA", color: theme.colors.primary ?? "#5741DF" }}
          >
            Week {structure.week_num}
          </span>
          <span className="px-2 text-[14px] font-medium" style={{ color: theme.colors.text_secondary }}>
            Data Date: <strong style={{ color: theme.colors.text_primary }}>{formatReportDate(structure.data_date)}</strong>
          </span>
          <label className="relative no-print">
            <span className="sr-only">Approval status</span>
            <select
              value={approvalStatus}
              onChange={(e) => setApprovalStatus(e.target.value as 'Approved' | 'Draft')}
              className="appearance-none rounded-lg border py-2 pl-3 pr-9 text-[14px] font-medium outline-none transition-colors"
              style={{
                borderColor: approvalStatus === 'Approved' ? (theme.colors.success ?? "#359D78") : (theme.colors.subtle_border ?? "#D9D6E8"),
                background: approvalStatus === 'Approved' ? (theme.colors.positive_bg ?? "#E6F5EF") : (theme.colors.surface_primary ?? "#FFFFFF"),
                color: approvalStatus === 'Approved' ? (theme.colors.success ?? "#359D78") : theme.colors.text_primary,
              }}
            >
              <option value="Approved">Approved</option>
              <option value="Draft">Draft</option>
            </select>
            <ChevronDown size={16} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" style={{ color: approvalStatus === 'Approved' ? (theme.colors.success ?? "#359D78") : theme.colors.text_secondary }} />
          </label>
          <label className="relative no-print">
            <span className="sr-only">Select reporting week</span>
            <select
              value={selectedId}
              onChange={(event) => setSelectedId(event.target.value)}
              className="appearance-none rounded-lg border py-2 pl-3 pr-9 text-[14px] font-medium outline-none transition-colors"
              style={{
                borderColor: theme.colors.subtle_border ?? "#D9D6E8",
                background: theme.colors.surface_primary ?? "#FFFFFF",
                color: theme.colors.text_primary,
              }}
              disabled={!structures?.length || widgetsLoading}
            >
              {(structures ?? []).map((candidate) => (
                <option key={candidate.structure_id} value={candidate.structure_id}>
                  Week {candidate.week_num} · {formatReportDate(candidate.data_date)}
                </option>
              ))}
            </select>
            <ChevronDown size={16} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" style={{ color: theme.colors.text_secondary }} />
          </label>
          <button
            onClick={() => window.print()}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-[12px] font-semibold transition-opacity hover:opacity-90"
            style={{ background: theme.colors.primary ?? "#5741DF", color: theme.colors.text_on_primary ?? "#FFF", cursor: "pointer" }}
          >
            <Printer size={14} /> Print report
          </button>
        </div>
      </header>

      <div className="flex">
        {/* Section navigation */}
        <nav
          className="no-print hidden md:flex flex-col gap-1 shrink-0 sticky top-[57px] self-start p-3"
          style={{ width: 232, height: "calc(100vh - 57px)", background: theme.colors.sidebar_bg ?? "#FFF", borderRight: `1px solid ${theme.colors.subtle_border ?? "#ECEAF6"}` }}
          aria-label="Dashboard sections"
        >
          {pages.map((p, i) => (
            <button
              key={p.page_id}
              onClick={() => scrollToSection(i)}
              className="text-left px-3 text-[13px] font-medium transition-colors"
              style={{
                height: 40,
                display: "flex",
                alignItems: "center",
                borderRadius: radius(theme, "navigation_pill"),
                background: activeSection === i ? (theme.colors.selected_nav_bg ?? theme.colors.primary_light ?? "#E7E3FA") : "transparent",
                color: activeSection === i ? (theme.colors.selected_nav_text ?? theme.colors.primary) : (theme.colors.text_secondary ?? theme.colors.text_primary),
                cursor: "pointer",
              }}
            >
              {p.title}
            </button>
          ))}
        </nav>

        {/* Main content */}
        <div className="flex-1 min-w-0 px-4 md:px-8 py-6" style={{ background: theme.colors.canvas ?? "#F4F3F8" }}>
          {/* Mobile section pills */}
          <div className="md:hidden flex gap-2 overflow-x-auto pb-4 -mx-1 px-1 no-print">
            {pages.map((p, i) => (
              <button
                key={p.page_id}
                onClick={() => scrollToSection(i)}
                className="shrink-0 px-3 py-1.5 text-[11px] font-semibold whitespace-nowrap"
                style={{
                  borderRadius: radius(theme, "navigation_pill"),
                  background: activeSection === i ? (theme.colors.primary ?? "#5741DF") : (theme.colors.surface_primary ?? "#FFF"),
                  color: activeSection === i ? (theme.colors.text_on_primary ?? "#FFF") : theme.colors.text_secondary,
                  border: `1px solid ${theme.colors.subtle_border ?? "#ECEAF6"}`,
                  cursor: "pointer",
                }}
              >
                {p.title}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-4">
            {widgetsLoading && (
              <div className="flex items-center justify-center gap-2 py-16 text-[13px] font-medium" style={{ color: theme.colors.text_secondary }}>
                <Loader2 size={16} className="animate-spin" /> Loading widgets for the selected update…
              </div>
            )}

            {widgetsError && !widgetsLoading && (
              <div
                className="flex items-start gap-2.5 p-4"
                style={{ background: theme.colors.negative_bg ?? "#FBE9E5", borderRadius: radius(theme, "analytical_panel") }}
              >
                <AlertTriangle size={16} className="shrink-0 mt-0.5" style={{ color: theme.colors.critical ?? "#DB694F" }} />
                <div>
                  <p className="text-[13px] font-semibold" style={{ color: theme.colors.text_primary }}>
                    Widget data could not be validated
                  </p>
                  <p className="text-[12px] mt-1 leading-5" style={{ color: theme.colors.text_secondary }}>
                    {widgetsError.message}
                  </p>
                </div>
              </div>
            )}

            {/* All sections stacked for continuous scrolling */}
            {pages.map((p, i) => {
              const pageWidgets = widgets && !widgetsLoading ? (widgetsByPage[p.page_id] ?? []) : [];
              return (
                <section
                  key={p.page_id}
                  ref={(el) => {
                    sectionRefs.current[i] = el;
                  }}
                  className="bolt-print-section scroll-mt-[72px]"
                >
                  <h2 className="bolt-section-heading text-[16px] md:text-[18px] font-semibold mb-4" style={{ color: theme.colors.text_primary, letterSpacing: "0" }}>
                    {p.title}
                  </h2>
                  {pageWidgets.length > 0 ? (
                    <div className="bolt-widget-grid grid grid-cols-1 md:grid-cols-12 gap-4 min-w-0" style={{ rowGap: space(theme, "gap_xl") }}>
                      {pageWidgets.map((w) => {
                        const placement = (p.widgets ?? []).find((pl) => pl.widget_id === w.widget_id);
                        return (
                          <div className="contents bolt-print-item" key={`${w.widget_record_id ?? w.widget_id}:${w.id}`}>
                          <p className="hidden bolt-print-context">{structure.dashboard_title} · {p.title} · Week {structure.week_num} · {structure.data_date}</p>
                          <WidgetRenderer
                            theme={theme}
                            widget={w}
                            placement={{ column_span: placement?.grid?.column_span }}
                            dataDate={structure?.data_date}
                            kpiSelection={kpiSelection}
                            onKpiSelectionChange={setPersistedKpiSelection}
                          />
                          </div>
                        );
                      })}
                    </div>
                  ) : widgetsLoading ? null : (
                    <p className="py-10 text-center text-[13px]" style={{ color: theme.colors.muted_text }}>
                      No widgets delivered for this section in the selected update.
                    </p>
                  )}
                </section>
              );
            })}

          </div>
        </div>
      </div>
    </div>
  );
}

// Used only while the approved design is still loading; replaced by the real
// token set as soon as the design endpoint responds.
const FALLBACK_DESIGN: ApprovedDesign = {
  id: 0,
  design_id: "",
  design_name: "loading",
  design_version: "0",
  design_specification: {
    radii: {},
    shadows: { shadow_card: "0 1px 2px rgba(36,37,45,0.04), 0 8px 24px rgba(36,37,45,0.04)" },
    spacing: {},
    navigation: {},
    typography: {},
    chart_styles: {},
    color_tokens: {},
    semantic_colors: {},
    table_styles: {},
    print_specification: {},
    responsive_breakpoints: {},
    design_name: "loading",
    design_version: "0",
  },
};
