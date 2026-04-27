export interface Process {
  id: string;
  name: string;
  status: string;
  version: number;
  companyId: string;
  nodes: ProcessNode[];
  edges: ProcessEdge[];
}

export interface ProcessNode {
  nodeId: string;
  type: string;
  name: string;
  departmentId: string;
  formSchemaId: string;
  slaHours: number;
}

export interface ProcessEdge {
  id: string;
  source: string;
  target: string;
}
