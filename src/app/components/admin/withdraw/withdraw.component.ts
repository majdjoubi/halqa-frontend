import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RepoService } from '../../../Repositories/repo.service';

interface WithdrawalRequest {
  id: number;
  teacherId: string;
  teacherName: string;
  teacherEmail: string;
  amount: number;
  status: string;
  paymentMethod: string;
  paymentAccount: string;
  notes: string;
  adminNotes: string;
  approvedByAdminName: string;
  createdAt: string;
  approvedAt: string;
  updatedAt: string;
}

interface WithdrawalResponse {
  requests: WithdrawalRequest[];
  total: number;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  totalPendingAmount: number;
}

@Component({
  selector: 'app-withdraw',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './withdraw.component.html',
  styleUrl: './withdraw.component.scss',
})
export class WithdrawComponent implements OnInit {
  activeTab: 'all' | 'pending' = 'all';
  allRequests: WithdrawalRequest[] = [];
  filteredRequests: WithdrawalRequest[] = [];
  searchText: string = '';

  // Statistics
  stats = {
    total: 0,
    pendingCount: 0,
    approvedCount: 0,
    rejectedCount: 0,
    totalPendingAmount: 0,
  };

  constructor(private repoService: RepoService) {}

  ngOnInit(): void {
    this.loadWithdrawalRequests();
  }

  loadWithdrawalRequests(): void {
    this.repoService.getAllWithdrawalRequests().subscribe({
      next: (response: any) => {
        this.allRequests = response.requests || [];
        this.stats = {
          total: response.total || 0,
          pendingCount: response.pendingCount || 0,
          approvedCount: response.approvedCount || 0,
          rejectedCount: response.rejectedCount || 0,
          totalPendingAmount: response.totalPendingAmount || 0,
        };
        this.filterRequests();
      },
      error: (error) => {
        console.error('Error loading withdrawal requests:', error);
      },
    });
  }

  setActiveTab(tab: 'all' | 'pending'): void {
    this.activeTab = tab;
    this.filterRequests();
  }

  filterRequests(): void {
    let filtered = [...this.allRequests];

    // Filter by tab
    if (this.activeTab === 'pending') {
      filtered = filtered.filter(
        (req) => req.status.toLowerCase() === 'pending'
      );
    }

    // Filter by search text
    if (this.searchText.trim()) {
      const searchLower = this.searchText.toLowerCase().trim();
      filtered = filtered.filter(
        (req) =>
          req.teacherName?.toLowerCase().includes(searchLower) ||
          req.teacherEmail?.toLowerCase().includes(searchLower) ||
          req.paymentMethod?.toLowerCase().includes(searchLower)
      );
    }

    this.filteredRequests = filtered;
  }

  onSearchChange(): void {
    this.filterRequests();
  }

  approveRequest(request: WithdrawalRequest): void {
    const adminNotes = prompt(
      `Approve withdrawal request for ${request.teacherName}?\nOptional notes:`
    );

    if (adminNotes !== null) {
      // null means cancelled
      this.repoService
        .approveWithdrawalRequest(request.id, adminNotes)
        .subscribe({
          next: (response) => {
            console.log('Request approved successfully:', response);
            alert('Withdrawal request approved successfully!');
            this.loadWithdrawalRequests();
          },
          error: (error) => {
            console.error('Error approving request:', error);
            alert('Failed to approve withdrawal request. Please try again.');
          },
        });
    }
  }

  rejectRequest(request: WithdrawalRequest): void {
    const adminNotes = prompt(
      `Reject withdrawal request for ${request.teacherName}?\nReason for rejection:`
    );

    if (adminNotes !== null) {
      // null means cancelled
      this.repoService
        .rejectWithdrawalRequest(request.id, adminNotes)
        .subscribe({
          next: (response) => {
            console.log('Request rejected successfully:', response);
            alert('Withdrawal request rejected successfully!');
            this.loadWithdrawalRequests();
          },
          error: (error) => {
            console.error('Error rejecting request:', error);
            alert('Failed to reject withdrawal request. Please try again.');
          },
        });
    }
  }

  getStatusClass(status: string): string {
    switch (status.toLowerCase()) {
      case 'approved':
        return 'status-approved';
      case 'pending':
        return 'status-pending';
      case 'rejected':
        return 'status-rejected';
      default:
        return '';
    }
  }

  formatDate(dateString: string): string {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  formatAmount(amount: number): string {
    return amount?.toFixed(2) || '0.00';
  }
}
