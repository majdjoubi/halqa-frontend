import { Component, OnInit, OnDestroy, ElementRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { NotificationService, Notification } from '../../services/notification.service';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-notification-bell',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslateModule],
  templateUrl: './notification-bell.component.html',
  styleUrls: ['./notification-bell.component.scss']
})
export class NotificationBellComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  
  notifications: Notification[] = [];
  unreadCount = 0;
  isOpen = false;
  isLoading = false;

  constructor(
    private notificationService: NotificationService,
    private elementRef: ElementRef,
    public translate: TranslateService
  ) {}

  ngOnInit(): void {
    // Subscribe to notifications
    this.notificationService.notifications$
      .pipe(takeUntil(this.destroy$))
      .subscribe(notifications => {
        this.notifications = notifications;
      });

    // Subscribe to unread count
    this.notificationService.unreadCount$
      .pipe(takeUntil(this.destroy$))
      .subscribe(count => {
        this.unreadCount = count;
      });

    // Subscribe to new notifications for sound/vibration
    this.notificationService.newNotification$
      .pipe(takeUntil(this.destroy$))
      .subscribe(notification => {
        this.playNotificationSound();
      });

    // Load notifications immediately (don't wait for SignalR)
    this.loadNotifications();

    // Initialize SignalR for real-time updates
    this.notificationService.initializeSignalR();
    
    // Request browser notification permission
    this.notificationService.requestNotificationPermission();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.isOpen = false;
    }
  }

  toggleDropdown(): void {
    this.isOpen = !this.isOpen;
    if (this.isOpen && this.notifications.length === 0) {
      this.loadNotifications();
    }
  }

  loadNotifications(): void {
    this.isLoading = true;
    this.notificationService.loadNotifications();
    setTimeout(() => this.isLoading = false, 500);
  }

  markAsRead(notification: Notification, event: Event): void {
    event.stopPropagation();
    if (!notification.isRead) {
      this.notificationService.markAsRead(notification.id)
        .pipe(takeUntil(this.destroy$))
        .subscribe();
    }
  }

  markAllAsRead(): void {
    this.notificationService.markAllAsRead()
      .pipe(takeUntil(this.destroy$))
      .subscribe();
  }

  deleteNotification(notification: Notification, event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    this.notificationService.deleteNotification(notification.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe();
  }

  navigateToNotification(notification: Notification): void {
    this.markAsRead(notification, new Event('click'));
    if (notification.actionUrl) {
      window.location.href = notification.actionUrl;
    }
    this.isOpen = false;
  }

  getIcon(type: string): string {
    return this.notificationService.getNotificationIcon(type);
  }

  getColorClass(type: string): string {
    return this.notificationService.getNotificationColorClass(type);
  }

  getTimeAgo(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return this.translate.instant('notifications.justNow');
    if (diffMins < 60) return this.translate.instant('notifications.minutesAgo', { count: diffMins });
    if (diffHours < 24) return this.translate.instant('notifications.hoursAgo', { count: diffHours });
    if (diffDays < 7) return this.translate.instant('notifications.daysAgo', { count: diffDays });
    
    return date.toLocaleDateString();
  }

  private playNotificationSound(): void {
    try {
      const audio = new Audio('/assets/sounds/notification.mp3');
      audio.volume = 0.5;
      audio.play().catch(() => {
        // Ignore autoplay errors
      });
    } catch {
      // Ignore audio errors
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
