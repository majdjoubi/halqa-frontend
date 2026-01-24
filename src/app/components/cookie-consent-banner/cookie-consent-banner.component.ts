import { CommonModule } from '@angular/common';
import { Component, Inject, OnDestroy, OnInit, PLATFORM_ID } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { isPlatformBrowser } from '@angular/common';
import { Subject, takeUntil } from 'rxjs';
import { CookieConsentService } from '../../services/consent/cookie-consent.service';

@Component({
  selector: 'app-cookie-consent-banner',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './cookie-consent-banner.component.html',
  styleUrl: './cookie-consent-banner.component.scss',
})
export class CookieConsentBannerComponent implements OnInit, OnDestroy {
  isVisible = false;

  private readonly destroy$ = new Subject<void>();
  private readonly isBrowser: boolean;

  constructor(
    private consent: CookieConsentService,
    private router: Router,
    @Inject(PLATFORM_ID) platformId: Object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  ngOnInit(): void {
    if (!this.isBrowser) return;

    this.consent.consent$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.isVisible = !this.consent.hasDecision;
    });

    this.isVisible = !this.consent.hasDecision;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  acceptAll(): void {
    this.consent.acceptAll();
  }

  rejectNonEssential(): void {
    this.consent.rejectNonEssential();
  }

  openSettings(): void {
    this.router.navigate(['/cookies'], { queryParams: { settings: 1 } });
  }
}
