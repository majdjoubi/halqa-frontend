import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { FormsModule } from '@angular/forms';
import { RepoService } from '../../../Repositories/repo.service';

@Component({
  selector: 'app-my-calendar',
  standalone: true,
  imports: [CommonModule, TranslateModule, FormsModule],
  templateUrl: './my-calendar.component.html',
  styleUrl: './my-calendar.component.scss',
})
export class MyCalendarComponent implements OnInit {
  // View mode
  view: 'calendar' | 'individual' | 'group' | 'availability' = 'calendar';
  
  // Counts for tabs
  individualCount = 0;
  groupCount = 0;
  availabilityCount = 0;
  
  // Loading state
  isLoading = true;
  
  // Default hourly rate (editable)
  defaultHourlyRate = 25;
  
  // Current hourly rate (from server - shown to students)
  currentHourlyRate = 0;
  
  // Saving state for hourly rate
  isSavingRate = false;

  constructor(private repo: RepoService) {}

  ngOnInit(): void {
    this.loadTeacherProfile();
  }

  private loadTeacherProfile(): void {
    this.isLoading = true;
    this.repo.getTeacherProfile().subscribe({
      next: (profile: any) => {
        this.currentHourlyRate = profile?.hourlyRate || 0;
        this.defaultHourlyRate = profile?.hourlyRate || 25;
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Error loading teacher profile:', err);
        this.isLoading = false;
      }
    });
  }

  // Calendar state
  selectedCalendarDate: string = '';
  currentMonth: Date = new Date();
  
  // Time slots (empty for now)
  allTimeSlots: any[] = [];
  
  // Group session mode
  isGroupSessionMode = false;
  
  // Bookings (empty for now)
  bookings: any[] = [];
  
  // Modal states
  showGroupSessionModal = false;
  showSuccessModal = false;
  showErrorModal = false;
  successTitle = '';
  successMessage = '';
  errorTitle = '';
  errorMessage = '';
  
  // Save hourly rate
  saveHourlyRate(): void {
    if (this.isSavingRate || this.defaultHourlyRate < 0) return;
    
    this.isSavingRate = true;
    
    const updateData = {
      hourlyRate: this.defaultHourlyRate
    };
    
    this.repo.EditOrUpdateTeacherProfile(updateData).subscribe({
      next: () => {
        this.currentHourlyRate = this.defaultHourlyRate;
        this.isSavingRate = false;
        // Show success feedback
        this.successTitle = 'Success';
        this.successMessage = 'Hourly rate updated successfully';
        this.showSuccessModal = true;
      },
      error: () => {
        this.isSavingRate = false;
        // Show error feedback
        this.errorTitle = 'Error';
        this.errorMessage = 'Failed to update hourly rate';
        this.showErrorModal = true;
      }
    });
  }

  // Placeholder methods - no functionality
  toggleGroupSessionMode(): void {
    this.isGroupSessionMode = !this.isGroupSessionMode;
  }
  
  toggleSlot(slot: any): void {
    // No functionality
  }
  
  removeSlot(slot: any): void {
    // No functionality
  }
  
  onDateSelected(date: string): void {
    this.selectedCalendarDate = date;
  }
  
  closeGroupSessionModal(): void {
    this.showGroupSessionModal = false;
  }
  
  createGroupSession(): void {
    // No functionality
  }
  
  closeSuccessModal(): void {
    this.showSuccessModal = false;
  }
  
  closeErrorModal(): void {
    this.showErrorModal = false;
  }
  
  startMeeting(booking: any): void {
    // No functionality
  }
  
  endMeeting(booking: any): void {
    // No functionality
  }
  
  joinMeeting(booking: any): void {
    // No functionality
  }
  
  cancelBooking(booking: any): void {
    // No functionality
  }
  
  getStatusLabel(booking: any): string {
    return booking?.status || '';
  }
  
  getStatusClass(booking: any): string {
    return 'status-' + (booking?.status || 'pending');
  }
  
  // Filter methods
  get filteredBookings(): any[] {
    return [];
  }
  
  get individualBookings(): any[] {
    return [];
  }
  
  get groupBookings(): any[] {
    return [];
  }
  
  get availabilityBookings(): any[] {
    return [];
  }
}
