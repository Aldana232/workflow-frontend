import { Component, inject, OnInit, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { DepartmentService } from '../../core/services/department';
import { UserService } from '../../core/services/user';

interface Dept  { id: string; name: string; description: string; active: boolean; companyId: string; }
interface UserRow { id: string; firstName: string; lastName: string; email: string; role: string; departmentId: string | null; active: boolean; }

@Component({
  selector: 'app-departments',
  imports: [FormsModule],
  templateUrl: './departments.html',
  styleUrl: './departments.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Departments implements OnInit {
  private deptService = inject(DepartmentService);
  private userService = inject(UserService);
  private toastr      = inject(ToastrService);
  private cdr         = inject(ChangeDetectorRef);

  departments: Dept[]  = [];
  allUsers:    UserRow[] = [];
  deptUsers:   UserRow[] = [];
  selected:    Dept | null = null;
  loading = true;

  // Modales
  showCreateDept  = false;
  showAssignUser  = false;
  showEditDept    = false;

  // Formularios
  deptForm  = { name: '', description: '' };
  editForm  = { name: '', description: '' };
  assignUserId = '';

  ngOnInit(): void {
    this.loadDepts();
    this.loadAllUsers();
  }

  private loadDepts(): void {
    this.deptService.getAll().subscribe({
      next: (data: any[]) => {
        this.departments = data.map(d => ({
          id: d.id, name: d.name ?? '—', description: d.description ?? '',
          active: d.active ?? true, companyId: d.companyId,
        }));
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => { this.loading = false; this.cdr.markForCheck(); },
    });
  }

  private loadAllUsers(): void {
    this.userService.getAll().subscribe({
      next: (data: any[]) => {
        this.allUsers = data.map(u => ({
          id: u.id, firstName: u.firstName ?? '', lastName: u.lastName ?? '',
          email: u.email, role: u.role ?? 'FUNCIONARIO',
          departmentId: u.departmentId ?? null, active: u.active ?? true,
        }));
        this.cdr.markForCheck();
      },
      error: () => {},
    });
  }

  selectDept(dept: Dept): void {
    this.selected = dept;
    this.deptUsers = this.allUsers.filter(u => u.departmentId === dept.id);
    this.cdr.markForCheck();
  }

  fullName(u: UserRow): string { return `${u.firstName} ${u.lastName}`.trim() || u.email; }

  userCount(dept: Dept): number { return this.allUsers.filter(u => u.departmentId === dept.id).length; }

  // Usuarios sin departamento o de otro dept — candidatos para asignar
  get unassignedUsers(): UserRow[] {
    return this.allUsers.filter(u => u.departmentId !== this.selected?.id && u.role === 'FUNCIONARIO');
  }

  // ── Crear departamento ──────────────────────────────────────────────────────
  openCreate(): void {
    this.deptForm = { name: '', description: '' };
    this.showCreateDept = true;
  }

  createDept(): void {
    if (!this.deptForm.name.trim()) return;
    this.deptService.create({ name: this.deptForm.name.trim(), description: this.deptForm.description.trim() }).subscribe({
      next: (d: any) => {
        this.departments = [...this.departments, {
          id: d.id, name: d.name, description: d.description ?? '',
          active: true, companyId: d.companyId,
        }];
        this.showCreateDept = false;
        this.toastr.success(`Departamento "${d.name}" creado.`, 'Listo');
        this.cdr.markForCheck();
      },
      error: () => this.toastr.error('No se pudo crear el departamento.', 'Error'),
    });
  }

  // ── Editar departamento ─────────────────────────────────────────────────────
  openEdit(): void {
    if (!this.selected) return;
    this.editForm = { name: this.selected.name, description: this.selected.description };
    this.showEditDept = true;
  }

  saveEdit(): void {
    if (!this.selected || !this.editForm.name.trim()) return;
    this.deptService.update(this.selected.id, { name: this.editForm.name.trim(), description: this.editForm.description.trim() }).subscribe({
      next: (d: any) => {
        this.departments = this.departments.map(dep =>
          dep.id === d.id ? { ...dep, name: d.name, description: d.description } : dep
        );
        this.selected = { ...this.selected!, name: d.name, description: d.description };
        this.showEditDept = false;
        this.toastr.success('Departamento actualizado.', 'Listo');
        this.cdr.markForCheck();
      },
      error: () => this.toastr.error('No se pudo actualizar.', 'Error'),
    });
  }

  deactivateDept(): void {
    if (!this.selected || !confirm(`¿Desactivar departamento "${this.selected.name}"?`)) return;
    this.deptService.deactivate(this.selected.id).subscribe({
      next: () => {
        this.departments = this.departments.map(d =>
          d.id === this.selected!.id ? { ...d, active: false } : d
        );
        this.selected = null;
        this.toastr.success('Departamento desactivado.', 'Listo');
        this.cdr.markForCheck();
      },
      error: () => this.toastr.error('No se pudo desactivar.', 'Error'),
    });
  }

  // ── Asignar usuario ─────────────────────────────────────────────────────────
  openAssign(): void {
    this.assignUserId = '';
    this.showAssignUser = true;
  }

  assignUser(): void {
    if (!this.assignUserId || !this.selected) return;
    this.userService.assignDepartment(this.assignUserId, this.selected.id).subscribe({
      next: () => {
        // actualizar en memoria
        this.allUsers = this.allUsers.map(u =>
          u.id === this.assignUserId ? { ...u, departmentId: this.selected!.id } : u
        );
        this.deptUsers = this.allUsers.filter(u => u.departmentId === this.selected!.id);
        this.showAssignUser = false;
        this.toastr.success('Funcionario asignado al departamento.', 'Listo');
        this.cdr.markForCheck();
      },
      error: () => this.toastr.error('No se pudo asignar el funcionario.', 'Error'),
    });
  }

  removeUser(user: UserRow): void {
    if (!confirm(`¿Quitar a ${this.fullName(user)} de este departamento?`)) return;
    this.userService.assignDepartment(user.id, null).subscribe({
      next: () => {
        this.allUsers = this.allUsers.map(u =>
          u.id === user.id ? { ...u, departmentId: null } : u
        );
        this.deptUsers = this.allUsers.filter(u => u.departmentId === this.selected!.id);
        this.toastr.success(`${this.fullName(user)} removido del departamento.`, 'Listo');
        this.cdr.markForCheck();
      },
      error: () => this.toastr.error('No se pudo quitar al funcionario.', 'Error'),
    });
  }
}
