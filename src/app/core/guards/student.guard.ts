import { Injectable, inject } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { StorageService } from '../../services/storage.service';

@Injectable({
  providedIn: 'root',
})
export class StudentGuard implements CanActivate {
  private storageService = inject(StorageService);
  private router = inject(Router);

  canActivate(): boolean {
    // Check if user has access token
    const accessToken = this.storageService.getItem('access_token');
    console.log('StudentGuard - accessToken:', accessToken ? 'exists' : 'missing');

    if (!accessToken) {
      // User is not authenticated, redirect to login
      console.log('StudentGuard - Redirecting to login (no token)');
      this.router.navigate(['/login']);
      return false;
    }

    // Check user role
    const userRole = this.storageService.getItem('user_role');
    console.log('StudentGuard - userRole:', userRole);

    if (userRole !== '1') {
      // User is not a student (role 1), redirect to home or appropriate page
      console.log('StudentGuard - Redirecting to home (not a student, role:', userRole, ')');
      this.router.navigate(['/home']);
      return false;
    }

    // User is authenticated and is a student, allow access
    console.log('StudentGuard - Access granted');
    return true;
  }
}
