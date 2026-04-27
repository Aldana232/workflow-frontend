export interface User {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'FUNCIONARIO' | 'CLIENTE';
  companyId: string;
  departmentId: string;
}
