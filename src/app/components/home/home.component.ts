import { Component, OnInit, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { AvailableLessonsService, AvailableLessonsPackage } from '../../services/v2/available-lessons.service';
import { FacadeAuthService } from '../../services/auth/facade-auth.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent implements OnInit {
  packages: AvailableLessonsPackage[] = [];
  packagesLoading = false;

  private readonly fallbackPackages: AvailableLessonsPackage[] = [
    { id: 'pkg-3', lessons: 3, priceUsd: 27, unitPriceUsd: 27 / 3, active: true },
    { id: 'pkg-6', lessons: 6, priceUsd: 51, unitPriceUsd: 51 / 6, active: true },
    { id: 'pkg-10', lessons: 10, priceUsd: 80, unitPriceUsd: 80 / 10, active: true },
  ];

  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    private router: Router,
    private availableLessonsService: AvailableLessonsService,
    private facadeAuthService: FacadeAuthService
  ) {}

  ngOnInit(): void {
    this.loadPackages();
  }

  isGuest(): boolean {
    return !this.facadeAuthService.isAuthenticated();
  }

  goToGuestTrial(): void {
    const returnUrl = '/all-teachers';

    if (this.facadeAuthService.isAuthenticated()) {
      this.goToAllTeachers();
      return;
    }

    // Encourage new visitors to create a student account first
    this.router.navigate(['/student-register'], { queryParams: { returnUrl } });
  }

  private loadPackages(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    // Always show packages to visitors (fallback values), even if v2 is disabled
    this.packages = [...this.fallbackPackages];

    // If v2 is enabled, attempt to replace fallback with API-provided packages
    if (!this.availableLessonsService.isEnabled()) return;

    this.packagesLoading = true;
    this.availableLessonsService.getPackages().subscribe({
      next: (pkgs) => {
        // Sort by lessons count and pick: 3, 6, 10 lessons packages
        const sorted = (Array.isArray(pkgs) ? pkgs : [])
          .filter(p => p.active !== false)
          .sort((a, b) => a.lessons - b.lessons);
        
        // Find specific packages: 3 lessons (popular), 6 lessons (value), 10 lessons (best value)
        const pkg3 = sorted.find(p => p.lessons === 3);
        const pkg6 = sorted.find(p => p.lessons === 6);
        const pkg10 = sorted.find(p => p.lessons === 10);
        
        // Build array with available packages
        this.packages = [pkg3, pkg6, pkg10].filter(p => p !== undefined) as AvailableLessonsPackage[];
        
        // Fallback: if we don't have exact matches, take up to 3 from sorted
        if (this.packages.length === 0 && sorted.length > 0) {
          this.packages = sorted.slice(0, 3);
        }
        
        this.packagesLoading = false;
      },
      error: () => {
        // Keep fallback packages for guests if API is unavailable/unauthorized
        this.packages = [...this.fallbackPackages];
        this.packagesLoading = false;
      }
    });
  }

  buyPackage(pkg: AvailableLessonsPackage): void {
    const returnUrl = '/all-teachers?openAvailableLessons=1';

    if (!this.facadeAuthService.isAuthenticated()) {
      this.router.navigate(['/login'], { queryParams: { returnUrl } });
      return;
    }

    // Student-only route
    const role = this.getBrowserStoredRole();
    if (role && role !== '1') {
      this.router.navigate(['/home']);
      return;
    }

    // Navigate to all-teachers with query param to open purchase modal
    this.router.navigate(['/all-teachers'], { queryParams: { openAvailableLessons: '1' } });
  }

  goToAllTeachers(): void {
    const returnUrl = '/all-teachers';

    if (!this.facadeAuthService.isAuthenticated()) {
      this.router.navigate(['/login'], { queryParams: { returnUrl } });
      return;
    }

    const role = this.getBrowserStoredRole();
    if (role && role !== '1') {
      this.router.navigate(['/home']);
      return;
    }

    this.router.navigate(['/all-teachers']);
  }

  goToGift(): void {
    this.router.navigate(['/gift']);
  }

  private getBrowserStoredRole(): string | null {
    if (!isPlatformBrowser(this.platformId)) return null;
    return localStorage.getItem('user_role');
  }
}
