import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import {
  loadStripe,
  Stripe,
  StripeElements,
  StripeCardElement,
} from '@stripe/stripe-js';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable({
  providedIn: 'root',
})
export class StripeService {
  private baseUrl = 'https://halqa-api.onrender.com/api';
  private stripePromise: Promise<Stripe | null> | null = null;
  private stripe: Stripe | null = null;
  private elements: StripeElements | null = null;
  private cardElement: StripeCardElement | null = null;

  constructor(private http: HttpClient) {}

  // جلب الـ Publishable Key من الـ Backend
  async initializeStripe(): Promise<void> {
    try {
      const config: any = await this.http
        .get(`${this.baseUrl}/payment/config`)
        .toPromise();

      if (config && config.publishableKey) {
        this.stripePromise = loadStripe(config.publishableKey);
        this.stripe = await this.stripePromise;
      } else {
        throw new Error('Failed to get Stripe configuration');
      }
    } catch (error) {
      console.error('Error initializing Stripe:', error);
      throw error;
    }
  }

  // إنشاء Card Element
  createCardElement(elementId: string): void {
    if (!this.stripe) {
      throw new Error('Stripe not initialized');
    }

    this.elements = this.stripe.elements();
    this.cardElement = this.elements.create('card', {
      style: {
        base: {
          fontSize: '16px',
          color: '#32325d',
          fontFamily: '"Helvetica Neue", Helvetica, sans-serif',
          '::placeholder': {
            color: '#aab7c4',
          },
        },
        invalid: {
          color: '#fa755a',
          iconColor: '#fa755a',
        },
      },
    });

    this.cardElement.mount(`#${elementId}`);
  }

  // إنشاء Payment Intent لشحن المحفظة
  createWalletPaymentIntent(
    amount: number,
    currency: string = 'usd',
    description?: string
  ): Observable<any> {
    const token = localStorage.getItem('token'); // أو حسب طريقة تخزين الـ Token عندك

    const headers = new HttpHeaders({
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    });

    const body = {
      amount: amount,
      currency: currency,
      description: description || 'Wallet top-up',
    };

    return this.http.post(
      `${this.baseUrl}/payment/payment-intent/wallet`,
      body,
      { headers }
    );
  }

  // تأكيد الدفع
  async confirmPayment(clientSecret: string): Promise<any> {
    if (!this.stripe || !this.cardElement) {
      throw new Error('Stripe or Card Element not initialized');
    }

    const result = await this.stripe.confirmCardPayment(clientSecret, {
      payment_method: {
        card: this.cardElement,
      },
    });

    return result;
  }

  // شحن المحفظة مباشرة
  topUpWallet(
    amount: number,
    currency: string = 'usd',
    description?: string
  ): Observable<any> {
    const token = localStorage.getItem('token');

    const headers = new HttpHeaders({
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    });

    const body = {
      amount: amount,
      currency: currency,
      description: description || 'Wallet top-up',
    };

    return this.http.post(`${this.baseUrl}/payment/wallet/topup`, body, {
      headers,
    });
  }

  // الحصول على حالة الدفع
  getPaymentStatus(paymentIntentId: string): Observable<any> {
    const token = localStorage.getItem('token');

    const headers = new HttpHeaders({
      Authorization: `Bearer ${token}`,
    });

    return this.http.get(
      `${this.baseUrl}/payment/payment-status/${paymentIntentId}`,
      { headers }
    );
  }

  // Cleanup
  destroyCardElement(): void {
    if (this.cardElement) {
      this.cardElement.destroy();
      this.cardElement = null;
    }
  }
}
