import { Component, Inject, OnInit, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

import { GiftService } from '../../../services/gifting/gift.service';
import { FacadeAuthService } from '../../../services/auth/facade-auth.service';

@Component({
  selector: 'app-gift-redeem',
  standalone: true,
  imports: [CommonModule, TranslateModule, RouterLink],
  templateUrl: './gift-redeem.component.html',
  styleUrl: './gift-redeem.component.scss',
})
export class GiftRedeemComponent implements OnInit {
  code = '';
  loading = true;
  error: string | null = null;
  success = false;
  packageId: string | null = null;

  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    private route: ActivatedRoute,
    private router: Router,
    private giftService: GiftService,
    private auth: FacadeAuthService
  ) {}

  ngOnInit(): void {
    this.code = String(this.route.snapshot.paramMap.get('code') || '').trim();
    if (!this.code) {
      this.loading = false;
      this.error = 'gifting.errors.missing_code';
      return;
    }

    if (isPlatformBrowser(this.platformId) && !this.auth.isAuthenticated()) {
      this.loading = false;
      this.router.navigate(['/login'], { queryParams: { returnUrl: `/redeem/${this.code}` } });
      return;
    }

    this.redeem();
  }

  redeem(): void {
    this.loading = true;
    this.error = null;
    this.success = false;

    this.giftService.redeemVoucher(this.code).subscribe({
      next: (resp: any) => {
        this.packageId = String(resp?.packageId || '');
        this.success = true;
        this.loading = false;
      },
      error: (err) => {
        console.error(err);
        this.loading = false;
        this.error = this.mapRedeemErrorToKey(err);
      },
    });
  }

  private mapRedeemErrorToKey(err: any): string {
    const status = Number(err?.status || 0);
    const message = this.extractErrorMessage(err).toLowerCase();

    if (status === 401) {
      if (message.includes('student token')) {
        return 'gifting.errors.student_required';
      }
      return 'gifting.errors.unauthorized';
    }

    if (status === 404) {
      return 'gifting.errors.not_found';
    }

    if (status === 400 || status === 409) {
      if (
        message.includes('already redeemed') ||
        message.includes('already been redeemed') ||
        message.includes('voucher already')
      ) {
        return 'gifting.errors.already_redeemed';
      }

      if (message.includes('not paid yet') || message.includes('payment') && message.includes('pending')) {
        return 'gifting.errors.not_paid_yet';
      }
    }

    return 'gifting.errors.redeem_failed';
  }

  private extractErrorMessage(err: any): string {
    const rawError = err?.error;

    // HttpClient with responseType 'text' yields a string body on errors.
    // Our serverless endpoints return JSON, so sometimes the string is JSON.
    if (typeof rawError === 'string') {
      const text = rawError.trim();
      if (!text) return '';
      try {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === 'object') {
          const msg = (parsed as any)?.message ?? (parsed as any)?.error;
          if (msg) return String(msg);
        }
      } catch {
        // ignore
      }
      return text;
    }

    if (rawError && typeof rawError === 'object') {
      const msg = (rawError as any)?.message ?? (rawError as any)?.error;
      if (msg) return String(msg);
    }

    const rawMessage = err?.message ?? '';
    return String(rawMessage || '');
  }
}
