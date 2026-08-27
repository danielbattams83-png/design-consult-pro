import { Injectable, computed, effect, signal } from '@angular/core';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarUrl?: string;
  isOfflineGuest?: boolean;
}

const STORAGE_AUTH_USER = 'design_consult_pro_auth_user';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  readonly currentUser = signal<UserProfile | null>(null);
  readonly isLoading = signal<boolean>(false);
  readonly authError = signal<string | null>(null);

  readonly isAuthenticated = computed<boolean>(() => this.currentUser() !== null);

  constructor() {
    this.loadPersistedAuth();

    // Persist changes
    effect(() => {
      const user = this.currentUser();
      if (typeof window !== 'undefined' && window.localStorage) {
        if (user) {
          localStorage.setItem(STORAGE_AUTH_USER, JSON.stringify(user));
        } else {
          localStorage.removeItem(STORAGE_AUTH_USER);
        }
      }
    });
  }

  private loadPersistedAuth(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      const raw = localStorage.getItem(STORAGE_AUTH_USER);
      if (raw) {
        const parsed = JSON.parse(raw) as UserProfile;
        if (parsed && parsed.email) {
          this.currentUser.set(parsed);
          return;
        }
      }
    } catch {
      // Fallback
    }

    // Default to an active field surveyor session for seamless on-site testing if desired, or logged in
    this.currentUser.set({
      id: 'user_consult_pro_01',
      name: 'Alex Rivera',
      email: 'concepts.phoenixproject@gmail.com',
      role: 'Principal Interior Architect & Field Surveyor',
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
      isOfflineGuest: false,
    });
  }

  async loginWithGoogle(): Promise<boolean> {
    this.isLoading.set(true);
    this.authError.set(null);

    // Simulate Google Sign-In with slight natural async delay
    await new Promise((res) => setTimeout(res, 450));

    const googleUser: UserProfile = {
      id: 'google_usr_' + Date.now(),
      name: 'Alex Rivera',
      email: 'concepts.phoenixproject@gmail.com',
      role: 'Lead Field Surveyor & Spatial Planner',
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
      isOfflineGuest: false,
    };

    this.currentUser.set(googleUser);
    this.isLoading.set(false);
    return true;
  }

  async loginWithEmail(email: string, pass: string): Promise<boolean> {
    this.isLoading.set(true);
    this.authError.set(null);

    if (!email || !email.includes('@')) {
      this.authError.set('Please enter a valid surveyor email address.');
      this.isLoading.set(false);
      return false;
    }

    if (!pass || pass.length < 4) {
      this.authError.set('Password must be at least 4 characters.');
      this.isLoading.set(false);
      return false;
    }

    await new Promise((res) => setTimeout(res, 400));

    const nameFromEmail = email.split('@')[0].replace(/[._]/g, ' ');
    const formattedName = nameFromEmail
      .split(' ')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

    const user: UserProfile = {
      id: 'email_usr_' + Date.now(),
      name: formattedName || 'Field Surveyor',
      email: email.trim().toLowerCase(),
      role: 'On-Site Design Consultant',
      avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80',
      isOfflineGuest: false,
    };

    this.currentUser.set(user);
    this.isLoading.set(false);
    return true;
  }

  continueAsOfflineGuest(): void {
    const guestUser: UserProfile = {
      id: 'offline_guest_' + Date.now(),
      name: 'On-Site Field Surveyor (Offline Mode)',
      email: 'offline.surveyor@designconsultpro.local',
      role: 'Field Inspector (Local Storage Cache)',
      isOfflineGuest: true,
    };
    this.currentUser.set(guestUser);
    this.authError.set(null);
  }

  logout(): void {
    this.currentUser.set(null);
    this.authError.set(null);
  }
}
