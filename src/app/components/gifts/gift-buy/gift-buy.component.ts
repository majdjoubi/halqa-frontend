import { Component, Inject, OnDestroy, OnInit, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { Subscription } from 'rxjs';

import { GiftService, GiftPackage, GiftPackageId } from '../../../services/gifting/gift.service';
import { StripeService } from '../../../services/stripe.service';
import { PaypalService } from '../../../services/paypal.service';
import { GoogleAdsService } from '../../../services/analytics/google-ads.service';

declare var paypal: any;

@Component({
  selector: 'app-gift-buy',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  templateUrl: './gift-buy.component.html',
  styleUrl: './gift-buy.component.scss',
})
export class GiftBuyComponent implements OnInit, OnDestroy {
  packages: GiftPackage[] = [];
  loading = false;
  error: string | null = null;

  paypalGiftEnabled = true;

  selectedPackageId: GiftPackageId = 'pkg_3';

  recipientName = '';
  message = '';
  purchaserEmail = '';

  redeemCode = '';

  paymentMethod: 'stripe' | 'paypal' = 'stripe';

  stripeReady = false;
  paying = false;

  private subs = new Subscription();

  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    private giftService: GiftService,
    private stripeService: StripeService,
    private paypalService: PaypalService,
    private googleAds: GoogleAdsService,
    private router: Router
  ) {}

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.loadPackages();
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    try {
      this.stripeService.destroyCardElement();
    } catch {
      // ignore
    }
  }

  private loadPackages(): void {
    this.loading = true;
    this.error = null;

    this.subs.add(
      this.giftService.getPackages().subscribe({
        next: (resp) => {
          this.packages = resp?.packages || [];
          if (!this.packages.find((p) => p.id === this.selectedPackageId)) {
            this.selectedPackageId = (this.packages[0]?.id as GiftPackageId) || 'pkg_3';
          }
          // Check if PayPal gifting is configured server-side
          this.subs.add(
            this.giftService.getPayPalGiftStatus().subscribe({
              next: (s) => {
                this.paypalGiftEnabled = !!s?.enabled;
                if (!this.paypalGiftEnabled && this.paymentMethod === 'paypal') {
                  this.paymentMethod = 'stripe';
                  this.error = 'gifting.buy.errors.paypal_unavailable';
                }

                this.loading = false;
                // Prepare payment UI
                this.prepareStripe();
                if (this.paypalGiftEnabled) this.preparePayPal();
              },
              error: (err) => {
                // If status endpoint fails, keep PayPal visible but let runtime errors handle it.
                console.error(err);
                this.paypalGiftEnabled = true;
                this.loading = false;
                this.prepareStripe();
                this.preparePayPal();
              },
            })
          );
        },
        error: (err) => {
          console.error(err);
          this.loading = false;
          this.error = 'gifting.buy.errors.load_packages';
        },
      })
    );
  }

  get selectedPackage(): GiftPackage | null {
    return this.packages.find((p) => p.id === this.selectedPackageId) || null;
  }

  setPaymentMethod(method: 'stripe' | 'paypal'): void {
    if (method === 'paypal' && !this.paypalGiftEnabled) {
      this.error = 'gifting.buy.errors.paypal_unavailable';
      this.paymentMethod = 'stripe';
      this.prepareStripe();
      return;
    }

    this.paymentMethod = method;
    this.error = null;

    if (method === 'stripe') {
      this.prepareStripe();
    } else {
      this.preparePayPal();
    }
  }

  private async prepareStripe(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    if (this.paymentMethod !== 'stripe') return;

    try {
      await this.stripeService.initializeStripe();
      // mount card element
      this.stripeService.createCardElement('gift-card-element');
      this.stripeReady = true;
    } catch (e) {
      console.error(e);
      this.stripeReady = false;
      this.error = 'gifting.buy.errors.stripe_unavailable';
    }
  }

  async payWithStripe(): Promise<void> {
    if (!this.selectedPackage) return;
    if (this.paying) return;

    this.error = null;
    this.paying = true;

    try {
      const resp = await this.giftService
        .createStripeIntent({
          packageId: this.selectedPackageId,
          recipientName: this.recipientName,
          message: this.message,
          purchaserEmail: this.purchaserEmail,
        })
        .toPromise();

      const code = resp?.code;
      const clientSecret = resp?.clientSecret;
      if (!code || !clientSecret) throw new Error('Payment could not be started');

      const result = await this.stripeService.confirmPayment(clientSecret);
      if (result?.error) {
        throw new Error(result.error?.message || 'Payment failed');
      }

      // Google Ads conversion (Purchase)
      const transactionId = String(result?.paymentIntent?.id || code || '').trim() || undefined;
      this.googleAds.trackConversion('AW-17893648867/cHYpCMr2t-sbEOPTrdRC', transactionId);

      await this.router.navigate(['/gift', code]);
    } catch (e: any) {
      console.error(e);
      this.error = e?.message || 'gifting.buy.errors.payment_failed';
    } finally {
      this.paying = false;
    }
  }

  private async preparePayPal(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    if (this.paymentMethod !== 'paypal') return;

    try {
      const cfg = await this.paypalService.getPayPalConfig().toPromise();
      const clientId = cfg?.clientId;
      if (!clientId) throw new Error('PayPal config missing');

      await this.paypalService.loadPayPalScript(clientId);

      // Render buttons with gift endpoints
      this.renderGiftPayPalButtons();
    } catch (e) {
      console.error(e);
      this.error = 'gifting.buy.errors.paypal_unavailable';
    }
  }

  private renderGiftPayPalButtons(): void {
    if (typeof paypal === 'undefined') return;

    // Re-render: clear container
    const el = document.getElementById('gift-paypal-buttons');
    if (el) el.innerHTML = '';

    paypal
      .Buttons({
        style: {
          layout: 'vertical',
          color: 'blue',
          shape: 'rect',
          label: 'paypal',
        },
        createOrder: async () => {
          try {
            const resp = await this.giftService
              .createPayPalOrder({
                packageId: this.selectedPackageId,
                recipientName: this.recipientName,
                message: this.message,
                purchaserEmail: this.purchaserEmail,
              })
              .toPromise();

            // store code for redirect after capture
            (window as any).__giftPayPalCode = resp?.code;
            return resp?.orderId;
          } catch (e: any) {
            const serverMessage =
              e instanceof HttpErrorResponse ? String((e.error as any)?.message || '') : String(e?.message || '');

            if (e instanceof HttpErrorResponse && e.status >= 500 && /PAYPAL_[A-Z0-9_]+ is required/.test(serverMessage)) {
              this.error = 'gifting.buy.errors.paypal_unavailable';
              throw new Error('PayPal unavailable');
            }

            this.error = 'gifting.buy.errors.paypal_start_failed';
            throw e;
          }
        },
        onApprove: async (data: any) => {
          try {
            const capture = await this.giftService.capturePayPalOrder(data.orderID).toPromise();
            if (!capture?.success) throw new Error('PayPal capture failed');

            // Google Ads conversion (Purchase)
            const transactionId = String(data?.orderID || capture?.code || '').trim() || undefined;
            this.googleAds.trackConversion('AW-17893648867/cHYpCMr2t-sbEOPTrdRC', transactionId);

            await this.router.navigate(['/gift', capture.code]);
          } catch (e: any) {
            console.error(e);
            const serverMessage =
              e instanceof HttpErrorResponse ? String((e.error as any)?.message || '') : String(e?.message || '');

            if (e instanceof HttpErrorResponse && e.status >= 500 && /PAYPAL_[A-Z0-9_]+ is required/.test(serverMessage)) {
              this.error = 'gifting.buy.errors.paypal_unavailable';
              return;
            }

            this.error = 'gifting.buy.errors.paypal_payment_failed';
          }
        },
        onError: (err: any) => {
          console.error(err);
          this.error = 'gifting.buy.errors.paypal_payment_failed';
        },
      })
      .render('#gift-paypal-buttons');
  }

  goRedeem(): void {
    const raw = String(this.redeemCode || '').trim();
    if (!raw) return;

    // Only normalize the new short code format; old codes (e.g. GFT_...) are case-sensitive.
    const normalized = /^halqa[a-z0-9]{5}$/i.test(raw) ? raw.toUpperCase() : raw;
    this.router.navigate(['/redeem', normalized]);
  }
}
