import { Injectable, inject } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { StorageService } from '../../services/storage.service';

@Injectable({
  providedIn: 'root',
})
export class ProtectedGuard implements CanActivate {
  private storageService = inject(StorageService);
  private router = inject(Router);

  canActivate(): boolean {
    // Check if user has access token in localStorage
    const accessToken = this.storageService.getItem('access_token');

    if (!accessToken) {
      // User is not authenticated, redirect to login page
      this.router.navigate(['/login']);
      return false;
    }

    // User is authenticated, allow access to protected pages
    return true;
  }
}
