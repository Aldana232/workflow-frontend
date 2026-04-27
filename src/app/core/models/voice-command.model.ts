export type VoiceAction =
  | 'ADD_NODE' | 'ADD_TASK' | 'ADD_START_EVENT' | 'ADD_END_EVENT' | 'ADD_GATEWAY'
  | 'CONNECT_NODES' | 'DELETE_NODE' | 'RENAME_NODE'
  | 'SET_NODE_DEPARTMENT' | 'SET_NODE_SLA'
  | 'SAVE_PROCESS' | 'PUBLISH_PROCESS' | 'DEACTIVATE_PROCESS' | 'CREATE_PROCESS'
  | 'ZOOM_IN' | 'ZOOM_OUT' | 'FIT_SCREEN'
  | 'UNDO' | 'REDO'
  | 'SELECT_NODE' | 'CLEAR_SELECTION'
  | 'ANALYZE' | 'ANALYZE_DIAGRAM'
  | 'CREATE_DEPARTMENT' | 'DEACTIVATE_DEPARTMENT'
  | 'SEARCH_TRAMITE' | 'DELETE_TRAMITE'
  | 'CREATE_USER' | 'ASSIGN_USER_DEPARTMENT'
  | 'ADD_FORM_FIELD'
  | 'EXPLAIN_TOOL'
  | 'UNKNOWN';

export interface VoiceCommand {
  action:          VoiceAction;
  nodeName?:       string;
  sourceNode?:     string;
  targetNode?:     string;
  newName?:        string;
  bpmnType?:       string;   // bpmn:UserTask | bpmn:StartEvent | bpmn:ExclusiveGateway…
  nodeType?:       string;   // START | END | USER_TASK | EXCLUSIVE_GW…
  departmentName?: string;
  userName?:       string;
  slaHours?:       number;
  processName?:    string;
  tramiteCode?:    string;
  fieldName?:      string;
  fieldType?:      string;   // TEXT | TEXTAREA | SELECT | CHECKBOX | FILE
  processId?:      string;
  confidence?:     'HIGH' | 'MEDIUM' | 'LOW';
  rawText?:        string;
  message?:        string;
}
