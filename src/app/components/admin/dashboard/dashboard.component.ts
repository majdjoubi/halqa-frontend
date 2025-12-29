import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  DashBoardCardsComponent,
  DashCard,
} from '../../../shared/AdminComponent/dash-board-cards/dash-board-cards.component';
import { SplineChartComponent } from '../../../shared/AdminComponent/spline-chart/spline-chart.component';
import { BarChartComponent } from '../../../shared/AdminComponent/bar-chart/bar-chart.component';
import { RepoService } from '../../../Repositories/repo.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, DashBoardCardsComponent, SplineChartComponent, BarChartComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit {
  dashboardData: any = {};
  quickStatusCounts: any = {};
  
  // Loading and error states
  isLoading = true;
  hasError = false;
  errorMessage = '';

  constructor(private repoService: RepoService) {}

  ngOnInit(): void {
    this.loadDashboardData();
  }

  private loadDashboardData(): void {
    this.isLoading = true;
    this.hasError = false;

    this.repoService.getAdminAnalytics().subscribe({
      next: (res) => {
        this.dashboardData = res;
        this.populateCards();
        this.populateChart();
        this.populateBarChart();
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Failed to load analytics:', err);
        this.hasError = true;
        this.errorMessage = 'فشل في تحميل البيانات. يرجى المحاولة مرة أخرى.';
        this.isLoading = false;
      }
    });

    this.repoService.getAdminStatusCounts().subscribe({
      next: (res) => {
        this.quickStatusCounts = res;
        this.populateCards();
      },
      error: (err) => {
        console.error('Failed to load status counts:', err);
      }
    });
  }

  retryLoad(): void {
    this.loadDashboardData();
  }

  // cards will be populated after data arrives
  cards: DashCard[] = [];

  // helper to populate cards using the fetched dashboardData
  private populateCards() {
    const u = this.dashboardData?.studentStats || {};
    const t = this.dashboardData?.teacherStats || {};
    const user = this.dashboardData?.userStats || {};
    // provide safe fallbacks in case a field is missing
    this.cards = [
      {
        title: 'Students',
        value: u.totalStudents ?? '0',
        percent: '12.5%',
        isUp: true,
        percentBg: 'green',
        extraText: 'You made an extra',
        extraValue: '0',
      },
      {
        title: 'Teachers',
        value: t.totalTeachers ?? '0',
        percent: '10.5%',
        isUp: true,
        percentBg: 'blue',
        extraText: 'You made an extra',
        extraValue: '0',
      },
      {
        title: 'Active Bookings',
        value: this.quickStatusCounts?.activeBookings ?? '0',
        percent: '2.3%',
        isUp: false,
        percentBg: 'yellow',
        extraText: 'You made an extra',
        extraValue: '0',
      },
      {
        title: 'Signups Today',
        value: user?.newUsersToday ?? '0',
        percent: '8.9%',
        isUp: true,
        percentBg: 'green',
        extraText: 'You made an extra',
        extraValue: '0',
      },
    ];
  }

  // example series and categories to pass into spline-chart
  // spline chart data will be populated from the API response
  chartSeries: Array<{ name: string; data: number[] }> = [];
  chartCategories: string[] = [];

  // populate the spline chart using available data from dashboardData
  private populateChart() {
    const months = this.dashboardData?.platformGrowth?.last12MonthsGrowth;
    if (Array.isArray(months) && months.length) {
      this.chartCategories = months.map(
        (m: any) => m.monthName ?? `${m.month}/${m.year}`
      );
      this.chartSeries = [
        { name: 'New Users', data: months.map((m: any) => m.newUsers ?? 0) },
        {
          name: 'New Teachers',
          data: months.map((m: any) => m.newTeachers ?? 0),
        },
        {
          name: 'New Students',
          data: months.map((m: any) => m.newStudents ?? 0),
        },
        {
          name: 'New Bookings',
          data: months.map((m: any) => m.newBookings ?? 0),
        },
      ];
      return;
    }

    const last30 = this.dashboardData?.bookingStats?.last30DaysBookings;
    if (Array.isArray(last30) && last30.length) {
      this.chartCategories = last30.map((d: any) => {
        try {
          return new Date(d.date).toLocaleDateString();
        } catch (e) {
          return d.date;
        }
      });
      this.chartSeries = [
        {
          name: 'Total Bookings',
          data: last30.map((d: any) => d.totalBookings ?? 0),
        },
        {
          name: 'Completed',
          data: last30.map((d: any) => d.completedBookings ?? 0),
        },
        {
          name: 'Cancelled',
          data: last30.map((d: any) => d.cancelledBookings ?? 0),
        },
      ];
      return;
    }

    // fallback: keep chart empty or use a small default
    this.chartCategories = [];
    this.chartSeries = [];
  }

  // example bar chart data
  // weekly bar chart - will be populated from API if available
  barChartSeries: Array<{ name: string; data: number[] }> = [
    { name: 'Bookings', data: [0, 0, 0, 0, 0, 0, 0] },
  ];
  barChartCategories = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  barChartTitle = 'This Week';
  barChartHeaderValue = '0';

  // Populate bar chart with weekly booking data
  private populateBarChart(): void {
    const weeklyData = this.dashboardData?.bookingStats?.thisWeekBookings;
    if (Array.isArray(weeklyData) && weeklyData.length) {
      this.barChartCategories = weeklyData.map((d: any) => {
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        try {
          const date = new Date(d.date);
          return dayNames[date.getDay()];
        } catch {
          return d.dayName ?? 'Day';
        }
      });
      this.barChartSeries = [
        { name: 'Bookings', data: weeklyData.map((d: any) => d.totalBookings ?? d.count ?? 0) },
      ];
      const total = this.barChartSeries[0].data.reduce((a, b) => a + b, 0);
      this.barChartHeaderValue = total.toString();
    } else {
      // Use status counts for a summary if weekly data not available
      const pending = this.quickStatusCounts?.pendingBookings ?? 0;
      const active = this.quickStatusCounts?.activeBookings ?? 0;
      const completed = this.quickStatusCounts?.completedBookings ?? 0;
      const cancelled = this.quickStatusCounts?.cancelledBookings ?? 0;
      
      this.barChartCategories = ['Pending', 'Active', 'Completed', 'Cancelled'];
      this.barChartSeries = [
        { name: 'Bookings', data: [pending, active, completed, cancelled] },
      ];
      this.barChartTitle = 'Booking Status';
      this.barChartHeaderValue = (pending + active + completed + cancelled).toString();
    }
  }
}
