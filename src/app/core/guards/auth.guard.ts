import { Injectable, inject } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { StorageService } from '../../services/storage.service';

@Injectable({
  providedIn: 'root',
})
export class AuthGuard implements CanActivate {
  private storageService = inject(StorageService);
  private router = inject(Router);

  canActivate(): boolean {
    // Check if user has access token in localStorage
    const accessToken = this.storageService.getItem('access_token');

    if (accessToken) {
      // User is authenticated, redirect to home page
      this.router.navigate(['/home']);
      return false;
    }

    // User is not authenticated, allow access to auth pages
    return true;
  }
}
