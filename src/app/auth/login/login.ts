import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth';
import { LucideZap } from '@lucide/angular';

@Component({
  selector: 'app-login',
  imports: [FormsModule, LucideZap],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {
  private authService = inject(AuthService);
  private router = inject(Router);

  email = '';
  password = '';
  loading = false;
  error = '';

  onSubmit(): void {
    this.loading = true;
    this.error = '';

    this.authService.login(this.email, this.password).subscribe({
      next: () => {
        const role = this.authService.getRole();
        if (role === 'ADMIN') this.router.navigate(['/admin/dashboard']);
        else if (role === 'FUNCIONARIO') this.router.navigate(['/funcionario/dashboard']);
        else this.router.navigate(['/login']);
      },
      error: () => {
        this.error = 'Credenciales inválidas. Intenta nuevamente.';
        this.loading = false;
      },
    });
  }
}
