import { Component, OnInit, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { AvailableLessonsService, AvailableLessonsPackage } from '../../services/v2/available-lessons.service';

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

  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    private router: Router,
    private availableLessonsService: AvailableLessonsService
  ) {}

  ngOnInit(): void {
    this.loadPackages();
  }

  private loadPackages(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (!this.availableLessonsService.isEnabled()) return;

    this.packagesLoading = true;
    this.availableLessonsService.getPackages().subscribe({
      next: (pkgs) => {
        // Sort by lessons count and take 3 (economy, popular, best value)
        const sorted = (Array.isArray(pkgs) ? pkgs : [])
          .filter(p => p.active !== false)
          .sort((a, b) => a.lessons - b.lessons);
        
        // Pick 3: smallest, middle, largest (or adapt if fewer)
        if (sorted.length >= 3) {
          this.packages = [sorted[0], sorted[Math.floor(sorted.length / 2)], sorted[sorted.length - 1]];
        } else {
          this.packages = sorted.slice(0, 3);
        }
        this.packagesLoading = false;
      },
      error: () => {
        this.packages = [];
        this.packagesLoading = false;
      }
    });
  }

  buyPackage(pkg: AvailableLessonsPackage): void {
    // Navigate to all-teachers with query param to open purchase modal
    this.router.navigate(['/all-teachers'], { queryParams: { openAvailableLessons: '1' } });
  }

  goToAllTeachers(): void {
    this.router.navigate(['/all-teachers']);
  }
}
