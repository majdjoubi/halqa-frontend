import { Routes } from '@angular/router';
import { AuthGuard } from './core/guards/auth.guard';
import { ProtectedGuard } from './core/guards/protected.guard';
import { TeacherGuard } from './core/guards/teacher.guard';
import { StudentGuard } from './core/guards/student.guard';
import { AdminGuard } from './core/guards/admin.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./components/home/home.component').then((m) => m.HomeComponent),
  },
  {
    path: 'gift',
    loadComponent: () =>
      import('./components/gifts/gift-buy/gift-buy.component').then((m) => m.GiftBuyComponent),
  },
  {
    path: 'gift/:code',
    loadComponent: () =>
      import('./components/gifts/gift-voucher/gift-voucher.component').then(
        (m) => m.GiftVoucherComponent
      ),
  },
  {
    path: 'redeem/:code',
    loadComponent: () =>
      import('./components/gifts/gift-redeem/gift-redeem.component').then(
        (m) => m.GiftRedeemComponent
      ),
  },
  {
    path: 'home',
    canActivate: [ProtectedGuard],
    loadComponent: () =>
      import('./components/home/home.component').then((m) => m.HomeComponent),
  },
  {
    path: 'student-register',
    canActivate: [AuthGuard],
    loadComponent: () =>
      import(
        './components/auth/student-auth/student-register/student-register.component'
      ).then((m) => m.StudentRegisterComponent),
  },
  {
    path: 'login',
    canActivate: [AuthGuard],
    loadComponent: () =>
      import('./components/auth/login/login.component').then(
        (m) => m.LoginComponent
      ),
  },
  {
    path: 'teacher-register',
    canActivate: [AuthGuard],
    loadComponent: () =>
      import(
        './components/auth/teacher-auth/teacher-register/teacher-register.component'
      ).then((m) => m.TeacherRegisterComponent),
  },
  {
    path: 'teacher-create-profile',
    canActivate: [TeacherGuard],
    loadComponent: () =>
      import(
        './components/auth/teacher-auth/teacher-create-profile/teacher-create-profile.component'
      ).then((m) => m.TeacherCreateProfileComponent),
  },
  {
    path: 'my-calendar',
    canActivate: [TeacherGuard],
    loadComponent: () =>
      import('./components/teacher/my-calendar/my-calendar.component').then(
        (m) => m.MyCalendarComponent
      ),
  },
  {
    path: 'teacher-instructions',
    canActivate: [TeacherGuard],
    loadComponent: () =>
      import(
        './components/teacher/teacher-instructions/teacher-instructions.component'
      ).then((m) => m.TeacherInstructionsComponent),
  },
  {
    path: 'forgot-password',
    canActivate: [AuthGuard],
    loadComponent: () =>
      import('./components/auth/forgetpassword/forgetpassword.component').then(
        (m) => m.ForgetpasswordComponent
      ),
  },
  {
    path: 'verify-otp',
    canActivate: [AuthGuard],
    loadComponent: () =>
      import('./components/auth/verify-otp/verify-otp.component').then(
        (m) => m.VerifyOtpComponent
      ),
  },
  {
    path: 'set-password',
    canActivate: [AuthGuard],
    loadComponent: () =>
      import('./components/auth/set-password/set-password.component').then(
        (m) => m.SetPasswordComponent
      ),
  },
  {
    path: 'student-profile',
    canActivate: [StudentGuard],
    loadComponent: () =>
      import(
        './components/auth/student-auth/student-profile/student-profile.component'
      ).then((m) => m.StudentProfileComponent),
  },
  {
    path: 'teacher-profile',
    canActivate: [TeacherGuard],
    loadComponent: () =>
      import(
        './components/auth/teacher-auth/teacher-profile/teacher-profile.component'
      ).then((m) => m.TeacherProfileComponent),
  },
  {
    path: 'all-teachers',
    canActivate: [StudentGuard],
    loadComponent: () =>
      import('./components/student/all-teachers/all-teachers.component').then(
        (m) => m.AllTeachersComponent
      ),
  },
  {
    path: 'my-bookings',
    canActivate: [StudentGuard],
    loadComponent: () =>
      import('./components/student/my-bookings/my-bookings.component').then(
        (m) => m.MyBookingsComponent
      ),
  },
  {
    path: 'join-us',
    canActivate: [AuthGuard],
    loadComponent: () =>
      import('./components/auth/join-us/join-us.component').then(
        (m) => m.JoinUsComponent
      ),
  },
  {
    path: 'dashboard',
    canActivate: [AdminGuard],
    loadComponent: () =>
      import('./components/admin/dashboard/dashboard.component').then(
        (m) => m.DashboardComponent
      ),
  },
  {
    path: 'pending-teachers',
    canActivate: [AdminGuard],
    loadComponent: () =>
      import(
        './components/admin/pending-teachers/pending-teachers.component'
      ).then((m) => m.PendingTeachersComponent),
  },
  {
    path: 'all-users',
    canActivate: [AdminGuard],
    loadComponent: () =>
      import('./components/admin/all-user/all-user.component').then(
        (m) => m.AllUserComponent
      ),
  },
  {
    path: 'withdraw-requests',
    canActivate: [AdminGuard],
    loadComponent: () =>
      import('./components/admin/withdraw/withdraw.component').then(
        (m) => m.WithdrawComponent
      ),
  },
  {
    path: 'payments-log',
    canActivate: [AdminGuard],
    loadComponent: () =>
      import('./components/admin/payments-log/payments-log.component').then(
        (m) => m.PaymentsLogComponent
      ),
  },
  {
    path: 'messaging',
    canActivate: [AdminGuard],
    loadComponent: () =>
      import('./components/admin/messaging/messaging.component').then(
        (m) => m.MessagingComponent
      ),
  },
  {
    path: 'wallet/topup',
    canActivate: [StudentGuard],
    loadComponent: () =>
      import('./components/wallet-topup/wallet-topup.component').then(
        (m) => m.WalletTopupComponent
      ),
  },
  {
    path: 'unsubscribe',
    loadComponent: () =>
      import('./components/unsubscribe/unsubscribe.component').then(
        (m) => m.UnsubscribeComponent
      ),
  },
  {
    path: 'not-found',
    loadComponent: () =>
      import('./components/not-fouend/not-fouend.component').then(
        (m) => m.NotFouendComponent
      ),
  },
  {
    path: '**',
    redirectTo: 'not-found',
  },
];
