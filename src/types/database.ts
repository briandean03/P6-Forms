export interface Database {
  public: {
    Tables: {
      dbp6_000401_engineering: {
        Row: Engineering
        Insert: Partial<Omit<Engineering, 'dgt_dbp6bd041engineeringid' | 'created_at'>>
        Update: Partial<Omit<Engineering, 'dgt_dbp6bd041engineeringid' | 'created_at'>>
      }
      dbp6_000402_qaqc_hse: {
        Row: QaqcHse
        Insert: Omit<QaqcHse, 'dgt_dbp6bd0402qaqchseid' | 'created_at'>
        Update: Partial<QaqcHse>
      }
      dbp6_000501_actualresources: {
        Row: ActualResources
        Insert: Omit<ActualResources, 'dgt_dbp6ud0501actualresourcesid' | 'created_at'>
        Update: Partial<ActualResources>
      }
      dbp6_0006_progressdata: {
        Row: DynamicActualData
        Insert: Omit<DynamicActualData, 'dgt_dbp6bd06dynamicactualdataid'>
        Update: Partial<DynamicActualData>
      }
      dbp6_0000_projectdata: {
        Row: ProjectData
        Insert: Omit<ProjectData, 'dgt_dbp6bd00projectdataid'>
        Update: Partial<ProjectData>
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
  mod_id: number | null
  owningbusinessunit: string | null
  created_at: string | null
  is_long_lead: boolean | null
  dgt_dbp6bd00projectdataid: string | null
}

export interface QaqcHse {
  dgt_dbp6bd0402qaqchseid: string
  dgt_dbp6bd00projectdataid: string | null
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
  dgt_dbp6bd00projectdataid: string | null
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
  dgt_dbp6bd00projectdataid: string | null
  dgt_activityid: string | null
  dgt_actualstart: string | null
  dgt_actualfinish: string | null
  dgt_pctcomplete: number | null
  mod_id: number | null
  version_num: number | null
  dgt_projectid: string | null
}

export interface Type {
  id: number
  created_at: string
  type_name: string | null
  type_code: number | null
  dgt_dbp6bd00projectdataid: string | null
  dgt_projectid: string | null
}

export interface AreaOfConcern {
  id: string
  aoc_number: string
  description: string | null
  project_id: string | null
  status: string | null
  created_at: string
  dgt_projectid: string | null
}

export interface Payments {
  dbp6bd0003paymentsid: string
  dgt_dateapproved: string | null
  dgt_datesubmitted: string | null
  exchangerate: number | null
  importsequencenumber: string | null
  dgt_ipaamount: number | null
  dgt_ipaamount_base: number | null
  dgt_iparef: string | null
  dgt_ipcamount: number | null
  dgt_ipcamount_base: number | null
  dgt_paymentreceivedamount: number | null
  dgt_paymentreceivedamount_base: number | null
  dgt_paymentreceiveddate: string | null
  statuscode: number | null
  statecode: string | null
  timezoneruleversionnumber: string | null
  utcconversiontimezonecode: string | null
  versionnumber: number | null
  transactioncurrencyid: string | null
  owningbusinessunit: string | null
  dgt_dbp6bd00projectdataid: string | null
  dgt_projectid: string | null
}

export interface Variations {
  dgt_dbp6bd0004variationsid: string
  dgt_dateapproved: string | null
  dgt_datesubmitted: string | null
  exchangerate: string | null
  statuscode: number | null
  versionnumber: number | null
  dgt_voappliedamount: string | null
  dgt_voapprovedamount: string | null
  dgt_voreceivedamount: string | null
  dgt_voreceiveddate: string | null
  dgt_voref: string | null
  dgt_projectid: string | null
}

export interface Trades {
  dgt_tradeid: string
  dgt_tradecode: string | null
  dgt_tradename: string | null
  importsequencenumber: string | null
  statuscode: number | null
  statecode: string | null
  dgt_dbp6bd00projectdataid: string | null
  dgt_projectid: string | null
}

export interface Subtrades {
  dgt_dbp6bd014subtradeid: string
  dgt_subtradecode: string | null
  dgt_subtradename: string | null
  importsequencenumber: string | null
  statuscode: number | null
  statecode: string | null
  dgt_dbp6bd00projectdataid: string | null
  dgt_projectid: string | null
}

export interface Discipline {
  id: number
  created_at: string
  discipline_name: string | null
  discipline_code: number | null
  dgt_dbp6bd00projectdataid: string | null
  dgt_projectid: string | null
}

export interface PartyContacts {
  companycontactid: string
  address1_companyname: string | null
  address1_telephone1: string | null
  address1_telephone2: string | null
  emailaddress1: string | null
  emailaddress2: string | null
  address1_line1: string | null
  address1_line2: string | null
  address1_city: string | null
  address1_country: string | null
  address1_postalcode: string | null
  address1_latitude: string | null
  address1_longitude: string | null
  primarycontact_firstname: string | null
  primarycontact_lastname: string | null
  jobtitle: string | null
  mobile_num: string | null
  websiteurl: string | null
  statuscode: string | null
  party_type: string | null
}

export interface ActivityDiscipline {
  discipline_code: string
  discipline_name: string
}

export interface ActivityWorkType {
  work_type_code: string
  work_type_name: string
}

export interface P6ActivityOutput {
  id: number
  project_code: string
  activity_id: string | null
  field_name: string
  field_value: string | null
  last_updated: string | null
}

export interface P6ActivityUpdate {
  id: number
  project_code: string
  task_code: string
  status_code: string | null
  wbs_id: string | null
  task_name: string | null
  act_start_date: string | null
  act_end_date: string | null
  complete_pct: number | null
  remain_drtn_hr_cnt: number | null
  mrk_uptd: number | null
  delete_record_flag: number | null
  data_date: string | null
  submitted_at: string | null
}

export interface P6ProjectMapping {
  id: number
  dgt_projectid: string
  p6_project_code: string
}

export interface P6RunTrigger {
  id: number
  project_code: string
  triggered: boolean | null
  triggered_at: string | null
  completed_at: string | null
  status: string | null
}

export interface Photo {
  id: string
  dgt_dbp6bd00projectdataid: string | null
  photo_date: string
  storage_path: string
  file_name: string
  created_at: string
}

export interface ProjectData {
  dgt_dbp6bd00projectdataid: string
  dgt_consultantsname: string | null
  dgt_contractvalue: number | null
  dgt_contractorsname: string | null
  dgt_datadate: string | null
  dgt_elapsedduration: string | null
  dgt_employersname: string | null
  dgt_eotawarded: string | null
  importsequencenumber: string | null
  dgt_location: string | null
  dgt_pmcsname: string | null
  dgt_projectenddate: string | null
  dgt_projectid: string | null
  dgt_projectname: string | null
  dgt_projectstartdate: string | null
  dgt_reportingstartingdate: string | null
  statuscode: number | null
  statecode: string | null
  timezoneruleversionnumber: string | null
  utcconversiontimezonecode: string | null
  versionnumber: number | null
  dgt_weeknum: number | null
  owningbusinessunit: string | null
  project_id: string | null
}
