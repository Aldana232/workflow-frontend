export interface Tramite {
  id: string;
  code: string;
  status: string;
  currentNodeId: string;
  processId: string;
  clienteInfo: any;
  history: HistoryEntry[];
  startedAt: string;
  completedAt: string;
}

export interface HistoryEntry {
  nodeId: string;
  nodeName: string;
  arrivedAt: string;
  completedAt: string;
  durationMinutes: number;
}
