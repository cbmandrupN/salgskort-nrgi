export type CaseStatus = 'ny' | 'i_gang' | 'tilbud_sendt' | 'vundet' | 'tabt' | 'afventer'
export type GeocodeStatus = 'ok' | 'delvis' | 'fejlet' | 'afventer'
export interface Case { id:string; case_number?:string; customer_name?:string; address_raw:string; address_normalized?:string; advisor?:string; department?:string; status?:CaseStatus; estimated_value_dkk?:number; created_date?:string; latitude?:number; longitude?:number; geocode_status:GeocodeStatus; source_row:number }
export interface RowIssue { row_number:number; severity:'fejl'|'advarsel'; field?:string; message:string }
export interface ApiResponse { meta:{fetched_at:string; data_source:string; total_rows:number; resolved_count:number; unresolved_count:number; error_count:number; warning_count:number}; cases:Case[]; issues:RowIssue[] }
