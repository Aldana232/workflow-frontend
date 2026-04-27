import { Component, inject, OnInit, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { UserService } from '../../core/services/user';
import { DepartmentService } from '../../core/services/department';
import { AuthService } from '../../core/services/auth';

interface UserRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  departmentId: string | null;
  active: boolean;
}

interface Dept { id: string; name: string; }

interface UserForm {
  firstName: string;
  lastName: string;
  email: string;
  departmentId: string;
  role: string;
  password: string;
  confirmPassword: string;
}

@Component({
  selector: 'app-users',
  imports: [FormsModule],
  templateUrl: './users.html',
  styleUrl: './users.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Users implements OnInit {
  private userService = inject(UserService);
  private deptService = inject(DepartmentService);
  private authService = inject(AuthService);
  private toastr      = inject(ToastrService);
  private cdr         = inject(ChangeDetectorRef);

  users:       UserRow[] = [];
  departments: Dept[]    = [];
  loading = true;
  showModal = false;

  form: UserForm = { firstName: '', lastName: '', email: '', departmentId: '', role: 'FUNCIONARIO', password: '', confirmPassword: '' };

  get formValid(): boolean {
    return !!this.form.firstName.trim() && !!this.form.email.trim()
      && this.form.password.length >= 6 && this.form.password === this.form.confirmPassword;
  }

  ngOnInit(): void {
    this.deptService.getAll().subscribe({
      next: (d: any[]) => {
        this.departments = d.map(dep => ({ id: dep.id, name: dep.name }));
        this.cdr.markForCheck();
      },
    });

    this.userService.getAll().subscribe({
      next: (data: any[]) => {
        this.users = data.map(u => ({
          id: u.id,
          firstName: u.firstName ?? '',
          lastName:  u.lastName  ?? '',
          email:     u.email,
          role:      u.role      ?? 'FUNCIONARIO',
          departmentId: u.departmentId ?? null,
          active:    u.active    ?? true,
        }));
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => { this.loading = false; this.cdr.markForCheck(); },
    });
  }

  fullName(u: UserRow): string { return `${u.firstName} ${u.lastName}`.trim() || u.email; }

  deptName(deptId: string | null): string {
    if (!deptId) return '—';
    return this.departments.find(d => d.id === deptId)?.name ?? deptId;
  }

  openModal(): void {
    this.form = { firstName: '', lastName: '', email: '', departmentId: '', role: 'FUNCIONARIO', password: '', confirmPassword: '' };
    this.showModal = true;
  }

  closeModal(): void { this.showModal = false; }

  save(): void {
    if (!this.formValid) return;
    // Heredar companyId del admin que crea el usuario → garantiza misma empresa
    const companyId = this.authService.getCurrentUser()?.companyId || 'saguapac';
    const payload = {
      firstName:    this.form.firstName.trim(),
      lastName:     this.form.lastName.trim(),
      email:        this.form.email.trim(),
      password:     this.form.password,
      role:         this.form.role,
      departmentId: this.form.departmentId || null,
      companyId,
    };
    this.userService.create(payload).subscribe({
      next: (u: any) => {
        this.users = [...this.users, {
          id: u.id, firstName: u.firstName ?? '', lastName: u.lastName ?? '',
          email: u.email, role: u.role ?? 'FUNCIONARIO',
          departmentId: u.departmentId ?? null, active: true,
        }];
        this.closeModal();
        this.toastr.success(`Funcionario "${u.firstName}" creado.`, 'Listo');
        this.cdr.markForCheck();
      },
      error: (err: any) => {
        const msg = typeof err.error === 'string' ? err.error : 'No se pudo crear el usuario';
        this.toastr.error(msg, 'Error');
      },
    });
  }

  toggleActive(user: UserRow): void {
    const newState = !user.active;
    this.userService.updateById(user.id, { active: newState }).subscribe({
      next: () => {
        this.users = this.users.map(u => u.id === user.id ? { ...u, active: newState } : u);
        this.toastr.success(newState ? 'Usuario activado.' : 'Usuario desactivado.', 'Listo');
        this.cdr.markForCheck();
      },
      error: () => this.toastr.error('No se pudo cambiar el estado.', 'Error'),
    });
  }
}
