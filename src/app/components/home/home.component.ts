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
