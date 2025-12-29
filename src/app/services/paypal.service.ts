import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, from } from 'rxjs';
import { environment } from '../environment/environment';

declare var paypal: any;

export interface PayPalOrderResponse {
  orderId: string;
  approvalUrl: string;
}

export interface PayPalCaptureResponse {
  success: boolean;
  transactionId: string;
  amount: number;
  status: string;
}

@Injectable({
  providedIn: 'root',
})
export class PaypalService {
  private baseUrl = environment.apiUrl || 'https://halqa-api.onrender.com';
  private paypalScriptLoaded = false;

  constructor(private http: HttpClient) {}

  /**
   * Load the PayPal SDK script dynamically
   * @param clientId - PayPal Client ID from backend config
   */
  async loadPayPalScript(clientId: string): Promise<void> {
    if (this.paypalScriptLoaded) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=USD`;
      script.onload = () => {
        this.paypalScriptLoaded = true;
        resolve();
      };
      script.onerror = () => {
        reject(new Error('Failed to load PayPal SDK'));
      };
      document.body.appendChild(script);
    });
  }

  /**
   * Get PayPal configuration from backend
   */
  getPayPalConfig(): Observable<{ clientId: string }> {
    return this.http.get<{ clientId: string }>(`${this.baseUrl}/api/payment/paypal/config`);
  }

  /**
   * Create a PayPal order for wallet top-up
   */
  createPayPalOrder(amount: number, currency: string = 'USD'): Observable<PayPalOrderResponse> {
    const token = localStorage.getItem('access_token');
    const headers = new HttpHeaders({
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    });

    return this.http.post<PayPalOrderResponse>(
      `${this.baseUrl}/api/payment/paypal/create-order`,
      { amount, currency },
      { headers }
    );
  }

  /**
   * Capture the PayPal order after user approval
   */
  capturePayPalOrder(orderId: string): Observable<PayPalCaptureResponse> {
    const token = localStorage.getItem('access_token');
    const headers = new HttpHeaders({
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    });

    return this.http.post<PayPalCaptureResponse>(
      `${this.baseUrl}/api/payment/paypal/capture-order`,
      { orderId },
      { headers }
    );
  }

  /**
   * Render PayPal buttons in a container
   * @param containerId - The ID of the HTML element to render buttons in
   * @param amount - The amount to charge
   * @param onSuccess - Callback when payment is successful
   * @param onError - Callback when payment fails
   */
  renderPayPalButtons(
    containerId: string,
    amount: number,
    onSuccess: (details: any) => void,
    onError: (error: any) => void
  ): void {
    if (typeof paypal === 'undefined') {
      onError(new Error('PayPal SDK not loaded'));
      return;
    }

    paypal.Buttons({
      style: {
        layout: 'vertical',
        color: 'blue',
        shape: 'rect',
        label: 'paypal',
      },
      createOrder: async () => {
        try {
          const response = await this.createPayPalOrder(amount).toPromise();
          return response?.orderId;
        } catch (error) {
          onError(error);
          throw error;
        }
      },
      onApprove: async (data: any) => {
        try {
          const captureResponse = await this.capturePayPalOrder(data.orderID).toPromise();
          if (captureResponse?.success) {
            onSuccess(captureResponse);
          } else {
            onError(new Error('Payment capture failed'));
          }
        } catch (error) {
          onError(error);
        }
      },
      onError: (err: any) => {
        console.error('PayPal Button Error:', err);
        onError(err);
      },
      onCancel: () => {
        console.log('Payment cancelled by user');
      },
    }).render(`#${containerId}`);
  }
}
