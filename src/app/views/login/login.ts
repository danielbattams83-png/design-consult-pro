import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './login.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
  auth = inject(AuthService);

  readonly email = signal<string>('concepts.phoenixproject@gmail.com');
  readonly password = signal<string>('••••••••');
  readonly rememberDevice = signal<boolean>(true);
  readonly showPassword = signal<boolean>(false);

  readonly isLoading = this.auth.isLoading;
  readonly authError = this.auth.authError;

  toggleShowPassword(): void {
    this.showPassword.update((v) => !v);
  }

  async onGoogleSignIn(): Promise<void> {
    await this.auth.loginWithGoogle();
  }

  async onEmailSignIn(): Promise<void> {
    await this.auth.loginWithEmail(this.email(), this.password());
  }

  onContinueOffline(): void {
    this.auth.continueAsOfflineGuest();
  }
}
