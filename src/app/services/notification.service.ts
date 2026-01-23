import { Injectable, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { takeUntil, tap } from 'rxjs/operators';
import * as signalR from '@microsoft/signalr';
import { environment } from '../environment/environment';
import { StorageService } from './storage.service';

export interface Notification {
  id: number;
  type: string;
  title: string;
  message: string;
  actionUrl?: string;
  isRead: boolean;
  createdAt: string;
}

export interface NotificationsResponse {
  notifications: Notification[];
  unreadCount: number;
  page: number;
  pageSize: number;
}

@Injectable({
  providedIn: 'root'
})
export class NotificationService implements OnDestroy {
  private baseUrl = (environment.apiUrl || '').replace(/\/$/, '');
  private hubBaseUrl = ((environment as any).notificationsHubUrl || '').replace(/\/$/, '');
  private readonly hardcodedProdHubBaseUrl = 'https://halqa-api-k60w.onrender.com';
  private hubConnection: signalR.HubConnection | null = null;
  private destroy$ = new Subject<void>();
  
  private notificationsSubject = new BehaviorSubject<Notification[]>([]);
  private unreadCountSubject = new BehaviorSubject<number>(0);
  private newNotificationSubject = new Subject<Notification>();
  
  public notifications$ = this.notificationsSubject.asObservable();
  public unreadCount$ = this.unreadCountSubject.asObservable();
  public newNotification$ = this.newNotificationSubject.asObservable();

  constructor(
    private http: HttpClient,
    private storageService: StorageService
  ) {}

  private getToken(): string {
    return (
      this.storageService.getItem('authToken') ||
      this.storageService.getItem('access_token') ||
      this.storageService.getItem('token') ||
      ''
    ).trim();
  }

  /**
   * Initialize SignalR connection for real-time notifications
   */
  initializeSignalR(): void {
    // Make initialization safe to call multiple times.
    if (this.hubConnection && this.hubConnection.state !== signalR.HubConnectionState.Disconnected) {
      return;
    }

    const token = this.getToken();
    if (!token) {
      console.log('No token available for SignalR connection');
      return;
    }

    // Determine hub URL based on environment.
    // In production, avoid same-origin '/hubs/*' because the frontend host may not serve SignalR.
    const resolvedHubBaseUrl =
      this.hubBaseUrl ||
      this.baseUrl ||
      (environment.production ? this.hardcodedProdHubBaseUrl : '');

    const hubUrl = resolvedHubBaseUrl
      ? `${resolvedHubBaseUrl.replace(/\/$/, '')}/hubs/notifications`
      : '/hubs/notifications';

    this.hubConnection = new signalR.HubConnectionBuilder()
      .withUrl(hubUrl, {
        // Important: return a fresh token each time (prevents stale token after login/refresh).
        accessTokenFactory: () => this.getToken()
      })
      .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
      .configureLogging(signalR.LogLevel.Information)
      .build();

    // Handle receiving new notifications
    this.hubConnection.on('ReceiveNotification', (notification: Notification) => {
      console.log('Received real-time notification:', notification);
      this.newNotificationSubject.next(notification);
      
      // Add to notifications list
      const currentNotifications = this.notificationsSubject.value;
      this.notificationsSubject.next([notification, ...currentNotifications]);
      
      // Update unread count
      this.unreadCountSubject.next(this.unreadCountSubject.value + 1);
      
      // Show browser notification if permitted
      this.showBrowserNotification(notification);
    });

    // Handle unread count updates
    this.hubConnection.on('UnreadCountUpdated', (count: number) => {
      this.unreadCountSubject.next(count);
    });

    // Handle connection events
    this.hubConnection.onclose((error) => {
      console.log('SignalR connection closed', error);
    });

    this.hubConnection.onreconnecting((error) => {
      console.log('SignalR reconnecting...', error);
    });

    this.hubConnection.onreconnected((connectionId) => {
      console.log('SignalR reconnected:', connectionId);
      // Refresh notifications after reconnection
      this.loadNotifications();
    });

    // Start connection
    this.startConnection();
  }

  private async startConnection(): Promise<void> {
    if (!this.hubConnection) return;

    // If token is missing/cleared, don't keep retrying.
    if (!this.getToken()) {
      this.stopSignalR();
      return;
    }

    try {
      await this.hubConnection.start();
      console.log('SignalR connected successfully');
      // Load initial notifications
      this.loadNotifications();
    } catch (error) {
      console.error('SignalR connection failed:', error);

      const msg = String((error as any)?.message || error || '');
      const looksUnauthorized = /\b401\b|unauthoriz/i.test(msg);
      if (looksUnauthorized) {
        // Stop noisy retry loops; allow re-init after a new login.
        this.stopSignalR();
        return;
      }

      // Retry after 5 seconds
      setTimeout(() => this.startConnection(), 5000);
    }
  }

  /**
   * Stop SignalR connection
   */
  stopSignalR(): void {
    if (this.hubConnection) {
      this.hubConnection.stop();
      this.hubConnection = null;
    }
  }

  /**
   * Request browser notification permission
   */
  requestNotificationPermission(): void {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }

  /**
   * Show browser notification
   */
  private showBrowserNotification(notification: Notification): void {
    if ('Notification' in window && Notification.permission === 'granted') {
      const browserNotification = new Notification(notification.title, {
        body: notification.message,
        icon: '/assets/icons/icon-192x192.png',
        badge: '/assets/icons/icon-72x72.png',
        tag: `notification-${notification.id}`,
        requireInteraction: false
      });

      browserNotification.onclick = () => {
        window.focus();
        if (notification.actionUrl) {
          window.location.href = notification.actionUrl;
        }
        browserNotification.close();
      };

      // Auto close after 5 seconds
      setTimeout(() => browserNotification.close(), 5000);
    }
  }

  /**
   * Load notifications from API
   */
  loadNotifications(unreadOnly = false, page = 1, pageSize = 20): void {
    this.getNotifications(unreadOnly, page, pageSize)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (page === 1) {
            this.notificationsSubject.next(response.notifications);
          } else {
            const current = this.notificationsSubject.value;
            this.notificationsSubject.next([...current, ...response.notifications]);
          }
          this.unreadCountSubject.next(response.unreadCount);
        },
        error: (error) => {
          console.error('Failed to load notifications:', error);
        }
      });
  }

  /**
   * Get notifications from API
   */
  getNotifications(unreadOnly = false, page = 1, pageSize = 20): Observable<NotificationsResponse> {
    return this.http.get<NotificationsResponse>(
      `${this.baseUrl}/api/notification?unreadOnly=${unreadOnly}&page=${page}&pageSize=${pageSize}`
    );
  }

  /**
   * Get unread count from API
   */
  getUnreadCount(): Observable<{ unreadCount: number }> {
    return this.http.get<{ unreadCount: number }>(`${this.baseUrl}/api/notification/unread-count`);
  }

  /**
   * Mark a notification as read
   */
  markAsRead(notificationId: number): Observable<any> {
    return this.http.put(`${this.baseUrl}/api/notification/${notificationId}/read`, {}).pipe(
      tap(() => {
        // Update local state
        const notifications = this.notificationsSubject.value.map(n =>
          n.id === notificationId ? { ...n, isRead: true } : n
        );
        this.notificationsSubject.next(notifications);
        
        // Decrement unread count
        const currentCount = this.unreadCountSubject.value;
        if (currentCount > 0) {
          this.unreadCountSubject.next(currentCount - 1);
        }
      })
    );
  }

  /**
   * Mark all notifications as read
   */
  markAllAsRead(): Observable<any> {
    return this.http.put(`${this.baseUrl}/api/notification/read-all`, {}).pipe(
      tap(() => {
        // Update local state
        const notifications = this.notificationsSubject.value.map(n => ({ ...n, isRead: true }));
        this.notificationsSubject.next(notifications);
        this.unreadCountSubject.next(0);
      })
    );
  }

  /**
   * Delete a notification
   */
  deleteNotification(notificationId: number): Observable<any> {
    return this.http.delete(`${this.baseUrl}/api/notification/${notificationId}`).pipe(
      tap(() => {
        const notifications = this.notificationsSubject.value.filter(n => n.id !== notificationId);
        this.notificationsSubject.next(notifications);
      })
    );
  }

  /**
   * Delete all notifications
   */
  deleteAllNotifications(): Observable<any> {
    return this.http.delete(`${this.baseUrl}/api/notification`).pipe(
      tap(() => {
        this.notificationsSubject.next([]);
        this.unreadCountSubject.next(0);
      })
    );
  }

  /**
   * Get notification type icon
   */
  getNotificationIcon(type: string): string {
    const icons: { [key: string]: string } = {
      'BookingConfirmed': 'fa-calendar-check',
      'BookingCancelled': 'fa-calendar-times',
      'BookingReminder1Hour': 'fa-clock',
      'BookingReminder24Hours': 'fa-bell',
      'NewBookingRequest': 'fa-calendar-plus',
      'MeetingStarted': 'fa-video',
      'MeetingEnded': 'fa-video-slash',
      'WalletTopUp': 'fa-wallet',
      'PaymentReceived': 'fa-money-bill-wave',
      'TeacherApproved': 'fa-user-check',
      'TeacherRejected': 'fa-user-times',
      'NewTeacherRegistration': 'fa-user-plus',
      'SystemMessage': 'fa-info-circle',
      'Welcome': 'fa-hand-sparkles'
    };
    return icons[type] || 'fa-bell';
  }

  /**
   * Get notification type color class
   */
  getNotificationColorClass(type: string): string {
    const colors: { [key: string]: string } = {
      'BookingConfirmed': 'bg-green-100 text-green-600',
      'BookingCancelled': 'bg-red-100 text-red-600',
      'BookingReminder1Hour': 'bg-orange-100 text-orange-600',
      'BookingReminder24Hours': 'bg-yellow-100 text-yellow-600',
      'NewBookingRequest': 'bg-blue-100 text-blue-600',
      'MeetingStarted': 'bg-purple-100 text-purple-600',
      'MeetingEnded': 'bg-gray-100 text-gray-600',
      'WalletTopUp': 'bg-emerald-100 text-emerald-600',
      'PaymentReceived': 'bg-green-100 text-green-600',
      'TeacherApproved': 'bg-green-100 text-green-600',
      'TeacherRejected': 'bg-red-100 text-red-600',
      'NewTeacherRegistration': 'bg-indigo-100 text-indigo-600',
      'SystemMessage': 'bg-gray-100 text-gray-600',
      'Welcome': 'bg-purple-100 text-purple-600'
    };
    return colors[type] || 'bg-gray-100 text-gray-600';
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.stopSignalR();
  }
}
