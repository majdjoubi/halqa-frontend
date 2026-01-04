import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { RepoService } from '../../../Repositories/repo.service';

interface PaymentLog {
  id: number;
  userId: string;
  userName: string;
  userEmail: string;
  profilePictureUrl: string | null;
  userRole: string;
  amount: number;
  type: number;
  typeDisplay: string;
  description: string;
  referenceId: string | null;
  balanceBefore: number;
  balanceAfter: number;
  teacherEarning: number | null;
  platformFee: number | null;
  createdAt: string;
}

interface PaymentLogResponse {
  transactions: PaymentLog[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalDeposits: number;
  totalPayments: number;
  totalTeacherEarnings: number;
  totalPlatformFees: number;
  totalRefunds: number;
  totalWithdrawals: number;
}

@Component({
  selector: 'app-payments-log',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  templateUrl: './payments-log.component.html',
  styleUrl: './payments-log.component.scss',
})
export class PaymentsLogComponent implements OnInit {
  paymentData: PaymentLogResponse | null = null;
  isLoading = true;
  hasError = false;
  errorMessage = '';
  
  currentPage = 1;
  pageSize = 50;

  constructor(
    private repoService: RepoService,
    private translate: TranslateService
  ) {}

  ngOnInit(): void {
    this.loadPaymentLog();
  }

  loadPaymentLog(): void {
    this.isLoading = true;
    this.hasError = false;

    this.repoService.getPaymentLog(this.currentPage, this.pageSize).subscribe({
      next: (res) => {
        this.paymentData = res;
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Failed to load payment log:', err);
        this.hasError = true;
        this.errorMessage = this.translate.instant('admin_payments.error_loading');
        this.isLoading = false;
      }
    });
  }

  nextPage(): void {
    if (this.paymentData && this.currentPage * this.pageSize < this.paymentData.totalCount) {
      this.currentPage++;
      this.loadPaymentLog();
    }
  }

  prevPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.loadPaymentLog();
    }
  }

  getTransactionTypeClass(type: number): string {
    switch (type) {
      case 1: return 'type-deposit';      // Deposit
      case 2: return 'type-payment';      // Payment
      case 3: return 'type-refund';       // Refund
      case 4: return 'type-earning';      // Earning
      case 5: return 'type-donation';     // DonationReceived
      case 6: return 'type-withdrawal';   // Withdrawal
      case 7: return 'type-hold';         // Hold
      case 8: return 'type-hold-release'; // HoldRelease
      default: return '';
    }
  }

  getTransactionIcon(type: number): string {
    switch (type) {
      case 1: return 'fa-arrow-down';     // Deposit
      case 2: return 'fa-shopping-cart';  // Payment
      case 3: return 'fa-undo';           // Refund
      case 4: return 'fa-hand-holding-usd'; // Earning
      case 5: return 'fa-gift';           // DonationReceived
      case 6: return 'fa-arrow-up';       // Withdrawal
      case 7: return 'fa-lock';           // Hold
      case 8: return 'fa-unlock';         // HoldRelease
      default: return 'fa-exchange-alt';
    }
  }

  getRoleDisplay(role: string): string {
    switch (role) {
      case 'Student': return this.translate.instant('admin_payments.student');
      case 'Teacher': return this.translate.instant('admin_payments.teacher');
      case 'Admin': return this.translate.instant('admin_payments.admin');
      default: return role;
    }
  }

  get totalPages(): number {
    if (!this.paymentData) return 0;
    return Math.ceil(this.paymentData.totalCount / this.pageSize);
  }
}
