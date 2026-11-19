import { isDashboardWidgetVisible } from '@/lib/dashboardVisibility';
export interface DesignTokenColor {
  hex: string;
  usage?: string;
  meaning?: string;
  color_token?: string;
}

export interface DesignSpecification {
  radii: Record<string, number>;
  shadows: Record<string, string>;
  spacing: Record<string, number>;
  navigation: Record<string, unknown>;
  typography: Record<string, Record<string, unknown>>;
  chart_styles: Record<string, unknown>;
  color_tokens: Record<string, DesignTokenColor>;
  semantic_colors: Record<string, DesignTokenColor>;
  table_styles: Record<string, unknown>;
  print_specification: Record<string, unknown>;
  responsive_breakpoints: Record<string, Record<string, unknown>>;
  design_name: string;
  design_version: string;
}

export interface ApprovedDesign {
  id: number;
  design_id: string;
  design_name: string;
  design_version: string;
  design_specification: DesignSpecification;
}

export interface StructureWidgetPlacement {
  widget_id: string;
  widget_type: string;
  title: string;
  display_order: number;
  page_id: string;
  semantic_role: string;
  grid: { row_span: number; column_span: number; preferred_width?: string };
  priority?: string;
  interaction?: { type: string; controls?: string[] };
  planning_notes?: string[];
  visibility_condition?: string;
  expected_data_structure?: string;
}

export interface StructurePage {
  page_order?: number;
  page_id: string;
  title: string;
  layout?: Record<string, unknown>;
  widgets: StructureWidgetPlacement[];
}

export interface StructurePlan {
  pages: StructurePage[];
  [key: string]: unknown;
}

export interface ApprovedStructure {
  id: number;
  structure_id: string;
  report_id: string;
  project_id: string;
  week_num: number;
  data_date: string;
  dashboard_title: string;
  structure_version: string;
  design_id: string;
  structure_plan: StructurePlan;
}

export interface WidgetRow {
  id: number;
  widget_record_id: string;
  structure_id: string;
  report_id: string;
  project_id: string;
  page_id: string;
  page_key: string;
  widget_id: string;
  widget_order: number;
  widget_title: string;
  widget_type: string;
  semantic_role: string;
  widget_ast: WidgetAst;
  data_status: string;
  widget_metadata?: Record<string, unknown>;
  source_packages?: unknown[];
}

export interface WidgetAst {
  type: string;
  title: string;
  content: Record<string, unknown>;
  page_id?: string;
  widget_id?: string;
  data_status?: string;
  [key: string]: unknown;
}

import { schemaClient } from '@/lib/supabase';

function decode<T>(raw: unknown, fallback: T): T {
  try {
    let value = raw;
    for (let i = 0; i < 2 && typeof value === 'string'; i++) value = JSON.parse(value);
    return value && typeof value === 'object' ? value as T : fallback;
  } catch { return fallback; }
}

export function createDashboardSource(schema: string, project: string) {
  // Dashboard tables are not included in the existing generated Database type.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = schemaClient(schema) as any;
  async function checked<T>(table: string, query: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
    const { data, error } = await query;
    if (error) throw new Error(`${schema}.${table}: ${error.message}`);
    return data;
  }
  return {
    async listStructures(): Promise<ApprovedStructure[]> {
      if (!project) return [];
      const rows = await checked<ApprovedStructure[]>('dbp6_0008_dashboard_structures', db.from('dbp6_0008_dashboard_structures')
        .select('structure_id,report_id,project_id,week_num,data_date,dashboard_title,structure_version,design_id')
        .eq('project_id', project).order('data_date', { ascending: false }));
      return rows ?? [];
    },
    async load(structureId: string) {
      const table = 'dbp6_0008_dashboard_structures';
      const raw = await checked<ApprovedStructure | null>(table, db.from(table).select('*').eq('project_id', project).eq('structure_id', structureId).maybeSingle());
      if (!raw) throw new Error('The selected dashboard structure is no longer available.');
      const structure = { ...raw, structure_plan: decode<StructurePlan>(raw.structure_plan, { pages: [] }) };
      if (!Array.isArray(structure.structure_plan.pages)) structure.structure_plan.pages = [];
      structure.structure_plan.pages = structure.structure_plan.pages.map(page => ({ ...page, widgets: (page.widgets ?? []).filter(widget => isDashboardWidgetVisible(widget.widget_id)) })).filter(page => page.widgets.length > 0);
      const layout = decode<{ dashboard_context?: { design_id?: string } }>((raw as unknown as Record<string, unknown>).a3_layout, {});
      const designId = raw.design_id || layout.dashboard_context?.design_id;
      const designTable = 'dbp6_0008_dashboard_designs';
      let designQuery = db.from(designTable).select('*');
      designQuery = designId ? designQuery.eq('design_id', designId) : designQuery.eq('is_approved', true).eq('is_default', true);
      const [design, rows] = await Promise.all([
        checked<ApprovedDesign | null>(designTable, designQuery.maybeSingle()),
        checked<WidgetRow[]>('dbp6_0008_dashboard_widgets', db.from('dbp6_0008_dashboard_widgets').select('*').eq('project_id', project).eq('structure_id', structureId).order('widget_order')),
      ]);
      if (!design) throw new Error(designId ? `Linked dashboard design ${designId} was not found.` : 'No approved default dashboard design is available.');
      const widgets = (rows ?? []).filter(row => isDashboardWidgetVisible(row.widget_id)).map(row => ({ ...row, widget_ast: decode<WidgetAst>(row.widget_ast, { type: row.widget_type, title: row.widget_title, content: {} }) }));
      const spec = decode<Partial<DesignSpecification>>(design.design_specification, {});
      const normalizedDesign = { ...design, design_specification: {
        radii: {}, shadows: {}, spacing: {}, navigation: {}, typography: {}, chart_styles: {}, color_tokens: {}, semantic_colors: {}, table_styles: {}, print_specification: {}, responsive_breakpoints: {}, design_name: design.design_name, design_version: design.design_version, ...spec,
      } as DesignSpecification };
      structure.structure_plan.pages.sort((a, b) => (a.page_order ?? 0) - (b.page_order ?? 0));
      const orphaned = widgets.filter(widget => !structure.structure_plan.pages.some(page => page.page_id === widget.page_id)).map(widget => widget.widget_id);
      const ids = widgets.map(widget => widget.widget_id);
      const expected = structure.structure_plan.pages.flatMap(page => (page.widgets ?? []).map(widget => widget.widget_id));
      const missing = expected.filter(id => !ids.includes(id));
      const duplicate = ids.filter((id, index) => ids.indexOf(id) !== index);
      const warning = [orphaned.length ? `Widgets without a matching section: ${orphaned.join(', ')}` : '', !structure.structure_plan.pages.length ? 'No dashboard sections are defined.' : '', !widgets.length ? 'No widgets are available for this update.' : '', missing.length ? `Missing widgets: ${missing.join(', ')}` : '', duplicate.length ? `Duplicate widgets: ${[...new Set(duplicate)].join(', ')}` : ''].filter(Boolean).join(' ');
      return { structure, design: normalizedDesign, widgets, warning };
    },
  };
}
