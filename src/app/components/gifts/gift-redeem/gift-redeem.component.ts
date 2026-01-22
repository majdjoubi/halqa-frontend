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
        this.error = err?.error?.message || err?.message || 'Redeem failed.';
      },
    });
  }
}
