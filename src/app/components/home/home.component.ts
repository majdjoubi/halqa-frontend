import { Component, OnDestroy, OnInit, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { AvailableLessonsService, AvailableLessonsPackage } from '../../services/v2/available-lessons.service';
import { FacadeAuthService } from '../../services/auth/facade-auth.service';
import { PublicStatisticsService } from '../../services/stats/public-statistics.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent implements OnInit, OnDestroy {
  packages: AvailableLessonsPackage[] = [];
  packagesLoading = false;

  // Social proof stats
  private readonly studentsMarketingOffset = 120;
  private registeredStudents = 31; // fallback until API loads
  totalStudentsDisplay = this.studentsMarketingOffset + this.registeredStudents;

  lessonsLiveNow = 6; // SSR-safe default
  private activityTimerId?: number;

  private readonly fallbackPackages: AvailableLessonsPackage[] = [
    { id: 'pkg-3', lessons: 3, priceUsd: 27, unitPriceUsd: 27 / 3, active: true },
    { id: 'pkg-6', lessons: 6, priceUsd: 51, unitPriceUsd: 51 / 6, active: true },
    { id: 'pkg-10', lessons: 10, priceUsd: 80, unitPriceUsd: 80 / 10, active: true },
  ];

  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    private router: Router,
    private availableLessonsService: AvailableLessonsService,
    private facadeAuthService: FacadeAuthService,
    private publicStatisticsService: PublicStatisticsService
  ) {}

  ngOnInit(): void {
    this.loadPackages();
    this.initActivityStats();
  }

  ngOnDestroy(): void {
    if (isPlatformBrowser(this.platformId) && this.activityTimerId) {
      window.clearInterval(this.activityTimerId);
    }
  }

  private initActivityStats(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    this.refreshActivityStats();

    // Refresh occasionally so the numbers feel alive without being noisy.
    this.activityTimerId = window.setInterval(() => {
      this.refreshActivityStats();
    }, 10 * 60 * 1000);
  }

  private refreshActivityStats(): void {
    this.lessonsLiveNow = this.computeLessonsLiveNow();
    this.publicStatisticsService.getTotalStudentsCount().subscribe({
      next: (count) => {
        if (typeof count === 'number' && count >= 0) {
          this.registeredStudents = count;
          this.totalStudentsDisplay = this.studentsMarketingOffset + this.registeredStudents;
        }
      },
      error: () => {
        // Keep fallback values silently
      },
    });
  }

  private computeLessonsLiveNow(date: Date = new Date()): number {
    // Deterministic time-of-day curve with a tiny day-based variation.
    // Range is clamped to [3, 12].
    const min = 3;
    const max = 12;
    const mid = (min + max) / 2; // 7.5
    const amp = (max - min) / 2; // 4.5

    const hour = date.getHours() + date.getMinutes() / 60;
    const peakHour = 20; // evening peak
    const angle = (2 * Math.PI * (hour - peakHour)) / 24;
    const base = mid + amp * Math.cos(angle);

    const day = date.getDay(); // 0..6
    const noise = ((day * 13 + Math.floor(hour) * 7) % 3) - 1; // -1..1

    const value = Math.round(base + noise * 0.6);
    return Math.max(min, Math.min(max, value));
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
    // Always show packages to visitors (fallback values), even during SSR
    this.packages = [...this.fallbackPackages];

    // Only attempt API calls in the browser
    if (!isPlatformBrowser(this.platformId)) return;

    // If v2 is enabled, attempt to replace fallback with API-provided packages
    if (!this.availableLessonsService.isEnabled()) return;

    this.packagesLoading = true;
    this.availableLessonsService.getPackages().subscribe({
      next: (pkgs) => {
        const list = Array.isArray(pkgs) ? pkgs : [];

        // If the v2 service is gated for guests (common to avoid 401 noise), it may
        // intentionally return an empty array. In that case, keep showing fallback.
        if (list.length === 0) {
          this.packages = [...this.fallbackPackages];
          this.packagesLoading = false;
          return;
        }

        // Sort by lessons count and pick: 3, 6, 10 lessons packages
        const sorted = list
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
      // Visitors: guide them to create a student account first
      this.router.navigate(['/student-register'], { queryParams: { returnUrl } });
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
