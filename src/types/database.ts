export interface Database {
  public: {
    Tables: {
      dbp6_bd041engineering: {
        Row: Engineering
        Insert: Partial<Omit<Engineering, 'dgt_dbp6bd041engineeringid' | 'created_at'>>
        Update: Partial<Omit<Engineering, 'dgt_dbp6bd041engineeringid' | 'created_at'>>
      }
      dbp6_bd0402_qaqc_hse: {
        Row: QaqcHse
        Insert: Omit<QaqcHse, 'dgt_dbp6bd0402qaqchseid' | 'created_at'>
        Update: Partial<QaqcHse>
      }
      dbp6_ud0501actualresources: {
        Row: ActualResources
        Insert: Omit<ActualResources, 'dgt_dbp6ud0501actualresourcesid' | 'created_at'>
        Update: Partial<ActualResources>
      }
      dgt_dbp6bd06dynamicactualdata: {
        Row: DynamicActualData
        Insert: Omit<DynamicActualData, 'dgt_dbp6bd06dynamicactualdataid'>
        Update: Partial<DynamicActualData>
      }
    }
  }
}

export interface Engineering {
  dgt_dbp6bd041engineeringid: string
  dgt_actualreturndate: string | null
  dgt_actualsubmissiondate: string | null
  dgt_discipline: number | null
  dgt_dtfid: string | null
  importsequencenumber: string | null
  dgt_plannedapprovaldate: string | null
  dgt_plannedsubmissiondate: string | null
  dgt_revision: number | null
  dgt_status: string | null
  dgt_transmittalref: string | null
  dgt_transmittalsubject: string | null
  dgt_transmittaltype: number | null
  utcconversiontimezonecode: string | null
  versionnumber: number | null
  owningbusinessunit: string | null
  created_at: string | null
  is_long_lead: boolean | null
}

export interface QaqcHse {
  dgt_dbp6bd0402qaqchseid: string
  dgt_discipline: number | null
  dgt_docid: string | null
  dgt_docref: string | null
  dgt_documentsubject: string | null
  dgt_documenttype: string | null
  importsequencenumber: string | null
  dgt_submissiondate: string | null
  dgt_responsedate: string | null
  dgt_revision: number | null
  dgt_status: string | null
  versionnumber: number | null
  owningbusinessunit: string | null
  created_at: string | null
}

export interface ActualResources {
  dgt_dbp6ud0501actualresourcesid: string
  resource_name: string | null
  dgt_resourcecount: number | null
  dgt_resourcediscipline: number | null
  dgt_resourcetype: number | null
  dgt_sequential: number | null
  versionnumber: number | null
  owningbusinessunit: string | null
  created_at: string | null
}

export interface DynamicActualData {
  dgt_dbp6bd06dynamicactualdataid: string
  dgt_activityid: string | null
  dgt_actualstart: string | null
  dgt_actualfinish: string | null
  dgt_pctcomplete: number | null
  mod_id: number | null
  version_num: number | null
  dgt_projectid: string | null
}
