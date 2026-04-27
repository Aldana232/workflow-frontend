export interface FormSchema {
  id: string;
  nodeId: string;
  processId: string;
  fields: FormField[];
}

export interface FormField {
  id: string;
  label: string;
  type: 'TEXT' | 'TEXTAREA' | 'SELECT' | 'CHECKBOX' | 'FILE';
  required: boolean;
  options?: string[];
  accept?: string;
  maxMb?: number;
}
