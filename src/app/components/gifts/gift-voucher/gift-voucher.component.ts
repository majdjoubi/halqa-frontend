import { Component, Inject, OnDestroy, OnInit, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { Subscription, interval, switchMap, takeWhile } from 'rxjs';

import { GiftService, GiftVoucherPublic } from '../../../services/gifting/gift.service';

@Component({
  selector: 'app-gift-voucher',
  standalone: true,
  imports: [CommonModule, TranslateModule, RouterLink],
  templateUrl: './gift-voucher.component.html',
  styleUrl: './gift-voucher.component.scss',
})
export class GiftVoucherComponent implements OnInit, OnDestroy {
  code = '';
  voucher: GiftVoucherPublic | null = null;
  loading = true;
  error: string | null = null;

  private subs = new Subscription();

  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    private route: ActivatedRoute,
    private giftService: GiftService
  ) {}

  ngOnInit(): void {
    this.code = String(this.route.snapshot.paramMap.get('code') || '').trim();
    if (!this.code) {
      this.loading = false;
      this.error = 'gifting.errors.missing_code';
      return;
    }

    this.fetchOnce();

    // If payment is still pending, poll for a short period.
    if (isPlatformBrowser(this.platformId)) {
      this.subs.add(
        interval(2500)
          .pipe(
            takeWhile(() => this.voucher?.status === 'pending', true),
            switchMap(() => this.giftService.getVoucher(this.code))
          )
          .subscribe({
            next: (resp) => {
              this.voucher = resp?.voucher || null;
              this.loading = false;
            },
            error: () => {
              // ignore polling errors
            },
          })
      );
    }
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  private fetchOnce(): void {
    this.loading = true;
    this.error = null;

    this.subs.add(
      this.giftService.getVoucher(this.code).subscribe({
        next: (resp) => {
          this.voucher = resp?.voucher || null;
          this.loading = false;
        },
        error: (err) => {
          console.error(err);
          this.loading = false;
          this.error = 'gifting.errors.not_found';
        },
      })
    );
  }

  print(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    window.print();
  }
}
