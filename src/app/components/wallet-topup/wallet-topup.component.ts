import { Component, OnInit, OnDestroy } from '@angular/core';
import { StripeService } from '../../services/stripe.service';
import { PaypalService } from '../../services/paypal.service';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
@Component({
  selector: 'app-wallet-topup',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './wallet-topup.component.html',
  styleUrls: ['./wallet-topup.component.scss'],
})
export class WalletTopupComponent implements OnInit, OnDestroy {
  amount: number = 0;
  currency: string = 'usd';
  isProcessing: boolean = false;
  errorMessage: string = '';
  successMessage: string = '';
  cardErrors: string = '';
  
  // Payment method selection
  paymentMethod: 'stripe' | 'paypal' = 'stripe';
  paypalReady: boolean = false;
  paypalLoading: boolean = false;

  constructor(
    private stripeService: StripeService,
    private paypalService: PaypalService,
    private router: Router
  ) {}

  async ngOnInit(): Promise<void> {
    try {
      // تهيئة Stripe
      await this.stripeService.initializeStripe();

      // إنشاء Card Element
      setTimeout(() => {
        this.stripeService.createCardElement('card-element');
      }, 100);
      
      // تحميل PayPal SDK
      this.loadPayPal();
    } catch (error) {
      console.error('Error initializing payment:', error);
      this.errorMessage = 'فشل تحميل نظام الدفع. يرجى المحاولة مرة أخرى.';
    }
  }

  async loadPayPal(): Promise<void> {
    try {
      this.paypalLoading = true;
      // Get PayPal config from backend
      const config = await this.paypalService.getPayPalConfig().toPromise();
      if (config?.clientId) {
        await this.paypalService.loadPayPalScript(config.clientId);
        this.paypalReady = true;
      }
    } catch (error) {
      console.warn('PayPal not available:', error);
      // PayPal is optional, don't show error
    } finally {
      this.paypalLoading = false;
    }
  }

  selectPaymentMethod(method: 'stripe' | 'paypal'): void {
    this.paymentMethod = method;
    this.errorMessage = '';
    this.successMessage = '';
    
    if (method === 'paypal' && this.paypalReady && this.amount > 0) {
      // Render PayPal buttons when selected
      setTimeout(() => {
        this.renderPayPalButtons();
      }, 100);
    }
  }

  renderPayPalButtons(): void {
    if (!this.paypalReady || this.amount <= 0) return;
    
    // Clear existing buttons
    const container = document.getElementById('paypal-button-container');
    if (container) {
      container.innerHTML = '';
    }
    
    this.paypalService.renderPayPalButtons(
      'paypal-button-container',
      this.amount,
      (details) => {
        // Success
        this.successMessage = `تم شحن المحفظة بنجاح بمبلغ ${this.amount} USD عبر PayPal`;
        setTimeout(() => {
          this.router.navigate(['/student-profile']);
        }, 2000);
      },
      (error) => {
        // Error
        this.errorMessage = error.message || 'فشل الدفع عبر PayPal. يرجى المحاولة مرة أخرى.';
      }
    );
  }

  onAmountChange(): void {
    // Re-render PayPal buttons when amount changes
    if (this.paymentMethod === 'paypal' && this.paypalReady && this.amount > 0) {
      setTimeout(() => {
        this.renderPayPalButtons();
      }, 100);
    }
  }

  ngOnDestroy(): void {
    this.stripeService.destroyCardElement();
  }

  async onSubmit(): Promise<void> {
    if (!this.amount || this.amount <= 0) {
      this.errorMessage = 'يرجى إدخال مبلغ صحيح';
      return;
    }
    
    // PayPal handles payment through its own buttons
    if (this.paymentMethod === 'paypal') {
      return;
    }

    this.isProcessing = true;
    this.errorMessage = '';
    this.successMessage = '';

    try {
      // الخطوة 1: إنشاء Payment Intent
      const paymentIntentResponse: any = await this.stripeService
        .createWalletPaymentIntent(this.amount, this.currency, 'شحن المحفظة')
        .toPromise();

      if (!paymentIntentResponse || !paymentIntentResponse.clientSecret) {
        throw new Error('فشل في إنشاء عملية الدفع');
      }

      // الخطوة 2: تأكيد الدفع باستخدام Stripe
      const confirmResult = await this.stripeService.confirmPayment(
        paymentIntentResponse.clientSecret
      );

      if (confirmResult.error) {
        // فشل الدفع
        this.errorMessage =
          confirmResult.error.message || 'فشل الدفع. يرجى المحاولة مرة أخرى.';
        this.isProcessing = false;
        return;
      }

      if (
        confirmResult.paymentIntent &&
        confirmResult.paymentIntent.status === 'succeeded'
      ) {
        // نجح الدفع
        this.successMessage = `تم شحن المحفظة بنجاح بمبلغ ${
          this.amount
        } ${this.currency.toUpperCase()}`;

        // انتظر 2 ثانية ثم انتقل للصفحة الرئيسية أو المحفظة
        setTimeout(() => {
          this.router.navigate(['/wallet']); // أو الصفحة اللي تحب توصل لها
        }, 2000);
      }
    } catch (error: any) {
      console.error('Payment error:', error);
      this.errorMessage = error.message || 'حدث خطأ أثناء عملية الدفع';
    } finally {
      this.isProcessing = false;
    }
  }
}
