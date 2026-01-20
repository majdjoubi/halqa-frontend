import {
  Component,
  OnInit,
  OnDestroy,
  HostListener,
  Inject,
  PLATFORM_ID,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { LanguageService, Language } from '../../services/language.service';
import { Subscription } from 'rxjs';
import { Router } from '@angular/router';
import { FacadeAuthService } from '../../services/auth/facade-auth.service';
import { FacadeProfilesService } from '../../services/profiles/facade-profiles.service';
import { NgxSkeletonLoaderModule } from 'ngx-skeleton-loader';
import { NotificationBellComponent } from '../notification-bell/notification-bell.component';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    TranslateModule,
    NgxSkeletonLoaderModule,
    NotificationBellComponent,
  ],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.scss',
})
export class NavbarComponent implements OnInit, OnDestroy {
  currentLanguage: Language;
  public readonly languages: Language[];
  private languageSubscription: Subscription;
  private authSubscription: Subscription;
  public roleSubscription: Subscription;
  private profileSubscription: Subscription;

  mobileMenuOpen = false;
  profileDropdownOpen = false;
  role: number = 0;
  public isAuthenticated: boolean = false;
  userName: string = ''; // Default username
  src: string = '/assets/images/blank-avatar.webp'; // Default avatar image path

  showNavbar = true;
  isLoading = true; // Loading state for skeleton

  hiddenRoutes = [
    '/join-us',
    '/student-register',
    '/forgot-password',
    '/verify-otp',
    '/reset-password',
    '/set-password',
    '/login',
    '/teacher-register',
    '/teacher-create-profile',
    '/video-room-bootstrap',
  ];

  constructor(
    private languageService: LanguageService,
    private router: Router,
    private _facadeAuth: FacadeAuthService,
    private _facadeProfile: FacadeProfilesService,

    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    this.currentLanguage = this.languageService.currentLanguage;
    this.languages = this.languageService.languages;
    this.languageSubscription = new Subscription();
    this.authSubscription = new Subscription();
    this.roleSubscription = new Subscription();
    this.profileSubscription = new Subscription();
    this.router.events.subscribe(() => {
      this.showNavbar = !this.hiddenRoutes.includes(this.router.url);
    });
  }

  ngOnInit(): void {
    setTimeout(() => {
      this.initializeAuthState();
    }, 300);

    // Subscribe to language changes
    this.languageSubscription = this.languageService.currentLanguage$.subscribe(
      (language) => {
        this.currentLanguage = language;
      }
    );

    // Subscribe to authentication state changes
    this.authSubscription = this._facadeAuth.isAuthenticated$.subscribe(
      (authenticated) => {
        this.isAuthenticated = authenticated;
        setTimeout(() => {
          this.isLoading = false;
        }, 200);
      }
    );

    // Subscribe to user role changes
    this.roleSubscription = this._facadeAuth.userRole$.subscribe((role) => {
      this.role = role;
    });

    // Get user data from localStorage if available
    this.getUserData();

    this._facadeAuth.loginResponse$.subscribe((response) => {
      const name =
        response?.user?.firstName || response?.user?.name || this.userName;
      const avatar = response?.user?.profilePictureUrl || this.src;

      this.userName = name;
      this.src = avatar;

      // Persist login response to localStorage so values survive refresh
      if (isPlatformBrowser(this.platformId)) {
        try {
          localStorage.setItem('user_name', this.userName || '');
          localStorage.setItem('user_avatar', this.src || '');
        } catch (e) {
          console.warn(
            'Navbar - could not persist login response to localStorage',
            e
          );
        }
      }
    });

    // Subscribe to the main profile data store so navbar always reflects the
    // latest profile (including updates triggered elsewhere) and persist it.
    this.profileSubscription =
      this._facadeProfile.studentProfileData$.subscribe((profileData) => {
        if (profileData && profileData.profile) {
          const p = profileData.profile;
          const newName = p.firstName || p.name || this.userName;
          const newAvatar = p.profilePictureUrl || this.src;

          this.userName = newName;
          this.src = newAvatar;

          if (isPlatformBrowser(this.platformId)) {
            try {
              localStorage.setItem('user_name', this.userName || '');
              localStorage.setItem('user_avatar', this.src || '');
            } catch (e) {
              console.warn(
                'Navbar - could not persist profile data to localStorage',
                e
              );
            }
          }
        }
      });

    // Also subscribe to teacher profile stores so avatar updates when teacher profile changes
    // Add these subscriptions to the same profileSubscription so they are cleaned up together
    this.profileSubscription.add(
      this._facadeProfile.teacherProfileData$.subscribe((profileData) => {
        if (profileData && profileData.profile) {
          const p = profileData.profile;
          const newName = p.firstName || p.name || this.userName;
          const newAvatar = p.profilePictureUrl || this.src;

          this.userName = newName;
          this.src = newAvatar;

          if (isPlatformBrowser(this.platformId)) {
            try {
              localStorage.setItem('user_name', this.userName || '');
              localStorage.setItem('user_avatar', this.src || '');
            } catch (e) {
              console.warn(
                'Navbar - could not persist teacher profile data to localStorage',
                e
              );
            }
          }
        }
      })
    );

    // Also subscribe to the getTeacherProfileData$ in case other flows update that store
    this.profileSubscription.add(
      this._facadeProfile.getTeacherProfileData$.subscribe((profileData) => {
        if (profileData && profileData.profile) {
          const p = profileData.profile;
          const newName = p.firstName || p.name || this.userName;
          const newAvatar = p.profilePictureUrl || this.src;

          this.userName = newName;
          this.src = newAvatar;

          if (isPlatformBrowser(this.platformId)) {
            try {
              localStorage.setItem('user_name', this.userName || '');
              localStorage.setItem('user_avatar', this.src || '');
            } catch (e) {
              console.warn(
                'Navbar - could not persist getTeacher profile data to localStorage',
                e
              );
            }
          }
        }
      })
    );
  }

  ngOnDestroy(): void {
    this.languageSubscription?.unsubscribe();
    this.authSubscription?.unsubscribe();
    this.roleSubscription?.unsubscribe();
    this.profileSubscription?.unsubscribe();
  }

  /**
   * Initialize authentication state on component load
   */
  private initializeAuthState(): void {
    this.isAuthenticated = this._facadeAuth.isAuthenticated();

    if (this.isAuthenticated && isPlatformBrowser(this.platformId)) {
      const savedRole = localStorage.getItem('user_role');
      if (savedRole && savedRole !== '0') {
        const savedName = localStorage.getItem('user_name');
        const savedAvatar = localStorage.getItem('user_avatar');
        if (savedName) this.userName = savedName;
        if (savedAvatar) this.src = savedAvatar;
        this.role = parseInt(savedRole, 10);
        this._facadeAuth.updateUserRole(this.role);
        setTimeout(() => {
          this.isLoading = false;
        }, 150);
        return;
      }

      const token = localStorage.getItem('access_token');
      if (token) {
        try {
          const payload = JSON.parse(atob(token.split('.')[1]));
          if (payload && payload.role !== undefined) {
            this.role = payload.role;
            this._facadeAuth.updateUserRole(payload.role);
          }
          if (payload && payload.name) {
            this.userName = payload.name;
          } else if (payload && payload.username) {
            this.userName = payload.username;
          } else if (payload && payload.email) {
            this.userName = payload.email.split('@')[0];
          }
        } catch (error) {
          console.error('Error extracting role from token:', error);
        }
      }

      this._facadeAuth._loginResponse.subscribe((response) => {
        this.userName = response?.user?.name || this.userName;
        this.src = response?.user?.profilePictureUrl || this.src;
      });
    }

    setTimeout(() => {
      this.isLoading = false;
    }, 400);
  }

  toggleLanguage(): void {
    this.languageService.toggleLanguage();
  }

  onLanguageChange(event: Event): void {
    const select = event.target as HTMLSelectElement | null;
    const languageCode = select?.value;
    if (!languageCode) return;
    this.languageService.setLanguage(languageCode);
  }

  getOtherLanguage(): Language {
    const languages = this.languageService.languages;
    return (
      languages.find((lang) => lang.code !== this.currentLanguage.code) ||
      languages[0]
    );
  }

  getUserData(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    try {
      const savedName = localStorage.getItem('user_name');
      const savedAvatar = localStorage.getItem('user_avatar');
      const savedRole = localStorage.getItem('user_role');

      if (savedName) {
        this.userName = savedName;
      }

      if (savedAvatar) {
        this.src = savedAvatar;
      }

      if (savedRole) {
        this.role = parseInt(savedRole, 10) || this.role;
        this._facadeAuth.updateUserRole(this.role);
      }
    } catch (e) {
      console.warn('Navbar - could not read user data from localStorage', e);
    }
  }

  isRTL(): boolean {
    return this.languageService.isRTL();
  }

  toggleMobileMenu(): void {
    this.mobileMenuOpen = !this.mobileMenuOpen;
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen = false;
  }

  toggleProfileDropdown(): void {
    this.profileDropdownOpen = !this.profileDropdownOpen;
  }

  closeProfileDropdown(): void {
    this.profileDropdownOpen = false;
  }

  openProfile(): void {
    this.closeProfileDropdown();
    if (this.role === 1) {
      this.router.navigate(['/student-profile']);
    } else if (this.role === 2) {
      this.router.navigate(['/teacher-profile']);
    } else {
      // Fallback: go to home if role is unknown
      this.router.navigate(['/']);
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    const target = event.target as HTMLElement;
    const navbar = target.closest('.modern-navbar');
    const profileDropdown = target.closest('.profile-dropdown');

    if (!navbar && this.mobileMenuOpen) {
      this.closeMobileMenu();
    }

    if (!profileDropdown && this.profileDropdownOpen) {
      this.closeProfileDropdown();
    }
  }

  onImageError(event: any): void {
    event.target.src = '/assets/images/blank-avatar.webp';
  }

  logout(): void {
    this._facadeAuth.logout();
    if (isPlatformBrowser(this.platformId)) {
      try {
        localStorage.removeItem('user_name');
        localStorage.removeItem('user_avatar');
        localStorage.removeItem('user_role');
      } catch (e) {
        console.warn('Navbar - could not clear user data from localStorage', e);
      }
    }
    this.closeMobileMenu();
    this.closeProfileDropdown();
  }
}
